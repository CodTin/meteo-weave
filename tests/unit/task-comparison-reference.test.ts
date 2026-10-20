import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import type { Page } from '../e2e/browser-guard'
import { queryConfiguration, startQueryBrowser } from './task-query-browser'
import type { queryTaskComparison } from '@/features/task-comparison/service'

declare global {
  interface Window {
    compareTaskQuery: typeof queryTaskComparison
  }
}

let browser: Awaited<ReturnType<typeof startQueryBrowser>>
let page: Page
beforeAll(async () => {
  browser = await startQueryBrowser()
})
beforeEach(async () => {
  page = await browser.open()
})
afterEach(async () => {
  await browser.reset()
})
afterAll(async () => {
  await browser?.close()
})

async function compare(a: string, b: string) {
  await page.addScriptTag({
    type: 'module',
    content: `
      import { queryTaskComparison } from '/src/features/task-comparison/service/index.ts'
      window.compareTaskQuery = queryTaskComparison
    `,
  })
  await page.waitForFunction(() => !!window.compareTaskQuery)
  return page.evaluate((selection) => window.compareTaskQuery(window.queryTasks, selection), {
    a,
    b,
  })
}

const region = { west: 0, east: 1, south: 0, north: 1 }
const time = '2024-01-01T00:00:00.000Z'
const reference = { referenceSeed: 1729, referenceVersion: 'synthetic-observations-v1' }

it('compares ordered completed tasks with the same public station reference across methods and resolutions', async () => {
  const a = await browser.seed({
    ...queryConfiguration,
    region,
    method: 'deterministic',
    resolution: '1km',
    timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-01-01' },
  })
  const b = await browser.seed({
    ...queryConfiguration,
    region,
    method: 'probabilistic',
    resolution: '5km',
    timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-01-01' },
  })
  const observationQuery = {
    kind: 'grid' as const,
    layer: 'observation' as const,
    observationMode: 'stations' as const,
    window: region,
    times: [time],
  }
  for (const task of [a, b]) {
    expect(task).toMatchObject(reference)
    expect(await browser.result(task, observationQuery)).toMatchObject({
      ok: true,
      reference,
      values: [
        {
          longitude: 0,
          latitude: 0,
          value: 20,
          observation: { station: { id: 'synthetic-station-v1:0:0' } },
        },
        {
          longitude: 1,
          latitude: 0,
          value: 22,
          observation: { station: { id: 'synthetic-station-v1:1:0' } },
        },
        {
          longitude: 0,
          latitude: 1,
          value: 19.6,
          observation: { station: { id: 'synthetic-station-v1:0:1' } },
        },
        {
          longitude: 1,
          latitude: 1,
          value: 21.6,
          observation: { station: { id: 'synthetic-station-v1:1:1' } },
        },
      ],
    })
  }
  const result = await compare(b.id, a.id)
  expect(result).toMatchObject({
    ok: true,
    tasks: [
      { id: b.id, status: 'Completed' },
      { id: a.id, status: 'Completed' },
    ],
    common: {
      available: true,
      reference,
      coverage: { n: 4, stationCount: 4, times: [time], window: region },
      metrics: { a: { n: 4 }, b: { n: 4 } },
    },
  })
}, 30_000)

it('keeps retired reference statistics explicitly unavailable and independent rather than replacing their source', async () => {
  const a = await browser.seed({ ...queryConfiguration, region })
  const seedB = await browser.seed({ ...queryConfiguration, region })
  const b = {
    ...seedB,
    id: `${seedB.id}-retired`,
    referenceVersion: 'synthetic-observations-retired',
  }
  const restored = await page.evaluate((task) => window.queryTasks.restore(task), b)
  if (!restored.ok) throw new Error(restored.error)
  expect(await compare(a.id, b.id)).toMatchObject({
    ok: true,
    common: { available: false, metrics: null, reasons: [{ code: 'REFERENCE_MISMATCH' }] },
    individual: {
      a: {
        available: true,
        rankingAllowed: false,
        reference: { referenceVersion: 'synthetic-observations-v1' },
      },
      b: {
        available: false,
        rankingAllowed: false,
        metrics: null,
        reference: { referenceVersion: 'synthetic-observations-retired' },
      },
    },
  })
}, 30_000)

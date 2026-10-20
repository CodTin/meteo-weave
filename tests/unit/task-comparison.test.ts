import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import type { Page } from '../e2e/browser-guard'
import { queryConfiguration, startQueryBrowser } from './task-query-browser'
import { browserTaskTransport } from './task-test-transport'
import type { queryTaskComparison } from '@/features/task-comparison/service'
import type { createTaskService, TaskTransport } from '@/features/downscaling-tasks/service'

declare global {
  interface Window {
    compareTaskQuery: typeof queryTaskComparison
    comparisonEnvironmentReady: Promise<void>
    completeComparisonEnvironment: () => void
    failComparisonEnvironment: (error: unknown) => void
    comparisonTaskService: (
      configure?: (transport: TaskTransport) => void,
    ) => ReturnType<typeof createTaskService>
  }
}

let browser: Awaited<ReturnType<typeof startQueryBrowser>>
let page: Page
beforeAll(async () => {
  browser = await startQueryBrowser()
})
beforeEach(async () => {
  page = await browser.open()
  await page.addScriptTag({
    type: 'module',
    content: `
      import { queryTaskComparison } from '/src/features/task-comparison/service/index.ts'
      import { createTaskService } from '/src/features/downscaling-tasks/service/index.ts'
      import { createQueryClient } from '/src/lib/query/client.ts'
      window.comparisonTaskService = (configure = () => {}) => {
        const transport = ${browserTaskTransport('queryRpc')}
        configure(transport)
        return createTaskService({ queryClient: createQueryClient(), transport })
      }
      window.compareTaskQuery = queryTaskComparison
    `,
  })
  await page.waitForFunction(() => !!window.compareTaskQuery)
})
afterEach(async () => {
  await browser.reset()
})
afterAll(async () => {
  await browser?.close()
})

const region = { west: 0, east: 1, south: 0, north: 1 }
const time = '2024-01-01T00:00:00.000Z'
const configuration = {
  ...queryConfiguration,
  region,
  timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-01-01' },
}

async function compare(a: string, b: string) {
  return page.evaluate((selection) => window.compareTaskQuery(window.queryTasks, selection), {
    a,
    b,
  })
}

/** Change environmental RPC replies, never task storage or query/metric internals. */
type SampleFixture = number | null | 'NaN' | 'Infinity'
async function withSampleReplies(
  predictions: Record<string, SampleFixture[]>,
  observations: Record<string, SampleFixture[]> = {},
  unavailableTask?: string,
  metadata?: {
    taskId: string
    change:
      | 'unit'
      | 'statistic'
      | 'rain-interval'
      | 'rain-incomplete'
      | 'reference-version'
      | 'station-coordinates'
  },
) {
  await page.evaluate(() => {
    window.comparisonEnvironmentReady = new Promise<void>((resolve, reject) => {
      window.completeComparisonEnvironment = resolve
      window.failComparisonEnvironment = reject
    })
  })
  await page.addScriptTag({
    type: 'module',
    content: `
      import { createTaskService } from '/src/features/downscaling-tasks/service/index.ts'
      import { createQueryClient } from '/src/lib/query/client.ts'
      try {
      window.queryTasks.close()
      const transport = ${browserTaskTransport('queryRpc')}
      const rpcResult = transport.result
      const predictions = ${JSON.stringify(predictions)}
      const observations = ${JSON.stringify(observations)}
      const unavailableTask = ${JSON.stringify(unavailableTask)}
      const metadata = ${JSON.stringify(metadata)}
      transport.result = async input => {
        if (input.task.id === unavailableTask && input.query.layer === 'downscaled' &&
            input.query.points.some(point => point.longitude === 0 && point.latitude === 0)) {
          return { ok: false, code: 'MISSING_DATA', error: 'One station value is unavailable.' }
        }
        const reply = await rpcResult(input)
        if (!reply.ok) return reply
        const values = reply.values.flatMap(value => {
          const index = value.latitude * 2 + value.longitude
          const fixture = input.query.layer === 'observation'
            ? (observations[input.task.id] ?? [10, 20, 30, 40])[index]
            : predictions[input.task.id]?.[index]
          return fixture === null ? [] : [{ ...value, value: typeof fixture === 'string' ? Number(fixture) : fixture ?? value.value }]
        })
        if (input.task.id !== metadata?.taskId) return { ...reply, values }
        if (metadata.change === 'unit') return { ...reply, unit: 'K', values }
        if (metadata.change === 'statistic') return { ...reply, temporalStatistic: 'daily-mean', values }
        if (metadata.change === 'reference-version' && reply.reference) return { ...reply, reference: { ...reply.reference, referenceVersion: 'different-public-version' }, values }
        return { ...reply, values: values.map(value => {
          if (metadata.change === 'station-coordinates' && value.observation?.mode === 'stations') return { ...value, observation: { ...value.observation, station: { ...value.observation.station, longitude: 99 } } }
          if (!value.accumulation) return value
          return { ...value, accumulation: metadata.change === 'rain-incomplete'
            ? { ...value.accumulation, complete: false }
            : { ...value.accumulation, end: '2024-01-01T12:00:00.000Z', requestedEnd: '2024-01-01T12:00:00.000Z', expectedHours: 12, sampledHours: 12 } }
        }) }

      }
      window.queryTasks = createTaskService({ queryClient: createQueryClient(), transport })
      await window.queryTasks.initialize()
      window.completeComparisonEnvironment()
      } catch (error) {
        window.failComparisonEnvironment(error)
      }
    `,
  })
  await page.evaluate(() => window.comparisonEnvironmentReady)
}

it('rejects a same-id replacement after the first task result completes instead of publishing old metrics', async () => {
  const a = await browser.seed(configuration)
  const b = await browser.seed(configuration)
  const result = await page.evaluate(
    async ({ a, b }) => {
      const original = window.queryTasks
      let replaced = false
      const service = window.comparisonTaskService((transport) => {
        const rawResult = transport.result
        transport.result = async (input) => {
          const reply = await rawResult(input)
          if (input.task.id === b.id && !replaced) {
            replaced = true
            await original.delete(a.id)
            const restored = await original.restore({ ...a, dataSeed: a.dataSeed + 1 })
            if (!restored.ok) throw new Error(restored.error)
          }
          return reply
        }
      })
      try {
        await service.initialize()
        return await window.compareTaskQuery(service, { a: a.id, b: b.id })
      } finally {
        service.close()
      }
    },
    { a, b },
  )
  expect(result.ok).toBe(false)
  expect(result).not.toHaveProperty('tasks')
  expect(result).not.toHaveProperty('common')
}, 30_000)

it('recalculates both metrics on the exact same station reference samples with honest bounded coverage', async () => {
  const a = await browser.seed(configuration)
  const b = await browser.seed({ ...configuration, resolution: '5km' })
  await withSampleReplies({ [a.id]: [11, 18, 33, 36], [b.id]: [12, 16, 36, 32] })
  const result = await compare(a.id, b.id)
  expect(result).toMatchObject({
    ok: true,
    common: {
      available: true,
      coverage: { n: 4, stationCount: 4, times: [time], window: region },
      metrics: {
        a: { rmse: 2.7386127875258306, mae: 2.5, r2: 0.94, n: 4, r2UnavailableReason: null },
        b: { rmse: 5.477225575051661, mae: 5, r2: 0.76, n: 4, r2UnavailableReason: null },
      },
      exclusions: { candidates: 4, retained: 4, excluded: 0, counts: {} },
      sampling: {
        strategy: 'bounded-station-time',
        availableStations: 4,
        availableTimes: 1,
        queriedSamples: 4,
        retainedSamples: 4,
        omittedSamples: 0,
        decimated: false,
        selectedTimes: [time],
        fallbackRequests: 0,
      },
    },
  })
}, 30_000)

it('excludes absent observations, absent predictions and non-finite values per common candidate without inventing zeros', async () => {
  const a = await browser.seed(configuration)
  const b = await browser.seed(configuration)
  await withSampleReplies(
    { [a.id]: [11, 18, 'NaN', 36], [b.id]: [12, null, 36, 32] },
    { [a.id]: [null, 20, 30, 40] },
  )
  expect(await compare(a.id, b.id)).toMatchObject({
    ok: true,
    common: {
      available: true,
      metrics: {
        a: { n: 1, rmse: 4, mae: 4, r2: null, r2UnavailableReason: 'constant-reference' },
        b: { n: 1, rmse: 8, mae: 8, r2: null, r2UnavailableReason: 'constant-reference' },
      },
      coverage: {
        n: 1,
        stationCount: 1,
        stations: [{ id: 'synthetic-station-v1:1:1', longitude: 1, latitude: 1 }],
        times: [time],
      },
      exclusions: {
        candidates: 4,
        retained: 1,
        excluded: 3,
        counts: { 'missing-observation': 1, 'missing-prediction': 1, 'non-finite': 1 },
      },
      sampling: { queriedSamples: 4, retainedSamples: 1, decimated: false },
    },
  })
}, 30_000)

it('retains valid station values with bounded fallback only when a public result batch is unavailable', async () => {
  const a = await browser.seed(configuration)
  const b = await browser.seed(configuration)
  await withSampleReplies({ [a.id]: [11, 18, 33, 36], [b.id]: [12, 16, 36, 32] }, {}, a.id)
  const result = await compare(a.id, b.id)
  expect(result).toMatchObject({
    ok: true,
    common: {
      available: true,
      coverage: { n: 3, stationCount: 3 },
      metrics: { a: { n: 3, mae: 3, r2: 0.855 }, b: { n: 3, mae: 6, r2: 0.42000000000000004 } },
      exclusions: { candidates: 4, retained: 3, excluded: 1, counts: { 'missing-prediction': 1 } },
    },
  })
  if (!result.ok) throw new Error(result.error)
  expect(result.common.sampling.fallbackRequests).toBeGreaterThan(0)
  expect(result.common.sampling.fallbackRequests).toBeLessThanOrEqual(32)
}, 30_000)

it('disables common metric ranking for different reference identities and exposes only separate non-ranking individual statistics', async () => {
  const a = await browser.seed(configuration)
  const createdB = await browser.seed(configuration)
  const b = { ...createdB, id: `${createdB.id}-reference`, referenceSeed: 1730 }
  const restored = await page.evaluate((task) => window.queryTasks.restore(task), b)
  if (!restored.ok) throw new Error(restored.error)
  await withSampleReplies(
    { [a.id]: [11, 18, 33, 36], [b.id]: [102, 196, 306, 392] },
    { [b.id]: [100, 200, 300, 400] },
  )
  expect(await compare(a.id, b.id)).toMatchObject({
    ok: true,
    common: {
      available: false,
      metrics: null,
      rankingAllowed: false,
      reasons: [{ code: 'REFERENCE_MISMATCH' }],
    },
    individual: {
      a: {
        available: true,
        rankingAllowed: false,
        reference: { referenceSeed: 1729 },
        metrics: { n: 4, mae: 2.5 },
      },
      b: {
        available: true,
        rankingAllowed: false,
        reference: { referenceSeed: 1730 },
        metrics: { n: 4, mae: 5 },
      },
    },
  })
}, 30_000)

it('rejects duplicate, deleted, foreign-account and non-Completed pairs without returning cached task data', async () => {
  const a = await browser.seed(configuration)
  const b = await browser.seed(configuration)
  expect(await compare(a.id, a.id)).toMatchObject({ ok: false, code: 'DUPLICATE_TASK' })
  const running = await page.evaluate((input) => window.queryTasks.create(input), configuration)
  if (!running.ok) throw new Error(running.error)
  expect(await compare(a.id, running.task.id)).toMatchObject({
    ok: false,
    code: 'TASK_UNAVAILABLE',
    failures: [{ side: 'b', taskId: running.task.id, code: 'NOT_COMPLETED' }],
  })
  await compare(a.id, b.id)
  await page.evaluate((id) => window.queryTasks.delete(id), b.id)
  const deleted = await compare(a.id, b.id)
  expect(deleted).toMatchObject({
    ok: false,
    failures: [{ side: 'b', taskId: b.id, code: 'NOT_FOUND' }],
  })
  expect(deleted).not.toHaveProperty('tasks')
  await browser.signIn('policy')
  expect(await compare(a.id, b.id)).toMatchObject({ ok: false, code: 'TASK_UNAVAILABLE' })
}, 30_000)

it('uses only overlapping native instants and actual station coordinates, and explains disjoint time, space, variable and grain', async () => {
  const a = await browser.seed({
    ...configuration,
    region: { west: 0, east: 2, south: 0, north: 2 },
    timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-01-03' },
  })
  const b = await browser.seed({
    ...configuration,
    resolution: '5km',
    region: { west: 1, east: 3, south: 1, north: 3 },
    timeRange: { mode: 'historical', start: '2024-01-02', end: '2024-01-04' },
  })
  expect(await compare(a.id, b.id)).toMatchObject({
    ok: true,
    common: {
      available: true,
      coverage: {
        n: 8,
        stationCount: 4,
        times: ['2024-01-02T00:00:00.000Z', '2024-01-03T00:00:00.000Z'],
        window: { west: 1, east: 2, south: 1, north: 2 },
      },
      sampling: { queriedSamples: 8, retainedSamples: 8, decimated: false },
    },
  })
  const disjointTime = await browser.seed({
    ...configuration,
    timeRange: { mode: 'historical', start: '2024-01-04', end: '2024-01-05' },
  })
  const disjointSpace = await browser.seed({
    ...configuration,
    region: { west: 4, east: 5, south: 4, north: 5 },
  })
  const pressure = await browser.seed({ ...configuration, variable: 'pressure' })
  const forecast = await browser.seed({
    ...configuration,
    timeRange: {
      mode: 'forecast',
      start: '2026-10-13T09:00:00.000Z',
      end: '2026-10-13T10:00:00.000Z',
    },
  })
  for (const [task, reason] of [
    [disjointTime, 'NO_TEMPORAL_OVERLAP'],
    [disjointSpace, 'NO_SPATIAL_OVERLAP'],
    [pressure, 'VARIABLE_MISMATCH'],
    [forecast, 'GRAIN_MISMATCH'],
  ] as const) {
    const result = await compare(a.id, task.id)
    expect(result).toMatchObject({
      ok: true,
      common: { available: false, metrics: null, rankingAllowed: false },
    })
    if (!result.ok || result.common.available) throw new Error('Expected an incompatible pair')
    expect(result.common.reasons.map((reason) => reason.code)).toContain(reason)
  }
}, 30_000)

it.each([
  ['unit', 'UNIT_MISMATCH'],
  ['statistic', 'STATISTIC_MISMATCH'],
  ['rain-interval', 'ACCUMULATION_MISMATCH'],
  ['rain-incomplete', 'ACCUMULATION_MISMATCH'],
  ['reference-version', 'REFERENCE_MISMATCH'],
  ['station-coordinates', 'NO_COMMON_SAMPLES'],
] as const)(
  'does not rank incompatible public %s metadata or samples',
  async (change, expected) => {
    const input = {
      ...configuration,
      ...(change.startsWith('rain') ? { variable: 'precipitation' } : {}),
    }
    const a = await browser.seed(input)
    const b = await browser.seed(input)
    await withSampleReplies({}, {}, undefined, { taskId: b.id, change })
    const result = await compare(a.id, b.id)
    expect(result).toMatchObject({
      ok: true,
      common: { available: false, metrics: null, rankingAllowed: false },
    })
    if (!result.ok || result.common.available) throw new Error('Expected incompatible metadata')
    expect(result.common.reasons.map((reason) => reason.code)).toContain(expected)
  },
  30_000,
)

it('reports exact bounded decimation and explicitly empty observation coverage without fabricating samples', async () => {
  const input = {
    ...configuration,
    region: { west: 0, east: 10, south: 0, north: 10 },
    timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-01-10' },
  }
  const a = await browser.seed(input)
  const b = await browser.seed(input)
  expect(await compare(a.id, b.id)).toMatchObject({
    ok: true,
    common: {
      available: true,
      coverage: { n: 64, stationCount: 8 },
      sampling: {
        availableStations: 121,
        availableTimes: 10,
        queriedSamples: 64,
        retainedSamples: 64,
        omittedSamples: 1146,
        decimated: true,
        fallbackRequests: 0,
      },
    },
  })
  const emptyInput = { ...configuration, region: { west: 0.1, east: 0.2, south: 0.1, north: 0.2 } }
  const c = await browser.seed(emptyInput)
  const d = await browser.seed(emptyInput)
  expect(await compare(c.id, d.id)).toMatchObject({
    ok: true,
    common: {
      available: false,
      metrics: null,
      coverage: { n: 0, stations: [], times: [], window: null },
      sampling: { availableStations: 0, queriedSamples: 0, retainedSamples: 0 },
    },
  })
}, 30_000)

it('revalidates late deletion through the public result transport and returns no stale pair', async () => {
  const a = await browser.seed(configuration)
  const b = await browser.seed(configuration)
  await page.addScriptTag({
    type: 'module',
    content: `
      import { createTaskService } from '/src/features/downscaling-tasks/service/index.ts'
      import { createQueryClient } from '/src/lib/query/client.ts'
      const previous = window.queryTasks
      previous.close()
      const transport = ${browserTaskTransport('queryRpc')}
      const rpcResult = transport.result
      let deleted = false
      transport.result = async input => {
        const result = await rpcResult(input)
        if (!deleted && input.task.id === ${JSON.stringify(a.id)}) {
          deleted = true
          await window.queryTasks.delete(${JSON.stringify(b.id)})
        }
        return result
      }
      window.queryTasks = createTaskService({ queryClient: createQueryClient(), transport })
      await window.queryTasks.initialize()
    `,
  })
  await page.waitForFunction(() => window.queryTasks.getState() === 'ready')
  const result = await compare(a.id, b.id)
  expect(result).toMatchObject({
    ok: false,
    code: 'TASK_UNAVAILABLE',
    failures: expect.arrayContaining([
      { side: 'b', taskId: b.id, code: 'NOT_FOUND', error: expect.any(String) },
    ]),
  })
  expect(result).not.toHaveProperty('tasks')
}, 30_000)

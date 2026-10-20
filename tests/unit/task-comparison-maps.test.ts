import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import type { Page } from '../e2e/browser-guard'
import { queryConfiguration, startQueryBrowser } from './task-query-browser'
import { browserTaskTransport } from './task-test-transport'
import type {
  createTaskService,
  ResultReply,
  TaskTransport,
} from '@/features/downscaling-tasks/service'
import type { queryComparisonMapPreviews } from '@/features/task-comparison/maps'

declare global {
  interface Window {
    fieldMapQuery: typeof queryComparisonMapPreviews
    fieldMapService: (transport?: Partial<TaskTransport>) => ReturnType<typeof createTaskService>
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
      import { queryComparisonMapPreviews } from '/src/features/task-comparison/maps/index.ts'
      import { createTaskService } from '/src/features/downscaling-tasks/service/index.ts'
      import { createQueryClient } from '/src/lib/query/client.ts'
      window.fieldMapQuery = queryComparisonMapPreviews
      window.fieldMapService = (overrides = {}) => createTaskService({
        queryClient: createQueryClient(),
        transport: { ...${browserTaskTransport('queryRpc')}, ...overrides },
      })
    `,
  })
  await page.waitForFunction(() => !!window.fieldMapQuery, undefined, { timeout: 5_000 })
}, 30_000)
afterEach(async () => {
  await browser.reset()
}, 30_000)
afterAll(async () => {
  await browser?.close()
})

async function completedTask(configuration: unknown = queryConfiguration) {
  const saved = await browser.seed(configuration)
  const reply = await browser.get(saved)
  if (!reply.ok) throw new Error(reply.error)
  return reply.task
}

it('returns A/B ordered real native field previews in each own extent with one shared absolute unit scale', async () => {
  const a = await completedTask()
  const b = await completedTask({
    ...queryConfiguration,
    resolution: '5km',
    region: { west: 112, east: 114, south: 28, north: 29 },
  })
  const reply = await page.evaluate((tasks) => window.fieldMapQuery(window.queryTasks, tasks), {
    a,
    b,
  })
  expect(reply.ok).toBe(true)
  if (!reply.ok) throw new Error(reply.error)
  expect(reply.previews.map((preview) => preview.task.id)).toEqual([a.id, b.id])
  expect(reply.commonTime).toBe('2024-01-01T00:00:00.000Z')
  expect(reply.scale.kind).toBe('shared')
  for (const [index, preview] of reply.previews.entries()) {
    expect(preview.ok).toBe(true)
    if (!preview.ok) throw new Error(preview.error)
    expect(preview.window).toEqual(index === 0 ? a.configuration.region : b.configuration.region)
    expect(preview.result).toMatchObject({
      taskId: preview.task.id,
      layer: 'downscaled',
      variable: 'temperature',
      unit: '°C',
      temporalStatistic: 'instantaneous',
      provenance: { label: 'Synthetic Demo' },
      grid: { sampling: 'decimated-grid', coordinateOrder: 'longitude-latitude' },
    })
    expect(preview.points.length).toBeGreaterThan(0)
    expect(preview.points.length).toBeLessThanOrEqual(64)
    expect(preview.points[0]).toMatchObject({
      longitude: preview.window.west,
      latitude: preview.window.south,
      time: '2024-01-01T00:00:00.000Z',
    })
    expect(preview.legend?.unit).toBe('°C')
    const other = reply.previews[1 - index]!
    expect(preview.legend).toEqual(other.ok ? other.legend : null)
  }
})

it('previews a 20-member probabilistic mean within public per-request value budgets', async () => {
  const a = await completedTask()
  const b = await completedTask({
    ...queryConfiguration,
    method: 'probabilistic',
    advanced: { uncertaintyQuantification: true, ensembleMembers: 20 },
  })
  const reply = await page.evaluate(
    async (tasks) => {
      // The request transport only accepts bounded, explicitly selected public means.
      const service = window.fieldMapService({
        result: async (input) => {
          const { task, query } = input
          if (task.configuration.resolvedMethod === 'probabilistic') {
            const factor = (task.configuration.advanced?.ensembleMembers ?? 10) + 1
            if (
              query.kind !== 'preview' ||
              query.maxPoints * factor > 256 ||
              query.ensemble?.kind !== 'mean'
            ) {
              return {
                ok: false,
                code: 'TRANSPORT_BUDGET',
                error: 'Expected a bounded explicit mean.',
              }
            }
          }
          return (await window.queryRpc('result', input)) as ResultReply
        },
      })
      try {
        await service.initialize()
        return await window.fieldMapQuery(service, tasks)
      } finally {
        service.close()
      }
    },
    { a, b },
  )
  if (!reply.ok) throw new Error(reply.error)
  const preview = reply.previews[1]
  expect(preview.ok).toBe(true)
  if (!preview.ok) throw new Error(preview.error)
  expect(preview.result.ensemble).toMatchObject({
    kind: 'mean',
    missingPolicy: 'exclude-unavailable-per-location-time',
    memberIds: Array.from(
      { length: 20 },
      (_, index) => `member-${String(index + 1).padStart(2, '0')}`,
    ),
  })
  expect(preview.points.length).toBeGreaterThan(0)
  expect(preview.points.length).toBeLessThanOrEqual(12)
  const samples = preview.result.ensemble?.samples ?? []
  expect(samples.length + preview.result.values.length).toBeLessThanOrEqual(256)
  const point = preview.result.values[0]!
  expect(point.ensembleMean?.sampleCount).toBe(20)
  expect(point.memberId).toBeUndefined()
  const mean =
    samples
      .filter(
        (sample) => sample.longitude === point.longitude && sample.latitude === point.latitude,
      )
      .reduce((sum, sample) => sum + sample.value, 0) / 20
  expect(point.value).toBeCloseTo(mean, 3)
})

it('selects a real common native instant for partially overlapping time windows without resampling either field', async () => {
  const a = await completedTask()
  const b = await completedTask({
    ...queryConfiguration,
    timeRange: { mode: 'historical', start: '2024-01-02', end: '2024-01-04' },
  })
  const reply = await page.evaluate((tasks) => window.fieldMapQuery(window.queryTasks, tasks), {
    a,
    b,
  })
  if (!reply.ok) throw new Error(reply.error)
  expect(reply.scale.kind).toBe('shared')
  expect(reply.commonTime).toBe('2024-01-02T00:00:00.000Z')
  for (const preview of reply.previews) {
    if (!preview.ok) throw new Error(preview.error)
    expect(preview.time).toBe('2024-01-02T00:00:00.000Z')
    expect([...new Set(preview.result.values.map((point) => point.time))]).toEqual([preview.time])
  }
})

it('honors a selected common instant expressed with a timezone offset instead of silently choosing the default', async () => {
  const a = await completedTask()
  const b = await completedTask()
  const reply = await page.evaluate(
    (tasks) => window.fieldMapQuery(window.queryTasks, tasks, '2024-01-02T08:00:00+08:00'),
    { a, b },
  )
  if (!reply.ok) throw new Error(reply.error)
  expect(reply.commonTime).toBe('2024-01-02T00:00:00.000Z')
  expect(reply.scale.kind).toBe('shared')
  expect(reply.previews.map((preview) => preview.time)).toEqual([
    '2024-01-02T00:00:00.000Z',
    '2024-01-02T00:00:00.000Z',
  ])
})

it('keeps independent own-time fields with a precise no-common-instant explanation for disjoint native windows', async () => {
  const a = await completedTask()
  const b = await completedTask({
    ...queryConfiguration,
    timeRange: { mode: 'historical', start: '2024-02-01', end: '2024-02-02' },
  })
  const reply = await page.evaluate((tasks) => window.fieldMapQuery(window.queryTasks, tasks), {
    a,
    b,
  })
  if (!reply.ok) throw new Error(reply.error)
  expect(reply.commonTime).toBeNull()
  expect(reply.scale).toMatchObject({
    kind: 'independent',
    explanation: expect.stringContaining('共同'),
  })
  expect(reply.previews.map((preview) => preview.time)).toEqual([
    '2024-01-01T00:00:00.000Z',
    '2024-02-01T00:00:00.000Z',
  ])
  for (const preview of reply.previews) expect(preview.ok).toBe(true)
})

it('explains an unavailable selected slice without relabelling a different native instant as common', async () => {
  const a = await completedTask()
  const b = await completedTask({
    ...queryConfiguration,
    timeRange: { mode: 'historical', start: '2024-01-02', end: '2024-01-03' },
  })
  const reply = await page.evaluate(
    (tasks) => window.fieldMapQuery(window.queryTasks, tasks, '2024-01-01T00:00:00Z'),
    { a, b },
  )
  if (!reply.ok) throw new Error(reply.error)
  expect(reply.previews[0].ok).toBe(true)
  expect(reply.previews[1].ok).toBe(false)
  expect(reply.commonTime).toBeNull()
  expect(reply.scale).toMatchObject({
    kind: 'independent',
    explanation: expect.stringContaining('不可用'),
  })
})

it('keeps different variables on their own absolute unit legends and explains the incompatible quantities', async () => {
  const a = await completedTask()
  const b = await completedTask({ ...queryConfiguration, variable: 'pressure' })
  const reply = await page.evaluate((tasks) => window.fieldMapQuery(window.queryTasks, tasks), {
    a,
    b,
  })
  if (!reply.ok) throw new Error(reply.error)
  expect(reply.scale.kind).toBe('independent')
  expect(reply.scale.explanation).toContain('T2M')
  expect(reply.scale.explanation).toContain('MSL')
  expect(reply.previews.map((preview) => (preview.ok ? preview.legend?.unit : null))).toEqual([
    '°C',
    'hPa',
  ])
})

it('does not share rainfall scales when even one returned accumulation interval is incomplete', async () => {
  const a = await completedTask({ ...queryConfiguration, variable: 'precipitation' })
  const b = await completedTask({ ...queryConfiguration, variable: 'precipitation' })
  const reply = await page.evaluate(
    async (tasks) => {
      const service = window.fieldMapService({
        result: async (input) => {
          const result = (await window.queryRpc('result', input)) as ResultReply
          if (!result.ok || result.variable !== 'precipitation' || input.task.id !== tasks.b.id)
            return result
          return {
            ...result,
            values: result.values.map((point, index) =>
              index === 1
                ? {
                    ...point,
                    accumulation: { ...point.accumulation, complete: false, sampledHours: 23 },
                  }
                : point,
            ),
          }
        },
      })
      try {
        await service.initialize()
        return await window.fieldMapQuery(service, tasks)
      } finally {
        service.close()
      }
    },
    { a, b },
  )
  if (!reply.ok) throw new Error(reply.error)
  expect(reply.previews.every((preview) => preview.ok)).toBe(true)
  expect(reply.scale.kind).toBe('independent')
  expect(reply.scale.explanation).toContain('累计区间')
  expect(reply.scale.explanation).toContain('完整')
})

it('keeps independent rainfall legends when one otherwise complete accumulation interval differs', async () => {
  const a = await completedTask({ ...queryConfiguration, variable: 'precipitation' })
  const b = await completedTask({ ...queryConfiguration, variable: 'precipitation' })
  const reply = await page.evaluate(
    async (tasks) => {
      const service = window.fieldMapService({
        result: async (input) => {
          const result = (await window.queryRpc('result', input)) as ResultReply
          if (!result.ok || result.variable !== 'precipitation' || input.task.id !== tasks.b.id)
            return result
          return {
            ...result,
            values: result.values.map((point, index) =>
              index === 1
                ? {
                    ...point,
                    accumulation: {
                      ...point.accumulation,
                      start: '2024-01-01T01:00:00.000Z',
                      end: '2024-01-02T01:00:00.000Z',
                      requestedStart: '2024-01-01T01:00:00.000Z',
                      requestedEnd: '2024-01-02T01:00:00.000Z',
                    },
                  }
                : point,
            ),
          }
        },
      })
      try {
        await service.initialize()
        return await window.fieldMapQuery(service, tasks)
      } finally {
        service.close()
      }
    },
    { a, b },
  )
  if (!reply.ok) throw new Error(reply.error)
  expect(reply.scale.kind).toBe('independent')
  expect(reply.scale.explanation).toContain('累计区间')
  expect(reply.scale.explanation).toContain('不同')
})

it('never treats stale returned sample times as a real common instant', async () => {
  const a = await completedTask()
  const b = await completedTask()
  const reply = await page.evaluate(
    async (tasks) => {
      const service = window.fieldMapService({
        result: async (input) => {
          const result = (await window.queryRpc('result', input)) as ResultReply
          if (
            !result.ok ||
            result.variable !== 'temperature' ||
            result.temporalStatistic !== 'instantaneous' ||
            input.task.id !== tasks.b.id
          )
            return result
          return {
            ...result,
            values: result.values.map((point) => ({ ...point, time: '2024-01-02T00:00:00.000Z' })),
          }
        },
      })
      try {
        await service.initialize()
        return await window.fieldMapQuery(service, tasks)
      } finally {
        service.close()
      }
    },
    { a, b },
  )
  if (!reply.ok) throw new Error(reply.error)
  expect(reply.commonTime).toBeNull()
  expect(reply.scale.kind).toBe('independent')
  expect(reply.previews[1]).toMatchObject({ ok: false, code: 'INVALID_RESULT' })
  expect(reply.scale.explanation).toContain('时间片')
})

it('excludes individually unavailable and non-finite samples from the legend without inventing zero or replacing omitted nodes', async () => {
  const a = await completedTask()
  const b = await completedTask()
  const reply = await page.evaluate(
    async (tasks) => {
      const service = window.fieldMapService({
        result: async (input) => {
          const result = (await window.queryRpc('result', input)) as ResultReply
          if (
            !result.ok ||
            result.variable !== 'temperature' ||
            result.temporalStatistic !== 'instantaneous'
          )
            return result
          return {
            ...result,
            values: result.values
              .slice(0, input.task.id === tasks.a.id ? 4 : 2)
              .map((point, index) => ({
                ...point,
                value:
                  input.task.id === tasks.a.id
                    ? [10, Number.NaN, Number.POSITIVE_INFINITY, 20][index]!
                    : [30, 40][index]!,
              })),
          }
        },
      })
      try {
        await service.initialize()
        return await window.fieldMapQuery(service, tasks)
      } finally {
        service.close()
      }
    },
    { a, b },
  )
  if (!reply.ok) throw new Error(reply.error)
  const preview = reply.previews[0]
  if (!preview.ok) throw new Error(preview.error)
  expect(preview.points.map((point) => point.value)).toEqual([10, null, null, 20])
  expect(preview.legend).toMatchObject({ min: 10, max: 40, unit: '°C' })
  expect(preview.sampleCounts).toMatchObject({ valid: 2, missing: 2, omitted: 59 })
})

it('rejects a stale pair if A is deleted after its field read succeeds while B is still pending', async () => {
  const a = await completedTask()
  const b = await completedTask()
  const reply = await page.evaluate(
    async (tasks) => {
      let releaseB = () => {}
      let startedB = () => {}
      const held = new Promise<void>((resolve) => {
        releaseB = resolve
      })
      const started = new Promise<void>((resolve) => {
        startedB = resolve
      })
      const service = window.fieldMapService({
        result: async (input) => {
          const result = (await window.queryRpc('result', input)) as ResultReply
          if (input.task.id === tasks.b.id) {
            startedB()
            await held
          }
          return result
        },
      })
      try {
        await service.initialize()
        const pending = window.fieldMapQuery(service, tasks)
        await started
        // Observe a completed A read through the public result interface, not a cache side channel.
        const aField = await service.result(tasks.a.id, {
          kind: 'preview',
          layer: 'downscaled',
          window: tasks.a.configuration.region,
          times: ['2024-01-01T00:00:00.000Z'],
          maxPoints: 64,
        })
        if (!aField.ok) throw new Error(aField.error)
        await window.queryTasks.delete(tasks.a.id)
        releaseB()
        return await pending
      } finally {
        releaseB()
        service.close()
      }
    },
    { a, b },
  )
  expect(reply).toMatchObject({ ok: false, code: 'NOT_FOUND' })
})

it('rejects a deleted-and-restored task with the same id but changed field identity while the other result is pending', async () => {
  const a = await completedTask()
  const b = await completedTask()
  const reply = await page.evaluate(
    async (tasks) => {
      let releaseB = () => {}
      let startedB = () => {}
      const held = new Promise<void>((resolve) => {
        releaseB = resolve
      })
      const started = new Promise<void>((resolve) => {
        startedB = resolve
      })
      const service = window.fieldMapService({
        result: async (input) => {
          const result = (await window.queryRpc('result', input)) as ResultReply
          if (input.task.id === tasks.b.id) {
            startedB()
            await held
          }
          return result
        },
      })
      try {
        await service.initialize()
        const pending = window.fieldMapQuery(service, tasks)
        await started
        await service.result(tasks.a.id, {
          kind: 'preview',
          layer: 'downscaled',
          window: tasks.a.configuration.region,
          times: ['2024-01-01T00:00:00.000Z'],
          maxPoints: 64,
        })
        await window.queryTasks.delete(tasks.a.id)
        const restored = await window.queryTasks.restore({
          ...tasks.a,
          dataSeed: tasks.a.dataSeed + 1,
        })
        if (!restored.ok) throw new Error(restored.error)
        releaseB()
        return await pending
      } finally {
        releaseB()
        service.close()
      }
    },
    { a, b },
  )
  expect(reply).toMatchObject({ ok: false, code: 'TASK_CHANGED' })
})

import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import {
  createLifecycleEnvironment,
  lifecycleConfiguration,
} from './task-lifecycle-native-environment'
import type { DownscalingTask, ResultQuery } from '@/features/downscaling-tasks/service'

let environment: Awaited<ReturnType<typeof createLifecycleEnvironment>>
beforeAll(async () => {
  environment = await createLifecycleEnvironment({ emptyWorkspace: true })
})
afterEach(async () => {
  await environment.reset()
}, 30_000)
afterAll(async () => {
  await environment.close()
})

const referenceQuery = {
  kind: 'points',
  layer: 'observation',
  observationMode: 'interpolated',
  points: [{ longitude: 11, latitude: 47 }],
  times: ['2024-01-01T00:00:00Z'],
} satisfies ResultQuery

it.each([
  ['get', 'remove'],
  ['result', 'remove'],
  ['list', 'remove'],
  ['get', 'add'],
  ['result', 'add'],
  ['get', 'remove-catalog'],
  ['result', 'remove-catalog'],
] as const)(
  'rejects a delayed %s after another native tab replaces optional reference identity (%s)',
  async (operation, change) => {
    await environment.signIn('researcher')
    const page = await environment.open()
    const other = await environment.tab()
    const created = await page.evaluate((input) => window.lifecycleTasks.create(input), {
      ...lifecycleConfiguration,
      dataSource: 'ecmwf',
      region: { west: 10, east: 12, south: 46, north: 48 },
    })
    if (!created.ok) throw new Error(created.error)
    const explicit: DownscalingTask = {
      ...created.task,
      id: `${created.task.id}-reference`,
      dataSeed: 42,
      referenceSeed: 4294967295,
      referenceVersion: 'synthetic-observations-v1',
    }
    const { referenceSeed: _seed, referenceVersion: _version, ...legacy } = explicit
    const initial =
      change === 'add'
        ? legacy
        : change === 'remove-catalog'
          ? {
              ...explicit,
              catalog: {
                id: 'restored-demo',
                version: 1,
                terrain: 'mountains' as const,
                label: 'Synthetic Demo' as const,
                description: 'Saved Synthetic Demo metadata',
              },
            }
          : explicit
    const replacement = change === 'remove' ? legacy : explicit
    expect(
      await page.evaluate((task) => window.lifecycleTasks.restore(task), initial),
    ).toMatchObject({ ok: true })
    environment.advance(2_500)
    expect(await page.evaluate((id) => window.lifecycleTasks.get(id), initial.id)).toMatchObject({
      ok: true,
      task: { status: 'Completed' },
    })
    const held = environment.holdNext(
      operation === 'result' ? 'result' : 'read',
      page,
      operation === 'result' ? undefined : initial.id,
    )
    const delayed = page.evaluate(
      async ({ operation, id, query }) => {
        if (operation === 'get') return window.lifecycleTasks.get(id)
        if (operation === 'list') return window.lifecycleTasks.list()
        return window.lifecycleTasks.result(id, query)
      },
      { operation, id: initial.id, query: referenceQuery },
    )
    try {
      await held.started
      expect(await other.evaluate((id) => window.lifecycleTasks.delete(id), initial.id)).toEqual({
        ok: true,
      })
      expect(
        await other.evaluate((task) => window.lifecycleTasks.restore(task), replacement),
      ).toMatchObject({ ok: true })
    } finally {
      held.release()
    }
    expect(await delayed).toMatchObject(
      operation === 'list'
        ? { issues: [{ code: 'RECORD_CHANGED' }] }
        : { ok: false, code: 'RECORD_CHANGED' },
    )
    const saved = await other.evaluate((id) => window.lifecycleTasks.get(id), initial.id)
    if (!saved.ok) throw new Error(saved.error)
    expect(saved.task.catalog).toBeUndefined()
    expect(saved.task.referenceSeed).toBe(change === 'remove' ? undefined : 4294967295)
    expect(saved.task.referenceVersion).toBe(
      change === 'remove' ? undefined : 'synthetic-observations-v1',
    )
    expect(
      await other.evaluate(({ id, query }) => window.lifecycleTasks.result(id, query), {
        id: initial.id,
        query: referenceQuery,
      }),
    ).toMatchObject({ ok: true, values: [{ value: change === 'remove' ? -0.8 : 0.2 }] })
  },
  30_000,
)

it.each([
  ['wind', '2024-01-01T12:00:00Z', 'MISSING_COMPONENT'],
  ['precipitation', '2024-01-01T04:00:00Z', 'MISSING_DATA'],
] as const)(
  'samples the reviewer native %s node without a positive weight on its missing neighbor',
  async (variable, time, missingCode) => {
    await environment.signIn('researcher')
    const page = await environment.open()
    const created = await page.evaluate((input) => window.lifecycleTasks.create(input), {
      ...lifecycleConfiguration,
      variable,
      dataSource: 'ecmwf',
      resolution: '1km',
      region: { west: 10.01, east: 30, south: 66, north: 67 },
    })
    if (!created.ok) throw new Error(created.error)
    const task = { ...created.task, id: `${created.task.id}-fixed`, dataSeed: 42 }
    expect(
      await page.evaluate((input) => window.lifecycleTasks.restore(input), task),
    ).toMatchObject({ ok: true })
    environment.advance(2_500)
    const result = (query: ResultQuery) =>
      page.evaluate(({ id, query }) => window.lifecycleTasks.result(id, query), {
        id: task.id,
        query,
      })
    const preview = await result({
      kind: 'preview',
      layer: 'downscaled',
      temporalResolution: 'hourly',
      window: { west: 25.01, east: 26, south: 66, north: 66 },
      times: ['2024-01-01T00:00:00Z'],
      maxPoints: 4,
    })
    // The point is an actual emitted native node, not an arbitrary almost-integer fixture.
    expect(preview).toMatchObject({
      ok: true,
      grid: { logicalGrid: { spacingDegrees: { longitude: 0.022528232540134755 } } },
    })
    if (!preview.ok || !('grid' in preview) || !preview.grid || !('logicalGrid' in preview.grid))
      throw new Error('Expected preview grid')
    const longitude =
      preview.grid.logicalGrid.origin.longitude +
      666 * preview.grid.logicalGrid.spacingDegrees.longitude
    expect(longitude).toBe(25.013802871729744)
    const point = { longitude, latitude: 66 }
    const expected =
      variable === 'wind'
        ? { u10: 5.9891, v10: 10.2321, speed: 11.856, value: 11.856 }
        : {
            value: 1.346,
            accumulation: {
              start: '2024-01-01T04:00:00.000Z',
              end: '2024-01-01T05:00:00.000Z',
              complete: true,
            },
          }
    for (const kind of ['points', 'export', 'grid'] as const) {
      const location =
        kind === 'points'
          ? { kind, points: [point] }
          : { kind, window: { west: longitude, east: longitude, south: 66, north: 66 } }
      expect(
        await result({
          ...location,
          layer: 'downscaled',
          temporalResolution: 'hourly',
          times: [time],
        }),
      ).toMatchObject({ ok: true, values: [{ ...point, ...expected }] })
    }
    for (const offset of [1e-12, 0.001]) {
      expect(
        await result({
          kind: 'points',
          layer: 'downscaled',
          temporalResolution: 'hourly',
          points: [{ longitude: longitude - offset, latitude: 66 }],
          times: [time],
        }),
      ).toMatchObject({ ok: false, code: missingCode })
    }
    expect(
      await result({
        kind: 'points',
        layer: 'downscaled',
        temporalResolution: 'hourly',
        points: [{ longitude: longitude + 1e-12, latitude: 66 }],
        times: [time],
      }),
    ).toMatchObject({ ok: true, values: [expected] })
  },
  30_000,
)

it('keeps an admitted forecast readable across the submission hour rollover and later restoration', async () => {
  await environment.signIn('researcher')
  const page = await environment.open()
  const instants = [Date.parse('2026-10-13T08:59:59.999Z')]
  const afterRollover = Date.parse('2026-10-13T09:00:00.000Z')
  environment.setClock(() => instants.shift() ?? afterRollover)
  const configuration = {
    ...lifecycleConfiguration,
    timeRange: {
      mode: 'forecast',
      start: '2026-10-13T08:00:00.000Z',
      end: '2026-10-13T09:00:00.000Z',
    },
  }
  const created = await page.evaluate((input) => window.lifecycleTasks.create(input), configuration)
  expect(created).toMatchObject({ ok: true })
  if (!created.ok) throw new Error(created.error)
  // Creation cannot report success for a record its very next public read rejects.
  expect(await page.evaluate((id) => window.lifecycleTasks.get(id), created.task.id)).toMatchObject(
    { ok: true },
  )
  expect(created.task).toMatchObject({
    createdAt: '2026-10-13T08:59:59.999Z',
    submittedAt: '2026-10-13T08:59:59.999Z',
    completionAt: '2026-10-13T09:00:02.499Z',
  })
  // Expired forecasts stay restorable; only new admission uses the current hour.
  environment.setClock(() => Date.parse('2026-10-21T09:00:00.000Z'))
  const restored = await page.evaluate((task) => window.lifecycleTasks.restore(task), {
    ...created.task,
    id: `${created.task.id}-backup`,
  })
  expect(restored).toMatchObject({ ok: true, task: { submittedAt: created.task.submittedAt } })
  expect(
    await page.evaluate((id) => window.lifecycleTasks.get(id), `${created.task.id}-backup`),
  ).toMatchObject({ ok: true, task: { status: 'Completed' } })
  expect(
    await page.evaluate((input) => window.lifecycleTasks.create(input), configuration),
  ).toMatchObject({
    ok: false,
    code: 'INVALID_CONFIGURATION',
  })
  // The server still owns identity and method authorization when a caller forges role hints.
  await environment.signIn('policy')
  expect(
    await page.evaluate((input) => window.lifecycleTasks.create(input), {
      ...lifecycleConfiguration,
      role: 'researcher',
      ownerId: 'researcher',
      method: 'probabilistic',
    }),
  ).toMatchObject({ ok: false, code: 'ROLE_RESTRICTED' })
  await environment.signOut()
  await expect(
    page.evaluate((input) => window.lifecycleTasks.create(input), lifecycleConfiguration),
  ).rejects.toThrow('AUTHENTICATION_REQUIRED')
}, 30_000)

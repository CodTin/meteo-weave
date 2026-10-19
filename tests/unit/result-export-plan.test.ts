import { describe, expect, it } from 'vitest'
import { createExportPlan } from '@/server/services/result-export-plan.server'
import { exportRequest, exportTask } from '../factories/export-task'

describe('authoritative export selection', () => {
  it('counts independent native axes and actual stations over a half-open hourly range', () => {
    const task = exportTask()
    const reply = createExportPlan(exportRequest(task), task)
    expect(reply.ok).toBe(true)
    if (!reply.ok) throw new Error(reply.message)
    expect(reply.timeInstants).toEqual(['2024-01-01T00:00:00.000Z', '2024-01-01T01:00:00.000Z'])
    expect(
      reply.layers.map(({ dataType, pointCount, resolutionKm }) => ({
        dataType,
        pointCount,
        resolutionKm,
      })),
    ).toEqual([
      { dataType: 'original', pointCount: 6, resolutionKm: 10 },
      { dataType: 'downscaled', pointCount: 20, resolutionKm: 3 },
      { dataType: 'observation', pointCount: 1, resolutionKm: null },
    ])
    expect(reply.recordCount).toBe(54)
    const stationLayer = reply.layers[2]
    expect(stationLayer?.dataType).toBe('observation')
    if (stationLayer?.dataType !== 'observation') throw new Error('Expected station layer')
    expect(stationLayer.stations).toEqual([
      { id: 'synthetic-station-v1:120:30', longitude: 120, latitude: 30 },
    ])
  })
})

it('authenticates the full saved task under the actual current Demo request', async () => {
  const { requestHandler } = await import('@tanstack/react-start/server')
  const { authenticateExportPlan } = await import('@/server/services/result-export-plan.server')
  const { loginDemoAccount } = await import('@/server/services/demo-session.server')
  const { isRedirect } = await import('@tanstack/react-router')
  const login = await requestHandler(() =>
    Response.json(loginDemoAccount({ account: 'researcher', password: 'meteo-demo' })),
  )(new Request('http://demo.test/login', { method: 'POST' }), {})
  const cookie = login.headers.get('set-cookie')!.split(';')[0]!
  const task = exportTask()
  const dispatch = (input: unknown, accountCookie = cookie) =>
    requestHandler(() => {
      try {
        return Response.json(authenticateExportPlan(input))
      } catch (error) {
        if (isRedirect(error)) return error
        throw error
      }
    })(
      new Request('http://demo.test/export', {
        method: 'POST',
        headers: { cookie: accountCookie },
      }),
      {},
    )
  expect((await dispatch(exportRequest(task))).status).toBe(200)
  expect(await (await dispatch(exportRequest(task))).json()).toMatchObject({
    ok: true,
    recordCount: 54,
  })
  const foreign = exportTask({ ownerId: 'policy' })
  expect(await (await dispatch(exportRequest(foreign))).json()).toMatchObject({
    ok: false,
    code: 'NOT_FOUND',
  })
  expect(
    await (await dispatch({ ...exportRequest(task), task: { id: task.id } })).json(),
  ).toMatchObject({ ok: false })
  expect(
    await (await dispatch({ ...exportRequest(task), taskId: 'different' })).json(),
  ).toMatchObject({ ok: false, code: 'TASK_ID_MISMATCH' })
  expect((await dispatch(exportRequest(task), '')).status).toBe(307)
})

it('rejects unknown request fields rather than silently changing the supplied identity', () => {
  const task = exportTask()
  expect(
    createExportPlan({ ...exportRequest(task), unsupportedSelection: true }, task),
  ).toMatchObject({ ok: false, code: 'INVALID_REQUEST' })
})

it('selects cropped native task axes rather than rebuilding a lattice at the crop origin', () => {
  const task = exportTask()
  const reply = createExportPlan(
    exportRequest(task, {
      dataTypes: ['downscaled'],
      bbox: { west: 120.02, east: 120.09, south: 30.01, north: 30.06 },
    }),
    task,
  )
  if (!reply.ok) throw new Error(reply.message)
  const layer = reply.layers[0]!
  if (layer.dataType === 'observation') throw new Error('Expected grid')
  expect(layer.pointCount).toBe(4)
  expect(layer.axes.longitudes[0]).not.toBe(120.02)
  expect(layer.axes.latitudes[0]).not.toBe(30.01)
  expect(layer.axes.longitudes[0]).toBeCloseTo(120.03113, 5)
  expect(layer.axes.latitudes).toEqual([30 + 3 / 111.32, 30 + 6 / 111.32])
})

it('canonicalizes selected data types and offset times into one immutable request identity', () => {
  const task = exportTask()
  const first = createExportPlan(exportRequest(task), task)
  const second = createExportPlan(
    exportRequest(task, {
      dataTypes: ['observation', 'downscaled', 'original'],
      timeRange: { start: '2024-01-01T08:00:00+08:00', end: '2024-01-01T10:00:00+08:00' },
    }),
    task,
  )
  if (!first.ok || !second.ok) throw new Error('Expected plans')
  expect(first.identity).toBe(second.identity)
  const duplicate = createExportPlan(
    exportRequest(task, { dataTypes: ['original', 'original'] }),
    task,
  )
  if (!duplicate.ok) throw new Error(duplicate.message)
  expect(duplicate.layers).toHaveLength(1)
  expect(duplicate.recordCount).toBe(12)
  const changed = exportTask({ dataSeed: 54321 })
  const next = createExportPlan(exportRequest(changed), changed)
  if (!next.ok) throw new Error(next.message)
  expect(next.identity).not.toBe(first.identity)
})

it('keeps zero station contributions explicit and rejects all-zero selection without making a fake file', () => {
  const task = exportTask({ region: { west: 120.1, east: 120.2, south: 30.1, north: 30.2 } })
  const mixed = createExportPlan(exportRequest(task), task)
  if (!mixed.ok) throw new Error(mixed.message)
  expect(mixed.layers.at(-1)).toEqual({
    dataType: 'observation',
    pointCount: 0,
    resolutionKm: null,
    stations: [],
  })
  expect(mixed.notes).toEqual(['No native observation locations in the selected bbox (0 records).'])
  expect(createExportPlan(exportRequest(task, { dataTypes: ['observation'] }), task)).toMatchObject(
    { ok: false, code: 'NO_EXPORT_DATA' },
  )
})

it('honors legacy date-only historical inclusive last date but normalized ISO half-open coverage only once', () => {
  const legacy = exportTask({
    timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-01-01' },
  })
  const hourly = createExportPlan(
    exportRequest(legacy, {
      dataTypes: ['original'],
      timeRange: { start: '2024-01-01T00:00:00.000Z', end: '2024-01-02T00:00:00.000Z' },
    }),
    legacy,
  )
  if (!hourly.ok) throw new Error(hourly.message)
  expect(hourly.timeInstants).toHaveLength(24)
  expect(hourly.timeInstants.at(-1)).toBe('2024-01-01T23:00:00.000Z')
  const normalized = exportTask({
    timeRange: {
      mode: 'historical',
      start: '2023-12-31T16:00:00.000Z',
      end: '2024-01-01T16:00:00.000Z',
    },
  })
  const within = createExportPlan(
    exportRequest(normalized, {
      dataTypes: ['original'],
      timeRange: { start: '2023-12-31T16:00:00.000Z', end: '2024-01-01T16:00:00.000Z' },
    }),
    normalized,
  )
  if (!within.ok) throw new Error(within.message)
  expect(within.timeInstants).toHaveLength(24)
  expect(
    createExportPlan(
      exportRequest(normalized, {
        timeRange: { start: '2024-01-01T00:00:00.000Z', end: '2024-01-02T00:00:00.000Z' },
      }),
      normalized,
    ),
  ).toMatchObject({ ok: false, code: 'OUTSIDE_COVERAGE' })
})

it('accepts UTC-aligned daily temperature/rain and rejects partial, empty or unsupported daily ranges', () => {
  const task = exportTask()
  const plan = createExportPlan(
    exportRequest(task, {
      temporalResolution: 'daily',
      timeRange: { start: '2024-01-01T00:00:00.000Z', end: '2024-01-03T00:00:00.000Z' },
    }),
    task,
  )
  if (!plan.ok) throw new Error(plan.message)
  expect(plan.timeInstants).toEqual(['2024-01-01T00:00:00.000Z', '2024-01-02T00:00:00.000Z'])
  expect(plan.recordCount).toBe(54)
  for (const timeRange of [
    { start: '2024-01-01T00:15:00.000Z', end: '2024-01-01T01:00:00.000Z' },
    { start: '2024-01-01T00:00:00.000Z', end: '2024-01-01T00:00:00.000Z' },
    { start: '2024-01-01T01:00:00.000Z', end: '2024-01-01T02:00:00.000Z' },
  ])
    expect(
      createExportPlan(exportRequest(task, { temporalResolution: 'daily', timeRange }), task),
    ).toMatchObject({ ok: false, code: 'INVALID_TIME_RANGE' })
  for (const variable of ['wind', 'pressure'] as const) {
    const unsupported = exportTask({ variable })
    expect(
      createExportPlan(
        exportRequest(unsupported, {
          temporalResolution: 'daily',
          timeRange: { start: '2024-01-01T00:00:00.000Z', end: '2024-01-02T00:00:00.000Z' },
        }),
        unsupported,
      ),
    ).toMatchObject({ ok: false, code: 'UNAVAILABLE_QUERY' })
  }
})

it('accepts exact 100km edges and 720 hours but rejects just-over requests with shrinking directions', () => {
  const task = exportTask({
    region: { west: 0, east: 2, south: 0, north: 2 },
    timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-02-01' },
  })
  const edgeDegrees = 100 / ((6371 * Math.PI) / 180)
  const boundary = createExportPlan(
    exportRequest(task, {
      dataTypes: ['original'],
      bbox: { west: 0, east: edgeDegrees, south: 0, north: edgeDegrees },
      timeRange: { start: '2024-01-01T00:00:00.000Z', end: '2024-01-01T01:00:00.000Z' },
    }),
    task,
  )
  expect(boundary.ok).toBe(true)
  expect(
    createExportPlan(
      exportRequest(task, { bbox: { west: 0, east: edgeDegrees + 1e-8, south: 0, north: 0.01 } }),
      task,
    ),
  ).toMatchObject({ ok: false, code: 'BBOX_TOO_LARGE' })
  expect(
    createExportPlan(
      exportRequest(task, { bbox: { west: 0, east: 0.01, south: 0, north: edgeDegrees + 1e-8 } }),
      task,
    ),
  ).toMatchObject({ ok: false, code: 'BBOX_TOO_LARGE' })
  const range = exportRequest(task, {
    dataTypes: ['original'],
    bbox: { west: 0, east: 0.01, south: 0, north: 0.01 },
    timeRange: { start: '2024-01-01T00:00:00.000Z', end: '2024-01-31T00:00:00.000Z' },
  })
  const month = createExportPlan(range, task)
  if (!month.ok) throw new Error(month.message)
  expect(month.timeInstants).toHaveLength(720)
  expect(
    createExportPlan(
      { ...range, timeRange: { ...range.timeRange, end: '2024-01-31T01:00:00.000Z' } },
      task,
    ),
  ).toMatchObject({ ok: false, code: 'TIME_RANGE_TOO_LARGE' })
})

it.each([NaN, Infinity, -Infinity])(
  'rejects nonfinite bbox coordinates %s before layout allocation',
  (coordinate) => {
    const task = exportTask()
    expect(
      createExportPlan(
        exportRequest(task, { bbox: { ...task.configuration.region, north: coordinate } }),
        task,
      ),
    ).toMatchObject({ ok: false, code: 'INVALID_REQUEST' })
  },
)

it('rejects unsupported saved schema/reference/generator or noncompleted task without substituting scientific missing', () => {
  for (const [task, code] of [
    [exportTask({ generatorVersion: 'future-generator' }), 'INCOMPATIBLE_GENERATOR'],
    [exportTask({ referenceVersion: 'future-reference' }), 'INCOMPATIBLE_REFERENCE'],
    [exportTask({ status: 'Running' }), 'RUNNING'],
    [exportTask({ status: 'Failed' }), 'FAILED'],
  ] as const)
    expect(createExportPlan(exportRequest(task), task)).toMatchObject({ ok: false, code })
  const invalid = { ...exportTask(), schemaVersion: 99 }
  expect(createExportPlan(exportRequest(invalid), invalid)).toMatchObject({
    ok: false,
    code: 'INCOMPATIBLE_SCHEMA',
  })
})

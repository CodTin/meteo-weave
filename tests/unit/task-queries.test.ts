import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import type { ResultQuery } from '@/features/downscaling-tasks/service'
import { queryConfiguration, startQueryBrowser } from './task-query-browser'

let browser: Awaited<ReturnType<typeof startQueryBrowser>>
beforeAll(async () => {
  browser = await startQueryBrowser()
})
beforeEach(async () => {
  await browser.open()
})
afterEach(async () => {
  await browser.reset()
})
afterAll(async () => {
  await browser?.close()
})

it('reads a daily time series through the same field as legacy point queries', async () => {
  const task = await browser.seed()
  const point = { longitude: 110.5, latitude: 30.5 }
  const points = await browser.result(task, {
    kind: 'points',
    layer: 'downscaled',
    points: [point],
    times: ['2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z', '2024-01-03T00:00:00Z'],
  })
  expect(points).toMatchObject({
    ok: true,
    values: [{ value: 19.1241 }, { value: 19.3335 }, { value: 19.316 }],
  })
  const series = await browser.result(task, {
    kind: 'time-series',
    layer: 'downscaled',
    point,
    timeRange: { start: '2024-01-01T08:00:00+08:00', end: '2024-01-03T00:00:00Z' },
  })
  expect(series).toEqual(points)
})

it('exports the same target lattice as a grid window and its independently requested points', async () => {
  const task = await browser.seed()
  const query = {
    kind: 'grid',
    layer: 'downscaled',
    window: { west: 110, east: 110.08, south: 30, north: 30.06 },
    times: ['2024-01-02T08:00:00+08:00'],
  } as const
  const grid = await browser.result(task, { ...query, times: [...query.times] })
  expect(grid).toMatchObject({
    ok: true,
    grid: {
      sampling: 'logical-grid',
      nominalSpacingKm: 3,
      coordinateOrder: 'longitude-latitude',
      availablePoints: 9,
      returnedPoints: 9,
      stride: { columns: 1, rows: 1 },
    },
  })
  if (!grid.ok) throw new Error('Expected grid')
  expect(grid.values).toHaveLength(9)
  expect(grid.values[0]).toMatchObject({ longitude: 110, latitude: 30 })
  const exported = await browser.result(task, { ...query, kind: 'export', times: [...query.times] })
  expect(exported).toEqual(grid)
  const points = await browser.result(task, {
    kind: 'points',
    layer: 'downscaled',
    points: grid.values.map(({ longitude, latitude }) => ({ longitude, latitude })),
    times: ['2024-01-02T00:00:00Z'],
  })
  expect(points).toMatchObject({ ok: true, values: grid.values, unit: grid.unit, taskId: task.id })
})

it('previews a global multi-year task with bounded native-node samples, not an export-resolution substitute', async () => {
  const task = await browser.seed({
    ...queryConfiguration,
    resolution: '1km',
    region: { west: -180, east: 180, south: -90, north: 90 },
    timeRange: { mode: 'historical', start: '2020-01-01', end: '2024-12-31' },
  })
  const preview = await browser.result(task, {
    kind: 'preview',
    layer: 'downscaled',
    window: task.configuration.region,
    times: ['2020-01-01T00:00:00Z', '2024-12-31T00:00:00Z'],
    maxPoints: 16,
  })
  expect(preview).toMatchObject({
    ok: true,
    grid: {
      nominalSpacingKm: 1,
      sampling: 'decimated-grid',
      logicalGrid: { dimensions: { columns: 40077, rows: 20039 } },
    },
  })
  if (!preview.ok || preview.grid.sampling === 'requested-points')
    throw new Error('Expected preview')
  expect(preview.values.length).toBeLessThanOrEqual(32)
  expect(preview.grid.availablePoints).toBeGreaterThan(800_000_000)
  expect(preview.grid.returnedPoints).toBeLessThanOrEqual(16)
  expect(preview.grid.stride.columns).toBeGreaterThan(1)
  expect(preview.grid.stride.rows).toBeGreaterThan(1)
  expect(preview.values[0]).toMatchObject({ longitude: -180, latitude: -90 })
  expect(preview.values.at(-1)).toMatchObject({ longitude: 180, latitude: 90 })
  const sample = preview.values[2]!
  const exact = await browser.result(task, {
    kind: 'export',
    layer: 'downscaled',
    window: {
      west: sample.longitude,
      east: sample.longitude,
      south: sample.latitude,
      north: sample.latitude,
    },
    times: [sample.time],
  })
  expect(exact).toMatchObject({
    ok: true,
    grid: { sampling: 'logical-grid', nominalSpacingKm: 1 },
    values: [sample],
  })
  const points = await browser.result(task, {
    kind: 'points',
    layer: 'downscaled',
    points: [{ longitude: sample.longitude, latitude: sample.latitude }],
    times: [sample.time],
  })
  expect(points).toMatchObject({ ok: true, values: [sample] })
  expect(
    await browser.result(task, {
      kind: 'export',
      layer: 'downscaled',
      window: task.configuration.region,
      times: ['2024-01-01T00:00:00Z'],
    }),
  ).toMatchObject({ ok: false, code: 'QUERY_LIMIT_EXCEEDED' })
})

it.each(['ecmwf', 'gfs', 'fusion'] as const)(
  'keeps %s values consistent across modes while 1/3/5km change the real target grid',
  async (dataSource) => {
    const window = { west: 110, east: 110.08, south: 30, north: 30.06 }
    const times = ['2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z']
    const counts: number[] = []
    const originals: unknown[] = []
    const nonNodeValues: number[] = []
    for (const resolution of ['1km', '3km', '5km'] as const) {
      const task = await browser.seed({ ...queryConfiguration, dataSource, resolution })
      const exported = await browser.result(task, {
        kind: 'export',
        layer: 'downscaled',
        window,
        times,
      })
      if (!exported.ok || exported.grid.sampling === 'requested-points')
        throw new Error('Expected exact grid')
      counts.push(exported.grid.returnedPoints)
      expect(exported.grid.nominalSpacingKm).toBe(Number.parseInt(resolution))
      const preview = await browser.result(task, {
        kind: 'preview',
        layer: 'downscaled',
        window,
        times,
        maxPoints: 256,
      })
      expect(preview).toEqual(exported)
      const grid = await browser.result(task, {
        kind: 'grid',
        layer: 'downscaled',
        window,
        times: [...times].reverse(),
      })
      if (!grid.ok) throw new Error('Expected grid')
      expect(grid.values).toEqual([
        ...exported.values.filter((value) => value.time === '2024-01-02T00:00:00.000Z'),
        ...exported.values.filter((value) => value.time === '2024-01-01T00:00:00.000Z'),
      ])
      const point = { longitude: 110.037, latitude: 30.047 }
      const points = await browser.result(task, {
        kind: 'points',
        layer: 'downscaled',
        points: [point],
        times,
      })
      const series = await browser.result(task, {
        kind: 'time-series',
        layer: 'downscaled',
        point,
        timeRange: { start: times[0]!, end: times[1]! },
      })
      expect(series).toEqual(points)
      if (!points.ok) throw new Error('Expected points')
      nonNodeValues.push(points.values[0]!.value)
      const original = await browser.result(task, {
        kind: 'grid',
        layer: 'original',
        window,
        times,
      })
      expect(original).toMatchObject({
        ok: true,
        grid: { nominalSpacingKm: 10, returnedPoints: 1 },
      })
      if (!original.ok) throw new Error('Expected original')
      originals.push(original.values)
      expect(await browser.get(task)).toMatchObject({
        ok: true,
        task: {
          id: task.id,
          ownerId: 'researcher',
          dataSeed: 42,
          generatorVersion: 'synthetic-temperature-v1',
          configuration: { dataSource, resolution },
        },
      })
    }
    expect(counts).toEqual([56, 9, 4])
    expect(new Set(nonNodeValues).size).toBe(3)
    expect(originals[1]).toEqual(originals[0])
    expect(originals[2]).toEqual(originals[0])
  },
)

it('uses hand-weighted bilinear values at a clipped cell and never fills missing spatial or temporal coverage', async () => {
  const region = { west: 0, east: 0.01, south: 0, north: 0.01 }
  const task = await browser.seed({ ...queryConfiguration, region })
  for (const layer of ['original', 'downscaled'] as const) {
    const corners = await browser.result(task, {
      kind: 'grid',
      layer,
      window: region,
      times: ['2024-01-01T00:00:00Z'],
    })
    if (!corners.ok) throw new Error('Expected corners')
    expect(corners.values.map(({ longitude, latitude }) => [longitude, latitude])).toEqual([
      [0, 0],
      [0.01, 0],
      [0, 0.01],
      [0.01, 0.01],
    ])
    const sampled = await browser.result(task, {
      kind: 'points',
      layer,
      points: [
        { longitude: 0.005, latitude: 0.005 },
        { longitude: 0.0025, latitude: 0.0075 },
      ],
      times: ['2024-01-01T00:00:00Z'],
    })
    if (!sampled.ok) throw new Error('Expected interpolation')
    const [sw, se, nw, ne] = corners.values.map((value) => value.value)
    // Independent four-corner weights: centre is 1/4 each, quarter/three-quarter is 3:1:9:3.
    const centre = (sw! + se! + nw! + ne!) / 4
    const offCentre = (3 * sw! + se! + 9 * nw! + 3 * ne!) / 16
    expect(Math.abs(sampled.values[0]!.value - centre)).toBeLessThanOrEqual(0.0001)
    expect(Math.abs(sampled.values[1]!.value - offCentre)).toBeLessThanOrEqual(0.0001)
    for (const point of [
      { longitude: -0.000001, latitude: 0.005 },
      { longitude: 0.010001, latitude: 0.005 },
      { longitude: 0.005, latitude: -0.000001 },
      { longitude: 0.005, latitude: 0.010001 },
    ]) {
      expect(
        await browser.result(task, {
          kind: 'points',
          layer,
          points: [point],
          times: ['2024-01-01T00:00:00Z'],
        }),
      ).toMatchObject({ ok: false, code: 'OUTSIDE_COVERAGE' })
    }
    expect(
      await browser.result(task, {
        kind: 'export',
        layer,
        window: { west: 0.004, east: 0.006, south: 0.004, north: 0.006 },
        times: ['2024-01-01T00:00:00Z'],
      }),
    ).toMatchObject({ ok: false, code: 'EMPTY_WINDOW' })
    expect(
      await browser.result(task, {
        kind: 'time-series',
        layer,
        point: { longitude: 0.005, latitude: 0.005 },
        timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T01:00:00Z' },
      }),
    ).toMatchObject({ ok: false, code: 'OUTSIDE_COVERAGE' })
    expect(
      await browser.result(task, {
        kind: 'preview',
        layer,
        window: { ...region, east: 0.010001 },
        times: ['2024-01-01T00:00:00Z'],
        maxPoints: 4,
      }),
    ).toMatchObject({ ok: false, code: 'OUTSIDE_COVERAGE' })
  }
})

it('reassembles offset windows and time slices in any request order, even after a native browser reopen', async () => {
  const task = await browser.seed()
  const window = { west: 110.01, east: 110.09, south: 30.01, north: 30.07 }
  const times = ['2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z']
  const whole = await browser.result(task, { kind: 'export', layer: 'downscaled', window, times })
  if (!whole.ok) throw new Error('Expected exact window')
  expect(whole.values[0]!.longitude).toBeGreaterThan(window.west)
  const right = await browser.result(task, {
    kind: 'grid',
    layer: 'downscaled',
    window: { ...window, west: 110.05 },
    times: [times[1]!],
  })
  const left = await browser.result(task, {
    kind: 'export',
    layer: 'downscaled',
    window: { ...window, east: 110.05 },
    times: [times[1]!],
  })
  if (!left.ok || !right.ok) throw new Error('Expected partitioned window')
  expect(
    [...left.values, ...right.values].sort(
      (a, b) => a.latitude - b.latitude || a.longitude - b.longitude,
    ),
  ).toEqual(whole.values.filter((value) => value.time === '2024-01-02T00:00:00.000Z'))
  await browser.reopen()
  expect(await browser.result(task, { kind: 'grid', layer: 'downscaled', window, times })).toEqual(
    whole,
  )
  const first = await browser.result(task, {
    kind: 'export',
    layer: 'downscaled',
    window,
    times: [times[0]!],
  })
  if (!first.ok) throw new Error('Expected time slice')
  expect(first.values).toEqual(
    whole.values.filter((value) => value.time === '2024-01-01T00:00:00.000Z'),
  )
  expect(await browser.get(task)).toMatchObject({
    ok: true,
    task: {
      id: task.id,
      dataSeed: 42,
      generatorVersion: task.generatorVersion,
      ownerId: task.ownerId,
    },
  })
})

it('bounds grid, preview and time-series products before expanding space or time', async () => {
  const task = await browser.seed({
    ...queryConfiguration,
    resolution: '1km',
    timeRange: { mode: 'historical', start: '2020-01-01', end: '2024-12-31' },
  })
  const geometry = await browser.result(task, {
    kind: 'preview',
    layer: 'downscaled',
    window: task.configuration.region,
    times: ['2024-01-01T00:00:00Z'],
    maxPoints: 1,
  })
  if (!geometry.ok || geometry.grid.sampling === 'requested-points')
    throw new Error('Expected geometry')
  const spacing = geometry.grid.logicalGrid.spacingDegrees
  const window = {
    west: 110,
    east: 110 + 15 * spacing.longitude,
    south: 30,
    north: 30 + 15 * spacing.latitude,
  }
  const grid = await browser.result(task, {
    kind: 'export',
    layer: 'downscaled',
    window,
    times: ['2024-01-01T00:00:00Z'],
  })
  expect(grid).toMatchObject({ ok: true, grid: { returnedPoints: 256 } })
  if (!grid.ok) throw new Error('Expected 256 values')
  expect(grid.values).toHaveLength(256)
  expect(
    await browser.result(task, {
      kind: 'grid',
      layer: 'downscaled',
      window,
      times: ['2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z'],
    }),
  ).toMatchObject({ ok: false, code: 'QUERY_LIMIT_EXCEEDED' })
  expect(
    await browser.result(task, {
      kind: 'grid',
      layer: 'downscaled',
      window: { ...window, east: 110 + 16 * spacing.longitude },
      times: ['2024-01-01T00:00:00Z'],
    }),
  ).toMatchObject({ ok: false, code: 'QUERY_LIMIT_EXCEEDED' })
  expect(
    await browser.result(task, {
      kind: 'time-series',
      layer: 'downscaled',
      point: { longitude: 110.5, latitude: 30.5 },
      timeRange: { start: '2020-01-01T00:00:00Z', end: '2024-12-31T00:00:00Z' },
    }),
  ).toMatchObject({ ok: false, code: 'QUERY_LIMIT_EXCEEDED' })
  const times = Array.from({ length: 168 }, (_, day) =>
    new Date(Date.UTC(2024, 0, day + 1)).toISOString(),
  )
  const preview = await browser.result(task, {
    kind: 'preview',
    layer: 'downscaled',
    window: task.configuration.region,
    times,
    maxPoints: 256,
  })
  expect(preview).toMatchObject({
    ok: true,
    grid: { returnedPoints: 1, sampled: { columns: 1, rows: 1 } },
  })
  if (!preview.ok) throw new Error('Expected bounded preview')
  expect(preview.values).toHaveLength(168)
  const series = await browser.result(task, {
    kind: 'time-series',
    layer: 'original',
    point: { longitude: 110.5, latitude: 30.5 },
    timeRange: { start: times[0]!, end: times.at(-1)! },
  })
  if (!series.ok) throw new Error('Expected bounded series')
  expect(series.values).toHaveLength(168)
  const query = {
    kind: 'preview',
    layer: 'downscaled',
    window: task.configuration.region,
    times: [times[0]!],
    maxPoints: 256,
  }
  for (const malformed of [
    { ...query, maxPoints: 257 },
    { ...query, maxPoints: 0 },
    { ...query, maxPoints: 1.5 },
    { ...query, window: { ...query.window, north: 29 } },
    { ...query, times: [] },
    { ...query, times: [...times, '2024-12-31T00:00:00Z'] },
    { ...query, times: ['2024-01-01T00:00:00'] },
    { ...query, maxPoints: undefined },
    { ...query, targetResolution: '5km' },
  ]) {
    expect(await browser.rpc('result', { task, query: malformed })).toMatchObject({
      ok: false,
      code: 'UNAVAILABLE_QUERY',
    })
  }
})

it('uses hourly forecast snapshots and normalizes timezone offsets for every query mode', async () => {
  const task = await browser.seed({
    ...queryConfiguration,
    timeRange: { mode: 'forecast', start: '2026-10-13T08:00:00Z', end: '2026-10-13T10:00:00Z' },
  })
  const point = { longitude: 110, latitude: 30 }
  const series = await browser.result(task, {
    kind: 'time-series',
    layer: 'original',
    point,
    timeRange: { start: '2026-10-13T16:00:00+08:00', end: '2026-10-13T10:00:00Z' },
  })
  if (!series.ok) throw new Error('Expected hourly series')
  expect(series.values.map((value) => value.time)).toEqual([
    '2026-10-13T08:00:00.000Z',
    '2026-10-13T09:00:00.000Z',
    '2026-10-13T10:00:00.000Z',
  ])
  expect(series).toMatchObject({
    unit: '°C',
    displayTimezone: 'UTC',
    temporalStatistic: 'instantaneous',
    provenance: { label: 'Synthetic Demo' },
  })
  for (const kind of ['grid', 'export', 'preview'] as const) {
    const query = {
      kind,
      layer: 'original',
      window: { west: 110, east: 110, south: 30, north: 30 },
      times: series.values.map((value) => value.time),
    } as const
    const result = await browser.result(
      task,
      kind === 'preview' ? { ...query, kind, maxPoints: 1 } : { ...query, kind },
    )
    expect(result).toMatchObject({
      ok: true,
      values: series.values,
      unit: series.unit,
      displayTimezone: series.displayTimezone,
    })
  }
  expect(
    await browser.result(task, {
      kind: 'time-series',
      layer: 'original',
      point,
      timeRange: { start: '2026-10-13T08:00:00Z', end: '2026-10-13T08:30:00Z' },
    }),
  ).toMatchObject({ ok: false, code: 'OUTSIDE_COVERAGE' })
})

it('keeps all new query modes behind the current authenticated account and saved version', async () => {
  const task = await browser.seed()
  const modes = [
    {
      kind: 'grid',
      layer: 'downscaled',
      window: { west: 110, east: 110, south: 30, north: 30 },
      times: ['2024-01-01T00:00:00Z'],
    },
    {
      kind: 'export',
      layer: 'downscaled',
      window: { west: 110, east: 110, south: 30, north: 30 },
      times: ['2024-01-01T00:00:00Z'],
    },
    {
      kind: 'preview',
      layer: 'downscaled',
      window: { west: 110, east: 110, south: 30, north: 30 },
      times: ['2024-01-01T00:00:00Z'],
      maxPoints: 1,
    },
    {
      kind: 'time-series',
      layer: 'downscaled',
      point: { longitude: 110, latitude: 30 },
      timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T00:00:00Z' },
    },
  ] satisfies ResultQuery[]
  for (const query of modes) {
    expect(await browser.result(task, query)).toMatchObject({ ok: true })
    expect(
      await browser.rpc('result', {
        task: { ...task, generatorVersion: 'synthetic-temperature-v999' },
        query,
      }),
    ).toMatchObject({ ok: false, code: 'INCOMPATIBLE_GENERATOR' })
  }
  await browser.signIn('policy')
  for (const query of modes) {
    expect(await browser.result(task, query)).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    expect(await browser.rpc('result', { task, query })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    })
  }
  await browser.signIn('researcher')
  expect(await browser.result(task, modes[0]!)).toMatchObject({ ok: true })
})

import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
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

it('saves and reopens wind with U10/V10, a 3-4-5 speed and meteorological from-direction', async () => {
  const task = await browser.seed({
    ...queryConfiguration,
    variable: 'wind',
    region: { west: 0, east: 1, south: 0, north: 1 },
  })
  expect(task.name).toContain('Wind')
  expect(task.generatorVersion).toBe('synthetic-variables-v2')
  const query = {
    kind: 'points',
    layer: 'downscaled',
    points: [{ longitude: 0, latitude: 0 }],
    times: ['2024-01-01T00:00:00Z'],
  } as const
  const result = await browser.result(task, {
    ...query,
    points: [...query.points],
    times: [...query.times],
  })
  expect(result).toMatchObject({
    ok: true,
    variable: 'wind',
    quantity: 'U10/V10',
    unit: 'm/s',
    displayTimezone: 'UTC',
    provenance: { label: 'Synthetic Demo', dataSource: 'fusion' },
    values: [
      {
        longitude: 0,
        latitude: 0,
        time: '2024-01-01T00:00:00.000Z',
        u10: 3,
        v10: 4,
        value: 5,
        speed: 5,
        fromDirection: 216.8699,
        directionStatus: 'available',
      },
    ],
  })
  await browser.reopen()
  expect(await browser.get(task)).toMatchObject({
    ok: true,
    task: { id: task.id, status: 'Completed', dataSeed: 42, configuration: { variable: 'wind' } },
  })
  expect(
    await browser.result(task, { ...query, points: [...query.points], times: [...query.times] }),
  ).toEqual(result)
})

it('creates and restores pressure as MSL hPa, not relabelled surface pressure', async () => {
  const task = await browser.seed({
    ...queryConfiguration,
    variable: 'pressure',
    region: { west: 0, east: 1, south: 0, north: 1 },
  })
  expect(task.name).toContain('MSL Pressure')
  const query = {
    kind: 'export',
    layer: 'original',
    window: { west: 0, east: 0, south: 0, north: 0 },
    times: ['2024-01-01T00:00:00Z'],
  } as const
  const result = await browser.result(task, { ...query, times: [...query.times] })
  expect(result).toMatchObject({
    ok: true,
    variable: 'pressure',
    quantity: 'MSL',
    unit: 'hPa',
    values: [{ value: 1013.25 }],
    provenance: { label: 'Synthetic Demo', generatorVersion: 'synthetic-variables-v2' },
  })
  await browser.reopen()
  expect(await browser.result(task, { ...query, times: [...query.times] })).toEqual(result)
  expect(
    await browser.result(task, {
      kind: 'points',
      layer: 'original',
      points: [{ longitude: 0, latitude: 0 }],
      times: ['2024-01-01T00:00:00Z'],
    }),
  ).toMatchObject({ ok: true, quantity: 'MSL', values: [{ value: 1013.25 }] })
})

it('reopens precipitation in mm as deduplicated interval totals rather than repeated cumulative counters', async () => {
  const task = await browser.seed({
    ...queryConfiguration,
    variable: 'precipitation',
    region: { west: 0, east: 1, south: 0, north: 1 },
  })
  expect(task.name).toContain('Precipitation')
  const query = {
    kind: 'points',
    layer: 'original',
    points: [{ longitude: 0, latitude: 0 }],
    times: ['2024-01-01T00:00:00Z', '2024-01-01T08:00:00+08:00'],
  } as const
  const result = await browser.result(task, {
    ...query,
    points: [...query.points],
    times: [...query.times],
  })
  expect(result).toMatchObject({
    ok: true,
    variable: 'precipitation',
    quantity: 'TP',
    unit: 'mm',
    temporalStatistic: 'accumulation',
    values: [
      {
        value: 9,
        accumulation: {
          start: '2024-01-01T00:00:00.000Z',
          end: '2024-01-02T00:00:00.000Z',
          bounds: '[start,end)',
          sampledHours: 24,
          expectedHours: 24,
          complete: true,
        },
      },
    ],
  })
  if (!result.ok) throw new Error('Expected precipitation')
  expect(result.values).toHaveLength(1)
  await browser.reopen()
  expect(
    await browser.result(task, { ...query, points: [...query.points], times: [...query.times] }),
  ).toEqual(result)
  const dry = await browser.seed({
    ...queryConfiguration,
    variable: 'precipitation',
    region: { west: 0, east: 1, south: 0, north: 1 },
    timeRange: { mode: 'forecast', start: '2026-10-13T08:00:00Z', end: '2026-10-13T09:00:00Z' },
  })
  expect(
    await browser.result(dry, {
      kind: 'points',
      layer: 'original',
      points: [{ longitude: 0, latitude: 0 }],
      times: ['2026-10-13T08:00:00Z'],
    }),
  ).toMatchObject({
    ok: true,
    values: [
      {
        value: 0,
        accumulation: {
          start: '2026-10-13T08:00:00.000Z',
          end: '2026-10-13T09:00:00.000Z',
          complete: true,
          sampledHours: 1,
        },
      },
    ],
  })
})

it('exposes the same temperature-v1 field hourly without changing native historical point semantics', async () => {
  const task = await browser.seed()
  const point = { longitude: 110.5, latitude: 30.5 }
  const result = await browser.result(task, {
    kind: 'time-series',
    temporalResolution: 'hourly',
    layer: 'downscaled',
    point,
    timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T23:00:00Z' },
  })
  expect(result).toMatchObject({
    ok: true,
    variable: 'temperature',
    quantity: 'T2M',
    unit: '°C',
    temporalStatistic: 'instantaneous',
    provenance: { generatorVersion: 'synthetic-temperature-v1' },
  })
  if (!result.ok) throw new Error('Expected hourly temperature')
  expect(result.values).toHaveLength(24)
  expect(result.values[0]!.value).toBe(19.1241)
  expect(result.values.map((value) => value.value)).toEqual([
    19.1241, 18.4453, 17.885, 17.4822, 17.2651, 17.2493, 17.4367, 17.8153, 18.3599, 19.0343, 19.793,
    20.5852, 21.3573, 22.0575, 22.6386, 23.0615, 23.2979, 23.3324, 23.1629, 22.8015, 22.2732,
    21.6145, 20.8705, 20.0924,
  ])
  expect(
    await browser.result(task, {
      kind: 'points',
      layer: 'downscaled',
      points: [point],
      times: ['2024-01-01T12:00:00Z'],
    }),
  ).toMatchObject({ ok: false, code: 'OUTSIDE_COVERAGE' })
  expect(
    await browser.result(task, {
      kind: 'points',
      temporalResolution: 'hourly',
      layer: 'downscaled',
      points: [point],
      times: ['2024-01-03T23:00:00Z'],
    }),
  ).toMatchObject({ ok: true })
})

it('derives daily mean and minimum from the 24 public hourly literals and flags incomplete forecast days', async () => {
  const task = await browser.seed()
  const point = { longitude: 110.5, latitude: 30.5 }
  const result = await browser.result(task, {
    kind: 'points',
    temporalResolution: 'daily',
    layer: 'downscaled',
    points: [point],
    times: ['2024-01-01T08:00:00+08:00'],
  })
  // The public hourly bank totals 487.0356 °C across 24 samples; its lowest sample is 17.2493.
  expect(result).toMatchObject({
    ok: true,
    variable: 'temperature',
    unit: '°C',
    temporalStatistic: 'daily-mean',
    values: [
      {
        value: 20.2932,
        daily: {
          mean: 20.2932,
          minimum: 17.2493,
          completeDay: true,
          sampledHours: 24,
          expectedHours: 24,
          start: '2024-01-01T00:00:00.000Z',
          end: '2024-01-02T00:00:00.000Z',
        },
      },
    ],
  })
  const lastDay = await browser.result(task, {
    kind: 'time-series',
    temporalResolution: 'daily',
    layer: 'downscaled',
    point,
    timeRange: { start: '2024-01-03T00:00:00Z', end: '2024-01-03T00:00:00Z' },
  })
  expect(lastDay).toMatchObject({
    ok: true,
    values: [{ daily: { completeDay: true, sampledHours: 24 } }],
  })
  const forecast = await browser.seed({
    ...queryConfiguration,
    timeRange: { mode: 'forecast', start: '2026-10-13T08:00:00Z', end: '2026-10-13T10:00:00Z' },
  })
  const partial = await browser.result(forecast, {
    kind: 'points',
    temporalResolution: 'daily',
    layer: 'original',
    points: [point],
    times: ['2026-10-13T00:00:00Z'],
  })
  expect(partial).toMatchObject({
    ok: true,
    values: [
      {
        daily: {
          completeDay: false,
          sampledHours: 3,
          expectedHours: 24,
          start: '2026-10-13T00:00:00.000Z',
          end: '2026-10-14T00:00:00.000Z',
        },
      },
    ],
  })
  expect(
    await browser.result(forecast, {
      kind: 'points',
      temporalResolution: 'daily',
      layer: 'original',
      points: [point],
      times: ['2026-10-14T00:00:00Z'],
    }),
  ).toMatchObject({ ok: false, code: 'OUTSIDE_COVERAGE' })
})

it('conserves the worked hourly rainfall buckets in daily totals and labels partial-day accumulation', async () => {
  const task = await browser.seed({
    ...queryConfiguration,
    variable: 'precipitation',
    region: { west: 0, east: 1, south: 0, north: 1 },
  })
  const point = { longitude: 0, latitude: 0 }
  const hourly = await browser.result(task, {
    kind: 'time-series',
    temporalResolution: 'hourly',
    layer: 'original',
    point,
    timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T07:00:00Z' },
  })
  if (!hourly.ok) throw new Error('Expected hourly rainfall')
  expect(hourly.values.map((value) => value.value)).toEqual([0, 0, 1, 2, 3, 2, 1, 0])
  expect(hourly.values[2]).toMatchObject({
    accumulation: {
      start: '2024-01-01T02:00:00.000Z',
      end: '2024-01-01T03:00:00.000Z',
      sampledHours: 1,
      complete: true,
    },
  })
  const daily = await browser.result(task, {
    kind: 'grid',
    temporalResolution: 'daily',
    layer: 'original',
    window: { west: 0, east: 0, south: 0, north: 0 },
    times: ['2024-01-01T00:00:00Z'],
  })
  expect(daily).toMatchObject({
    ok: true,
    values: [{ value: 9, accumulation: { sampledHours: 24, expectedHours: 24, complete: true } }],
  })
  const forecast = await browser.seed({
    ...queryConfiguration,
    variable: 'precipitation',
    region: { west: 0, east: 1, south: 0, north: 1 },
    timeRange: { mode: 'forecast', start: '2026-10-13T08:00:00Z', end: '2026-10-13T10:00:00Z' },
  })
  expect(
    await browser.result(forecast, {
      kind: 'export',
      temporalResolution: 'daily',
      layer: 'original',
      window: { west: 0, east: 0, south: 0, north: 0 },
      times: ['2026-10-13T00:00:00Z'],
    }),
  ).toMatchObject({
    ok: true,
    values: [
      {
        value: 0,
        accumulation: {
          complete: false,
          sampledHours: 3,
          expectedHours: 24,
          start: '2026-10-13T08:00:00.000Z',
          end: '2026-10-13T11:00:00.000Z',
          requestedStart: '2026-10-13T00:00:00.000Z',
          requestedEnd: '2026-10-14T00:00:00.000Z',
        },
      },
    ],
  })
})

it('distinguishes calm/from-direction from missing components and refuses to interpolate across missing required nodes', async () => {
  const task = await browser.seed({
    ...queryConfiguration,
    variable: 'wind',
    region: { west: -30, east: 1, south: -50, north: 1 },
  })
  const result = await browser.result(task, {
    kind: 'points',
    layer: 'original',
    points: [
      { longitude: -30, latitude: -40 },
      { longitude: -30, latitude: -50 },
      { longitude: 0, latitude: -40 },
    ],
    times: ['2024-01-01T00:00:00Z'],
  })
  expect(result).toMatchObject({
    ok: true,
    values: [
      { value: 0, speed: 0, fromDirection: null, directionStatus: 'calm' },
      { v10: -1, value: 1, speed: 1, fromDirection: 0, directionStatus: 'available' },
      { u10: 3, value: 3, speed: 3, fromDirection: 270, directionStatus: 'available' },
    ],
  })
  if (!result.ok || result.variable !== 'wind') throw new Error('Expected wind')
  // Signed zero has the same physical meaning; no nonzero rounded component passes these checks.
  expect(result.values[0]!.u10).toBeCloseTo(0, 10)
  expect(result.values[0]!.v10).toBeCloseTo(0, 10)
  expect(result.values[1]!.u10).toBeCloseTo(0, 10)
  expect(result.values[2]!.v10).toBeCloseTo(0, 10)
  const edge = await browser.seed({
    ...queryConfiguration,
    variable: 'wind',
    region: { west: 19.8, east: 20.4, south: 65, north: 65.4 },
  })
  const request = {
    kind: 'points',
    temporalResolution: 'hourly',
    layer: 'original',
    times: ['2024-01-01T12:00:00Z'],
  } as const
  // This exact valid node does not need the missing node to its east (zero interpolation weight).
  expect(
    await browser.result(edge, {
      ...request,
      times: [...request.times],
      points: [{ longitude: 19.8, latitude: 65 }],
    }),
  ).toMatchObject({ ok: true })
  // The point itself is west of the missing patch, but its bilinear support is not complete.
  const missing = await browser.result(edge, {
    ...request,
    times: [...request.times],
    points: [{ longitude: 19.9, latitude: 65 }],
  })
  expect(missing).toMatchObject({ ok: false, code: 'MISSING_COMPONENT' })
  if (missing.ok) throw new Error('Expected missing wind component')
  expect(missing.error).toContain('U10')
  expect(await browser.get(edge)).toMatchObject({ ok: true, task: { status: 'Completed' } })
})

it('never treats missing rainfall as dry weather or a complete daily total', async () => {
  const task = await browser.seed({
    ...queryConfiguration,
    variable: 'precipitation',
    region: { west: 20, east: 21, south: 65, north: 66 },
  })
  const query = {
    kind: 'points',
    temporalResolution: 'hourly',
    layer: 'original',
    points: [{ longitude: 20, latitude: 65 }],
  } as const
  expect(
    await browser.result(task, {
      ...query,
      points: [...query.points],
      times: ['2024-01-01T04:00:00Z'],
    }),
  ).toMatchObject({ ok: false, code: 'MISSING_DATA' })
  expect(
    await browser.result(task, {
      ...query,
      points: [...query.points],
      times: ['2024-01-01T08:00:00Z'],
    }),
  ).toMatchObject({ ok: true, values: [{ value: 0, accumulation: { complete: true } }] })
  expect(
    await browser.result(task, {
      ...query,
      temporalResolution: 'daily',
      points: [...query.points],
      times: ['2024-01-01T00:00:00Z'],
    }),
  ).toMatchObject({ ok: false, code: 'MISSING_DATA' })
  expect(await browser.get(task)).toMatchObject({ ok: true, task: { status: 'Completed' } })
  await browser.reopen()
  expect(
    await browser.result(task, {
      ...query,
      points: [...query.points],
      times: ['2024-01-01T04:00:00Z'],
    }),
  ).toMatchObject({ ok: false, code: 'MISSING_DATA' })
})

it('varies wind coherently across historical days as well as space without changing saved seed or version', async () => {
  const task = await browser.seed({
    ...queryConfiguration,
    variable: 'wind',
    region: { west: 0, east: 2, south: 0, north: 2 },
  })
  const query = {
    kind: 'points',
    layer: 'original',
    points: [
      { longitude: 0, latitude: 0 },
      { longitude: 1, latitude: 1 },
    ],
    times: ['2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z'],
  } as const
  const result = await browser.result(task, {
    ...query,
    points: [...query.points],
    times: [...query.times],
  })
  if (!result.ok || result.variable !== 'wind') throw new Error('Expected wind')
  expect(result.values[0]!.value).not.toBe(result.values[1]!.value)
  expect(result.values[0]!.value).not.toBe(result.values[2]!.value)
  expect(
    await browser.result(task, { ...query, points: [...query.points], times: [...query.times] }),
  ).toEqual(result)
  expect(await browser.get(task)).toMatchObject({
    ok: true,
    task: { dataSeed: 42, generatorVersion: 'synthetic-variables-v2' },
  })
})

it.each([
  ['temperature', 'T2M', '°C', 'daily'],
  ['wind', 'U10/V10', 'm/s', 'hourly'],
  ['pressure', 'MSL', 'hPa', 'hourly'],
  ['precipitation', 'TP', 'mm', 'daily'],
] as const)(
  'keeps %s values, units, source and time metadata identical across every query mode after reopening',
  async (variable, quantity, unit, temporalResolution) => {
    const task = await browser.seed({
      ...queryConfiguration,
      variable,
      region: { west: 0, east: 1, south: 0, north: 1 },
    })
    const point = { longitude: 0, latitude: 0 }
    const window = { west: 0, east: 0, south: 0, north: 0 }
    const times = ['2024-01-01T08:00:00+08:00']
    for (const layer of ['original', 'downscaled'] as const) {
      const baseline = await browser.result(task, {
        kind: 'points',
        layer,
        temporalResolution,
        points: [point],
        times,
      })
      if (!baseline.ok) throw new Error('Expected variable result')
      expect(baseline).toMatchObject({
        variable,
        quantity,
        unit,
        displayTimezone: 'UTC',
        provenance: {
          label: 'Synthetic Demo',
          dataSource: 'fusion',
          generatorVersion: task.generatorVersion,
        },
      })
      for (const kind of ['grid', 'export', 'preview'] as const) {
        const query = { kind, layer, temporalResolution, window, times }
        const result = await browser.result(
          task,
          kind === 'preview' ? { ...query, kind, maxPoints: 1 } : { ...query, kind },
        )
        expect(result).toMatchObject({
          ok: true,
          quantity,
          unit,
          values: baseline.values,
          provenance: baseline.provenance,
          temporalStatistic: baseline.temporalStatistic,
        })
      }
      expect(
        await browser.result(task, {
          kind: 'time-series',
          layer,
          temporalResolution,
          point,
          timeRange: { start: times[0]!, end: times[0]! },
        }),
      ).toEqual(baseline)
    }
    const before = await browser.result(task, {
      kind: 'export',
      layer: 'downscaled',
      temporalResolution,
      window,
      times,
    })
    await browser.reopen()
    expect(
      await browser.result(task, {
        kind: 'export',
        layer: 'downscaled',
        temporalResolution,
        window,
        times,
      }),
    ).toEqual(before)
  },
)

it.each(['ecmwf', 'gfs', 'fusion'] as const)(
  'keeps the %s configuration and true 1/3/5km grids for all new variables',
  async (dataSource) => {
    for (const variable of ['wind', 'pressure', 'precipitation'] as const) {
      const counts: number[] = []
      for (const resolution of ['1km', '3km', '5km'] as const) {
        const task = await browser.seed({ ...queryConfiguration, variable, dataSource, resolution })
        const result = await browser.result(task, {
          kind: 'grid',
          layer: 'downscaled',
          window: { west: 110, east: 110.08, south: 30, north: 30.06 },
          times: ['2024-01-01T00:00:00Z'],
        })
        if (!result.ok || result.grid.sampling === 'requested-points')
          throw new Error('Expected grid')
        expect(result).toMatchObject({
          variable,
          provenance: { dataSource, generatorVersion: 'synthetic-variables-v2' },
        })
        counts.push(result.grid.returnedPoints)
        expect(await browser.get(task)).toMatchObject({
          ok: true,
          task: { dataSeed: 42, configuration: { dataSource, variable, resolution } },
        })
      }
      expect(counts).toEqual([56, 9, 4])
    }
  },
)

it.each(['wind', 'precipitation'] as const)(
  'propagates missing %s samples through every query mode instead of fabricating values',
  async (variable) => {
    const task = await browser.seed({
      ...queryConfiguration,
      variable,
      region: { west: 20, east: 21, south: 65, north: 66 },
    })
    const time = variable === 'wind' ? '2024-01-01T12:00:00Z' : '2024-01-01T04:00:00Z'
    const expected = { ok: false, code: variable === 'wind' ? 'MISSING_COMPONENT' : 'MISSING_DATA' }
    const common = { layer: 'original', temporalResolution: 'hourly' } as const
    for (const kind of ['grid', 'export', 'preview'] as const) {
      const query = {
        ...common,
        kind,
        window: { west: 20, east: 20, south: 65, north: 65 },
        times: [time],
      }
      expect(
        await browser.result(
          task,
          kind === 'preview' ? { ...query, kind, maxPoints: 1 } : { ...query, kind },
        ),
      ).toMatchObject(expected)
    }
    expect(
      await browser.result(task, {
        ...common,
        kind: 'time-series',
        point: { longitude: 20, latitude: 65 },
        timeRange: { start: time, end: time },
      }),
    ).toMatchObject(expected)
    expect(await browser.get(task)).toMatchObject({ ok: true, task: { status: 'Completed' } })
  },
)

it('bounds hourly histories and daily preview work before expansion, and rejects unsupported temporal statistics', async () => {
  const task = await browser.seed({
    ...queryConfiguration,
    resolution: '1km',
    region: { west: -180, east: 180, south: -80, north: 80 },
    timeRange: { mode: 'historical', start: '2020-01-01', end: '2024-12-31' },
  })
  const preview = await browser.result(task, {
    kind: 'preview',
    temporalResolution: 'daily',
    layer: 'downscaled',
    window: task.configuration.region,
    times: ['2020-01-01T00:00:00Z', '2024-12-31T00:00:00Z'],
    maxPoints: 256,
  })
  if (
    !preview.ok ||
    preview.variable !== 'temperature' ||
    preview.temporalStatistic !== 'daily-mean'
  )
    throw new Error('Expected daily preview')
  expect(preview.values.length).toBeLessThanOrEqual(256)
  expect(
    preview.values.every((value) => value.daily.completeDay && value.daily.sampledHours === 24),
  ).toBe(true)
  expect(
    await browser.result(task, {
      kind: 'export',
      temporalResolution: 'daily',
      layer: 'downscaled',
      window: task.configuration.region,
      times: ['2020-01-01T00:00:00Z'],
    }),
  ).toMatchObject({ ok: false, code: 'QUERY_LIMIT_EXCEEDED' })
  expect(
    await browser.result(task, {
      kind: 'time-series',
      temporalResolution: 'hourly',
      layer: 'downscaled',
      point: { longitude: 0, latitude: 0 },
      timeRange: { start: '2020-01-01T00:00:00Z', end: '2024-12-31T00:00:00Z' },
    }),
  ).toMatchObject({ ok: false, code: 'QUERY_LIMIT_EXCEEDED' })
  for (const variable of ['wind', 'pressure'] as const) {
    const other = await browser.seed({ ...queryConfiguration, variable })
    expect(
      await browser.result(other, {
        kind: 'points',
        temporalResolution: 'daily',
        layer: 'original',
        points: [{ longitude: 110, latitude: 30 }],
        times: ['2024-01-01T00:00:00Z'],
      }),
    ).toMatchObject({ ok: false, code: 'UNAVAILABLE_QUERY' })
  }
})

it('retains legacy temperature versions, rejects incompatible variable/version pairs and keeps new variables account-scoped', async () => {
  const temperature = await browser.seed()
  const wind = await browser.seed({ ...queryConfiguration, variable: 'wind' })
  const query = {
    kind: 'points',
    layer: 'downscaled',
    points: [{ longitude: 110.5, latitude: 30.5 }],
    times: ['2024-01-01T00:00:00Z'],
  } as const
  expect(
    await browser.result(temperature, {
      ...query,
      points: [...query.points],
      times: [...query.times],
    }),
  ).toMatchObject({
    ok: true,
    values: [{ value: 19.1241 }],
    provenance: { generatorVersion: 'synthetic-temperature-v1' },
  })
  expect(
    await browser.rpc('result', {
      task: { ...wind, generatorVersion: 'synthetic-temperature-v1' },
      query,
    }),
  ).toMatchObject({ ok: false, code: 'UNAVAILABLE_COMBINATION' })
  expect(
    await browser.rpc('result', {
      task: { ...temperature, generatorVersion: 'synthetic-variables-v2' },
      query,
    }),
  ).toMatchObject({ ok: false, code: 'UNAVAILABLE_COMBINATION' })
  expect(
    await browser.rpc('result', {
      task: { ...wind, generatorVersion: 'synthetic-variables-v999' },
      query,
    }),
  ).toMatchObject({ ok: false, code: 'INCOMPATIBLE_GENERATOR' })
  await browser.signIn('policy')
  expect(
    await browser.result(wind, { ...query, points: [...query.points], times: [...query.times] }),
  ).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  await browser.signIn('researcher')
  expect(await browser.get(wind)).toMatchObject({
    ok: true,
    task: { generatorVersion: 'synthetic-variables-v2', ownerId: 'researcher', dataSeed: 42 },
  })
})

it('labels a partial precipitation total with the actual accumulated interval as well as the requested day', async () => {
  const task = await browser.seed({
    ...queryConfiguration,
    variable: 'precipitation',
    region: { west: 0, east: 1, south: 0, north: 1 },
    timeRange: { mode: 'forecast', start: '2026-10-13T08:00:00Z', end: '2026-10-13T10:00:00Z' },
  })
  expect(
    await browser.result(task, {
      kind: 'points',
      temporalResolution: 'daily',
      layer: 'original',
      points: [{ longitude: 0, latitude: 0 }],
      times: ['2026-10-13T00:00:00Z'],
    }),
  ).toMatchObject({
    ok: true,
    values: [
      {
        accumulation: {
          start: '2026-10-13T08:00:00.000Z',
          end: '2026-10-13T11:00:00.000Z',
          requestedStart: '2026-10-13T00:00:00.000Z',
          requestedEnd: '2026-10-14T00:00:00.000Z',
          complete: false,
        },
      },
    ],
  })
})

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

const reference = { referenceSeed: 1729, referenceVersion: 'synthetic-observations-v1' }
const origin = { longitude: 0, latitude: 0 }
const time = '2024-01-01T00:00:00Z'
const region = { west: -0.3, east: 1.3, south: -0.3, north: 1.3 }

it('saves an independent reference and reopens the same synthetic station through the public task API', async () => {
  const task = await browser.seed({ ...queryConfiguration, region })
  expect(task).toMatchObject(reference)
  const query = {
    kind: 'points',
    layer: 'observation',
    observationMode: 'stations',
    points: [origin],
    times: [time],
  } as const
  const result = await browser.result(task, {
    ...query,
    points: [...query.points],
    times: [...query.times],
  })
  expect(result).toMatchObject({
    ok: true,
    layer: 'observation',
    reference,
    variable: 'temperature',
    quantity: 'T2M',
    unit: '°C',
    provenance: { label: 'Synthetic Demo' },
    values: [
      {
        ...origin,
        time: '2024-01-01T00:00:00.000Z',
        value: 20,
        observation: {
          mode: 'stations',
          station: { id: 'synthetic-station-v1:0:0', ...origin },
          distanceKm: 0,
        },
      },
    ],
  })
  await browser.reopen()
  expect(await browser.get(task)).toMatchObject({
    ok: true,
    task: { ...reference, status: 'Completed' },
  })
  expect(
    await browser.result(task, { ...query, points: [...query.points], times: [...query.times] }),
  ).toEqual(result)
})

it('interpolates the same four literal reference stations, not the task target grid', async () => {
  // Independent reference square at epoch: SW=20, SE=22, NW=19.6, NE=21.6 °C.
  // Equal weights at its centre give 20.8; a query region need not enclose the support stations.
  for (const [dataSource, resolution, method] of [
    ['ecmwf', '1km', 'deterministic'],
    ['gfs', '3km', 'recommended'],
    ['fusion', '5km', 'deterministic'],
  ] as const) {
    const task = await browser.seed({
      ...queryConfiguration,
      dataSource,
      resolution,
      method,
      region: { west: 0.4, east: 0.6, south: 0.4, north: 0.6 },
    })
    expect(
      await browser.result(task, {
        kind: 'points',
        layer: 'observation',
        observationMode: 'interpolated',
        points: [{ longitude: 0.5, latitude: 0.5 }],
        times: [time],
      }),
    ).toMatchObject({
      ok: true,
      reference,
      values: [
        {
          value: 20.8,
          observation: {
            mode: 'interpolated',
            stations: [
              {
                station: { id: 'synthetic-station-v1:0:0', longitude: 0, latitude: 0 },
                weight: 0.25,
              },
              {
                station: { id: 'synthetic-station-v1:1:0', longitude: 1, latitude: 0 },
                weight: 0.25,
              },
              {
                station: { id: 'synthetic-station-v1:0:1', longitude: 0, latitude: 1 },
                weight: 0.25,
              },
              {
                station: { id: 'synthetic-station-v1:1:1', longitude: 1, latitude: 1 },
                weight: 0.25,
              },
            ],
          },
        },
      ],
    })
  }
})

it('lists actual stable station ids in overlapping windows regardless of region origin or target spacing', async () => {
  const window = { west: 0, east: 1, south: 0, north: 1 }
  for (const [west, resolution] of [
    [-0.3, '1km'],
    [0, '5km'],
  ] as const) {
    const task = await browser.seed({
      ...queryConfiguration,
      region: { ...region, west },
      resolution,
    })
    const result = await browser.result(task, {
      kind: 'grid',
      layer: 'observation',
      observationMode: 'stations',
      window,
      times: [time],
    })
    expect(result).toMatchObject({
      ok: true,
      reference,
      grid: {
        nominalSpacingKm: null,
        sampling: 'logical-grid',
        returnedPoints: 4,
        logicalGrid: { spacingDegrees: { longitude: 1, latitude: 1 } },
      },
      values: [
        {
          longitude: 0,
          latitude: 0,
          value: 20,
          observation: { station: { id: 'synthetic-station-v1:0:0' }, distanceKm: 0 },
        },
        {
          longitude: 1,
          latitude: 0,
          value: 22,
          observation: { station: { id: 'synthetic-station-v1:1:0' }, distanceKm: 0 },
        },
        {
          longitude: 0,
          latitude: 1,
          value: 19.6,
          observation: { station: { id: 'synthetic-station-v1:0:1' }, distanceKm: 0 },
        },
        {
          longitude: 1,
          latitude: 1,
          value: 21.6,
          observation: { station: { id: 'synthetic-station-v1:1:1' }, distanceKm: 0 },
        },
      ],
    })
    expect(
      await browser.result(task, {
        kind: 'export',
        layer: 'observation',
        observationMode: 'stations',
        window,
        times: [time],
      }),
    ).toEqual(result)
  }
})

it('preserves station wind components and derives interpolated vectors before speed and meteorological direction', async () => {
  const task = await browser.seed({ ...queryConfiguration, variable: 'wind', region })
  for (const observationMode of ['stations', 'interpolated'] as const) {
    expect(
      await browser.result(task, {
        kind: 'points',
        layer: 'observation',
        observationMode,
        points: [origin, { longitude: 1, latitude: 1 }],
        times: [time],
      }),
    ).toMatchObject({
      ok: true,
      reference,
      variable: 'wind',
      quantity: 'U10/V10',
      unit: 'm/s',
      directionUnit: 'degrees',
      directionConvention: 'meteorological-from',
      values: [
        {
          u10: 3,
          v10: 4,
          speed: 5,
          value: 5,
          fromDirection: 216.8699,
          directionStatus: 'available',
        },
        { u10: 0, v10: 0, speed: 0, fromDirection: null, directionStatus: 'calm' },
      ],
    })
  }
  // Four literal vectors (3,4), (0,4), (3,0), (0,0) yield (1.5,2), NOT mean speed 3.
  expect(
    await browser.result(task, {
      kind: 'points',
      layer: 'observation',
      observationMode: 'interpolated',
      points: [{ longitude: 0.5, latitude: 0.5 }],
      times: [time],
    }),
  ).toMatchObject({
    ok: true,
    values: [{ u10: 1.5, v10: 2, speed: 2.5, value: 2.5, fromDirection: 216.8699 }],
  })
})

it('returns reference MSL pressure in hPa with literal station and bilinear values, not SP or task HR', async () => {
  const task = await browser.seed({ ...queryConfiguration, variable: 'pressure', region })
  expect(
    await browser.result(task, {
      kind: 'points',
      layer: 'observation',
      observationMode: 'interpolated',
      points: [origin, { longitude: 0.5, latitude: 0.5 }],
      times: [time],
    }),
  ).toMatchObject({
    ok: true,
    reference,
    variable: 'pressure',
    quantity: 'MSL',
    unit: 'hPa',
    values: [{ value: 1013.25 }, { value: 1014.2 }],
  })
  expect(
    await browser.result(task, {
      kind: 'points',
      layer: 'observation',
      observationMode: 'stations',
      points: [{ longitude: 1, latitude: 1 }],
      times: [time],
    }),
  ).toMatchObject({
    ok: true,
    values: [{ value: 1015.15 }],
  })
})

it('keeps literal hourly rainfall, genuine zero and deduplicated daily accumulation on the same station reference', async () => {
  const task = await browser.seed({ ...queryConfiguration, variable: 'precipitation', region })
  const hourly = await browser.result(task, {
    kind: 'points',
    layer: 'observation',
    observationMode: 'interpolated',
    temporalResolution: 'hourly',
    points: [origin, { longitude: 0.5, latitude: 0 }],
    times: ['2024-01-01T06:00:00Z'],
  })
  expect(hourly).toMatchObject({
    ok: true,
    reference,
    variable: 'precipitation',
    quantity: 'TP',
    unit: 'mm',
    temporalStatistic: 'accumulation',
    values: [
      {
        value: 2,
        accumulation: {
          start: '2024-01-01T06:00:00.000Z',
          end: '2024-01-01T07:00:00.000Z',
          bounds: '[start,end)',
          sampledHours: 1,
          expectedHours: 1,
          complete: true,
        },
      },
      { value: 3 },
    ],
  })
  expect(
    await browser.result(task, {
      kind: 'points',
      layer: 'observation',
      observationMode: 'stations',
      temporalResolution: 'hourly',
      points: [origin],
      times: [time],
    }),
  ).toMatchObject({ ok: true, values: [{ value: 0 }] })
  for (const temporalResolution of [undefined, 'daily'] as const) {
    expect(
      await browser.result(task, {
        kind: 'points',
        layer: 'observation',
        observationMode: 'stations',
        temporalResolution,
        points: [origin, origin],
        times: [time, '2024-01-01T08:00:00+08:00'],
      }),
    ).toMatchObject({
      ok: true,
      values: [
        {
          value: 12,
          accumulation: {
            start: '2024-01-01T00:00:00.000Z',
            end: '2024-01-02T00:00:00.000Z',
            requestedStart: '2024-01-01T00:00:00.000Z',
            requestedEnd: '2024-01-02T00:00:00.000Z',
            sampledHours: 24,
            expectedHours: 24,
            complete: true,
          },
        },
      ],
    })
  }
})

it('derives daily reference temperature from hourly stations and labels partial rainfall coverage', async () => {
  const task = await browser.seed({ ...queryConfiguration, region })
  // Epoch reference day: a symmetric 4°C diurnal cycle around 20°C, minimum at 18:00.
  for (const observationMode of ['stations', 'interpolated'] as const) {
    expect(
      await browser.result(task, {
        kind: 'points',
        layer: 'observation',
        observationMode,
        temporalResolution: 'daily',
        points: [origin],
        times: [time],
      }),
    ).toMatchObject({
      ok: true,
      temporalStatistic: 'daily-mean',
      values: [
        {
          value: 20,
          daily: {
            mean: 20,
            minimum: 16,
            sampledHours: 24,
            expectedHours: 24,
            completeDay: true,
            start: '2024-01-01T00:00:00.000Z',
            end: '2024-01-02T00:00:00.000Z',
            bounds: '[start,end)',
          },
        },
      ],
    })
    expect(
      await browser.result(task, {
        kind: 'points',
        layer: 'observation',
        observationMode,
        temporalResolution: 'hourly',
        points: [origin],
        times: ['2024-01-01T18:00:00Z'],
      }),
    ).toMatchObject({ ok: true, values: [{ value: 16 }] })
  }
  const rain = await browser.seed({
    ...queryConfiguration,
    region,
    variable: 'precipitation',
    timeRange: { mode: 'forecast', start: '2026-10-13T08:00:00Z', end: '2026-10-13T09:00:00Z' },
  })
  expect(
    await browser.result(rain, {
      kind: 'points',
      layer: 'observation',
      observationMode: 'interpolated',
      temporalResolution: 'daily',
      points: [origin],
      times: ['2026-10-13T00:00:00Z'],
    }),
  ).toMatchObject({
    ok: true,
    values: [
      {
        value: 4,
        accumulation: {
          start: '2026-10-13T08:00:00.000Z',
          end: '2026-10-13T10:00:00.000Z',
          requestedStart: '2026-10-13T00:00:00.000Z',
          requestedEnd: '2026-10-14T00:00:00.000Z',
          sampledHours: 2,
          expectedHours: 24,
          complete: false,
        },
      },
    ],
  })
})

it.each([
  ['temperature', '2024-01-01T06:00:00Z', 'MISSING_DATA'],
  ['wind', '2024-01-01T12:00:00Z', 'MISSING_COMPONENT'],
  ['pressure', '2024-01-01T08:00:00Z', 'MISSING_DATA'],
  ['precipitation', '2024-01-01T04:00:00Z', 'MISSING_DATA'],
] as const)(
  'keeps missing %s station support unavailable, rather than zero or extrapolation',
  async (variable, gap, code) => {
    const task = await browser.seed({
      ...queryConfiguration,
      variable,
      region: { west: 19, east: 26, south: 64, north: 71 },
    })
    const query = {
      kind: 'points',
      layer: 'observation',
      observationMode: 'interpolated',
      temporalResolution: 'hourly',
      points: [{ longitude: 22, latitude: 67 }],
      times: [gap],
    } as const
    expect(
      await browser.result(task, { ...query, points: [...query.points], times: [...query.times] }),
    ).toMatchObject({ ok: false, code })
    expect(
      await browser.result(task, {
        ...query,
        observationMode: 'stations',
        points: [...query.points],
        times: [...query.times],
      }),
    ).toMatchObject({ ok: false, code: 'NO_OBSERVATION' })
    // A zero-weight missing neighbour at (20,65) must not poison the valid node (19,65).
    expect(
      await browser.result(task, {
        ...query,
        points: [{ longitude: 19, latitude: 65 }],
        times: [gap],
      }),
    ).toMatchObject({ ok: true })
    expect(
      await browser.result(task, {
        ...query,
        points: [{ longitude: 19.5, latitude: 65 }],
        times: [gap],
      }),
    ).toMatchObject({ ok: false, code })
    await browser.reopen()
    expect(
      await browser.result(task, { ...query, points: [...query.points], times: [...query.times] }),
    ).toMatchObject({ ok: false, code })
    expect(await browser.get(task)).toMatchObject({ ok: true, task: { status: 'Completed' } })
  },
)

it('matches at most 25 km using literal equatorial boundaries and returns the actual great-circle distance', async () => {
  const task = await browser.seed({ ...queryConfiguration, region })
  // Independent spherical-distance fixtures (IUGG mean radius 6371.0088 km):
  // 0.1° along the equator = 11.11950802335329 km; 0.2248300909311345° = 25 km.
  for (const [longitude, expectedKm] of [
    [0.1, 11.11950802335329],
    [0.2248300909311345, 25],
  ] as const) {
    const result = await browser.result(task, {
      kind: 'points',
      layer: 'observation',
      observationMode: 'stations',
      points: [{ longitude, latitude: 0 }],
      times: [time],
    })
    expect(result).toMatchObject({
      ok: true,
      reference: {
        ...reference,
        kind: 'synthetic-stations',
        maximumMatchDistanceKm: 25,
        distanceMetric: 'great-circle',
        earthRadiusKm: 6371.0088,
      },
      values: [{ value: 20, observation: { station: { id: 'synthetic-station-v1:0:0' } } }],
    })
    if (!result.ok || result.values[0]?.observation?.mode !== 'stations')
      throw new Error('Expected station match')
    expect(result.values[0].observation.distanceKm).toBeCloseTo(expectedKm, 10)
    expect(result.values[0].observation.distanceKm).toBeLessThanOrEqual(25)
  }
  for (const longitude of [0.2248301, 0.5]) {
    expect(
      await browser.result(task, {
        kind: 'points',
        layer: 'observation',
        observationMode: 'stations',
        points: [{ longitude, latitude: 0 }],
        times: [time],
      }),
    ).toMatchObject({ ok: false, code: 'NO_OBSERVATION' })
  }
  const polar = await browser.seed({
    ...queryConfiguration,
    region: { west: -1, east: 1, south: 88, north: 90 },
  })
  expect(
    await browser.result(polar, {
      kind: 'points',
      layer: 'observation',
      observationMode: 'interpolated',
      points: [{ longitude: 0, latitude: 89.1 }],
      times: [time],
    }),
  ).toMatchObject({ ok: false, code: 'NO_OBSERVATION' })
  expect(
    await browser.result(polar, {
      kind: 'points',
      layer: 'observation',
      observationMode: 'stations',
      points: [{ longitude: 0, latitude: 90 }],
      times: [time],
    }),
  ).toMatchObject({ ok: false, code: 'NO_OBSERVATION' })
  expect(
    await browser.result(task, {
      kind: 'points',
      layer: 'observation',
      observationMode: 'interpolated',
      points: [{ longitude: -0.31, latitude: 0 }],
      times: [time],
    }),
  ).toMatchObject({ ok: false, code: 'OUTSIDE_COVERAGE' })
})

it('chooses the nearest valid station, but never substitutes another station in a station listing', async () => {
  const task = await browser.seed({
    ...queryConfiguration,
    variable: 'wind',
    region: { west: 19, east: 21, south: 69, north: 71 },
  })
  const result = await browser.result(task, {
    kind: 'points',
    layer: 'observation',
    observationMode: 'stations',
    temporalResolution: 'hourly',
    points: [{ longitude: 19.6, latitude: 70 }],
    times: ['2024-01-01T12:00:00Z'],
  })
  expect(result).toMatchObject({
    ok: true,
    values: [{ observation: { station: { id: 'synthetic-station-v1:19:70' } } }],
  })
  if (!result.ok || result.values[0]?.observation?.mode !== 'stations')
    throw new Error('Expected valid alternative')
  expect(result.values[0].observation.distanceKm).toBeGreaterThan(22)
  expect(result.values[0].observation.distanceKm).toBeLessThan(25)
  expect(
    await browser.result(task, {
      kind: 'grid',
      layer: 'observation',
      observationMode: 'stations',
      temporalResolution: 'hourly',
      window: { west: 20, east: 20, south: 70, north: 70 },
      times: ['2024-01-01T12:00:00Z'],
    }),
  ).toMatchObject({ ok: false, code: 'MISSING_COMPONENT' })
})

it.each(['temperature', 'wind', 'pressure', 'precipitation'] as const)(
  'keeps %s reference samples identical across saved source/method/resolution/data-seed variants',
  async (variable) => {
    const task = await browser.seed({ ...queryConfiguration, variable, region })
    for (const observationMode of ['stations', 'interpolated'] as const) {
      const query = {
        kind: 'points',
        layer: 'observation',
        observationMode,
        temporalResolution: 'hourly',
        points: observationMode === 'stations' ? [origin] : [{ longitude: 0.5, latitude: 0.5 }],
        times: ['2024-01-01T06:00:00Z'],
      } as const
      const original = await browser.result(task, {
        ...query,
        points: [...query.points],
        times: [...query.times],
      })
      if (!original.ok) throw new Error('Expected reference sample')
      for (const [dataSource, resolution, method, dataSeed] of [
        ['ecmwf', '1km', 'deterministic', 0],
        ['gfs', '5km', 'recommended', 4294967295],
        ['fusion', '3km', 'deterministic', 709],
      ] as const) {
        // Metadata backup and query use the real authenticated public server services, not generator helpers.
        const variant = {
          ...task,
          id: `${task.id}-${dataSource}`,
          dataSeed,
          configuration: {
            ...task.configuration,
            dataSource,
            resolution,
            method,
            region: { west: -0.1, east: 1.1, south: -0.1, north: 1.1 },
          },
        }
        expect(await browser.rpc('restore', variant)).toMatchObject({
          ok: true,
          task: { ...reference, dataSeed },
        })
        expect(await browser.rpc('result', { task: variant, query })).toMatchObject({
          ok: true,
          reference: original.reference,
          values: original.values,
        })
      }
    }
  },
)

it('reconstructs legacy reference defaults and explicit reference seeds without substituting unknown versions or altering model data', async () => {
  const task = await browser.seed({ ...queryConfiguration, region })
  const query = {
    kind: 'points',
    layer: 'observation',
    observationMode: 'interpolated',
    points: [origin],
    times: [time],
  } as const
  const { referenceSeed: _seed, referenceVersion: _version, ...legacy } = task
  expect(await browser.rpc('restore', legacy)).toMatchObject({ ok: true })
  const expected = await browser.result(task, {
    ...query,
    points: [...query.points],
    times: [...query.times],
  })
  expect(await browser.rpc('result', { task: legacy, query })).toEqual(expected)
  const variant = { ...task, referenceSeed: 4294967295 }
  expect(await browser.rpc('restore', variant)).toMatchObject({
    ok: true,
    task: { referenceSeed: 4294967295 },
  })
  expect(await browser.rpc('result', { task: variant, query })).toMatchObject({
    ok: true,
    reference: { referenceSeed: 4294967295, referenceVersion: 'synthetic-observations-v1' },
    values: [{ value: 21 }],
  })
  const retired = { ...task, referenceVersion: 'synthetic-observations-retired' }
  expect(await browser.rpc('restore', retired)).toMatchObject({
    ok: true,
    task: { referenceVersion: 'synthetic-observations-retired' },
  })
  expect(await browser.rpc('result', { task: retired, query })).toMatchObject({
    ok: false,
    code: 'INCOMPATIBLE_REFERENCE',
  })
  for (const layer of ['original', 'downscaled'] as const) {
    const modelQuery = { kind: 'points', layer, points: [origin], times: [time] } as const
    const model = await browser.result(task, {
      ...modelQuery,
      points: [...query.points],
      times: [...query.times],
    })
    expect(model).toMatchObject({ ok: true })
    expect(await browser.rpc('result', { task: variant, query: modelQuery })).toEqual(model)
    expect(await browser.rpc('result', { task: retired, query: modelQuery })).toEqual(model)
  }
  for (const invalid of [
    { ...legacy, referenceSeed: 1729 },
    { ...legacy, referenceVersion: 'synthetic-observations-v1' },
    { ...task, referenceSeed: -1 },
    { ...task, referenceSeed: 4294967296 },
    { ...task, referenceVersion: '' },
  ]) {
    expect(await browser.rpc('restore', invalid)).toMatchObject({
      ok: false,
      code: 'INVALID_RECORD',
    })
  }
})

it.each(['temperature', 'wind', 'pressure', 'precipitation'] as const)(
  'shares %s reference values across point, time-series, grid, preview and export queries',
  async (variable) => {
    const task = await browser.seed({
      ...queryConfiguration,
      variable,
      region: { west: 0, east: 1, south: 0, north: 1 },
    })
    const times = [time, '2024-01-02T00:00:00Z']
    for (const observationMode of ['stations', 'interpolated'] as const) {
      const window =
        observationMode === 'stations'
          ? task.configuration.region
          : { west: 0, east: 0.05, south: 0, north: 0.05 }
      const grid = await browser.result(task, {
        kind: 'grid',
        layer: 'observation',
        observationMode,
        window,
        times,
      })
      if (!grid.ok) throw new Error('Expected observation grid')
      const points = grid.values
        .filter((value) => value.time === '2024-01-01T00:00:00.000Z')
        .map(({ longitude, latitude }) => ({ longitude, latitude }))
      expect(
        await browser.result(task, {
          kind: 'points',
          layer: 'observation',
          observationMode,
          points,
          times,
        }),
      ).toMatchObject({ ok: true, reference: grid.reference, values: grid.values })
      expect(
        await browser.result(task, {
          kind: 'export',
          layer: 'observation',
          observationMode,
          window,
          times,
        }),
      ).toEqual(grid)
      expect(
        await browser.result(task, {
          kind: 'preview',
          layer: 'observation',
          observationMode,
          window,
          times,
          maxPoints: 64,
        }),
      ).toEqual(grid)
      const pointValues = await browser.result(task, {
        kind: 'points',
        layer: 'observation',
        observationMode,
        points: [origin],
        times,
      })
      expect(
        await browser.result(task, {
          kind: 'time-series',
          layer: 'observation',
          observationMode,
          point: origin,
          timeRange: { start: time, end: '2024-01-02T00:00:00Z' },
        }),
      ).toEqual(pointValues)
    }
  },
)

it('bounds a global station preview arithmetically and keeps full-resolution windows explicit', async () => {
  const task = await browser.seed({
    ...queryConfiguration,
    resolution: '1km',
    region: { west: -180, east: 180, south: -90, north: 90 },
    timeRange: { mode: 'historical', start: '2020-01-01', end: '2024-12-31' },
  })
  const query = {
    layer: 'observation',
    observationMode: 'stations',
    window: task.configuration.region,
    times: ['2020-01-01T00:00:00Z', '2024-12-31T00:00:00Z'],
  } as const
  const preview = await browser.result(task, {
    ...query,
    kind: 'preview',
    times: [...query.times],
    maxPoints: 16,
  })
  expect(preview).toMatchObject({
    ok: true,
    grid: { sampling: 'decimated-grid', availablePoints: 64619, nominalSpacingKm: null },
  })
  if (!preview.ok) throw new Error('Expected bounded preview')
  expect(preview.values.length).toBeLessThanOrEqual(32)
  expect(preview.values[0]).toMatchObject({ longitude: -180, latitude: -89 })
  expect(preview.values.at(-1)).toMatchObject({ longitude: 180, latitude: 89 })
  expect(
    await browser.result(task, { ...query, kind: 'grid', times: [...query.times] }),
  ).toMatchObject({ ok: false, code: 'QUERY_LIMIT_EXCEEDED' })
  expect(
    await browser.result(task, { ...query, kind: 'export', times: [...query.times] }),
  ).toMatchObject({ ok: false, code: 'QUERY_LIMIT_EXCEEDED' })
  expect(
    await browser.result(task, {
      kind: 'grid',
      layer: 'observation',
      observationMode: 'stations',
      window: { west: 0.1, east: 0.2, south: 0.1, north: 0.2 },
      times: [time],
    }),
  ).toMatchObject({ ok: false, code: 'NO_OBSERVATION' })
})

it('uses asymmetric literal station weights and does not extrapolate time coverage', async () => {
  const task = await browser.seed({ ...queryConfiguration, region })
  expect(
    await browser.result(task, {
      kind: 'points',
      layer: 'observation',
      observationMode: 'interpolated',
      points: [{ longitude: 0.25, latitude: 0.75 }],
      times: [time],
    }),
  ).toMatchObject({
    ok: true,
    values: [
      {
        value: 20.2,
        observation: {
          mode: 'interpolated',
          stations: [
            { station: { id: 'synthetic-station-v1:0:0' }, weight: 0.1875 },
            { station: { id: 'synthetic-station-v1:1:0' }, weight: 0.0625 },
            { station: { id: 'synthetic-station-v1:0:1' }, weight: 0.5625 },
            { station: { id: 'synthetic-station-v1:1:1' }, weight: 0.1875 },
          ],
        },
      },
    ],
  })
  for (const observationMode of ['stations', 'interpolated'] as const) {
    expect(
      await browser.result(task, {
        kind: 'points',
        layer: 'observation',
        observationMode,
        points: [origin],
        times: ['2024-01-04T00:00:00Z'],
      }),
    ).toMatchObject({ ok: false, code: 'OUTSIDE_COVERAGE' })
  }
  expect(
    await browser.rpc('result', {
      task,
      query: {
        kind: 'points',
        layer: 'original',
        observationMode: 'stations',
        points: [origin],
        times: [time],
      },
    }),
  ).toMatchObject({ ok: false, code: 'UNAVAILABLE_QUERY' })
})

it.each([
  ['temperature', '2024-01-01T06:00:00Z', 'MISSING_DATA'],
  ['wind', '2024-01-01T12:00:00Z', 'MISSING_COMPONENT'],
  ['pressure', '2024-01-01T08:00:00Z', 'MISSING_DATA'],
  ['precipitation', '2024-01-01T04:00:00Z', 'MISSING_DATA'],
] as const)(
  'propagates missing %s reference support through every window and temporal query',
  async (variable, gap, code) => {
    const task = await browser.seed({
      ...queryConfiguration,
      variable,
      region: { west: 22, east: 23, south: 67, north: 68 },
    })
    for (const observationMode of ['stations', 'interpolated'] as const) {
      const query = {
        layer: 'observation',
        observationMode,
        temporalResolution: 'hourly',
        window: { west: 22, east: 22, south: 67, north: 67 },
        times: [gap],
      } as const
      for (const kind of ['grid', 'export'] as const) {
        expect(
          await browser.result(task, { ...query, kind, times: [...query.times] }),
        ).toMatchObject({ ok: false, code })
      }
      expect(
        await browser.result(task, {
          ...query,
          kind: 'preview',
          maxPoints: 16,
          times: [...query.times],
        }),
      ).toMatchObject({ ok: false, code })
      expect(
        await browser.result(task, {
          kind: 'time-series',
          layer: 'observation',
          observationMode,
          temporalResolution: 'hourly',
          point: { longitude: 22, latitude: 67 },
          timeRange: { start: gap, end: gap },
        }),
      ).toMatchObject({ ok: false, code: observationMode === 'stations' ? 'NO_OBSERVATION' : code })
      if (variable === 'temperature' || variable === 'precipitation') {
        expect(
          await browser.result(task, {
            ...query,
            kind: 'grid',
            temporalResolution: 'daily',
            times: [time],
          }),
        ).toMatchObject({ ok: false, code })
      }
    }
  },
)

it('samples a global interpolated observation preview without allocating the full target grid', async () => {
  const task = await browser.seed({
    ...queryConfiguration,
    region: { west: -180, east: 180, south: -89, north: 89 },
    resolution: '1km',
  })
  const result = await browser.result(task, {
    kind: 'preview',
    layer: 'observation',
    observationMode: 'interpolated',
    window: task.configuration.region,
    times: [time],
    maxPoints: 16,
  })
  expect(result).toMatchObject({
    ok: true,
    reference,
    grid: { nominalSpacingKm: 1, sampling: 'decimated-grid' },
  })
  if (!result.ok || result.grid.sampling === 'requested-points') throw new Error('Expected preview')
  expect(result.grid.availablePoints).toBeGreaterThan(700_000_000)
  expect(result.values.length).toBeLessThanOrEqual(16)
  const sample = result.values[1]!
  expect(
    await browser.result(task, {
      kind: 'points',
      layer: 'observation',
      observationMode: 'interpolated',
      points: [{ longitude: sample.longitude, latitude: sample.latitude }],
      times: [time],
    }),
  ).toMatchObject({ ok: true, values: [sample] })
})

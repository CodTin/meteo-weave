import { describe, expect, it } from 'vitest'
import { demoCatalogFor } from '@/features/downscaling-tasks/service/demo-catalog'
import { exportTaskAsNetCDF, estimateNetCDFPlan } from '@/server/services/netcdf-export.server'
import { readNetCDF } from '../lib/netcdf-reader'
import { exportTask, exportRequest } from '../factories/export-task'
import { queryTaskResult } from '@/features/downscaling-tasks/service/result-queries'
import { createExportPlan } from '@/server/services/result-export-plan.server'
import { generateCsvFromTask, generateGeoJsonFromTask } from '@/server/services/csv-export.server'
import Papa from 'papaparse'

const task = demoCatalogFor('researcher')[0]!
const request = {
  taskId: task.id,
  task,
  bbox: { west: 10, east: 10.08, south: 46, north: 46.06 },
  timeRange: { start: '2024-01-01T00:00:00.000Z', end: '2024-01-01T02:00:00.000Z' },
  dataTypes: ['original', 'downscaled', 'observation'],
  format: 'netcdf',
  temporalResolution: 'hourly',
} as const

describe('NetCDF through the same result-export selection', () => {
  it('exports only the selected time window and preserves both grids and stations', async () => {
    const result = await exportTaskAsNetCDF(task, {
      ...request,
      dataTypes: [...request.dataTypes],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    const file = readNetCDF(result.data)
    expect(file.dimensions).toEqual(
      expect.arrayContaining([
        { name: 'time', size: 2 },
        { name: 'original_latitude', size: 1 },
        { name: 'original_longitude', size: 1 },
        { name: 'downscaled_latitude', size: 3 },
        { name: 'downscaled_longitude', size: 3 },
        { name: 'station', size: 1 },
      ]),
    )
    const time = file.variables.find((variable) => variable.name === 'time')!
    expect(Array.from(time.data)).toEqual([1704067200, 1704070800])
    expect(time.attributes).toMatchObject({
      units: 'seconds since 1970-01-01 00:00:00',
      calendar: 'proleptic_gregorian',
    })
    expect(file.globalAttributes).toMatchObject({
      taskId: task.id,
      seed: 42,
      source: 'Synthetic Demo',
      recordCount: 22,
    })
  })
})

it('preserves wind components, meteorological direction and negative values in every native layer', async () => {
  const wind = exportTask({
    variable: 'wind',
    dataSeed: 44,
    region: { west: -20, east: -19.9, south: 10, north: 10.08 },
  })
  const selection = exportRequest(wind, { format: 'netcdf' })
  const result = await exportTaskAsNetCDF(wind, selection)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error)
  const file = readNetCDF(result.data)
  for (const layer of ['original', 'downscaled', 'observation'] as const) {
    const component = file.variables.find((variable) => variable.name === `u10_${layer}`)!
    expect(component.attributes).toMatchObject({ quantity: 'U10', units: 'm/s', _FillValue: -9999 })
    const longitude = layer === 'observation' ? -20 : wind.configuration.region.west
    const latitude = layer === 'observation' ? 10 : wind.configuration.region.south
    const expected = queryTaskResult(wind, {
      kind: 'points',
      layer,
      ...(layer === 'observation' ? { observationMode: 'stations' } : {}),
      points: [{ longitude, latitude }],
      times: [selection.timeRange.start],
      temporalResolution: 'hourly',
    })
    if (!expected.ok || expected.variable !== 'wind') throw new Error('Expected public wind result')
    if (layer !== 'observation') expect(component.data[0]).toBeLessThan(0)
    expect(component.data[0]).toBeCloseTo(expected.values[0]!.u10, 3)
    expect(
      file.variables.find((variable) => variable.name === `v10_${layer}`)!.data[0],
    ).toBeCloseTo(expected.values[0]!.v10, 3)
    expect(
      file.variables.find((variable) => variable.name === `direction_${layer}`)!.attributes,
    ).toMatchObject({ convention: 'meteorological-from', units: 'degrees' })
  }
})

it('exports MSL sea-level pressure in hPa, never SP, with independent grid and station coordinates', async () => {
  const pressure = exportTask({ variable: 'pressure', dataSeed: 42 })
  const selection = exportRequest(pressure, { format: 'netcdf' })
  const result = await exportTaskAsNetCDF(pressure, selection)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error)
  const file = readNetCDF(result.data)
  for (const layer of ['original', 'downscaled', 'observation'] as const) {
    const msl = file.variables.find((variable) => variable.name === `msl_${layer}`)!
    expect(msl.attributes).toMatchObject({
      quantity: 'MSL',
      units: 'hPa',
      standard_name: 'air_pressure_at_mean_sea_level',
      source: 'Synthetic Demo',
      _FillValue: -9999,
    })
    expect(msl.data[0]).toBeGreaterThan(900)
    const expected = queryTaskResult(pressure, {
      kind: 'points',
      layer,
      ...(layer === 'observation' ? { observationMode: 'stations' } : {}),
      points: [{ longitude: 120, latitude: 30 }],
      times: [selection.timeRange.start],
      temporalResolution: 'hourly',
    })
    if (!expected.ok) throw new Error(expected.error)
    expect(msl.data[0]).toBeCloseTo(expected.values[0]!.value, 3)
    expect(msl.dimensions).toEqual(
      layer === 'observation'
        ? ['time', 'station']
        : ['time', `${layer}_latitude`, `${layer}_longitude`],
    )
  }
  expect(file.variables.some((variable) => variable.name.toUpperCase() === 'SP')).toBe(false)
})

it('exports hourly precipitation totals, requested and actual interval bounds and coverage without double accumulation', async () => {
  const rain = exportTask({ variable: 'precipitation', dataSeed: 42 })
  const selection = exportRequest(rain, {
    format: 'netcdf',
    timeRange: { start: '2024-01-01T00:00:00.000Z', end: '2024-01-01T08:00:00.000Z' },
  })
  const result = await exportTaskAsNetCDF(rain, selection)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error)
  const file = readNetCDF(result.data)
  expect(file.dimensions).toContainEqual({ name: 'bounds', size: 2 })
  for (const layer of ['original', 'downscaled', 'observation'] as const) {
    const total = file.variables.find((variable) => variable.name === `precipitation_${layer}`)!
    expect(total.attributes).toMatchObject({
      quantity: 'TP',
      units: 'mm',
      interval_bounds: `accumulation_bounds_${layer}`,
    })
    const boundaries = file.variables.find(
      (variable) => variable.name === `accumulation_bounds_${layer}`,
    )!
    expect(boundaries.attributes).toMatchObject({
      units: 'seconds since 1970-01-01 00:00:00',
      calendar: 'proleptic_gregorian',
      boundary_convention: '[start,end)',
    })
    expect(Array.from(boundaries.data).slice(0, 2)).toEqual([1704067200, 1704070800])
    const expected = queryTaskResult(rain, {
      kind: 'points',
      layer,
      ...(layer === 'observation' ? { observationMode: 'stations' } : {}),
      points: [{ longitude: 120, latitude: 30 }],
      times: [selection.timeRange.start],
      temporalResolution: 'hourly',
    })
    if (!expected.ok) throw new Error(expected.error)
    expect(total.data[0]).toBeCloseTo(expected.values[0]!.value, 3)
    if (layer !== 'observation') expect(total.data[0]).toBe(0)
    expect(
      file.variables.find((variable) => variable.name === `sampled_hours_${layer}`)!.data[0],
    ).toBe(1)
    expect(
      file.variables.find((variable) => variable.name === `expected_hours_${layer}`)!.data[0],
    ).toBe(1)
  }
})

it('keeps scientific wind missing slots and valid neighbor slots with explicit quality rather than deleting rows', async () => {
  const wind = exportTask({
    variable: 'wind',
    region: { west: 20, east: 20.12, south: 65, north: 65.08 },
    dataSeed: 44,
  })
  const selection = exportRequest(wind, {
    format: 'netcdf',
    timeRange: { start: '2024-01-01T11:00:00.000Z', end: '2024-01-01T13:00:00.000Z' },
  })
  const result = await exportTaskAsNetCDF(wind, selection)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error)
  const file = readNetCDF(result.data)
  for (const layer of ['original', 'downscaled'] as const) {
    const component = file.variables.find((variable) => variable.name === `u10_${layer}`)!
    const quality = file.variables.find((variable) => variable.name === `quality_flag_${layer}`)!
    const size = component.data.length / 2
    expect(component.data[0]).not.toBe(-9999)
    expect(component.data[size]).toBe(-9999)
    expect(quality.data[0]).toBe(0)
    expect(quality.data[size]).toBe(1)
    expect(quality.attributes).toMatchObject({
      flag_meanings: 'valid missing incomplete',
      source: 'Synthetic Demo',
    })
  }
})

it('exports calm wind as real zero components and unavailable direction, not a fabricated north wind', async () => {
  const wind = exportTask({
    variable: 'wind',
    dataSeed: 0,
    region: { west: 60, east: 60.06, south: -10, north: -9.94 },
  })
  // The known original point uses source fusion's zero offset and the v2 calm fixture.
  wind.configuration.dataSource = 'fusion'
  const selection = exportRequest(wind, { format: 'netcdf', dataTypes: ['original'] })
  const result = await exportTaskAsNetCDF(wind, selection)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error)
  const file = readNetCDF(result.data)
  expect(file.variables.find((variable) => variable.name === 'u10_original')!.data[0]).toBe(0)
  expect(file.variables.find((variable) => variable.name === 'v10_original')!.data[0]).toBe(0)
  expect(file.variables.find((variable) => variable.name === 'speed_original')!.data[0]).toBe(0)
  expect(file.variables.find((variable) => variable.name === 'direction_original')!.data[0]).toBe(
    -9999,
  )
  expect(
    file.variables.find((variable) => variable.name === 'direction_status_original')!.data[0],
  ).toBe(1)
})

it('retains a missing hourly rain slot and its requested interval separately from real zero rain', async () => {
  const rain = exportTask({
    variable: 'precipitation',
    dataSeed: 42,
    region: { west: 20, east: 20.12, south: 65, north: 65.08 },
  })
  const selection = exportRequest(rain, {
    format: 'netcdf',
    dataTypes: ['original'],
    timeRange: { start: '2024-01-01T00:00:00.000Z', end: '2024-01-01T05:00:00.000Z' },
  })
  const result = await exportTaskAsNetCDF(rain, selection)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error)
  const file = readNetCDF(result.data)
  const total = file.variables.find((variable) => variable.name === 'precipitation_original')!
  const size = (total.data.length / 5) * 4
  expect(total.data[0]).toBe(0)
  expect(total.data[size]).toBe(-9999)
  const requested = file.variables.find(
    (variable) => variable.name === 'requested_accumulation_bounds_original',
  )!
  expect(Array.from(requested.data).slice(size * 2, size * 2 + 2)).toEqual([1704081600, 1704085200])
  expect(
    file.variables.find((variable) => variable.name === 'sampled_hours_original')!.data[size],
  ).toBe(0)
  expect(
    file.variables.find((variable) => variable.name === 'complete_coverage_original')!.data[size],
  ).toBe(0)
})

it('preserves public ensemble-mean identity and per-slot denominator without exporting members as locations', async () => {
  const ensemble = exportTask({ variable: 'temperature', ensembleMembers: 5 })
  const selection = exportRequest(ensemble, { format: 'netcdf', dataTypes: ['downscaled'] })
  const result = await exportTaskAsNetCDF(ensemble, selection)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error)
  const file = readNetCDF(result.data)
  expect(file.dimensions.some((dimension) => dimension.name === 'member')).toBe(false)
  const temperature = file.variables.find((variable) => variable.name === 'temperature_downscaled')!
  const count = file.variables.find(
    (variable) => variable.name === 'ensemble_sample_count_downscaled',
  )!
  expect(count.data.length).toBe(temperature.data.length)
  expect(count.data[0]).toBe(5)
  expect(temperature.attributes).toMatchObject({
    aggregation: 'public ensemble mean; members are not extra records',
  })
  expect(file.globalAttributes).toMatchObject({
    aggregation: 'public-default-ensemble-mean',
    requestedMethod: 'probabilistic',
    actualMethod: 'probabilistic',
  })
})

it('shares the public daily rain interval with UTC epoch bounds across a day boundary', async () => {
  const rain = exportTask({
    variable: 'precipitation',
    timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-01-03' },
  })
  const selection = exportRequest(rain, {
    format: 'netcdf',
    temporalResolution: 'daily',
    timeRange: { start: '2024-01-01T00:00:00.000Z', end: '2024-01-03T00:00:00.000Z' },
  })
  const result = await exportTaskAsNetCDF(rain, selection)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error)
  const file = readNetCDF(result.data)
  for (const layer of ['original', 'downscaled', 'observation'] as const) {
    const boundaries = file.variables.find(
      (variable) => variable.name === `accumulation_bounds_${layer}`,
    )!
    expect(Array.from(boundaries.data).slice(0, 2)).toEqual([1704067200, 1704153600])
    const expected = file.variables.find((variable) => variable.name === `expected_hours_${layer}`)!
    expect(expected.data[0]).toBe(24)
    expect(
      file.variables.find((variable) => variable.name === `complete_coverage_${layer}`)!.data[0],
    ).toBe(1)
  }
})

it('keeps a missing daily precipitation total missing while preserving actual hourly coverage', async () => {
  const rain = exportTask({
    variable: 'precipitation',
    region: { west: 20, east: 20.12, south: 65, north: 65.08 },
  })
  const selection = exportRequest(rain, {
    format: 'netcdf',
    temporalResolution: 'daily',
    dataTypes: ['original'],
    timeRange: { start: '2024-01-01T00:00:00.000Z', end: '2024-01-02T00:00:00.000Z' },
  })
  const result = await exportTaskAsNetCDF(rain, selection)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error)
  const file = readNetCDF(result.data)
  expect(
    file.variables.find((variable) => variable.name === 'precipitation_original')!.data[0],
  ).toBe(-9999)
  expect(
    file.variables.find((variable) => variable.name === 'sampled_hours_original')!.data[0],
  ).toBe(23)
  expect(
    file.variables.find((variable) => variable.name === 'expected_hours_original')!.data[0],
  ).toBe(24)
  expect(
    file.variables.find((variable) => variable.name === 'complete_coverage_original')!.data[0],
  ).toBe(0)
})

it.each(['temperature', 'wind', 'pressure', 'precipitation'] as const)(
  'uses exact record counts and the measured CDF1 layout for mixed %s without generating an estimate file',
  async (variable) => {
    const task = exportTask({ variable })
    const selection = exportRequest(task, { format: 'netcdf' })
    const plan = createExportPlan(selection, task)
    if (!plan.ok) throw new Error(plan.message)
    const estimate = estimateNetCDFPlan(plan)
    if (!estimate.ok) throw new Error(estimate.message)
    const [binary, csv, geojson] = await Promise.all([
      exportTaskAsNetCDF(task, selection),
      generateCsvFromTask({ ...selection, format: 'csv' }, task),
      generateGeoJsonFromTask({ ...selection, format: 'geojson' }, task),
    ])
    if (!binary.ok || !csv.ok || !geojson.ok) throw new Error('Expected mixed format generation')
    const rows = Papa.parse<Record<string, string>>(csv.content, {
      header: true,
      skipEmptyLines: true,
    }).data
    const json = JSON.parse(geojson.content) as {
      features: Array<{
        geometry: { coordinates: [number, number] }
        properties: Record<string, unknown>
      }>
    }
    expect(rows.length).toBe(estimate.recordCount)
    expect(json.features.length).toBe(estimate.recordCount)
    expect(binary.recordCount).toBe(estimate.recordCount)
    expect(Math.abs(estimate.approximateSize - binary.data.byteLength)).toBeLessThanOrEqual(256)
    const file = readNetCDF(binary.data)
    for (const layer of ['original', 'downscaled', 'observation'] as const) {
      const row = rows.find((row) => row.dataType === layer)!
      const feature = json.features.find((feature) => feature.properties.dataType === layer)!
      const prefix = {
        temperature: 'temperature',
        wind: 'speed',
        pressure: 'msl',
        precipitation: 'precipitation',
      }[variable]
      const value = file.variables.find((entry) => entry.name === `${prefix}_${layer}`)!.data[0]!
      expect(Math.abs(value - Number(row.value))).toBeLessThanOrEqual(0.001)
      expect(Math.abs(value - Number(feature.properties.value))).toBeLessThanOrEqual(0.001)
      expect(feature.geometry.coordinates).toEqual([Number(row.longitude), Number(row.latitude)])
      if (variable === 'wind') {
        expect(file.variables.find((entry) => entry.name === `u10_${layer}`)!.data[0]).toBeCloseTo(
          Number(row.u10),
          3,
        )
        expect(file.variables.find((entry) => entry.name === `v10_${layer}`)!.data[0]).toBeCloseTo(
          Number(row.v10),
          3,
        )
      }
    }
  },
)

it('accepts exactly 100km edges and 720 hours but rejects just-over limits before generation', async () => {
  const edge = 100 / ((6371 * Math.PI) / 180)
  const task = exportTask({
    region: { west: 0, east: 1, south: 0, north: 1 },
    timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-02-02' },
  })
  const boundary = exportRequest(task, {
    format: 'netcdf',
    dataTypes: ['original'],
    bbox: { west: 0, east: edge, south: 0, north: edge },
    timeRange: { start: '2024-01-01T00:00:00.000Z', end: '2024-01-31T00:00:00.000Z' },
  })
  const plan = createExportPlan(boundary, task)
  expect(plan.ok).toBe(true)
  if (!plan.ok) throw new Error(plan.message)
  expect(estimateNetCDFPlan(plan).ok).toBe(true)
  expect(
    await exportTaskAsNetCDF(task, { ...boundary, bbox: { ...boundary.bbox, east: edge + 1e-7 } }),
  ).toMatchObject({ ok: false, code: 'BBOX_TOO_LARGE' })
  expect(
    await exportTaskAsNetCDF(task, { ...boundary, bbox: { ...boundary.bbox, north: edge + 1e-7 } }),
  ).toMatchObject({ ok: false, code: 'BBOX_TOO_LARGE' })
  expect(
    await exportTaskAsNetCDF(task, {
      ...boundary,
      timeRange: { ...boundary.timeRange, end: '2024-01-31T01:00:00.000Z' },
    }),
  ).toMatchObject({ ok: false, code: 'TIME_RANGE_TOO_LARGE' })
})

it('rejects oversized full-resolution requests before reading a large native field and does not output a partial .nc', async () => {
  const task = exportTask({
    resolution: '1km',
    variable: 'wind',
    region: { west: 0, east: 1, south: 0, north: 1 },
    timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-02-02' },
  })
  const selection = exportRequest(task, {
    format: 'netcdf',
    dataTypes: ['downscaled'],
    bbox: { west: 0, east: 0.8, south: 0, north: 0.8 },
    timeRange: { start: '2024-01-01T00:00:00.000Z', end: '2024-01-31T00:00:00.000Z' },
  })
  const result = await exportTaskAsNetCDF(task, selection)
  expect(result).toMatchObject({ ok: false, code: 'EXPORT_LIMIT_EXCEEDED' })
  expect(result).not.toHaveProperty('data')
  if (result.ok) throw new Error('Expected preallocation rejection')
  expect(result.message).toMatch(/shrink|area|time/i)
})

it('tells mixed exports about zero station contribution and refuses an observation-only fake file', async () => {
  const task = exportTask({ region: { west: 120.1, east: 120.2, south: 30.1, north: 30.2 } })
  const selection = exportRequest(task, { format: 'netcdf' })
  const mixed = await exportTaskAsNetCDF(task, selection)
  expect(mixed.ok).toBe(true)
  if (!mixed.ok) throw new Error(mixed.error)
  const file = readNetCDF(mixed.data)
  expect(file.dimensions.some((dimension) => dimension.name === 'station')).toBe(false)
  expect(file.globalAttributes.observation_coverage).toContain('0 records')
  expect(mixed.notes.join()).toContain('observation')
  expect(
    await exportTaskAsNetCDF(task, { ...selection, dataTypes: ['observation'] }),
  ).toMatchObject({ ok: false, code: 'NO_EXPORT_DATA' })
})

it('rejects unavailable generator/reference identity instead of converting a reading failure to missing science', async () => {
  const task = exportTask({ generatorVersion: 'unavailable-generator' })
  const result = await exportTaskAsNetCDF(task, exportRequest(task, { format: 'netcdf' }))
  expect(result.ok).toBe(false)
  expect(result).not.toHaveProperty('data')
  const reference = exportTask({ referenceVersion: 'unavailable-reference' })
  expect(
    await exportTaskAsNetCDF(reference, exportRequest(reference, { format: 'netcdf' })),
  ).toMatchObject({ ok: false, code: 'INCOMPATIBLE_REFERENCE' })
})

it('cancels a cooperative binary generation without publishing partial or successful bytes', async () => {
  const task = exportTask({
    region: { west: 120, east: 120.7, south: 30, north: 30.7 },
    resolution: '1km',
  })
  const request = exportRequest(task, { format: 'netcdf', dataTypes: ['downscaled'] })
  const controller = new AbortController()
  const pending = exportTaskAsNetCDF(task, request, controller.signal)
  controller.abort()
  const result = await pending
  expect(result).toMatchObject({ ok: false, code: 'CANCELLED' })
  expect(result).not.toHaveProperty('data')
})

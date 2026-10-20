import { describe, expect, it } from 'vitest'
import {
  applyResultMapRange,
  formatResultMapBound,
  resultMapDisplaySettings,
  resultMapStandardPalette,
  resultSampleColor,
} from '@/features/result-analysis/service/result-map-display'
import type {
  ResultMapData,
  ResultMapKind,
  ResultMapSample,
} from '@/features/result-analysis/types/result-map'

const time = '2024-01-01T00:00:00.000Z'

function displayData(values: Record<ResultMapKind, Array<number | null>>): ResultMapData {
  const samples = (kind: ResultMapKind): ResultMapSample[] =>
    values[kind].map((value, longitude) => ({ longitude, latitude: 0, time, value }))
  return {
    taskId: 'display-contract',
    time,
    region: { west: 0, east: 3, south: 0, north: 1 },
    variable: 'temperature',
    unit: '°C',
    observationMode: 'interpolated',
    layers: {
      original: { kind: 'original', status: 'ready', samples: samples('original') },
      downscaled: { kind: 'downscaled', status: 'ready', samples: samples('downscaled') },
      observation: { kind: 'observation', status: 'ready', samples: samples('observation') },
      difference: { kind: 'difference', status: 'ready', samples: samples('difference') },
    },
  }
}

describe('public result map display settings', () => {
  it('shares the actual finite union for comparable levels while reporting excluded missing and nonfinite slots', () => {
    const data = displayData({
      original: [-2, 4, null],
      downscaled: [0, 8, Number.POSITIVE_INFINITY],
      observation: [-5, 3],
      difference: [-3, 2],
    })
    const settings = resultMapDisplaySettings(data)
    for (const kind of ['original', 'downscaled', 'observation'] as const) {
      expect(settings[kind]).toMatchObject({ min: -5, max: 8, mode: 'automatic' })
      expect(settings[kind].basis).toMatch(/finite union.*Original.*Downscaled.*Observation/i)
    }
    expect(settings.original).toMatchObject({ finiteCount: 2, missingCount: 1, nonfiniteCount: 0 })
    expect(settings.downscaled).toMatchObject({
      finiteCount: 2,
      missingCount: 0,
      nonfiniteCount: 1,
    })
    expect(data.layers.downscaled.samples[2]!.value).toBe(Number.POSITIVE_INFINITY)
  })
})

it('never mixes standard deviation with forecast levels in the automatic union', () => {
  const data = displayData({
    original: [-2, 4],
    downscaled: [200, 210],
    observation: [-5, 3],
    difference: [-3, 2],
  })
  data.layers.downscaled.ensemble = {
    kind: 'stddev',
    missingPolicy: 'exclude-unavailable-per-location-time',
    allMemberIds: ['member-01', 'member-02'],
    memberIds: ['member-01', 'member-02'],
    unavailable: [],
  }
  const settings = resultMapDisplaySettings(data)
  expect(settings.original).toMatchObject({ min: -5, max: 4 })
  expect(settings.observation).toMatchObject({ min: -5, max: 4 })
  expect(settings.downscaled).toMatchObject({ min: 200, max: 210 })
  expect(settings.downscaled.basis).toMatch(
    /independent.*standard deviation.*not.*forecast levels/i,
  )
})

it('keeps an explicitly incompatible quantity/unit/statistic independent of the common preview context', () => {
  const data = displayData({
    original: [-2, 4],
    downscaled: [0, 8],
    observation: [980, 1020],
    difference: [-3, 2],
  })
  data.layers.observation.displayContext = {
    variable: 'pressure',
    unit: 'hPa',
    quantity: 'MSL',
    temporalStatistic: 'instantaneous',
  }
  const settings = resultMapDisplaySettings(data)
  expect(settings.original).toMatchObject({ min: -2, max: 8, unit: '°C' })
  expect(settings.downscaled).toMatchObject({ min: -2, max: 8 })
  expect(settings.observation).toMatchObject({ min: 980, max: 1020, unit: 'hPa' })
  expect(settings.observation.basis).toMatch(/independent.*incompatible/i)
})

it('reports an empty finite union without inventing a numeric color scale', () => {
  const data = displayData({
    original: [null],
    downscaled: [Number.NaN],
    observation: [Number.NEGATIVE_INFINITY],
    difference: [null],
  })
  const settings = resultMapDisplaySettings(data)
  expect(settings.original).toMatchObject({ domain: 'empty', min: 0, max: 0, finiteCount: 0 })
  expect(settings.difference).toMatchObject({ domain: 'empty', min: 0, max: 0 })
  expect(settings.original.basis).toMatch(/no finite values.*no numeric scale/i)
})

it('keeps constant zero as a real value and uses a single honest automatic color instead of fabricated variation', () => {
  const data = displayData({
    original: [0],
    downscaled: [0, null],
    observation: [0],
    difference: [0],
  })
  const settings = resultMapDisplaySettings(data)
  expect(settings.original).toMatchObject({
    domain: 'constant',
    min: 0,
    max: 0,
    dataMin: 0,
    dataMax: 0,
  })
  expect(settings.difference).toMatchObject({ domain: 'constant', min: 0, max: 0 })
  expect(resultSampleColor(0, settings.original)).toBe('#ffffff')
  expect(resultSampleColor(0, settings.difference)).toBe('#ffffff')
  expect(resultSampleColor(null, settings.original)).not.toBe('#ffffff')
})

it('does not combine equal-unit precipitation with different actual accumulation coverage', () => {
  const data = displayData({
    original: [2, 4],
    downscaled: [3, 6],
    observation: [80, 90],
    difference: [-1, 2],
  })
  data.variable = 'precipitation'
  data.unit = 'mm'
  const complete = {
    start: time,
    end: '2024-01-02T00:00:00.000Z',
    requestedStart: time,
    requestedEnd: '2024-01-02T00:00:00.000Z',
    bounds: '[start,end)' as const,
    sampledHours: 24,
    expectedHours: 24,
    complete: true,
  }
  for (const kind of ['original', 'downscaled'] as const) {
    data.layers[kind].samples = data.layers[kind].samples.map((sample) => ({
      ...sample,
      accumulation: complete,
    }))
  }
  data.layers.observation.samples = data.layers.observation.samples.map((sample) => ({
    ...sample,
    accumulation: {
      ...complete,
      end: '2024-01-01T06:00:00.000Z',
      sampledHours: 6,
      complete: false,
    },
  }))
  const settings = resultMapDisplaySettings(data)
  expect(settings.original).toMatchObject({ min: 2, max: 6 })
  expect(settings.observation).toMatchObject({ min: 80, max: 90 })
  expect(settings.observation.basis).toMatch(/independent.*accumulation/i)
})

describe('public manual display range', () => {
  it("rejects nonfinite or unordered bounds without replacing the caller's previous valid mapping", () => {
    const automatic = resultMapDisplaySettings(
      displayData({
        original: [-2, 4],
        downscaled: [0, 8],
        observation: [-5, 3],
        difference: [-3, 2],
      }),
    ).original
    const applied = applyResultMapRange(automatic, { min: -1, max: 2 })
    expect(applied).toMatchObject({ ok: true, display: { min: -1, max: 2, mode: 'manual' } })
    if (!applied.ok) throw new Error(applied.error)
    const previous = { ...applied.display }
    for (const input of [
      { min: Number.NaN, max: 2 },
      { min: -1, max: Number.POSITIVE_INFINITY },
      { min: '-Infinity', max: '2' },
      { min: '', max: '2' },
      { min: '1', max: '1' },
      { min: 3, max: 2 },
    ]) {
      expect(applyResultMapRange(applied.display, input)).toMatchObject({
        ok: false,
        error: expect.any(String),
      })
      expect(applied.display).toEqual(previous)
    }
  })
})

it('enforces nonnegative wind/rain absolute ranges but allows signed zero-centered Difference and honest endpoint saturation', () => {
  for (const variable of ['wind', 'precipitation'] as const) {
    const data = displayData({
      original: [0, 5],
      downscaled: [0, 8],
      observation: [0, 3],
      difference: [-3, 2],
    })
    data.variable = variable
    data.unit = variable === 'wind' ? 'm/s' : 'mm'
    const automatic = resultMapDisplaySettings(data)
    expect(applyResultMapRange(automatic.original, { min: -1, max: 4 })).toMatchObject({
      ok: false,
    })
    const manual = applyResultMapRange(automatic.difference, {
      min: -1,
      max: 3,
      symmetricZero: true,
    })
    if (!manual.ok) throw new Error(manual.error)
    expect(manual.display).toMatchObject({ min: -3, max: 3, symmetricZero: true })
    expect(resultSampleColor(-20, manual.display)).toBe('#0c4a6e')
    expect(resultSampleColor(20, manual.display)).toBe('#991b1b')
    expect(resultSampleColor(0, manual.display)).toBe('#ffffff')
    const absolute = applyResultMapRange(automatic.original, { min: 0, max: 4 })
    if (!absolute.ok) throw new Error(absolute.error)
    expect(resultSampleColor(0, absolute.display)).not.toBe(
      resultSampleColor(null, absolute.display),
    )
    expect(resultSampleColor(Number.POSITIVE_INFINITY, absolute.display)).toBe(
      resultSampleColor(null, absolute.display),
    )
  }
})

it('changing display ranges leaves public scientific queries, task configuration/seed and existing parsed CSV unchanged', async () => {
  const { queryTaskResult } = await import('@/features/downscaling-tasks/service/result-queries')
  const { readResultMapData } = await import('@/features/result-analysis/service/result-map-data')
  const { generateCsvFromTask } = await import('@/server/services/csv-export.server')
  const { exportTask, exportRequest } = await import('../factories/export-task')
  const Papa = (await import('papaparse')).default
  const task = exportTask()
  const taskBefore = structuredClone(task)
  const query = {
    kind: 'points' as const,
    layer: 'original' as const,
    temporalResolution: 'hourly' as const,
    points: [{ longitude: 120, latitude: 30 }],
    times: [time],
  }
  const before = queryTaskResult(task, query)
  if (!before.ok) throw new Error(before.error)
  expect(before.values[0]!.value).toBeGreaterThan(1)
  const csvBefore = await generateCsvFromTask(exportRequest(task), task)
  if (!csvBefore.ok) throw new Error(csvBefore.message)
  const maps = await readResultMapData(
    { result: async (_id, input) => queryTaskResult(task, input) },
    task,
    { time, observationMode: 'stations' },
  )
  const settings = resultMapDisplaySettings(maps)
  const applied = applyResultMapRange(settings.original, { min: 0, max: 1 })
  if (!applied.ok) throw new Error(applied.error)
  expect(resultSampleColor(before.values[0]!.value, applied.display)).toBe('#dc2626')
  expect(queryTaskResult(task, query)).toEqual(before)
  const csvAfter = await generateCsvFromTask(exportRequest(task), task)
  if (!csvAfter.ok) throw new Error(csvAfter.message)
  const parsedBefore = Papa.parse(csvBefore.content, { header: true, skipEmptyLines: true })
  const parsedAfter = Papa.parse(csvAfter.content, { header: true, skipEmptyLines: true })
  expect(parsedBefore.errors).toEqual([])
  expect(parsedAfter.errors).toEqual([])
  expect(parsedBefore.data).toHaveLength(54)
  expect(parsedAfter.data).toEqual(parsedBefore.data)
  expect(task).toEqual(taskBefore)
})

it('keeps zero neutral in an asymmetric signed Difference range instead of relabelling it blue or red', () => {
  const data = displayData({
    original: [0, 2],
    downscaled: [0, 3],
    observation: [0],
    difference: [-1, 3],
  })
  const manual = applyResultMapRange(resultMapDisplaySettings(data).difference, {
    min: -1,
    max: 3,
    symmetricZero: false,
  })
  if (!manual.ok) throw new Error(manual.error)
  expect(resultSampleColor(0, manual.display)).toBe('#ffffff')
  expect(resultSampleColor(-5, manual.display)).toBe('#0c4a6e')
  expect(resultSampleColor(20, manual.display)).toBe('#991b1b')
})

it('renders a constant positive Difference with its true sign, not neutral zero', () => {
  const settings = resultMapDisplaySettings(
    displayData({ original: [1], downscaled: [3], observation: [1], difference: [2, 2] }),
  ).difference
  expect(settings).toMatchObject({ domain: 'constant', dataMin: 2, dataMax: 2 })
  expect(resultSampleColor(2, settings)).toBe('#991b1b')
})

it('accepts finite same-sign Difference ranges without painting positive values blue or negative values red', () => {
  const display = resultMapDisplaySettings(
    displayData({ original: [1], downscaled: [3], observation: [1], difference: [-2, 2] }),
  ).difference
  for (const [min, max, value, color] of [
    [1, 3, 2, '#f87171'],
    [-3, -1, -2, '#0ea5e9'],
  ] as const) {
    const manual = applyResultMapRange(display, { min, max, symmetricZero: false })
    expect(manual.ok).toBe(true)
    if (!manual.ok) throw new Error(manual.error)
    expect(resultSampleColor(value, manual.display)).toBe(color)
  }
})

it('exposes immutable standard palettes and finite range mapping without changing scientific samples', () => {
  const palette = resultMapStandardPalette('temperature')
  expect(Object.isFrozen(palette)).toBe(true)
  expect(Object.isFrozen(palette.colors)).toBe(true)
  expect(palette.colors).toEqual(['#2563eb', '#93c5fd', '#ffffff', '#fca5a5', '#dc2626'])
  const data = displayData({
    original: [0],
    downscaled: [1],
    observation: [2],
    difference: [-1, 1],
  })
  const manual = applyResultMapRange(resultMapDisplaySettings(data).original, {
    min: -Number.MAX_VALUE,
    max: Number.MAX_VALUE,
  })
  if (!manual.ok) throw new Error(manual.error)
  expect(resultSampleColor(0, manual.display)).toBe('#ffffff')
})

it('formats displayed bounds without binary-float noise while leaving exact mapping values untouched', () => {
  const data = displayData({
    original: [0, 2],
    downscaled: [0, 3],
    observation: [0],
    difference: [-1.965299999999998, 1.965299999999998],
  })
  const display = resultMapDisplaySettings(data).difference
  expect(formatResultMapBound(display.min)).toBe('-1.9653')
  expect(formatResultMapBound(display.max)).toBe('1.9653')
  expect(formatResultMapBound(0.11959999999999127)).toBe('0.1196')
  expect(formatResultMapBound(0.0000001)).toBe('1e-7')
  expect(display.min).toBe(-1.965299999999998)
  expect(display.max).toBe(1.965299999999998)
})

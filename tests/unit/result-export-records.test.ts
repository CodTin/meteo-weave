import { describe, expect, it } from 'vitest'
import { queryTaskResult } from '@/features/downscaling-tasks/service/result-queries'
import { createExportPlan } from '@/server/services/result-export-plan.server'
import { readExportRecords } from '@/server/services/result-export-records.server'
import { exportRequest, exportTask } from '../factories/export-task'
import { demoCatalogFor } from '@/features/downscaling-tasks/service/demo-catalog'

describe('actual public export records', () => {
  it('returns each planned slot using public query values and exact native/station identity', async () => {
    const task = exportTask()
    const plan = createExportPlan(exportRequest(task), task)
    if (!plan.ok) throw new Error(plan.message)
    const result = await readExportRecords(plan)
    if (!result.ok) throw new Error(result.message)
    expect(result.records).toHaveLength(54)
    expect(result.records.map((row) => row.dataType)).toEqual([
      ...Array<string>(12).fill('original'),
      ...Array<string>(40).fill('downscaled'),
      ...Array<string>(2).fill('observation'),
    ])
    for (const record of result.records) {
      const query = queryTaskResult(task, {
        kind: 'points',
        layer: record.dataType,
        ...(record.dataType === 'observation' ? { observationMode: 'stations' } : {}),
        temporalResolution: 'hourly',
        points: [{ longitude: record.longitude, latitude: record.latitude }],
        times: [record.time],
      })
      if (!query.ok) throw new Error(query.error)
      expect(record.value).toBe(query.values[0]!.value)
      expect(record).toMatchObject({
        provenance: 'Synthetic Demo',
        unit: '°C',
        qualityFlag: 'valid',
        qualityReason: null,
      })
    }
    expect(result.records.at(-1)).toMatchObject({
      stationId: 'synthetic-station-v1:120:30',
      sampling: 'stations',
      resolutionKm: null,
    })
  })
})

it('keeps missing wind slots and retries a mixed batch without dropping valid neighboring samples', async () => {
  const task = exportTask({
    variable: 'wind',
    region: { west: 19.9, east: 20.1, south: 65, north: 65.05 },
  })
  const request = exportRequest(task, {
    dataTypes: ['downscaled'],
    timeRange: { start: '2024-01-01T12:00:00.000Z', end: '2024-01-01T13:00:00.000Z' },
  })
  const plan = createExportPlan(request, task)
  if (!plan.ok) throw new Error(plan.message)
  const result = await readExportRecords(plan)
  if (!result.ok) throw new Error(result.message)
  expect(result.records).toHaveLength(plan.recordCount)
  expect(result.records.filter((record) => record.qualityFlag === 'valid')).toHaveLength(6)
  expect(result.records.filter((record) => record.qualityFlag === 'missing')).toHaveLength(9)
  for (const row of result.records.filter((record) => record.qualityFlag === 'missing')) {
    expect(row).toMatchObject({
      value: null,
      u10: null,
      v10: null,
      speed: null,
      direction: null,
      directionStatus: 'missing',
      qualityReason: 'MISSING_COMPONENT',
    })
  }
})

it('retains signed U10/V10 and meteorological-from diagnostics including exact calm station wind', async () => {
  const task = exportTask({
    variable: 'wind',
    region: { west: 0.95, east: 1.05, south: 0.95, north: 1.05 },
  })
  const plan = createExportPlan(exportRequest(task, { dataTypes: ['observation'] }), task)
  if (!plan.ok) throw new Error(plan.message)
  const result = await readExportRecords(plan)
  if (!result.ok) throw new Error(result.message)
  expect(result.records[0]).toMatchObject({
    value: 0,
    u10: 0,
    v10: 0,
    speed: 0,
    direction: null,
    directionStatus: 'calm',
    directionConvention: 'meteorological-from',
    qualityFlag: 'valid',
  })
  const negativeTask = exportTask({
    variable: 'wind',
    region: { west: 1.95, east: 2.05, south: 1.95, north: 2.05 },
  })
  const negativePlan = createExportPlan(
    exportRequest(negativeTask, { dataTypes: ['observation'] }),
    negativeTask,
  )
  if (!negativePlan.ok) throw new Error(negativePlan.message)
  const negative = await readExportRecords(negativePlan)
  if (!negative.ok) throw new Error(negative.message)
  expect(negative.records[0]).toMatchObject({
    u10: -3,
    v10: -4,
    speed: 5,
    directionStatus: 'available',
    directionConvention: 'meteorological-from',
  })
  expect(negative.records[0]!.direction).toBe(36.8699)
})

it('distinguishes dry zero from missing daily precipitation while keeping actual/requested interval coverage', async () => {
  const task = exportTask({
    variable: 'precipitation',
    region: { west: 20, east: 20.1, south: 65, north: 65.05 },
  })
  const dailyPlan = createExportPlan(
    exportRequest(task, {
      dataTypes: ['observation'],
      temporalResolution: 'daily',
      timeRange: { start: '2024-01-01T00:00:00.000Z', end: '2024-01-02T00:00:00.000Z' },
    }),
    task,
  )
  if (!dailyPlan.ok) throw new Error(dailyPlan.message)
  const daily = await readExportRecords(dailyPlan)
  if (!daily.ok) throw new Error(daily.message)
  expect(daily.records).toHaveLength(1)
  expect(daily.records[0]).toMatchObject({
    value: null,
    qualityFlag: 'missing',
    qualityReason: 'MISSING_DATA',
    accumulation: {
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-01-02T00:00:00.000Z',
      requestedStart: '2024-01-01T00:00:00.000Z',
      requestedEnd: '2024-01-02T00:00:00.000Z',
      bounds: '[start,end)',
      sampledHours: 23,
      expectedHours: 24,
      complete: false,
    },
  })
  const hourlyPlan = createExportPlan(
    exportRequest(task, {
      dataTypes: ['observation'],
      timeRange: { start: '2024-01-01T00:00:00.000Z', end: '2024-01-01T01:00:00.000Z' },
    }),
    task,
  )
  if (!hourlyPlan.ok) throw new Error(hourlyPlan.message)
  const hourly = await readExportRecords(hourlyPlan)
  if (!hourly.ok) throw new Error(hourly.message)
  expect(hourly.records[0]).toMatchObject({
    value: 0,
    qualityFlag: 'valid',
    accumulation: { sampledHours: 1, expectedHours: 1, complete: true },
  })
})

it.each([5, 10, 20] as const)(
  'reads bounded %s-member public means without exporting member samples or preview decimation',
  async (ensembleMembers) => {
    const task = exportTask({ ensembleMembers, resolution: '1km' })
    const plan = createExportPlan(exportRequest(task, { dataTypes: ['downscaled'] }), task)
    if (!plan.ok) throw new Error(plan.message)
    const result = await readExportRecords(plan)
    if (!result.ok) throw new Error(result.message)
    expect(result.records).toHaveLength(260)
    expect(plan.recordCount).toBe(260)
    for (const record of [result.records[0]!, result.records[127]!, result.records.at(-1)!]) {
      const reply = queryTaskResult(task, {
        kind: 'points',
        layer: 'downscaled',
        temporalResolution: 'hourly',
        points: [{ longitude: record.longitude, latitude: record.latitude }],
        times: [record.time],
      })
      if (!reply.ok) throw new Error(reply.error)
      expect(record.value).toBe(reply.values[0]!.value)
      expect(record.ensembleMean).toEqual(reply.values[0]!.ensembleMean)
      expect(record.aggregation).toBe('ensemble-mean')
      expect(record.ensembleMeanDefinition).toBe(reply.ensemble!.meanDefinition)
      expect(record.ensembleMean!.sampleCount).toBe(ensembleMembers)
      expect(reply.ensemble!.samples).toHaveLength(ensembleMembers)
    }
  },
)

it('cooperatively rejects cancellation before or between batches rather than returning partial records', async () => {
  const task = exportTask({ ensembleMembers: 20, resolution: '1km' })
  const plan = createExportPlan(exportRequest(task, { dataTypes: ['downscaled'] }), task)
  if (!plan.ok) throw new Error(plan.message)
  const preAborted = new AbortController()
  preAborted.abort()
  await expect(readExportRecords(plan, preAborted.signal)).rejects.toMatchObject({
    name: 'AbortError',
  })
  const controller = new AbortController()
  const pending = readExportRecords(plan, controller.signal)
  setTimeout(() => controller.abort(), 0)
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
})

it('returns version/reference faults as whole-read failures, never scientific missing rows', async () => {
  const task = exportTask()
  const plan = createExportPlan(exportRequest(task), task)
  if (!plan.ok) throw new Error(plan.message)
  const failed = await readExportRecords({
    ...plan,
    task: { ...task, generatorVersion: 'future-version' },
  })
  expect(failed).toMatchObject({ ok: false, code: 'INCOMPATIBLE_GENERATOR' })
  expect('records' in failed).toBe(false)
  const reference = await readExportRecords({
    ...plan,
    task: { ...task, referenceVersion: 'future-reference' },
  })
  expect(reference).toMatchObject({ ok: false, code: 'INCOMPATIBLE_REFERENCE' })
  expect('records' in reference).toBe(false)
})

it('preserves public daily temperature mean/minimum/coverage and complete daily rain across native layers', async () => {
  for (const variable of ['temperature', 'precipitation'] as const) {
    const task = exportTask({
      variable,
      timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-01-02' },
    })
    const plan = createExportPlan(
      exportRequest(task, {
        temporalResolution: 'daily',
        timeRange: { start: '2024-01-01T00:00:00.000Z', end: '2024-01-02T00:00:00.000Z' },
      }),
      task,
    )
    if (!plan.ok) throw new Error(plan.message)
    const result = await readExportRecords(plan)
    if (!result.ok) throw new Error(result.message)
    expect(result.records).toHaveLength(27)
    for (const record of result.records) {
      const reply = queryTaskResult(task, {
        kind: 'points',
        layer: record.dataType,
        ...(record.dataType === 'observation' ? { observationMode: 'stations' } : {}),
        temporalResolution: 'daily',
        points: [{ longitude: record.longitude, latitude: record.latitude }],
        times: [record.time],
      })
      if (!reply.ok) throw new Error(reply.error)
      expect(record.value).toBe(reply.values[0]!.value)
      if (reply.variable === 'temperature' && reply.temporalStatistic === 'daily-mean') {
        expect(record.daily).toEqual(reply.values[0]!.daily)
        expect(record.daily).toMatchObject({
          sampledHours: 24,
          expectedHours: 24,
          completeDay: true,
        })
      }
      if (reply.variable === 'precipitation') {
        expect(record.accumulation).toEqual(reply.values[0]!.accumulation)
        expect(record.accumulation).toMatchObject({
          sampledHours: 24,
          expectedHours: 24,
          complete: true,
          requestedStart: '2024-01-01T00:00:00.000Z',
          requestedEnd: '2024-01-02T00:00:00.000Z',
        })
      }
    }
  }
})

it('exports canonical daily rainfall with unavailable members using the actual available-member mean', async () => {
  const task = demoCatalogFor('researcher').find(
    (candidate) => candidate.configuration.variable === 'precipitation',
  )!
  const selection = exportRequest(task, {
    bbox: { west: 113, east: 113.001, south: 29, north: 29.001 },
    timeRange: { start: '2024-01-01T00:00:00.000Z', end: '2024-01-02T00:00:00.000Z' },
    temporalResolution: 'daily',
    dataTypes: ['original', 'downscaled', 'observation'],
  })
  const mean = queryTaskResult(task, {
    kind: 'points',
    layer: 'downscaled',
    temporalResolution: 'daily',
    points: [{ longitude: 113, latitude: 29 }],
    times: [selection.timeRange.start],
  })
  if (!mean.ok) throw new Error(mean.error)
  expect(mean.ensemble?.unavailable).toHaveLength(1)
  expect(mean.ensemble?.unavailable.every((member) => member.code === 'MISSING_MEMBER')).toBe(true)
  expect(mean.values[0]!.ensembleMean?.sampleCount).toBe(4)
  const plan = createExportPlan(selection, task)
  if (!plan.ok) throw new Error(plan.message)
  const result = await readExportRecords(plan)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.message)
  expect(result.records).toHaveLength(3)
  expect(result.records.map((record) => record.dataType)).toEqual([
    'original',
    'downscaled',
    'observation',
  ])
  for (const record of result.records) {
    const query = queryTaskResult(task, {
      kind: 'points',
      layer: record.dataType,
      ...(record.dataType === 'observation' ? { observationMode: 'stations' } : {}),
      temporalResolution: 'daily',
      points: [{ longitude: record.longitude, latitude: record.latitude }],
      times: [record.time],
    })
    if (!query.ok) throw new Error(query.error)
    expect(record.value).toBe(query.values[0]!.value)
    const value = query.values[0]!
    if (!('accumulation' in value)) throw new Error('Rainfall lacks accumulation coverage')
    expect(record.accumulation).toEqual(value.accumulation)
    expect(record.qualityFlag).toBe('valid')
    expect(record.accumulation?.complete).toBe(true)
  }
  expect(result.records[1]!.ensembleMean).toEqual(mean.values[0]!.ensembleMean)
  expect(result.records[1]!.ensembleMeanDefinition).toBe(mean.ensemble?.meanDefinition)
})

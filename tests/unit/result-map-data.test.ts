import { describe, expect, it } from 'vitest'
import { queryTaskResult } from '@/features/downscaling-tasks/service/result-queries'
import type { ResultQuery } from '@/features/downscaling-tasks/service'
import { readResultMapData } from '@/features/result-analysis/service/result-map-data'
import { exportTask } from '../factories/export-task'

const time = '2024-01-01T01:00:00.000Z'

function publicSource(task = exportTask()) {
  return { result: async (_id: string, query: ResultQuery) => queryTaskResult(task, query) }
}

describe('public result map data', () => {
  it('reads the selected task/frame while preserving independent native grids and provenance', async () => {
    const task = exportTask()
    const maps = await readResultMapData(publicSource(task), task, {
      time,
      observationMode: 'interpolated',
    })
    expect(maps.taskId).toBe(task.id)
    expect(maps.time).toBe(time)
    expect(maps.variable).toBe('temperature')
    expect(maps.unit).toBe('°C')
    expect(maps.layers.original.status).toBe('ready')
    expect(maps.layers.downscaled.status).toBe('ready')
    expect(maps.layers.original.grid).toMatchObject({
      sampling: 'logical-grid',
      nominalSpacingKm: 10,
      crs: 'EPSG:4326',
    })
    expect(maps.layers.downscaled.grid).toMatchObject({
      sampling: 'logical-grid',
      nominalSpacingKm: 3,
      crs: 'EPSG:4326',
    })
    expect(maps.layers.original.samples).toHaveLength(6)
    expect(maps.layers.downscaled.samples).toHaveLength(20)
    const expected = queryTaskResult(task, {
      kind: 'grid',
      layer: 'original',
      window: task.configuration.region,
      times: [time],
      temporalResolution: 'hourly',
    })
    if (!expected.ok) throw new Error(expected.error)
    expect(maps.layers.original.samples).toEqual(expected.values)
    expect(maps.layers.original.provenance).toEqual(expected.provenance)
    expect(maps.layers.observation.reference?.referenceVersion).toBe('synthetic-observations-v1')
  })
  it('compares Original at the actual Downscaled locations, not unrelated grid indices', async () => {
    const task = exportTask()
    const maps = await readResultMapData(publicSource(task), task, {
      time,
      observationMode: 'interpolated',
    })
    expect(maps.layers.difference.status).toBe('ready')
    expect(maps.layers.difference.grid).toEqual(maps.layers.downscaled.grid)
    expect(maps.layers.difference.samples).toHaveLength(20)
    const target = maps.layers.downscaled.samples[6]!
    const original = queryTaskResult(task, {
      kind: 'points',
      layer: 'original',
      points: [{ longitude: target.longitude, latitude: target.latitude }],
      times: [time],
      temporalResolution: 'hourly',
    })
    if (!original.ok) throw new Error(original.error)
    expect(maps.layers.difference.samples[6]).toMatchObject({
      longitude: target.longitude,
      latitude: target.latitude,
      time,
      value: target.value! - original.values[0]!.value,
    })
    expect(maps.layers.difference.reason).toMatch(/bilinear.*Downscaled.*not.*improvement/i)
  })
})

it('keeps valid neighbors visible when a public preview contains missing wind components', async () => {
  const task = exportTask({
    variable: 'wind',
    region: { west: 19.9, east: 20.1, south: 65, north: 65.05 },
  })
  const maps = await readResultMapData(publicSource(task), task, {
    time: '2024-01-01T12:00:00.000Z',
    observationMode: 'interpolated',
  })
  const layer = maps.layers.downscaled
  expect(layer.status).toBe('ready')
  expect(layer.samples).toHaveLength(15)
  expect(layer.samples.filter((sample) => sample.value !== null)).toHaveLength(6)
  expect(layer.samples.filter((sample) => sample.value === null)).toHaveLength(9)
  expect(layer.samples.find((sample) => sample.value === null)).toMatchObject({
    time: '2024-01-01T12:00:00.000Z',
    value: null,
    unavailable: { code: 'MISSING_COMPONENT' },
  })
  expect(maps.layers.difference.samples.some((sample) => sample.value === null)).toBe(true)
})

it('does not relabel the known wind stddev mean-vector defect as an ensemble spread map', async () => {
  const task = exportTask({
    variable: 'wind',
    ensembleMembers: 5,
    region: { west: 120, east: 122, south: 30, north: 32 },
  })
  const maps = await readResultMapData(publicSource(task), task, {
    time: '2024-01-01T00:00:00.000Z',
    observationMode: 'stations',
    ensemble: { kind: 'stddev' },
  })
  expect(maps.layers.original.status).toBe('ready')
  expect(maps.layers.observation.status).toBe('ready')
  expect(maps.layers.downscaled.status).toBe('unavailable')
  expect(maps.layers.downscaled.reason).toMatch(/wind.*standard deviation.*mean.vector/i)
  expect(maps.layers.difference.status).toBe('unavailable')
})

it('preserves unavailable selected-member slots even when the public query succeeds with no values', async () => {
  const task = exportTask({
    variable: 'wind',
    ensembleMembers: 5,
    region: { west: 0, east: 0.12, south: 0, north: 0.08 },
  })
  const maps = await readResultMapData(publicSource(task), task, {
    time: '2024-01-01T06:00:00.000Z',
    observationMode: 'stations',
    ensemble: { kind: 'members', memberIds: ['member-05'] },
  })
  expect(maps.layers.downscaled.status).toBe('ready')
  expect(maps.layers.downscaled.samples).toHaveLength(24)
  expect(maps.layers.downscaled.samples.every((sample) => sample.value === null)).toBe(true)
  expect(maps.layers.downscaled.samples[0]).toMatchObject({
    longitude: 0,
    latitude: 0,
    time: '2024-01-01T06:00:00.000Z',
    memberId: 'member-05',
    value: null,
    unavailable: { code: 'MISSING_MEMBER' },
  })
  expect(maps.layers.difference.samples.every((sample) => sample.value === null)).toBe(true)
})

it('keeps actual station neighbors and public NO_OBSERVATION codes separate from valid zero', async () => {
  const task = exportTask({
    variable: 'wind',
    region: { west: 19, east: 20.1, south: 65, north: 65.05 },
  })
  const maps = await readResultMapData(publicSource(task), task, {
    time: '2024-01-01T12:00:00.000Z',
    observationMode: 'stations',
  })
  expect(maps.layers.observation.status).toBe('ready')
  expect(maps.layers.observation.samples).toHaveLength(2)
  expect(maps.layers.observation.samples[0]).toMatchObject({
    longitude: 19,
    latitude: 65,
    observation: { station: { id: 'synthetic-station-v1:19:65' } },
  })
  expect(maps.layers.observation.samples[1]).toMatchObject({
    longitude: 20,
    latitude: 65,
    value: null,
    unavailable: { code: 'NO_OBSERVATION' },
  })
})

it('leaves incomplete rainfall buckets unavailable for Difference even when their partial bounds match', async () => {
  const task = exportTask({
    variable: 'precipitation',
    timeRange: {
      mode: 'forecast',
      start: '2024-01-01T10:00:00.000Z',
      end: '2024-01-01T12:00:00.000Z',
    },
    region: { west: 0, east: 0.12, south: 0, north: 0.08 },
  })
  const maps = await readResultMapData(publicSource(task), task, {
    time: '2024-01-01T00:00:00.000Z',
    observationMode: 'interpolated',
    temporalResolution: 'daily',
  })
  expect(maps.layers.original.samples[0]?.accumulation).toMatchObject({
    sampledHours: 3,
    expectedHours: 24,
    complete: false,
  })
  expect(maps.layers.difference.status).toBe('unavailable')
  expect(maps.layers.difference.code).toBe('INCOMPLETE_INTERVAL')
})

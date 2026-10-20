import { beforeAll, expect, test } from 'vitest'
import { requestHandler } from '@tanstack/react-start/server'
import { loginDemoAccount } from '@/server/services/demo-session.server'
import {
  getDemoTaskCatalog,
  queryDownscalingTaskResult,
  restoreDownscalingTask,
} from '@/server/services/downscaling-tasks.server'
import type { DownscalingTask, ResultQuery } from '@/features/downscaling-tasks/service'
import { readResultMapData } from '@/features/result-analysis/service/result-map-data'
import { readResultMapPointQuery } from '@/features/result-analysis/service/result-map-point-query'
import { calculateResultMapPointImprovement } from '@/features/result-analysis/service/result-map-point-improvement'
import { resultMapDisplaySettings } from '@/features/result-analysis/service/result-map-display'

const time = '2024-01-01T00:00:00.000Z'
let cookie = ''
async function authenticated<T>(operation: () => T): Promise<T> {
  let result: T | undefined
  const response = await requestHandler(() => {
    result = operation()
    return Response.json(result)
  })(new Request('http://demo.test/tasks', { method: 'POST', headers: { cookie } }), {})
  if (response.headers.get('set-cookie'))
    cookie = response.headers.get('set-cookie')!.split(';')[0]!
  if (result === undefined) throw new Error(`No public reply: HTTP ${response.status}`)
  return result
}
beforeAll(async () => {
  await authenticated(() => loginDemoAccount({ account: 'researcher', password: 'meteo-demo' }))
})
async function catalogTask(id: string) {
  const catalog = await authenticated(getDemoTaskCatalog)
  const task = catalog.tasks.find((value) => value.catalog?.id === id)
  if (!task) throw new Error(`No public catalog task ${id}`)
  return task
}
function publicSource(task: DownscalingTask) {
  return {
    result: async (_id: string, query: ResultQuery) =>
      authenticated(() => queryDownscalingTaskResult({ task, query })),
  }
}

test('public 3/24-hour daily temperature retains actual metadata and is unavailable for map, point and detail comparisons', async () => {
  const { catalog: _catalog, ...backup } = await catalogTask('alpine-temperature')
  const restored = await authenticated(() =>
    restoreDownscalingTask({
      ...backup,
      id: 'review-partial-daily-temperature',
      configuration: {
        ...backup.configuration,
        timeRange: {
          mode: 'forecast',
          start: '2024-01-01T10:00:00.000Z',
          end: '2024-01-01T12:00:00.000Z',
        },
      },
    }),
  )
  if (!restored.ok) throw new Error(restored.error)
  const source = publicSource(restored.task)
  const selection = {
    time,
    observationMode: 'interpolated' as const,
    temporalResolution: 'daily' as const,
  }
  const maps = await readResultMapData(source, restored.task, selection)
  const point = await readResultMapPointQuery(source, restored.task, selection, {
    longitude: 11,
    latitude: 47,
  })
  expect(maps.layers.difference).toMatchObject({
    status: 'unavailable',
    code: 'INCOMPLETE_INTERVAL',
  })
  expect(point.values.difference).toMatchObject({
    status: 'unavailable',
    code: 'INCOMPLETE_INTERVAL',
  })
  expect(calculateResultMapPointImprovement(point)).toMatchObject({
    status: 'unavailable',
    code: 'INCOMPLETE_INTERVAL',
  })
  expect(maps.layers.original).toMatchObject({
    displayContext: {
      variable: 'temperature',
      quantity: 'T2M',
      unit: '°C',
      temporalStatistic: 'daily-mean',
    },
  })
  expect(
    maps.layers.original.samples.find(
      (sample) => sample.longitude === 10 && sample.latitude === 46,
    ),
  ).toMatchObject({
    value: 10.5391,
    daily: { sampledHours: 3, expectedHours: 24, completeDay: false },
  })
  expect(resultMapDisplaySettings(maps).original.rangeGroup).toContain('T2M:daily-mean:')
})

test('actual/requested interval disagreements have the same map/point/detail verdict and separate display domains', async () => {
  const task = await catalogTask('lowland-rain')
  const actual = publicSource(task)
  const source = {
    result: async (id: string, query: ResultQuery) => {
      const reply = await actual.result(id, query)
      return reply.ok && reply.variable === 'precipitation' && query.layer === 'downscaled'
        ? {
            ...reply,
            values: reply.values.map((sample) => ({
              ...sample,
              accumulation: { ...sample.accumulation, requestedStart: '2023-12-31T00:00:00.000Z' },
            })),
          }
        : reply
    },
  }
  const selection = { time, observationMode: 'stations' as const }
  const maps = await readResultMapData(source, task, selection)
  const point = await readResultMapPointQuery(source, task, selection, {
    longitude: 114,
    latitude: 30,
  })
  expect(maps.layers.difference).toMatchObject({ status: 'unavailable', code: 'INTERVAL_MISMATCH' })
  expect(point.values.difference).toMatchObject({
    status: 'unavailable',
    code: 'INTERVAL_MISMATCH',
  })
  expect(calculateResultMapPointImprovement(point)).toMatchObject({
    status: 'unavailable',
    code: 'INTERVAL_MISMATCH',
  })
  const display = resultMapDisplaySettings(maps)
  expect(display.original.rangeGroup).not.toBe(display.downscaled.rangeGroup)
})

test('the initial missing preview retains the valid public 3.237 mm native-grid sample and explicit gaps', async () => {
  const { catalog: _catalog, ...backup } = await catalogTask('lowland-rain')
  const restored = await authenticated(() =>
    restoreDownscalingTask({
      ...backup,
      id: 'review-rain-first-frame-gap',
      configuration: {
        ...backup.configuration,
        region: { west: 20, east: 26, south: 65, north: 71 },
      },
    }),
  )
  if (!restored.ok) throw new Error(restored.error)
  const source = publicSource(restored.task)
  const location = { longitude: 25.755229240145198, latitude: 70.65936040244341 }
  const native = await source.result(restored.task.id, {
    kind: 'points',
    layer: 'original',
    times: [time],
    points: [location],
  })
  expect(native).toMatchObject({
    ok: true,
    values: [
      {
        ...location,
        time,
        value: 3.237,
        accumulation: { sampledHours: 24, expectedHours: 24, complete: true },
      },
    ],
  })
  const maps = await readResultMapData(source, restored.task, {
    time,
    observationMode: 'interpolated',
  })
  expect(maps.layers.original).toMatchObject({
    status: 'ready',
    grid: { sampling: 'decimated-grid', returnedPoints: 240 },
  })
  expect(
    maps.layers.original.samples.find(
      (sample) => sample.longitude === location.longitude && sample.latitude === location.latitude,
    ),
  ).toMatchObject({
    time,
    value: 3.237,
    accumulation: { sampledHours: 24, expectedHours: 24, complete: true },
  })
  expect(
    maps.layers.original.samples.some(
      (sample) => sample.value === null && sample.unavailable?.code === 'MISSING_DATA',
    ),
  ).toBe(true)
  expect(maps.layers.original.samples.every((sample) => sample.time === time)).toBe(true)
  expect(maps.layers.observation).toMatchObject({
    status: 'ready',
    reference: { referenceSeed: 1729, referenceVersion: 'synthetic-observations-v1' },
  })
  expect(
    maps.layers.observation.samples.some((sample) => sample.observation?.mode === 'interpolated'),
  ).toBe(true)
  expect(maps.layers.difference.status).toBe('ready')
  expect(maps.layers.difference.samples.some((sample) => sample.value !== null)).toBe(true)
  expect(maps.layers.downscaled.ensemble).toMatchObject({
    kind: 'mean',
    memberIds: ['member-01', 'member-02', 'member-03', 'member-04', 'member-05'],
  })
})

import { beforeAll, describe, expect, it } from 'vitest'
import { requestHandler } from '@tanstack/react-start/server'
import { loginDemoAccount } from '@/server/services/demo-session.server'
import {
  getDemoTaskCatalog,
  queryDownscalingTaskResult,
  restoreDownscalingTask,
} from '@/server/services/downscaling-tasks.server'
import type { ResultQuery } from '@/features/downscaling-tasks/service'
import { readResultMapPointQuery } from '@/features/result-analysis/service/result-map-point-query'

const time = '2024-01-01T00:00:00.000Z'
let cookie = ''

async function authenticated<T>(operation: () => T): Promise<T> {
  let result: T | undefined
  await requestHandler(() => {
    result = operation()
    return Response.json(result)
  })(new Request('http://demo.test/tasks', { method: 'POST', headers: { cookie } }), {})
  if (result === undefined) throw new Error('Authenticated operation did not return a reply')
  return result
}

beforeAll(async () => {
  const response = await requestHandler(() =>
    Response.json(loginDemoAccount({ account: 'researcher', password: 'meteo-demo' })),
  )(new Request('http://demo.test/login', { method: 'POST' }), {})
  cookie = response.headers.get('set-cookie')?.split(';')[0] ?? ''
})

async function catalogCase(id: string) {
  const catalog = await authenticated(getDemoTaskCatalog)
  const task = catalog.tasks.find((candidate) => candidate.catalog?.id === id)
  if (!task) throw new Error(`Missing canonical demo ${id}`)
  return task
}

function publicSource(task: Awaited<ReturnType<typeof catalogCase>>) {
  return {
    result: async (_id: string, query: ResultQuery) =>
      authenticated(() => queryDownscalingTaskResult({ task, query })),
  }
}

describe('public joint result point query', () => {
  it('reads the literal alpine edge point and retains units, station support and Difference direction', async () => {
    const task = await catalogCase('alpine-temperature')
    const result = await readResultMapPointQuery(
      publicSource(task),
      task,
      { time, observationMode: 'stations' },
      { longitude: 10, latitude: 48 },
    )
    expect(result.point).toEqual({ longitude: 10, latitude: 48 })
    expect(result.values.original).toMatchObject({
      status: 'available',
      sample: { value: 16.2787, longitude: 10, latitude: 48, time },
      metadata: { unit: '°C', quantity: 'T2M', temporalStatistic: 'instantaneous' },
    })
    expect(result.values.downscaled).toMatchObject({
      status: 'available',
      sample: { value: 14.8358 },
    })
    expect(result.values.observation).toMatchObject({
      status: 'available',
      sample: {
        value: 0.8,
        observation: { mode: 'stations', station: { longitude: 10, latitude: 48 }, distanceKm: 0 },
      },
      metadata: { reference: { kind: 'synthetic-stations', referenceSeed: 1729 } },
    })
    const difference = result.values.difference
    expect(difference.status).toBe('available')
    if (difference.status !== 'available') throw new Error(difference.reason)
    expect(difference.sample.value).toBeCloseTo(-1.4429, 10)
    expect(difference.reason).toMatch(/Downscaled.*Original.*not.*improvement/i)
  })
})

it('retains all four valid hourly rainfall zeroes rather than treating them as missing', async () => {
  const task = await catalogCase('lowland-rain')
  const result = await readResultMapPointQuery(
    publicSource(task),
    task,
    { time, observationMode: 'stations', temporalResolution: 'hourly' },
    { longitude: 114, latitude: 30 },
  )
  for (const value of Object.values(result.values)) {
    expect(value).toMatchObject({
      status: 'available',
      sample: { value: 0 },
      metadata: { unit: 'mm' },
    })
  }
  expect(result.values.downscaled).toMatchObject({
    sample: {
      accumulation: {
        start: time,
        end: '2024-01-01T01:00:00.000Z',
        requestedStart: time,
        requestedEnd: '2024-01-01T01:00:00.000Z',
        sampledHours: 1,
        expectedHours: 1,
        complete: true,
      },
    },
  })
})

it('reports a missing selected member even when the public wind reply has an empty successful values list', async () => {
  const task = await catalogCase('coastal-wind')
  const result = await readResultMapPointQuery(
    publicSource(task),
    task,
    {
      time: '2024-01-01T06:00:00.000Z',
      observationMode: 'stations',
      temporalResolution: 'hourly',
      ensemble: { kind: 'members', memberIds: ['member-05'] },
    },
    { longitude: 121, latitude: 31 },
  )
  expect(result.values.original.status).toBe('available')
  expect(result.values.observation.status).toBe('available')
  expect(result.values.downscaled).toMatchObject({
    status: 'unavailable',
    code: 'MISSING_MEMBER',
    reason: expect.stringMatching(/member/i),
  })
  expect(result.values.difference.status).toBe('unavailable')
})

it('keeps an observation transport failure separate from valid model values and their Difference', async () => {
  const task = await catalogCase('alpine-temperature')
  const actual = publicSource(task)
  const result = await readResultMapPointQuery(
    {
      result: (id, query) =>
        query.layer === 'observation'
          ? Promise.reject(new Error('Observation HTTP 503'))
          : actual.result(id, query),
    },
    task,
    { time, observationMode: 'stations' },
    { longitude: 10, latitude: 48 },
  )
  expect(result.values.observation).toMatchObject({
    status: 'error',
    reason: 'Observation HTTP 503',
  })
  expect(result.values.original).toMatchObject({ status: 'available', sample: { value: 16.2787 } })
  expect(result.values.downscaled).toMatchObject({
    status: 'available',
    sample: { value: 14.8358 },
  })
  expect(result.values.difference.status).toBe('available')
})

it('withholds ordinary Difference for a Standard Deviation view and never relabels wind mean-vector speed as spread', async () => {
  const task = await catalogCase('coastal-wind')
  const result = await readResultMapPointQuery(
    publicSource(task),
    task,
    { time, observationMode: 'stations', ensemble: { kind: 'stddev' } },
    { longitude: 121, latitude: 31 },
  )
  expect(result.values.original).toMatchObject({ status: 'available', sample: { value: 17.8191 } })
  expect(result.values.observation).toMatchObject({
    status: 'available',
    sample: { value: 0, fromDirection: null },
  })
  expect(result.values.downscaled).toMatchObject({
    status: 'unavailable',
    code: 'UNAVAILABLE_WIND_SPREAD',
    reason: expect.stringMatching(/mean.vector/i),
  })
  expect(result.values.difference).toMatchObject({
    status: 'unavailable',
    code: 'INCOMPATIBLE_STATISTIC',
    reason: expect.stringMatching(/spread.*not.*prediction/i),
  })
})

it('rejects nonfinite and geographically invalid coordinates through the joint query, without clamping', async () => {
  const task = await catalogCase('alpine-temperature')
  for (const point of [
    { longitude: Number.NaN, latitude: 47 },
    { longitude: 11, latitude: Number.POSITIVE_INFINITY },
    { longitude: 181, latitude: 47 },
    { longitude: 11, latitude: -91 },
  ]) {
    const result = await readResultMapPointQuery(
      publicSource(task),
      task,
      { time, observationMode: 'stations' },
      point,
    )
    for (const value of Object.values(result.values))
      expect(value).toMatchObject({
        status: 'unavailable',
        code: 'INVALID_POINT',
        reason: expect.stringMatching(/finite.*longitude.*latitude/i),
      })
  }
})

it('rejects a reply for the wrong task rather than displaying another scientific context', async () => {
  const task = await catalogCase('alpine-temperature')
  const actual = publicSource(task)
  const result = await readResultMapPointQuery(
    {
      result: async (id, query) => {
        const reply = await actual.result(id, query)
        return reply.ok ? { ...reply, taskId: 'another-task' } : reply
      },
    },
    task,
    { time, observationMode: 'stations' },
    { longitude: 10, latitude: 48 },
  )
  expect(result.values.original).toMatchObject({ status: 'error', code: 'RESULT_CONTEXT_MISMATCH' })
  expect(result.values.downscaled.status).toBe('error')
  expect(result.values.difference.status).not.toBe('available')
})

it('preserves partial daily rainfall coverage but refuses to subtract it as a complete forecast interval', async () => {
  const catalog = await catalogCase('lowland-rain')
  const { catalog: _catalog, ...backup } = catalog
  const restored = await authenticated(() =>
    restoreDownscalingTask({
      ...backup,
      id: 'partial-day-rain-backup',
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
  const result = await readResultMapPointQuery(
    publicSource(restored.task),
    restored.task,
    { time, observationMode: 'interpolated', temporalResolution: 'daily' },
    { longitude: 114, latitude: 30 },
  )
  expect(result.values.original).toMatchObject({
    status: 'available',
    sample: {
      accumulation: {
        start: '2024-01-01T10:00:00.000Z',
        end: '2024-01-01T13:00:00.000Z',
        requestedStart: time,
        requestedEnd: '2024-01-02T00:00:00.000Z',
        sampledHours: 3,
        expectedHours: 24,
        complete: false,
      },
    },
  })
  expect(result.values.difference).toMatchObject({
    status: 'unavailable',
    code: 'INCOMPLETE_INTERVAL',
  })
})

it('rejects unequal requested accumulation bounds even when finite scalar values and actual intervals match', async () => {
  const task = await catalogCase('lowland-rain')
  const actual = publicSource(task)
  const result = await readResultMapPointQuery(
    {
      result: async (id, query) => {
        const reply = await actual.result(id, query)
        return reply.ok && reply.variable === 'precipitation' && query.layer === 'downscaled'
          ? {
              ...reply,
              values: reply.values.map((value) => ({
                ...value,
                accumulation: {
                  ...value.accumulation,
                  requestedEnd: '2024-01-03T00:00:00.000Z',
                },
              })),
            }
          : reply
      },
    },
    task,
    { time, observationMode: 'stations' },
    { longitude: 114, latitude: 30 },
  )
  expect(result.values.original.status).toBe('available')
  expect(result.values.downscaled.status).toBe('available')
  expect(result.values.difference).toMatchObject({
    status: 'unavailable',
    code: 'INTERVAL_MISMATCH',
  })
})

it('compares only matching scalar quantities and temporal statistics, not merely equal units', async () => {
  const task = await catalogCase('alpine-temperature')
  const actual = publicSource(task)
  const result = await readResultMapPointQuery(
    {
      result: async (id, query) => {
        const reply = await actual.result(id, query)
        return reply.ok && reply.variable === 'temperature' && query.layer === 'downscaled'
          ? {
              ...reply,
              temporalStatistic: 'daily-mean' as const,
              values: reply.values.map((value) => ({
                ...value,
                daily: {
                  start: time,
                  end: '2024-01-02T00:00:00.000Z',
                  bounds: '[start,end)' as const,
                  sampledHours: 24,
                  expectedHours: 24,
                  mean: value.value,
                  minimum: value.value,
                  completeDay: true,
                },
              })),
            }
          : reply
      },
    },
    task,
    { time, observationMode: 'stations' },
    { longitude: 10, latitude: 48 },
  )
  expect(result.values.difference).toMatchObject({
    status: 'unavailable',
    code: 'INCOMPATIBLE_STATISTIC',
  })
})

it('keeps the actual outside-coverage reason for all four values, with inclusive region edges', async () => {
  const task = await catalogCase('alpine-temperature')
  const result = await readResultMapPointQuery(
    publicSource(task),
    task,
    { time, observationMode: 'stations' },
    { longitude: 12.01, latitude: 47 },
  )
  for (const value of Object.values(result.values))
    expect(value).toMatchObject({ status: 'unavailable', code: 'OUTSIDE_COVERAGE' })
})

it('preserves incomplete daily temperature diagnostics without calling their difference a full-day mean comparison', async () => {
  const catalog = await catalogCase('alpine-temperature')
  const { catalog: _catalog, ...backup } = catalog
  const restored = await authenticated(() =>
    restoreDownscalingTask({
      ...backup,
      id: 'partial-day-temperature-backup',
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
  const result = await readResultMapPointQuery(
    publicSource(restored.task),
    restored.task,
    { time, observationMode: 'interpolated', temporalResolution: 'daily' },
    { longitude: 11, latitude: 47 },
  )
  expect(result.values.original).toMatchObject({
    status: 'available',
    metadata: { temporalStatistic: 'daily-mean' },
    sample: {
      daily: {
        start: time,
        end: '2024-01-02T00:00:00.000Z',
        sampledHours: 3,
        expectedHours: 24,
        completeDay: false,
      },
    },
  })
  expect(result.values.difference).toMatchObject({
    status: 'unavailable',
    code: 'INCOMPLETE_INTERVAL',
  })
})

it('retains no-observation and missing-ensemble codes without hiding valid model or reference zeroes', async () => {
  const task = await catalogCase('alpine-temperature')
  const noObservation = await readResultMapPointQuery(
    publicSource(task),
    task,
    { time, observationMode: 'stations' },
    { longitude: 11.5, latitude: 47.5 },
  )
  expect(noObservation.values.observation).toMatchObject({
    status: 'unavailable',
    code: 'NO_OBSERVATION',
  })
  expect(noObservation.values.original).toMatchObject({
    status: 'available',
    sample: { value: 16.5027 },
  })
  expect(noObservation.values.downscaled).toMatchObject({
    status: 'available',
    sample: { value: 15.7693 },
  })
  const difference = noObservation.values.difference
  expect(difference.status).toBe('available')
  if (difference.status === 'available') expect(difference.sample.value).toBeCloseTo(-0.7334, 10)
  const rain = await catalogCase('lowland-rain')
  const missing = await readResultMapPointQuery(
    publicSource(rain),
    rain,
    { time, observationMode: 'stations', ensemble: { kind: 'mean', memberIds: ['member-05'] } },
    { longitude: 114, latitude: 30 },
  )
  expect(missing.values.downscaled).toMatchObject({
    status: 'unavailable',
    code: 'MISSING_ENSEMBLE',
  })
  expect(missing.values.difference.status).toBe('unavailable')
  expect(missing.values.observation).toMatchObject({ status: 'available', sample: { value: 0 } })
})

it('treats a nonfinite public point sample as scientific missing, not a displayed number or zero', async () => {
  const task = await catalogCase('alpine-temperature')
  const actual = publicSource(task)
  const result = await readResultMapPointQuery(
    {
      result: async (id, query) => {
        const reply = await actual.result(id, query)
        return reply.ok &&
          reply.variable === 'temperature' &&
          reply.temporalStatistic === 'instantaneous' &&
          query.layer === 'downscaled'
          ? { ...reply, values: reply.values.map((value) => ({ ...value, value: Number.NaN })) }
          : reply
      },
    },
    task,
    { time, observationMode: 'stations' },
    { longitude: 10, latitude: 48 },
  )
  expect(result.values.downscaled).toMatchObject({ status: 'unavailable', code: 'MISSING_DATA' })
  expect(result.values.difference.status).toBe('unavailable')
})

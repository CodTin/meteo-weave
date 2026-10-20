import { beforeAll, describe, expect, it } from 'vitest'
import { requestHandler } from '@tanstack/react-start/server'
import { loginDemoAccount } from '@/server/services/demo-session.server'
import {
  getDemoTaskCatalog,
  queryDownscalingTaskResult,
} from '@/server/services/downscaling-tasks.server'
import type { DownscalingTask, ResultQuery } from '@/features/downscaling-tasks/service'
import type { ResultMapSelection } from '@/features/result-analysis/service/result-map-data'
import { readResultMapPointQuery } from '@/features/result-analysis/service/result-map-point-query'
import { calculateResultMapPointImprovement } from '@/features/result-analysis/service/result-map-point-improvement'

const time = '2024-01-01T00:00:00.000Z'
let cookie = ''
let tasks: DownscalingTask[] = []

async function authenticated<T>(operation: () => T): Promise<T> {
  let value: T | undefined
  const response = await requestHandler(() => {
    value = operation()
    return Response.json(value)
  })(new Request('http://demo.test/tasks', { method: 'POST', headers: { cookie } }), {})
  if (response.status !== 200 || value === undefined)
    throw new Error('Authenticated task operation failed')
  return value
}

beforeAll(async () => {
  const login = await requestHandler(() =>
    Response.json(loginDemoAccount({ account: 'researcher', password: 'meteo-demo' })),
  )(new Request('http://demo.test/login', { method: 'POST' }), {})
  cookie = login.headers.get('set-cookie')?.split(';')[0] ?? ''
  tasks = (await authenticated(getDemoTaskCatalog)).tasks
})

async function pointResult(
  caseId: string,
  longitude: number,
  latitude: number,
  selection: ResultMapSelection = { time, observationMode: 'stations' },
) {
  const task = tasks.find((candidate) => candidate.catalog?.id === caseId)
  if (!task) throw new Error(`Missing canonical demo ${caseId}`)
  const source = {
    result: async (_id: string, query: ResultQuery) =>
      authenticated(() => queryDownscalingTaskResult({ task, query })),
  }
  return readResultMapPointQuery(source, task, selection, { longitude, latitude })
}

describe('public pinned-point reference-error calculation', () => {
  it('reports the literal positive alpine improvement as an unrounded fraction, not field Difference', async () => {
    const result = await pointResult('alpine-temperature', 10, 48)
    const improvement = calculateResultMapPointImprovement(result)
    expect(improvement).toMatchObject({
      status: 'available',
      unit: '°C',
      referenceType: 'colocated-synthetic-station',
    })
    if (improvement.status !== 'available') throw new Error(improvement.reason)
    expect(improvement.originalAbsoluteError).toBeCloseTo(15.4787, 10)
    expect(improvement.downscaledAbsoluteError).toBeCloseTo(14.0358, 10)
    expect(improvement.fraction).toBeCloseTo(0.09321842273575945, 14)
  })
})

it('keeps legal hourly rain zeroes and explains a zero original absolute error instead of dividing by zero', async () => {
  const result = await pointResult('lowland-rain', 114, 30, {
    time,
    observationMode: 'stations',
    temporalResolution: 'hourly',
  })
  for (const value of Object.values(result.values))
    expect(value).toMatchObject({
      status: 'available',
      sample: { value: 0 },
      metadata: { unit: 'mm' },
    })
  expect(calculateResultMapPointImprovement(result)).toMatchObject({
    status: 'unavailable',
    code: 'ZERO_ORIGINAL_ERROR',
    reason: expect.stringMatching(/original absolute error.*zero.*not missing/i),
  })
})

it.each([
  ['alpine-temperature', 11, 47, -0.03157816637749978, '°C'],
  ['plateau-pressure', 90, 32, 0, 'hPa'],
  ['lowland-rain', 114, 30, 0, 'mm'],
] as const)(
  'retains the independent literal fraction for %s at %s,%s',
  async (caseId, longitude, latitude, fraction, unit) => {
    const improvement = calculateResultMapPointImprovement(
      await pointResult(caseId, longitude, latitude),
    )
    expect(improvement).toMatchObject({ status: 'available', unit })
    if (improvement.status !== 'available') throw new Error(improvement.reason)
    expect(improvement.fraction).toBeCloseTo(fraction, 14)
  },
)

it('uses a valid zero reference in complete hourly rainfall to report positive error reduction', async () => {
  const result = await pointResult('lowland-rain', 114, 30, {
    time: '2024-01-01T04:00:00.000Z',
    observationMode: 'stations',
    temporalResolution: 'hourly',
  })
  expect(result.values.observation).toMatchObject({ status: 'available', sample: { value: 0 } })
  const improvement = calculateResultMapPointImprovement(result)
  expect(improvement).toMatchObject({ status: 'available', unit: 'mm' })
  if (improvement.status !== 'available') throw new Error(improvement.reason)
  expect(improvement.originalAbsoluteError).toBeCloseTo(1.5284, 10)
  expect(improvement.downscaledAbsoluteError).toBeCloseTo(0.4585, 10)
  expect(improvement.fraction).toBeCloseTo(0.7000130855796912, 14)
})

it('rejects a nearest station despite the public echoed point, retaining its actual support and distance', async () => {
  const result = await pointResult('alpine-temperature', 11.1, 47)
  expect(result.values.observation).toMatchObject({
    status: 'available',
    sample: {
      longitude: 11.1,
      latitude: 47,
      observation: {
        mode: 'stations',
        station: { longitude: 11, latitude: 47 },
        distanceKm: 7.583485721794525,
      },
    },
  })
  expect(calculateResultMapPointImprovement(result)).toMatchObject({
    status: 'unavailable',
    code: 'NONCOLOCATED_REFERENCE',
    reason: expect.stringMatching(/11.*47.*7\.583.*not colocated/i),
  })
})

it('explicitly distinguishes evaluated interpolated-reference improvement from measured station validation', async () => {
  const result = await pointResult('alpine-temperature', 11.5, 47.5, {
    time,
    observationMode: 'interpolated',
  })
  expect(result.values.observation).toMatchObject({
    status: 'available',
    sample: { value: 0, observation: { mode: 'interpolated', stations: expect.any(Array) } },
  })
  const improvement = calculateResultMapPointImprovement(result)
  expect(improvement).toMatchObject({
    status: 'available',
    referenceType: 'interpolated-synthetic-reference',
    unit: '°C',
  })
  if (improvement.status !== 'available') throw new Error(improvement.reason)
  expect(improvement.fraction).toBeCloseTo(0.044441212650051284, 14)
})

it('rejects incomplete actual and requested rainfall intervals even if all three inputs are finite', async () => {
  const task = tasks.find((candidate) => candidate.catalog?.id === 'lowland-rain')
  if (!task) throw new Error('Missing rainfall demo')
  const partial = {
    ...task,
    id: 'partial-pinned-rain',
    catalog: undefined,
    configuration: {
      ...task.configuration,
      timeRange: {
        mode: 'forecast' as const,
        start: '2024-01-01T10:00:00Z',
        end: '2024-01-01T12:00:00Z',
      },
    },
  }
  const { restoreDownscalingTask } = await import('@/server/services/downscaling-tasks.server')
  const restored = await authenticated(() => restoreDownscalingTask(partial))
  if (!restored.ok) throw new Error(restored.error)
  const source = {
    result: async (_id: string, query: ResultQuery) =>
      authenticated(() => queryDownscalingTaskResult({ task: restored.task, query })),
  }
  const result = await readResultMapPointQuery(
    source,
    restored.task,
    {
      time,
      temporalResolution: 'daily',
      observationMode: 'interpolated',
    },
    { longitude: 114, latitude: 30 },
  )
  expect(result.values.original).toMatchObject({
    status: 'available',
    sample: { accumulation: { sampledHours: 3, expectedHours: 24, complete: false } },
  })
  expect(calculateResultMapPointImprovement(result)).toMatchObject({
    status: 'unavailable',
    code: 'INCOMPLETE_INTERVAL',
    reason: expect.stringMatching(/complete.*interval/i),
  })
})

it('rejects quantity/unit/statistic incompatibility instead of presenting a percentage', async () => {
  const result = await pointResult('alpine-temperature', 10, 48)
  const pressure = await pointResult('plateau-pressure', 90, 32)
  expect(
    calculateResultMapPointImprovement({
      ...result,
      values: { ...result.values, observation: pressure.values.observation },
    }),
  ).toMatchObject({
    status: 'unavailable',
    code: 'INCOMPATIBLE_STATISTIC',
    reason: expect.stringMatching(/quantity.*unit.*statistic/i),
  })
})

it('does not treat Standard Deviation as a prediction with a reference error', async () => {
  const result = await pointResult('lowland-rain', 114, 30, {
    time,
    observationMode: 'stations',
    ensemble: { kind: 'stddev' },
  })
  expect(calculateResultMapPointImprovement(result)).toMatchObject({
    status: 'unavailable',
    code: 'INCOMPATIBLE_STATISTIC',
    reason: expect.stringMatching(/spread.*not a prediction/i),
  })
})

it('rejects nonfinite samples at the public detail boundary even if marked available', async () => {
  const result = await pointResult('alpine-temperature', 10, 48)
  const observation = result.values.observation
  if (observation.status !== 'available') throw new Error(observation.reason)
  expect(
    calculateResultMapPointImprovement({
      ...result,
      values: {
        ...result.values,
        observation: { ...observation, sample: { ...observation.sample, value: Number.NaN } },
      },
    }),
  ).toMatchObject({
    status: 'unavailable',
    code: 'NONFINITE_INPUT',
    reason: expect.stringMatching(/finite/i),
  })
})

it('requires the same full UTC instant, not just finite values with matching units', async () => {
  const result = await pointResult('alpine-temperature', 10, 48)
  const observation = result.values.observation
  if (observation.status !== 'available') throw new Error(observation.reason)
  expect(
    calculateResultMapPointImprovement({
      ...result,
      values: {
        ...result.values,
        observation: {
          ...observation,
          sample: { ...observation.sample, time: '2024-01-02T00:00:00.000Z' },
        },
      },
    }),
  ).toMatchObject({
    status: 'unavailable',
    code: 'RESULT_CONTEXT_MISMATCH',
    reason: expect.stringMatching(/point.*task.*time/i),
  })
})

it('requires identical actual and requested accumulation bounds and complete hour counts', async () => {
  const result = await pointResult('lowland-rain', 114, 30)
  const observation = result.values.observation
  if (observation.status !== 'available' || !observation.sample.accumulation)
    throw new Error('Expected complete rain reference')
  const mismatched = {
    ...observation,
    sample: {
      ...observation.sample,
      accumulation: {
        ...observation.sample.accumulation,
        requestedEnd: '2024-01-03T00:00:00.000Z',
      },
    },
  }
  expect(
    calculateResultMapPointImprovement({
      ...result,
      values: { ...result.values, observation: mismatched },
    }),
  ).toMatchObject({
    status: 'unavailable',
    code: 'INTERVAL_MISMATCH',
    reason: expect.stringMatching(/actual.*requested.*bounds/i),
  })
})

it('requires actual reference support instead of inferring a colocated station from the value alone', async () => {
  const result = await pointResult('alpine-temperature', 10, 48)
  const observation = result.values.observation
  if (observation.status !== 'available') throw new Error(observation.reason)
  expect(
    calculateResultMapPointImprovement({
      ...result,
      values: {
        ...result.values,
        observation: { ...observation, sample: { ...observation.sample, observation: undefined } },
      },
    }),
  ).toMatchObject({
    status: 'unavailable',
    code: 'INVALID_REFERENCE',
    reason: expect.stringMatching(/reference.*support/i),
  })
})

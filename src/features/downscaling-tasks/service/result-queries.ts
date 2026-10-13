import { z } from 'zod'
import {
  GENERATOR_VERSION,
  RESULT_QUERY_LIMITS,
  unavailable,
  type DownscalingTask,
  type ResultReply,
} from './contracts'
import { temperatureAt } from './temperature-field'

const querySchema = z
  .strictObject({
    kind: z.literal('points'),
    layer: z.enum(['original', 'downscaled']),
    points: z
      .array(z.strictObject({ longitude: z.number(), latitude: z.number() }))
      .min(1)
      .max(RESULT_QUERY_LIMITS.points),
    times: z
      .array(z.iso.datetime({ offset: true }))
      .min(1)
      .max(RESULT_QUERY_LIMITS.times),
  })
  .refine((value) => value.points.length * value.times.length <= RESULT_QUERY_LIMITS.values)

export function resultAvailability(
  task: Pick<DownscalingTask, 'generatorVersion' | 'configuration'>,
) {
  if (task.generatorVersion !== GENERATOR_VERSION) {
    return unavailable(
      'INCOMPATIBLE_GENERATOR',
      'The saved generator version is unavailable; it will not be replaced.',
    )
  }
  if (
    task.configuration.variable !== 'temperature' ||
    task.configuration.resolvedMethod !== 'deterministic'
  ) {
    return unavailable(
      'UNAVAILABLE_COMBINATION',
      'Only deterministic Synthetic Demo temperature is implemented.',
    )
  }
  return null
}

export function queryTemperatureResult(task: DownscalingTask, input: unknown): ResultReply {
  const unavailableResult = resultAvailability(task)
  if (unavailableResult) return unavailableResult
  const parsed = querySchema.safeParse(input)
  if (!parsed.success)
    return unavailable(
      'UNAVAILABLE_QUERY',
      'Use original/downscaled point queries: at most 64 points, 168 times and 256 values.',
    )
  const query = parsed.data
  const { region, timeRange } = task.configuration
  const start = Date.parse(timeRange.start)
  const end = Date.parse(timeRange.end)
  const step = timeRange.mode === 'historical' ? 86_400_000 : 3_600_000
  if (
    query.points.some(
      (point) =>
        point.longitude < region.west ||
        point.longitude > region.east ||
        point.latitude < region.south ||
        point.latitude > region.north,
    ) ||
    query.times.some(
      (time) =>
        Date.parse(time) < start ||
        Date.parse(time) > end ||
        (Date.parse(time) - start) % step !== 0,
    )
  ) {
    return unavailable(
      'OUTSIDE_COVERAGE',
      'Points and times must be on the task coverage; values are not extrapolated.',
    )
  }
  const values = query.times.flatMap((rawTime) => {
    const time = new Date(rawTime).toISOString()
    return query.points.map((point) => ({
      ...point,
      time,
      value: temperatureAt(task, query.layer, point.longitude, point.latitude, time),
    }))
  })
  if (values.some((value) => !Number.isFinite(value.value))) {
    return unavailable(
      'GENERATION_FAILED',
      'The synthetic temperature field could not be reconstructed.',
    )
  }
  return {
    ok: true,
    taskId: task.id,
    layer: query.layer,
    unit: '°C',
    displayTimezone: 'UTC',
    temporalStatistic: 'instantaneous',
    provenance: {
      label: 'Synthetic Demo',
      description:
        'Synthetic temperature, not actual ECMWF/GFS output or model inference. Historical values are daily UTC snapshots, not daily means or minima.',
    },
    grid: {
      nominalSpacingKm:
        query.layer === 'original' ? 10 : Number.parseInt(task.configuration.resolution),
      sampling: 'requested-points',
      interpolation: 'bilinear',
      crs: 'EPSG:4326',
    },
    values,
  }
}

/** A bounded reconstruction probe, using the same evaluation as all result queries. */
export function probeTaskResult(task: DownscalingTask) {
  const { region, timeRange } = task.configuration
  for (const layer of ['original', 'downscaled'] as const) {
    const result = queryTemperatureResult(task, {
      kind: 'points',
      layer,
      points: [{ longitude: region.west, latitude: region.south }],
      times: [new Date(timeRange.start).toISOString()],
    })
    if (!result.ok) return result
  }
  return null
}

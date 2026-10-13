import { z } from 'zod'
import {
  GENERATOR_VERSION,
  RESULT_QUERY_LIMITS,
  unavailable,
  type DownscalingTask,
  type ResultReply,
  type ResultPoint,
  type ResultQuery,
  type WindowSampling,
} from './contracts'
import { temperatureAt } from './temperature-field'
import { windowPoints } from './result-grid'

const pointSchema = z.strictObject({ longitude: z.number(), latitude: z.number() })
const instantSchema = z.iso.datetime({ offset: true })
const layerSchema = z.enum(['original', 'downscaled'])
const windowSchema = z
  .strictObject({
    west: z.number().min(-180).max(180),
    east: z.number().min(-180).max(180),
    south: z.number().min(-90).max(90),
    north: z.number().min(-90).max(90),
  })
  .refine((value) => value.west <= value.east && value.south <= value.north)
const timesSchema = z.array(instantSchema).min(1).max(RESULT_QUERY_LIMITS.times)
const querySchema = z.discriminatedUnion('kind', [
  z
    .strictObject({
      kind: z.literal('points'),
      layer: layerSchema,
      points: z.array(pointSchema).min(1).max(RESULT_QUERY_LIMITS.points),
      times: timesSchema,
    })
    .refine((value) => value.points.length * value.times.length <= RESULT_QUERY_LIMITS.values),
  z.strictObject({
    kind: z.literal('time-series'),
    layer: layerSchema,
    point: pointSchema,
    timeRange: z
      .strictObject({ start: instantSchema, end: instantSchema })
      .refine((value) => Date.parse(value.start) <= Date.parse(value.end)),
  }),
  z.strictObject({
    kind: z.enum(['grid', 'export']),
    layer: layerSchema,
    window: windowSchema,
    times: timesSchema,
  }),
  z.strictObject({
    kind: z.literal('preview'),
    layer: layerSchema,
    window: windowSchema,
    times: timesSchema,
    maxPoints: z.number().int().min(1).max(RESULT_QUERY_LIMITS.gridPoints),
  }),
])

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
      'Use points, time-series, grid, preview or export: at most 64 requested points, 256 grid points, 168 times and 256 total values.',
    )
  const requested = parsed.data
  const { region, timeRange } = task.configuration
  const start = Date.parse(timeRange.start)
  const end = Date.parse(timeRange.end)
  const step = timeRange.mode === 'historical' ? 86_400_000 : 3_600_000
  let sampling: { sampling: 'requested-points' } | WindowSampling = { sampling: 'requested-points' }
  let query: { layer: ResultQuery['layer']; points: ResultPoint[]; times: string[] }
  if (requested.kind === 'time-series') {
    const first = Date.parse(requested.timeRange.start)
    const last = Date.parse(requested.timeRange.end)
    if (first < start || last > end || (first - start) % step || (last - start) % step) {
      return unavailable(
        'OUTSIDE_COVERAGE',
        'Times must be on the task coverage; missing times are not filled.',
      )
    }
    const count = (last - first) / step + 1
    if (count > RESULT_QUERY_LIMITS.times) {
      return unavailable('QUERY_LIMIT_EXCEEDED', 'Request a time slice of at most 168 instants.')
    }
    query = {
      layer: requested.layer,
      points: [requested.point],
      times: Array.from({ length: count }, (_, index) =>
        new Date(first + index * step).toISOString(),
      ),
    }
  } else if (requested.kind === 'points') {
    query = requested
  } else {
    const window = requested.window
    if (
      window.west < region.west ||
      window.east > region.east ||
      window.south < region.south ||
      window.north > region.north
    ) {
      return unavailable(
        'OUTSIDE_COVERAGE',
        'The entire window must be inside task coverage; it is not silently clipped.',
      )
    }
    const result = windowPoints(
      task,
      requested.layer,
      window,
      requested.times.length,
      requested.kind === 'preview' ? requested.maxPoints : undefined,
    )
    if ('ok' in result) return result
    sampling = result.grid
    query = { layer: requested.layer, points: result.points, times: requested.times }
  }
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
      ...sampling,
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

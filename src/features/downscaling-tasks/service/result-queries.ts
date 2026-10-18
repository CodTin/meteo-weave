import { z } from 'zod'
import {
  GENERATOR_VERSION,
  VARIABLE_GENERATOR_VERSION,
  ENSEMBLE_GENERATOR_VERSION,
  RESULT_QUERY_LIMITS,
  unavailable,
  type DownscalingTask,
  type ResultReply,
  type ResultPoint,
  type ResultQuery,
  type WindowSampling,
  type ResultMetadata,
} from './contracts'
import { selectEnsemble, queryEnsemble } from './ensemble-results'
import { temperatureDay } from './temperature-aggregation'
import { temperatureAt } from './temperature-field'
import { windAt, pressureAt, precipitationAt } from './variable-fields'
import { stationWindow } from './observation-reference'
import { queryObservations } from './observation-queries'
import { windowPoints } from './result-grid'

const pointSchema = z.strictObject({ longitude: z.number(), latitude: z.number() })
const instantSchema = z.iso.datetime({ offset: true })
const layerSchema = z.enum(['original', 'downscaled', 'observation'])
const windowSchema = z
  .strictObject({
    west: z.number().min(-180).max(180),
    east: z.number().min(-180).max(180),
    south: z.number().min(-90).max(90),
    north: z.number().min(-90).max(90),
  })
  .refine((value) => value.west <= value.east && value.south <= value.north)
const timesSchema = z.array(instantSchema).min(1).max(RESULT_QUERY_LIMITS.times)
const ensembleSchema = z
  .strictObject({
    kind: z.enum(['members', 'mean', 'stddev']),
    memberIds: z
      .array(z.string().min(1).max(64))
      .min(1)
      .max(RESULT_QUERY_LIMITS.members)
      .optional(),
  })
  .refine(
    (selection) =>
      !selection.memberIds || new Set(selection.memberIds).size === selection.memberIds.length,
  )
const querySchema = z.discriminatedUnion('kind', [
  z
    .strictObject({
      kind: z.literal('points'),
      layer: layerSchema,
      ensemble: ensembleSchema.optional(),
      observationMode: z.enum(['stations', 'interpolated']).optional(),
      temporalResolution: z.enum(['hourly', 'daily']).optional(),
      points: z.array(pointSchema).min(1).max(RESULT_QUERY_LIMITS.points),
      times: timesSchema,
    })
    .refine((value) => value.points.length * value.times.length <= RESULT_QUERY_LIMITS.values),
  z.strictObject({
    kind: z.literal('time-series'),
    layer: layerSchema,
    ensemble: ensembleSchema.optional(),
    observationMode: z.enum(['stations', 'interpolated']).optional(),
    temporalResolution: z.enum(['hourly', 'daily']).optional(),
    point: pointSchema,
    timeRange: z
      .strictObject({ start: instantSchema, end: instantSchema })
      .refine((value) => Date.parse(value.start) <= Date.parse(value.end)),
  }),
  z.strictObject({
    kind: z.enum(['grid', 'export']),
    layer: layerSchema,
    ensemble: ensembleSchema.optional(),
    observationMode: z.enum(['stations', 'interpolated']).optional(),
    temporalResolution: z.enum(['hourly', 'daily']).optional(),
    window: windowSchema,
    times: timesSchema,
  }),
  z.strictObject({
    kind: z.literal('preview'),
    layer: layerSchema,
    ensemble: ensembleSchema.optional(),
    observationMode: z.enum(['stations', 'interpolated']).optional(),
    temporalResolution: z.enum(['hourly', 'daily']).optional(),
    window: windowSchema,
    times: timesSchema,
    maxPoints: z.number().int().min(1).max(RESULT_QUERY_LIMITS.gridPoints),
  }),
])

export function resultAvailability(
  task: Pick<DownscalingTask, 'generatorVersion' | 'configuration'>,
) {
  if (
    task.generatorVersion !== GENERATOR_VERSION &&
    task.generatorVersion !== VARIABLE_GENERATOR_VERSION &&
    task.generatorVersion !== ENSEMBLE_GENERATOR_VERSION
  ) {
    return unavailable(
      'INCOMPATIBLE_GENERATOR',
      'The saved generator version is unavailable; it will not be replaced.',
    )
  }
  if (
    task.generatorVersion === ENSEMBLE_GENERATOR_VERSION
      ? task.configuration.resolvedMethod !== 'probabilistic'
      : task.configuration.resolvedMethod !== 'deterministic' ||
        (task.generatorVersion === GENERATOR_VERSION
          ? task.configuration.variable !== 'temperature'
          : !['wind', 'pressure', 'precipitation'].includes(task.configuration.variable))
  ) {
    return unavailable(
      'UNAVAILABLE_COMBINATION',
      'This variable/method is unavailable in the saved Synthetic Demo generator version.',
    )
  }
  return null
}

export function queryTaskResult(task: DownscalingTask, input: unknown): ResultReply {
  const unavailableResult = resultAvailability(task)
  if (unavailableResult) return unavailableResult
  const parsed = querySchema.safeParse(input)
  if (!parsed.success)
    return unavailable(
      'UNAVAILABLE_QUERY',
      'Use points, time-series, grid, preview or export: at most 64 requested points, 256 grid points, 168 times and 256 total values.',
    )
  const requested = parsed.data
  if ((requested.layer === 'observation') !== (requested.observationMode !== undefined))
    return unavailable(
      'UNAVAILABLE_QUERY',
      'The observation layer requires an explicit stations or interpolated mode; other layers do not accept it.',
    )
  const selection = selectEnsemble(task, requested.ensemble)
  if (selection && 'ok' in selection) return selection
  const memberFactor =
    requested.layer === 'downscaled' && selection
      ? selection.memberIds.length +
        (selection.kind === 'mean' || selection.kind === 'stddev' ? 1 : 0)
      : 1
  const { region, timeRange } = task.configuration
  const daily = requested.temporalResolution === 'daily'
  if (daily && !['temperature', 'precipitation'].includes(task.configuration.variable)) {
    return unavailable(
      'UNAVAILABLE_QUERY',
      'Daily mean/minimum are available for temperature; daily totals are available for precipitation.',
    )
  }
  const start = daily
    ? Math.floor(Date.parse(timeRange.start) / 86_400_000) * 86_400_000
    : Date.parse(timeRange.start)
  const end = daily
    ? Math.floor(Date.parse(timeRange.end) / 86_400_000) * 86_400_000
    : Date.parse(timeRange.end) +
      (requested.temporalResolution === 'hourly' && timeRange.mode === 'historical'
        ? 23 * 3_600_000
        : 0)
  const step = daily
    ? 86_400_000
    : requested.temporalResolution === 'hourly'
      ? 3_600_000
      : timeRange.mode === 'historical'
        ? 86_400_000
        : 3_600_000
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
    if (count > RESULT_QUERY_LIMITS.times || count * memberFactor > RESULT_QUERY_LIMITS.values) {
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
    if (requested.times.length * memberFactor > RESULT_QUERY_LIMITS.values)
      return unavailable(
        'QUERY_LIMIT_EXCEEDED',
        'The time/member product exceeds the bounded result budget.',
      )
    const result =
      requested.layer === 'observation' && requested.observationMode === 'stations'
        ? stationWindow(
            window,
            requested.times.length * memberFactor,
            requested.kind === 'preview' ? requested.maxPoints : undefined,
          )
        : windowPoints(
            task,
            requested.layer,
            window,
            requested.times.length * memberFactor,
            requested.kind === 'preview' ? requested.maxPoints : undefined,
          )
    if ('ok' in result) return result
    sampling = result.grid
    query = { layer: requested.layer, points: result.points, times: requested.times }
  }
  if (query.points.length * query.times.length * memberFactor > RESULT_QUERY_LIMITS.values) {
    return unavailable(
      'QUERY_LIMIT_EXCEEDED',
      'Request fewer points, times or members: at most 256 member sample/mean rows, including the samples returned with each mean.',
    )
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
  // A precipitation interval has one identity even when requested with two timezone spellings.
  // Never aggregate or return the same bucket twice as though it were extra rainfall.
  if (task.configuration.variable === 'precipitation') {
    query.times = [...new Set(query.times.map((time) => new Date(time).toISOString()))]
    query.points = [
      ...new Map(
        query.points.map((point) => [`${point.longitude},${point.latitude}`, point]),
      ).values(),
    ]
  }
  const metadata: ResultMetadata = {
    ok: true,
    taskId: task.id,
    layer: query.layer,
    displayTimezone: 'UTC',
    temporalStatistic: 'instantaneous',
    provenance: {
      label: 'Synthetic Demo',
      dataSource: task.configuration.dataSource,
      generatorVersion: task.generatorVersion,
      description:
        'Versioned Synthetic Demo fields: ECMWF/GFS/Fusion are configuration labels, not actual runs or model inference. Temperature-v1 native historical values are UTC snapshots; daily statistics and precipitation intervals are explicitly labelled.',
    },
    grid: {
      nominalSpacingKm:
        query.layer === 'original' ? 10 : Number.parseInt(task.configuration.resolution),
      ...sampling,
      interpolation: 'bilinear',
      crs: 'EPSG:4326',
    },
  }
  if (query.layer === 'observation') {
    return queryObservations(task, requested, query, metadata)
  }
  if (selection && query.layer === 'downscaled') {
    return queryEnsemble(
      task,
      { ...query, temporalResolution: requested.temporalResolution },
      selection,
      metadata,
    )
  }
  if (daily && task.configuration.variable === 'temperature') {
    const values = []
    for (const rawTime of query.times) {
      const time = new Date(rawTime).toISOString()
      for (const point of query.points) {
        const result = temperatureDay(task, query.layer, point, time)
        if ('ok' in result) return result
        values.push({ ...point, time, ...result })
      }
    }
    return {
      ...metadata,
      temporalStatistic: 'daily-mean',
      variable: 'temperature',
      quantity: 'T2M',
      unit: '°C',
      values,
    }
  }
  if (task.configuration.variable === 'wind') {
    const values = []
    for (const rawTime of query.times) {
      const time = new Date(rawTime).toISOString()
      for (const point of query.points) {
        const result = windAt(task, query.layer, point, time)
        if ('ok' in result) return result
        values.push({ ...point, time, ...result })
      }
    }
    return {
      ...metadata,
      variable: 'wind',
      quantity: 'U10/V10',
      unit: 'm/s',
      directionUnit: 'degrees',
      directionConvention: 'meteorological-from',
      values,
    }
  }
  if (task.configuration.variable === 'precipitation') {
    const values = []
    for (const rawTime of query.times) {
      const time = new Date(rawTime).toISOString()
      for (const point of query.points) {
        const result = precipitationAt(
          task,
          query.layer,
          point,
          time,
          daily ? 24 : requested.temporalResolution === 'hourly' ? 1 : undefined,
        )
        if ('ok' in result) return result
        values.push({ ...point, time, ...result })
      }
    }
    return {
      ...metadata,
      temporalStatistic: 'accumulation',
      variable: 'precipitation',
      quantity: 'TP',
      unit: 'mm',
      values,
    }
  }
  if (task.configuration.variable === 'pressure') {
    const values = query.times.flatMap((rawTime) => {
      const time = new Date(rawTime).toISOString()
      return query.points.map((point) => ({
        ...point,
        time,
        value: pressureAt(task, query.layer, point, time),
      }))
    })
    return { ...metadata, variable: 'pressure', quantity: 'MSL', unit: 'hPa', values }
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
    return unavailable('GENERATION_FAILED', 'The synthetic field could not be reconstructed.')
  }
  return {
    ...metadata,
    temporalStatistic: 'instantaneous',
    variable: 'temperature',
    quantity: 'T2M',
    unit: '°C',
    values,
  }
}

/** A bounded reconstruction probe, using the same evaluation as all result queries. */
export function probeTaskResult(task: DownscalingTask) {
  const { region, timeRange } = task.configuration
  for (const layer of ['original', 'downscaled'] as const) {
    const result = queryTaskResult(task, {
      kind: 'points',
      layer,
      points: [{ longitude: region.west, latitude: region.south }],
      times: [new Date(timeRange.start).toISOString()],
      ...(task.configuration.resolvedMethod === 'probabilistic'
        ? { ensemble: { kind: 'members', memberIds: ['member-01'] } }
        : {}),
    })
    // A declared data gap is not a corrupt generator or a failed task. Query callers still
    // receive explicit unavailable replies; no missing value is converted to zero.
    if (!result.ok && !['MISSING_COMPONENT', 'MISSING_DATA'].includes(result.code)) return result
  }
  return null
}

import { RESULT_QUERY_LIMITS } from '@/features/downscaling-tasks/service'
import { OBSERVATION_REFERENCE } from '@/features/downscaling-tasks/service/contracts'
import type {
  DownscalingTask,
  ObservationStation,
  ResultPoint,
  Accumulation,
  DailyTemperature,
  ResultQuery,
  ResultReply,
  ResultValue,
  ResultWindow,
  TaskReply,
} from '@/features/downscaling-tasks/service/contracts'
import { calculateAccuracyMetrics } from '@/features/result-analysis/service/accuracy-metrics'
import type {
  ComparisonCoverage,
  ComparisonExclusions,
  ComparisonSampling,
  ComparisonReason,
  IndividualComparisonStats,
  ComparisonMetrics,
  TaskComparisonReply,
  TaskComparisonSelection,
  TaskComparisonService,
} from '../types'

export type { TaskComparisonReply, TaskComparisonSelection, TaskComparisonService } from '../types'

export const TASK_COMPARISON_LIMITS = { stations: 16, times: 8, samples: 64 } as const
const limits = TASK_COMPARISON_LIMITS

function boundedIndices(count: number, limit: number) {
  const size = Math.min(count, limit)
  return Array.from({ length: size }, (_, index) =>
    size <= 1 ? 0 : Math.floor((index * (count - 1)) / (size - 1)),
  )
}

function samplePoints(window: ResultWindow, budget: number): ResultPoint[] {
  const west = Math.ceil(window.west)
  const south = Math.ceil(window.south)
  const columns = Math.max(0, Math.floor(window.east) - west + 1)
  const rows = Math.max(0, Math.floor(window.north) - south + 1)
  // Probe the public one-degree station lattice, but trust only returned station identities.
  return boundedIndices(columns * rows, budget).map((index) => ({
    longitude: west + (index % columns),
    latitude: south + Math.floor(index / columns),
  }))
}

function commonTimes(a: DownscalingTask, b: DownscalingTask) {
  const rangeA = a.configuration.timeRange
  const rangeB = b.configuration.timeRange
  const step = rangeA.mode === 'historical' ? 86_400_000 : 3_600_000
  const startA = Date.parse(rangeA.start)
  const startB = Date.parse(rangeB.start)
  if (rangeA.mode !== rangeB.mode || (startA - startB) % step) return { times: [], count: 0 }
  const first = Math.max(startA, startB)
  const last = Math.min(Date.parse(rangeA.end), Date.parse(rangeB.end))
  const count = Math.max(0, Math.floor((last - first) / step) + 1)
  return {
    count,
    times: boundedIndices(count, limits.times).map((index) =>
      new Date(first + index * step).toISOString(),
    ),
  }
}

type AvailableResult = Extract<ResultReply, { ok: true }>
type ResultRead = {
  result: AvailableResult | null
  fatal: Extract<ResultReply, { ok: false }> | null
  fallbackRequests: number
}

const missingCodes = new Set(['MISSING_DATA', 'MISSING_COMPONENT', 'NO_OBSERVATION', 'NO_SAMPLES'])
const fatalCodes = new Set([
  'NOT_FOUND',
  'FAILED',
  'NOT_COMPLETED',
  'INVALID_RECORD',
  'RECORD_CHANGED',
  'FORBIDDEN',
  'AUTHENTICATION_REQUIRED',
])

async function valuesAt(
  service: TaskComparisonService,
  task: DownscalingTask,
  layer: 'observation' | 'downscaled',
  points: ResultPoint[],
  times: string[],
  fallback: { remaining: number },
): Promise<ResultRead> {
  const memberFactor =
    layer === 'downscaled' && task.configuration.resolvedMethod === 'probabilistic'
      ? (task.configuration.advanced?.ensembleMembers ?? 10) + 1
      : 1
  const pointBudget = Math.max(
    1,
    Math.min(
      RESULT_QUERY_LIMITS.points,
      Math.floor(RESULT_QUERY_LIMITS.values / (Math.max(1, times.length) * memberFactor)),
    ),
  )
  let combined: AvailableResult | null = null
  let fatal: ResultRead['fatal'] = null
  let fallbackRequests = 0
  async function read(
    batchPoints: ResultPoint[],
    batchTimes: string[],
    isFallback = false,
  ): Promise<void> {
    if (fatal || !batchPoints.length || !batchTimes.length) return
    if (isFallback) {
      if (!fallback.remaining) return
      fallback.remaining--
      fallbackRequests++
    }
    const query: ResultQuery = {
      kind: 'points',
      points: batchPoints,
      times: batchTimes,
      ...(layer === 'observation'
        ? { layer, observationMode: 'stations' }
        : {
            layer,
            ...(task.configuration.resolvedMethod === 'probabilistic'
              ? { ensemble: { kind: 'mean' as const } }
              : {}),
          }),
    }
    const result = await service.result(task.id, query)
    if (result.ok) {
      combined = combined
        ? ({ ...combined, values: [...combined.values, ...result.values] } as AvailableResult)
        : result
      return
    }
    if (fatalCodes.has(result.code)) {
      fatal = result
      return
    }
    if (!missingCodes.has(result.code)) return
    if (batchPoints.length > 1) {
      const middle = Math.ceil(batchPoints.length / 2)
      await read(batchPoints.slice(0, middle), batchTimes, true)
      await read(batchPoints.slice(middle), batchTimes, true)
    } else if (batchTimes.length > 1) {
      const middle = Math.ceil(batchTimes.length / 2)
      await read(batchPoints, batchTimes.slice(0, middle), true)
      await read(batchPoints, batchTimes.slice(middle), true)
    }
  }
  for (let offset = 0; offset < points.length; offset += pointBudget) {
    await read(points.slice(offset, offset + pointBudget), times)
  }
  return { result: combined, fatal, fallbackRequests }
}

function pointTimeKey(value: Pick<ResultValue, 'longitude' | 'latitude' | 'time'>) {
  if (
    !Number.isFinite(value.longitude) ||
    !Number.isFinite(value.latitude) ||
    !Number.isFinite(Date.parse(value.time))
  )
    return ''
  return `${value.longitude},${value.latitude},${new Date(value.time).toISOString()}`
}

type EvaluationValue = ResultValue & { accumulation?: Accumulation; daily?: DailyTemperature }
function interval(value: EvaluationValue): { complete: boolean; key: string } | null {
  if (value.accumulation) {
    const a = value.accumulation
    return {
      complete:
        a.complete &&
        a.sampledHours === a.expectedHours &&
        a.expectedHours > 0 &&
        a.start === a.requestedStart &&
        a.end === a.requestedEnd &&
        Date.parse(a.end) - Date.parse(a.start) === a.expectedHours * 3_600_000,
      key: `${a.start}/${a.end}/${a.bounds}/${a.expectedHours}`,
    }
  }
  if (value.daily) {
    const d = value.daily
    return {
      complete: d.completeDay && d.sampledHours === 24 && d.expectedHours === 24,
      key: `${d.start}/${d.end}/${d.bounds}/${d.expectedHours}`,
    }
  }
  return null
}
function intervalExclusion(values: EvaluationValue[]) {
  const intervals = values.map(interval)
  if (intervals.some((i) => i && !i.complete)) return 'incomplete-interval' as const
  if (intervals.some((i) => i?.key !== intervals[0]?.key)) return 'interval-mismatch' as const
  return null
}
function stationMatches(value: ResultValue, point: ResultPoint) {
  const s = value.observation?.mode === 'stations' ? value.observation.station : undefined
  return (
    !!s &&
    !!s.id &&
    Number.isFinite(s.longitude) &&
    Number.isFinite(s.latitude) &&
    s.longitude === point.longitude &&
    s.latitude === point.latitude &&
    value.longitude === s.longitude &&
    value.latitude === s.latitude
  )
}
function metadataReasons(results: AvailableResult[]): ComparisonReason[] {
  const first = results[0]!
  const reasons: ComparisonReason[] = []
  for (const [field, code, message] of [
    ['variable', 'VARIABLE_MISMATCH', 'Meteorological variables differ.'],
    ['quantity', 'QUANTITY_MISMATCH', 'Result quantities differ.'],
    ['unit', 'UNIT_MISMATCH', 'Result units differ; direct ranking is disabled.'],
    ['temporalStatistic', 'STATISTIC_MISMATCH', 'Result temporal statistics differ.'],
  ] as const) {
    if (results.some((result) => result[field] !== first[field])) reasons.push({ code, message })
  }
  return reasons
}

function metrics(observed: number[], predicted: number[]): ComparisonMetrics {
  const result = calculateAccuracyMetrics(observed, predicted)
  if (!result.available) throw new Error(result.reason)
  return {
    ...result.metrics,
    r2: Number.isFinite(result.metrics.r2) ? result.metrics.r2 : null,
    r2UnavailableReason: Number.isFinite(result.metrics.r2) ? null : 'constant-reference',
  }
}

function coverage(stations: ObservationStation[], times: string[], n: number): ComparisonCoverage {
  return {
    n,
    stationCount: stations.length,
    stations,
    times: [...new Set(times)].sort(),
    window: stations.length
      ? {
          west: Math.min(...stations.map((point) => point.longitude)),
          east: Math.max(...stations.map((point) => point.longitude)),
          south: Math.min(...stations.map((point) => point.latitude)),
          north: Math.max(...stations.map((point) => point.latitude)),
        }
      : null,
  }
}

function taskReference(task: DownscalingTask) {
  return {
    referenceSeed: task.referenceSeed ?? OBSERVATION_REFERENCE.referenceSeed,
    referenceVersion: task.referenceVersion ?? OBSERVATION_REFERENCE.referenceVersion,
  }
}

function sameReference(a: AvailableResult | null, b: AvailableResult | null) {
  return (
    !!a?.reference &&
    !!b?.reference &&
    a.reference.referenceSeed === b.reference.referenceSeed &&
    a.reference.referenceVersion === b.reference.referenceVersion &&
    a.reference.kind === b.reference.kind
  )
}

async function individualStats(
  service: TaskComparisonService,
  task: DownscalingTask,
  fallback: { remaining: number },
): Promise<IndividualComparisonStats> {
  const { times, count: availableTimes } = commonTimes(task, task)
  const window = task.configuration.region
  const points = samplePoints(
    window,
    Math.min(limits.stations, Math.floor(limits.samples / Math.max(1, times.length))),
  )
  const availableStations =
    Math.max(0, Math.floor(window.east) - Math.ceil(window.west) + 1) *
    Math.max(0, Math.floor(window.north) - Math.ceil(window.south) + 1)
  const [observation, prediction] = await Promise.all([
    valuesAt(service, task, 'observation', points, times, fallback),
    valuesAt(service, task, 'downscaled', points, times, fallback),
  ])
  const candidates = points.length * times.length
  const observed: number[] = []
  const predicted: number[] = []
  const stations = new Map<string, ObservationStation>()
  const retainedTimes: string[] = []
  const obs = new Map(observation.result?.values.map((value) => [pointTimeKey(value), value]))
  const pred = new Map(prediction.result?.values.map((value) => [pointTimeKey(value), value]))
  for (const value of obs.values()) {
    const point = value.observation?.mode === 'stations' ? value.observation.station : undefined
    const p = pred.get(pointTimeKey(value))
    if (!point || !p || !Number.isFinite(value.value) || !Number.isFinite(p.value)) continue
    observed.push(value.value)
    predicted.push(p.value)
    stations.set(point.id, point)
    retainedTimes.push(value.time)
  }
  const base = {
    rankingAllowed: false as const,
    reference: observation.result?.reference ?? taskReference(task),
    coverage: coverage([...stations.values()], retainedTimes, observed.length),
    sampling: {
      strategy: 'bounded-station-time' as const,
      availableStations,
      availableTimes,
      queriedSamples: candidates,
      retainedSamples: observed.length,
      omittedSamples: availableStations * availableTimes - candidates,
      decimated: availableStations * availableTimes > candidates,
      selectedTimes: times,
      selectedWindow: window,
      limits,
      fallbackRequests: observation.fallbackRequests + prediction.fallbackRequests,
      notes: [
        'Individual task statistics on its own reference and samples. Not a fair pair ranking.',
      ],
    },
    exclusions: {
      candidates,
      retained: observed.length,
      excluded: candidates - observed.length,
      counts:
        candidates === observed.length
          ? {}
          : { 'missing-prediction': candidates - observed.length },
    },
  }
  return observed.length
    ? { ...base, available: true, metrics: metrics(observed, predicted), reasons: [] }
    : {
        ...base,
        available: false,
        metrics: null,
        reasons: [{ code: 'NO_COMMON_SAMPLES', message: 'No valid individual station samples.' }],
      }
}

function pairFailures(selection: TaskComparisonSelection, replies: [TaskReply, TaskReply]) {
  return replies.flatMap((reply, index) => {
    const side = index === 0 ? ('a' as const) : ('b' as const)
    const taskId = selection[side]
    if (!reply.ok) return [{ side, taskId, code: reply.code, error: reply.error }]
    if (reply.task.id !== taskId)
      return [{ side, taskId, code: 'INVALID_RECORD', error: 'The task identity changed.' }]
    if (reply.task.status !== 'Completed')
      return [
        { side, taskId, code: 'NOT_COMPLETED', error: 'Only Completed tasks can be compared.' },
      ]
    return []
  })
}

function unavailablePair(
  selection: TaskComparisonSelection,
  failures: Extract<TaskComparisonReply, { ok: false }>['failures'],
): TaskComparisonReply {
  return {
    ok: false,
    code: 'TASK_UNAVAILABLE',
    error: 'The selected pair is unavailable. Return to task management.',
    selection,
    failures,
  }
}

/** Revalidates an ordered pair through the existing browser task/result service. */
export async function queryTaskComparison(
  service: TaskComparisonService,
  selection: TaskComparisonSelection,
): Promise<TaskComparisonReply> {
  if (
    !selection.a ||
    !selection.b ||
    selection.a.trim() !== selection.a ||
    selection.b.trim() !== selection.b
  ) {
    return {
      ok: false,
      code: 'INVALID_PAIR',
      error: 'Choose exactly two valid task identifiers.',
      selection,
      failures: [],
    }
  }
  if (selection.a === selection.b) {
    return {
      ok: false,
      code: 'DUPLICATE_TASK',
      error: 'A task cannot be compared with itself.',
      selection,
      failures: [],
    }
  }
  const [a, b] = await Promise.all([service.get(selection.a), service.get(selection.b)])
  const failures = pairFailures(selection, [a, b])
  if (failures.length) return unavailablePair(selection, failures)
  if (!a.ok || !b.ok) return unavailablePair(selection, failures)
  if (a.task.ownerId !== b.task.ownerId)
    return unavailablePair(selection, [
      {
        side: 'b',
        taskId: selection.b,
        code: 'FORBIDDEN',
        error: 'Tasks must belong to the same current account.',
      },
    ])
  const window = {
    west: Math.max(a.task.configuration.region.west, b.task.configuration.region.west),
    east: Math.min(a.task.configuration.region.east, b.task.configuration.region.east),
    south: Math.max(a.task.configuration.region.south, b.task.configuration.region.south),
    north: Math.min(a.task.configuration.region.north, b.task.configuration.region.north),
  }
  const { times, count: availableTimes } = commonTimes(a.task, b.task)
  const points = samplePoints(
    window,
    Math.min(limits.stations, Math.floor(limits.samples / Math.max(1, times.length))),
  )
  const availableStations =
    Math.max(0, Math.floor(window.east) - Math.ceil(window.west) + 1) *
    Math.max(0, Math.floor(window.north) - Math.ceil(window.south) + 1)
  const candidates = points.length * times.length
  const exclusions: ComparisonExclusions = {
    candidates,
    retained: 0,
    excluded: candidates,
    counts: candidates ? { incompatible: candidates } : {},
  }
  const sampling: ComparisonSampling = {
    strategy: 'bounded-station-time',
    availableStations,
    availableTimes,
    queriedSamples: candidates,
    retainedSamples: 0,
    omittedSamples: availableStations * availableTimes - candidates,
    decimated: availableStations * availableTimes > candidates,
    selectedTimes: times,
    selectedWindow: points.length ? window : null,
    limits,
    fallbackRequests: 0,
    notes: [
      'Synthetic Demo station samples, not full-grid or real-model validation.',
      'Deterministic first-to-last station/time decimation; no missing values are filled.',
    ],
  }
  const configurationReasons: ComparisonReason[] = []
  if (a.task.configuration.variable !== b.task.configuration.variable)
    configurationReasons.push({
      code: 'VARIABLE_MISMATCH',
      message: 'Different meteorological variables cannot be ranked directly.',
    })
  if (a.task.configuration.timeRange.mode !== b.task.configuration.timeRange.mode)
    configurationReasons.push({
      code: 'GRAIN_MISMATCH',
      message: 'Native daily historical snapshots and hourly forecast values have different grain.',
    })
  if (window.west > window.east || window.south > window.north)
    configurationReasons.push({
      code: 'NO_SPATIAL_OVERLAP',
      message: 'Task spatial coverage does not overlap.',
    })
  if (!times.length)
    configurationReasons.push({
      code: 'NO_TEMPORAL_OVERLAP',
      message: 'No shared task-aligned native instants.',
    })
  if (configurationReasons.length) {
    // Planned samples were not queried when the pair was rejected before any result RPC.
    sampling.queriedSamples = 0
    sampling.omittedSamples = availableStations * availableTimes
    exclusions.candidates = 0
    exclusions.excluded = 0
    exclusions.counts = {}
    return {
      ok: true,
      selection,
      tasks: [a.task, b.task],
      individual: null,
      common: {
        available: false,
        rankingAllowed: false,
        metrics: null,
        coverage: coverage([], [], 0),
        exclusions,
        sampling,
        reasons: configurationReasons,
      },
    }
  }
  const fallback = { remaining: 32 }
  const reads = await Promise.all([
    valuesAt(service, a.task, 'observation', points, times, fallback),
    valuesAt(service, b.task, 'observation', points, times, fallback),
    valuesAt(service, a.task, 'downscaled', points, times, fallback),
    valuesAt(service, b.task, 'downscaled', points, times, fallback),
  ])
  sampling.fallbackRequests = reads.reduce((sum, read) => sum + read.fallbackRequests, 0)
  const current = await Promise.all([service.get(selection.a), service.get(selection.b)])
  const lateFailures = pairFailures(selection, current)
  reads.forEach((read, index) => {
    if (read.fatal)
      lateFailures.push({
        side: index % 2 === 0 ? 'a' : 'b',
        taskId: index % 2 === 0 ? selection.a : selection.b,
        code: read.fatal.code,
        error: read.fatal.error,
      })
  })
  if (lateFailures.length) return unavailablePair(selection, lateFailures)

  const [observationA, observationB, predictionA, predictionB] = reads.map((read) => read.result)
  const referenceA = taskReference(a.task)
  const referenceB = taskReference(b.task)
  if (
    referenceA.referenceSeed !== referenceB.referenceSeed ||
    referenceA.referenceVersion !== referenceB.referenceVersion ||
    (observationA?.reference &&
      observationB?.reference &&
      !sameReference(observationA, observationB))
  ) {
    const [statsA, statsB] = await Promise.all([
      individualStats(service, a.task, fallback),
      individualStats(service, b.task, fallback),
    ])
    const revalidated = await Promise.all([service.get(selection.a), service.get(selection.b)])
    const lateIndividualFailures = pairFailures(selection, revalidated)
    if (lateIndividualFailures.length) return unavailablePair(selection, lateIndividualFailures)
    return {
      ok: true,
      selection,
      tasks: [a.task, b.task],
      individual: { a: statsA, b: statsB },
      common: {
        available: false,
        rankingAllowed: false,
        metrics: null,
        coverage: coverage([], [], 0),
        exclusions,
        sampling,
        reasons: [
          {
            code: 'REFERENCE_MISMATCH',
            message:
              'Reference seed, version or source differs. Individual statistics are not a fair ranking.',
          },
        ],
      },
    }
  }
  if (
    !observationA ||
    !observationB ||
    !predictionA ||
    !predictionB ||
    !observationA.reference ||
    !observationB.reference
  ) {
    exclusions.counts = candidates
      ? {
          [!observationA || !observationB ? 'missing-observation' : 'missing-prediction']:
            candidates,
        }
      : {}
    return {
      ok: true,
      selection,
      tasks: [a.task, b.task],
      individual: null,
      common: {
        available: false,
        rankingAllowed: false,
        metrics: null,
        coverage: coverage([], [], 0),
        exclusions,
        sampling,
        reasons: [{ code: 'NO_COMMON_SAMPLES', message: 'No common valid station samples.' }],
      },
    }
  }
  const incompatibleMetadata = metadataReasons([
    observationA,
    observationB,
    predictionA,
    predictionB,
  ])
  if (incompatibleMetadata.length)
    return {
      ok: true,
      selection,
      tasks: [a.task, b.task],
      individual: null,
      common: {
        available: false,
        rankingAllowed: false,
        metrics: null,
        coverage: coverage([], [], 0),
        exclusions,
        sampling,
        reasons: incompatibleMetadata,
      },
    }
  exclusions.counts = {}
  const observationsA = new Map(observationA.values.map((value) => [pointTimeKey(value), value]))
  const observationsB = new Map(observationB.values.map((value) => [pointTimeKey(value), value]))
  const predictionsA = new Map(predictionA.values.map((value) => [pointTimeKey(value), value]))
  const predictionsB = new Map(predictionB.values.map((value) => [pointTimeKey(value), value]))
  const observed: number[] = []
  const predictedA: number[] = []
  const predictedB: number[] = []
  const stations = new Map<string, ObservationStation>()
  const retainedTimes: string[] = []
  for (const candidate of times.flatMap((time) => points.map((point) => ({ ...point, time })))) {
    const key = pointTimeKey(candidate)
    const value = observationsA.get(key)
    const counterpart = observationsB.get(key)
    const station = value?.observation?.mode === 'stations' ? value.observation.station : undefined
    const otherStation =
      counterpart?.observation?.mode === 'stations' ? counterpart.observation.station : undefined
    const predA = predictionsA.get(key)
    const predB = predictionsB.get(key)
    const exclusion =
      !value || !station || !counterpart
        ? 'missing-observation'
        : station.id !== otherStation?.id ||
            !stationMatches(value, candidate) ||
            !stationMatches(counterpart, candidate)
          ? 'station-mismatch'
          : predA === undefined || predB === undefined
            ? 'missing-prediction'
            : ![value.value, counterpart.value, predA.value, predB.value].every(Number.isFinite)
              ? 'non-finite'
              : counterpart.value !== value.value
                ? 'reference-value-mismatch'
                : intervalExclusion([value, counterpart, predA, predB])
    if (exclusion) {
      exclusions.counts[exclusion] = (exclusions.counts[exclusion] ?? 0) + 1
      continue
    }
    if (predA === undefined || predB === undefined || !station || !value) continue
    observed.push(value.value)
    predictedA.push(predA.value)
    predictedB.push(predB.value)
    stations.set(station.id, station)
    retainedTimes.push(value.time)
  }
  exclusions.retained = observed.length
  exclusions.excluded = candidates - observed.length
  sampling.retainedSamples = observed.length
  const retained = coverage([...stations.values()], retainedTimes, observed.length)
  return {
    ok: true,
    selection,
    tasks: [a.task, b.task],
    individual: null,
    common: observed.length
      ? {
          available: true,
          rankingAllowed: true,
          quantity: observationA.quantity,
          unit: observationA.unit,
          temporalStatistic: observationA.temporalStatistic,
          reference: observationA.reference,
          coverage: retained,
          exclusions,
          sampling,
          metrics: { a: metrics(observed, predictedA), b: metrics(observed, predictedB) },
          reasons: [],
        }
      : {
          available: false,
          rankingAllowed: false,
          coverage: retained,
          exclusions,
          sampling,
          metrics: null,
          reasons: [
            ...(exclusions.counts['incomplete-interval'] || exclusions.counts['interval-mismatch']
              ? [
                  {
                    code: 'ACCUMULATION_MISMATCH' as const,
                    message: 'No complete matching accumulation/statistic intervals.',
                  },
                ]
              : []),
            { code: 'NO_COMMON_SAMPLES', message: 'No common valid station samples.' },
          ],
        },
  }
}

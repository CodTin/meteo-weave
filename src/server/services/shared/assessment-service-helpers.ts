import { createTaskService } from '@/features/downscaling-tasks/service'
import type { DownscalingTask } from '@/features/downscaling-tasks/service/contracts'
import { QueryClient } from '@tanstack/react-query'
import { alignAccuracySamples } from '@/features/result-analysis/service/accuracy-samples'
import {
  extractWindSpeed,
  validateAccumulationCoverage,
} from '@/features/result-analysis/service/variable-accuracy'
import type {
  ResultValue,
  WindValue,
  Accumulation,
} from '@/features/downscaling-tasks/service/contracts'

/**
 * Base response for assessment data unavailability
 */
export type UnavailableData = {
  available: false
  reason: string
}

/**
 * Result of task retrieval and validation
 */
export type TaskValidationResult =
  | {
      ok: true
      task: DownscalingTask
      service: ReturnType<typeof createTaskService>
    }
  | {
      ok: false
      reason: string
    }

/**
 * Initializes the task service and retrieves a validated task for assessment.
 * Returns the task and service if successful, otherwise returns an error reason.
 */
export async function initializeAndValidateTask(taskId: string): Promise<TaskValidationResult> {
  const queryClient = new QueryClient()
  const service = createTaskService({ queryClient })
  await service.initialize()

  const taskResult = await service.get(taskId)
  if (!taskResult.ok) {
    return { ok: false, reason: '任务不存在或无法访问' }
  }

  const task = taskResult.task

  if (task.status !== 'Completed') {
    return {
      ok: false,
      reason: `任务尚未完成（当前状态：${task.status === 'Running' ? '运行中' : '失败'}）`,
    }
  }

  return { ok: true, task, service }
}

/**
 * Extracts the comparable value from a result value based on the variable type.
 * For wind: uses derived speed from U10/V10, not direction
 * For precipitation: validates accumulation coverage
 * For temperature and pressure: uses value directly
 * Preserves valid zeros for all variables
 */
export function extractComparableValue(resultValue: ResultValue, variable: string): number {
  if (variable === 'wind') {
    // Wind: evaluate by speed derived from U10/V10
    const windValue = resultValue as WindValue
    return extractWindSpeed(windValue)
  }

  if (variable === 'precipitation') {
    // Precipitation: check accumulation coverage
    const precipValue = resultValue as ResultValue & { accumulation?: Accumulation }
    if (precipValue.accumulation) {
      const validation = validateAccumulationCoverage(precipValue.accumulation)
      if (!validation.valid) {
        return NaN // Exclude incomparable samples
      }
    }
    return resultValue.value
  }

  // Temperature and pressure: use value directly
  return resultValue.value
}

/**
 * Query options for assessment sample data
 */
export type SampleQueryOptions = {
  taskId: string
  region: { west: number; south: number; east: number; north: number }
  times: string[]
  maxPoints: number
}

/**
 * Result of querying assessment sample data
 */
export type SampleQueryResult =
  | {
      ok: true
      original: ResultValue[]
      downscaled: ResultValue[]
      observation: ResultValue[]
    }
  | {
      ok: false
      reason: string
    }

/**
 * Queries original, downscaled, and observation data for assessment.
 * Returns all three datasets or an error reason.
 */
export async function querySampleData(
  service: ReturnType<typeof createTaskService>,
  options: SampleQueryOptions,
): Promise<SampleQueryResult> {
  const { taskId, region, times, maxPoints } = options

  // Query original data at observation stations
  const originalResult = await service.result(taskId, {
    layer: 'original',
    kind: 'preview',
    window: region,
    times,
    maxPoints,
  })

  if (!originalResult.ok) {
    return { ok: false, reason: '无法获取原始数据' }
  }

  // Query downscaled data at same points
  const downscaledResult = await service.result(taskId, {
    layer: 'downscaled',
    kind: 'preview',
    window: region,
    times,
    maxPoints,
  })

  if (!downscaledResult.ok) {
    return { ok: false, reason: '无法获取降尺度数据' }
  }

  // Query observation data at stations
  const observationResult = await service.result(taskId, {
    layer: 'observation',
    observationMode: 'stations',
    kind: 'preview',
    window: region,
    times,
    maxPoints,
  })

  if (!observationResult.ok) {
    return { ok: false, reason: '无法获取观测数据' }
  }

  return {
    ok: true,
    original: originalResult.values,
    downscaled: downscaledResult.values,
    observation: observationResult.values,
  }
}

/**
 * Sample set for assessment calculations
 */
export type AlignedSamples = {
  samples: Array<{
    stationId: string
    time: string
    observed: number
    original: number
    downscaled: number
    location?: { lon: number; lat: number }
    elevation?: number
  }>
  timeCoverage: { start: string; end: string }
}

/**
 * Extracts samples from result values with observation data, preserving station metadata.
 */
function extractSamplesWithObservation(
  values: ResultValue[],
  variable: string,
): Array<{
  stationId: string
  time: string
  value: number
  location?: { lon: number; lat: number }
  elevation?: number
}> {
  const getStationId = (obs: NonNullable<ResultValue['observation']>): string => {
    return obs.mode === 'stations' ? obs.station.id : 'interpolated'
  }

  const getStationLocation = (
    obs: NonNullable<ResultValue['observation']>,
  ): { lon: number; lat: number } | undefined => {
    return obs.mode === 'stations'
      ? { lon: obs.station.longitude, lat: obs.station.latitude }
      : undefined
  }

  const getStationElevation = (
    _obs: NonNullable<ResultValue['observation']>,
  ): number | undefined => {
    // Elevation is not in ObservationStation type yet, return undefined
    return undefined
  }

  return values
    .filter((v): v is ResultValue & { observation: NonNullable<ResultValue['observation']> } =>
      Boolean(v.observation),
    )
    .map((v) => ({
      stationId: getStationId(v.observation!),
      time: v.time,
      value: extractComparableValue(v, variable),
      location: getStationLocation(v.observation!),
      elevation: getStationElevation(v.observation!),
    }))
    .filter((s) => Number.isFinite(s.value))
}

/**
 * Extracts and aligns samples from query results.
 * Returns aligned samples ready for assessment calculations with station metadata preserved.
 */
export function extractAndAlignSamples(
  original: ResultValue[],
  downscaled: ResultValue[],
  observation: ResultValue[],
  variable: string,
): AlignedSamples['samples'] {
  const originalSamples = extractSamplesWithObservation(original, variable)
  const downscaledSamples = extractSamplesWithObservation(downscaled, variable)

  const observationSamples = observation
    .map((v) => {
      const stationId =
        v.observation && v.observation.mode === 'stations' ? v.observation.station.id : 'unknown'
      const location =
        v.observation && v.observation.mode === 'stations'
          ? { lon: v.observation.station.longitude, lat: v.observation.station.latitude }
          : undefined
      const elevation = undefined // Elevation not yet in ObservationStation type

      return {
        stationId,
        time: v.time,
        value: extractComparableValue(v, variable),
        location,
        elevation,
      }
    })
    .filter((s) => Number.isFinite(s.value))

  const aligned = alignAccuracySamples(originalSamples, downscaledSamples, observationSamples)
  return aligned.samples
}

/**
 * Result of querying and aligning samples
 */
export type AlignedSampleResult =
  | {
      ok: true
      samples: AlignedSamples['samples']
      timeCoverage: { start: string; end: string }
    }
  | {
      ok: false
      reason: string
    }

/**
 * Queries and aligns samples for assessment in one operation.
 * Returns aligned samples ready for metric calculation or an error reason.
 */
export async function queryAndAlignSamples(
  service: ReturnType<typeof createTaskService>,
  options: SampleQueryOptions,
  variable: string,
  emptyReason: string,
): Promise<AlignedSampleResult> {
  const queryResult = await querySampleData(service, options)

  if (!queryResult.ok) {
    return { ok: false, reason: queryResult.reason }
  }

  const alignedSamples = extractAndAlignSamples(
    queryResult.original,
    queryResult.downscaled,
    queryResult.observation,
    variable,
  )

  if (alignedSamples.length === 0) {
    return { ok: false, reason: emptyReason }
  }

  const { times } = options
  return {
    ok: true,
    samples: alignedSamples,
    timeCoverage: { start: times[0] || '', end: times[times.length - 1] || '' },
  }
}

/**
 * Wraps task validation result into a standard assessment response format.
 * Reduces duplication across assessment server endpoints.
 */
export function wrapValidationFailure(
  taskValidation: TaskValidationResult,
): { ok: true; data: { available: false; reason: string } } | null {
  if (!taskValidation.ok) {
    return {
      ok: true,
      data: {
        available: false,
        reason: taskValidation.reason,
      },
    }
  }
  return null
}

/**
 * Wraps sample query failure into a standard assessment response format.
 * Reduces duplication across assessment server endpoints.
 */
export function wrapSampleQueryFailure(
  sampleResult: AlignedSampleResult,
): { ok: true; data: { available: false; reason: string } } | null {
  if (!sampleResult.ok) {
    return {
      ok: true,
      data: {
        available: false,
        reason: sampleResult.reason,
      },
    }
  }
  return null
}

/**
 * Station metadata for reproducibility
 */
export type StationMetadata = {
  stationId: string
  location: { lon: number; lat: number }
  elevation?: number
}

/**
 * Extracts unique station metadata from aligned samples
 */
export function extractStationMetadata(
  samples: Array<{
    stationId: string
    time: string
    location?: { lon: number; lat: number }
    elevation?: number
  }>,
): StationMetadata[] {
  const stationMap = new Map<string, StationMetadata>()

  for (const sample of samples) {
    if (!stationMap.has(sample.stationId) && sample.location) {
      stationMap.set(sample.stationId, {
        stationId: sample.stationId,
        location: sample.location,
        elevation: sample.elevation,
      })
    }
  }

  return Array.from(stationMap.values())
}

/**
 * Determines sampling plan based on task time range and budget
 */
export function determineSamplingPlan(
  startTime: string,
  endTime: string,
  maxTimes: number,
): { times: string[]; plan: string } {
  const start = new Date(startTime)
  const end = new Date(endTime)
  const totalHours = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60))

  if (totalHours <= maxTimes) {
    const times: string[] = []
    for (let h = 0; h <= totalHours; h++) {
      const time = new Date(start.getTime() + h * 60 * 60 * 1000)
      times.push(time.toISOString())
    }
    return {
      times,
      plan: `完整时间覆盖：${times.length} 个时刻`,
    }
  } else {
    const times: string[] = []
    const interval = Math.floor(totalHours / (maxTimes - 1))
    for (let i = 0; i < maxTimes; i++) {
      const hours = i === maxTimes - 1 ? totalHours : i * interval
      const time = new Date(start.getTime() + hours * 60 * 60 * 1000)
      times.push(time.toISOString())
    }
    return {
      times,
      plan: `预算内均匀采样：${times.length} 个时刻（总时长 ${totalHours + 1} 小时，间隔 ${interval} 小时）`,
    }
  }
}

/**
 * Builds the final assessment response data structure.
 * Shared pattern for returning station count, time coverage, and sampling details.
 */
export function buildAssessmentSamplingInfo(
  alignedSamples: Array<{ stationId: string }>,
  timeCoverage: { start: string; end: string },
  times: string[],
  maxPoints: number,
  maxTimes: number,
  plan: string,
) {
  const uniqueStations = new Set(alignedSamples.map((s) => s.stationId))
  return {
    stationCount: uniqueStations.size,
    timeCoverage: {
      start: timeCoverage.start,
      end: timeCoverage.end,
      actualTimes: times.length,
    },
    sampling: {
      budget: { maxPoints, maxTimes },
      actual: { points: uniqueStations.size, times: times.length },
      plan,
    },
  }
}

/**
 * Wraps assessment errors into standard response format.
 */
export function wrapAssessmentError(
  error: unknown,
  assessmentType: string,
): { ok: true; data: { available: false; reason: string } } {
  return {
    ok: true,
    data: {
      available: false,
      reason: `${assessmentType}评估失败: ${error instanceof Error ? error.message : '未知错误'}`,
    },
  }
}

/**
 * Standard sampling budget constants for all assessment types.
 * Ensures consistent sampling across accuracy and CRPS evaluations.
 */
export const ASSESSMENT_SAMPLING_BUDGET = {
  maxTimes: 10, // Maximum time samples to query
  maxPoints: 50, // Maximum spatial points per time
} as const

/**
 * Prepares sampling plan and queries aligned samples using the standard assessment budget.
 * Reduces duplication in assessment setup across different evaluation types.
 */
export async function prepareAssessmentSamples(
  task: {
    configuration: { timeRange: { start: string; end: string }; region: any; variable: string }
  },
  service: ReturnType<typeof import('@/features/downscaling-tasks/service').createTaskService>,
  taskId: string,
  unavailableReason: string,
) {
  const { start, end } = task.configuration.timeRange
  const { maxTimes, maxPoints } = ASSESSMENT_SAMPLING_BUDGET

  const { times, plan } = determineSamplingPlan(start, end, maxTimes)

  const sampleResult = await queryAndAlignSamples(
    service,
    {
      taskId,
      region: task.configuration.region,
      times,
      maxPoints,
    },
    task.configuration.variable,
    unavailableReason,
  )

  return { sampleResult, times, plan, maxTimes, maxPoints }
}

import type {
  DownscalingTask,
  ObservationReference,
  ObservationStation,
  ResultMetadata,
  ResultWindow,
} from '@/features/downscaling-tasks/service/contracts'
import type { createTaskService } from '@/features/downscaling-tasks/service'
import type { AccuracyMetrics } from '@/features/result-analysis/service/accuracy-metrics'

/** Pass the hydrated, initialized workspace service; this query never opens storage. */
export type TaskComparisonService = Pick<ReturnType<typeof createTaskService>, 'get' | 'result'>
export type TaskComparisonSelection = { a: string; b: string }
export type ComparisonMetrics = Omit<AccuracyMetrics, 'r2'> & {
  r2: number | null
  r2UnavailableReason: 'constant-reference' | null
}
export type ComparisonCoverage = {
  n: number
  stationCount: number
  stations: ObservationStation[]
  times: string[]
  window: ResultWindow | null
}
export type ComparisonSampling = {
  strategy: 'bounded-station-time'
  availableStations: number
  availableTimes: number
  queriedSamples: number
  retainedSamples: number
  omittedSamples: number
  decimated: boolean
  selectedTimes: string[]
  selectedWindow: ResultWindow | null
  limits: { stations: number; times: number; samples: number }
  fallbackRequests: number
  notes: string[]
}
export type ComparisonExclusionCode =
  | 'missing-observation'
  | 'missing-prediction'
  | 'non-finite'
  | 'station-mismatch'
  | 'reference-value-mismatch'
  | 'incomplete-interval'
  | 'interval-mismatch'
  | 'incompatible'
export type ComparisonExclusions = {
  candidates: number
  retained: number
  excluded: number
  /** One primary exclusion per candidate; counts sum to excluded. */
  counts: Partial<Record<ComparisonExclusionCode, number>>
}
export type ComparisonReason = {
  code:
    | 'VARIABLE_MISMATCH'
    | 'UNIT_MISMATCH'
    | 'QUANTITY_MISMATCH'
    | 'GRAIN_MISMATCH'
    | 'STATISTIC_MISMATCH'
    | 'ACCUMULATION_MISMATCH'
    | 'REFERENCE_MISMATCH'
    | 'REFERENCE_UNAVAILABLE'
    | 'NO_SPATIAL_OVERLAP'
    | 'NO_TEMPORAL_OVERLAP'
    | 'NO_COMMON_SAMPLES'
    | 'RESULT_UNAVAILABLE'
  message: string
  side?: 'a' | 'b'
  resultCode?: string
}
export type IndividualComparisonStats = {
  rankingAllowed: false
  reference: ObservationReference | null
  coverage: ComparisonCoverage
  sampling: ComparisonSampling
  exclusions: ComparisonExclusions
} & (
  | { available: true; metrics: ComparisonMetrics; reasons: [] }
  | { available: false; metrics: null; reasons: ComparisonReason[] }
)
export type CommonComparison = {
  coverage: ComparisonCoverage
  sampling: ComparisonSampling
  exclusions: ComparisonExclusions
} & (
  | {
      available: true
      rankingAllowed: true
      reference: ObservationReference
      quantity: string
      unit: string
      temporalStatistic: ResultMetadata['temporalStatistic']
      metrics: { a: ComparisonMetrics; b: ComparisonMetrics }
      reasons: []
    }
  | {
      available: false
      rankingAllowed: false
      metrics: null
      reasons: ComparisonReason[]
    }
)
export type TaskComparisonReply =
  | {
      ok: false
      code: 'INVALID_PAIR' | 'DUPLICATE_TASK' | 'TASK_UNAVAILABLE'
      error: string
      selection: TaskComparisonSelection
      failures: Array<{ side: 'a' | 'b'; taskId: string; code: string; error: string }>
    }
  | {
      ok: true
      selection: TaskComparisonSelection
      /** Always A then B, with fresh public get/result validation. */
      tasks: [DownscalingTask, DownscalingTask]
      common: CommonComparison
      /** Different references use each task's own bounded samples; NEVER rank these cards. */
      individual: { a: IndividualComparisonStats; b: IndividualComparisonStats } | null
    }

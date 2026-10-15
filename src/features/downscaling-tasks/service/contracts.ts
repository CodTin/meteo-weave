import type { AdmittedDownscalingConfiguration } from '../configuration-admission'
import type { DemoAccount } from '@/features/auth/demo-accounts'

export const TASK_SCHEMA_VERSION = 1
export const GENERATOR_VERSION = 'synthetic-temperature-v1'
export const VARIABLE_GENERATOR_VERSION = 'synthetic-variables-v2'
export const ENSEMBLE_GENERATOR_VERSION = 'synthetic-ensemble-v3'
// This identity is also the permanent fallback for pre-observation schema-1 backups.
export const OBSERVATION_REFERENCE = {
  referenceSeed: 1729,
  referenceVersion: 'synthetic-observations-v1',
} as const
export const TASK_DURATION_MS = 2_500
export const RESULT_QUERY_LIMITS = {
  points: 64,
  times: 168,
  values: 256,
  gridPoints: 256,
  members: 20,
} as const

export type DemoCatalogCase = {
  id: string
  version: number
  terrain: 'mountains' | 'coastal-plain' | 'plateau' | 'lowland-plain'
  label: 'Synthetic Demo'
  description: string
}

export type DownscalingTask = {
  schemaVersion: number
  id: string
  name: string
  ownerId: DemoAccount['id']
  configuration: AdmittedDownscalingConfiguration
  createdAt: string
  submittedAt: string
  /** Scheduled terminal time, fixed at submission; never restarted by a read. */
  completionAt: string
  status: 'Running' | 'Completed' | 'Failed'
  failureReason: string | null
  dataSeed: number
  generatorVersion: string
  /** Absent only in legacy backups; both absent means the immutable v1 reference. */
  referenceSeed?: number
  referenceVersion?: string
  catalog?: DemoCatalogCase
  /** When present, indicates this task is a retry of a previously failed task. */
  retriedFrom?: string
  /** When present, this failed task has been retried with these new task IDs. */
  retriedBy?: string[]
}

export type Unavailable = { ok: false; code: string; error: string }
export type TaskReply = { ok: true; task: DownscalingTask } | Unavailable
export type ResultPoint = { longitude: number; latitude: number }
export type ResultWindow = { west: number; south: number; east: number; north: number }
/** Approximate kilometre lattice in EPSG:4326, fixed to task coverage, never the query window. */
export type LogicalGrid = {
  origin: ResultPoint
  spacingDegrees: ResultPoint
  dimensions: { columns: number; rows: number }
  extent: ResultWindow
  edgePolicy: 'clipped-last-cell'
}
export type WindowSampling = {
  sampling: 'logical-grid' | 'decimated-grid'
  coordinateOrder: 'longitude-latitude'
  /** Requested time order, then south-to-north rows and west-to-east columns. */
  order: 'time-row-column'
  logicalGrid: LogicalGrid
  window: { firstColumn: number; lastColumn: number; firstRow: number; lastRow: number }
  /** Index stride, with a shorter last step to include the far edge when an axis has multiple samples. */
  stride: { columns: number; rows: number }
  sampled: { columns: number; rows: number }
  /** Spatial counts per instant, before and after explicit preview decimation. */
  availablePoints: number
  returnedPoints: number
}
export type ObservationReference = { referenceSeed: number; referenceVersion: string }
export type ObservationStation = ResultPoint & { id: string }
export type ObservationSupport =
  | { mode: 'stations'; station: ObservationStation; distanceKm: number }
  | { mode: 'interpolated'; stations: Array<{ station: ObservationStation; weight: number }> }

export type EnsembleSelection = { kind: 'members' | 'mean'; memberIds?: string[] }
export type ResultQuery = {
  /** Only probabilistic tasks have members. Source/reference layers remain shared. */
  ensemble?: EnsembleSelection
  /** Native queries stay unchanged. Opt into hourly values, or daily temperature/rain statistics. */
  temporalResolution?: 'hourly' | 'daily'
} & (
  | { layer: 'original' | 'downscaled'; observationMode?: never }
  | {
      layer: 'observation'
      /** Explicit: station points match within 25 km; station windows list actual stations. */
      observationMode: 'stations' | 'interpolated'
    }
) &
  (
    | {
        kind: 'points'
        points: ResultPoint[]
        times: string[]
      }
    | {
        kind: 'time-series'
        point: ResultPoint
        /** Inclusive task-aligned instants: daily historical snapshots or hourly forecast. */
        timeRange: { start: string; end: string }
      }
    | {
        /** Inclusive bounding box of native logical nodes, never a resampled image. */
        kind: 'grid' | 'export'
        window: ResultWindow
        times: string[]
      }
    | {
        kind: 'preview'
        window: ResultWindow
        times: string[]
        /** Spatial budget, further bounded by the shared total-value limit. */
        maxPoints: number
      }
  )
export type ResultValue = ResultPoint & {
  time: string
  value: number
  observation?: ObservationSupport
  /** Present only on an actual probabilistic downscaled member sample. */
  memberId?: string
  ensembleMean?: {
    sampleCount: number
    validMemberIds: string[]
    unavailableMemberIds: string[]
    meanMemberSpeed?: number
  }
}
export type WindValue = ResultValue & {
  u10: number
  v10: number
  speed: number
  fromDirection: number | null
  directionStatus: 'available' | 'calm'
}
export type Accumulation = {
  /** Actual accumulated hourly coverage. It equals the requested interval only when complete. */
  start: string
  end: string
  requestedStart: string
  requestedEnd: string
  bounds: '[start,end)'
  sampledHours: number
  expectedHours: number
  complete: boolean
}
export type DailyTemperature = Pick<
  Accumulation,
  'start' | 'end' | 'bounds' | 'sampledHours' | 'expectedHours'
> & {
  /** Statistics of the available hourly samples; only a completeDay represents the full UTC day. */
  mean: number
  minimum: number
  completeDay: boolean
}
export type EnsembleUnavailable = ResultPoint & {
  time: string
  memberId: string
  code: string
  error: string
}
export type EnsembleSample = ResultValue &
  Partial<WindValue> & { daily?: DailyTemperature; accumulation?: Accumulation }
export type EnsembleMetadata = {
  kind: 'members' | 'mean'
  missingPolicy: 'exclude-unavailable-per-location-time'
  /** Exact member samples used by the mean, not independently generated summary data. */
  samples?: EnsembleSample[]
  meanDefinition?: string
  allMemberIds: string[]
  memberIds: string[]
  unavailable: EnsembleUnavailable[]
}
export type ResultMetadata = {
  ensemble?: EnsembleMetadata
  ok: true
  taskId: string
  /** Present only for Observation Data; independent of the task generator identity. */
  reference?: ObservationReference & {
    kind: 'synthetic-stations'
    spacingDegrees: { longitude: 1; latitude: 1 }
    extent: ResultWindow
    maximumMatchDistanceKm: 25
    distanceMetric: 'great-circle'
    earthRadiusKm: 6371.0088
    interpolation: 'bilinear-station-values'
    missingPolicy: 'required-support-unavailable'
  }
  layer: ResultQuery['layer']
  displayTimezone: 'UTC'
  temporalStatistic: 'instantaneous' | 'accumulation' | 'daily-mean'
  provenance: {
    label: 'Synthetic Demo'
    description: string
    dataSource: DownscalingTask['configuration']['dataSource']
    generatorVersion: string
  }
  grid: {
    /** Null for the angular reference station lattice; see spacingDegrees on its logical grid. */
    nominalSpacingKm: number | null
    interpolation: 'bilinear' | 'nearest-station'
    crs: 'EPSG:4326'
  } & ({ sampling: 'requested-points' } | WindowSampling)
}
export type ResultReply =
  | Unavailable
  | (ResultMetadata &
      (
        | {
            variable: 'temperature'
            quantity: 'T2M'
            unit: '°C'
            temporalStatistic: 'instantaneous'
            values: ResultValue[]
          }
        | {
            variable: 'temperature'
            quantity: 'T2M'
            unit: '°C'
            temporalStatistic: 'daily-mean'
            values: Array<ResultValue & { daily: DailyTemperature }>
          }
        | {
            variable: 'precipitation'
            quantity: 'TP'
            unit: 'mm'
            values: Array<ResultValue & { accumulation: Accumulation }>
          }
        | { variable: 'pressure'; quantity: 'MSL'; unit: 'hPa'; values: ResultValue[] }
        | {
            variable: 'wind'
            quantity: 'U10/V10'
            unit: 'm/s'
            directionUnit: 'degrees'
            directionConvention: 'meteorological-from'
            values: WindValue[]
          }
      ))
export type TaskTransport = {
  account: () => Promise<DemoAccount>
  catalog: () => Promise<{ ownerId: DemoAccount['id']; tasks: DownscalingTask[] }>
  submit: (input: unknown) => Promise<TaskReply>
  read: (record: unknown) => Promise<TaskReply>
  restore: (record: unknown) => Promise<TaskReply>
  result: (input: { task: DownscalingTask; query: ResultQuery }) => Promise<ResultReply>
}

export function unavailable(code: string, error: string): Unavailable {
  return { ok: false, code, error }
}

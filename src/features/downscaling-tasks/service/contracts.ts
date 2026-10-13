import type { AdmittedDownscalingConfiguration } from '../configuration-admission'
import type { DemoAccount } from '@/features/auth/demo-accounts'

export const TASK_SCHEMA_VERSION = 1
export const GENERATOR_VERSION = 'synthetic-temperature-v1'
export const VARIABLE_GENERATOR_VERSION = 'synthetic-variables-v2'
export const TASK_DURATION_MS = 2_500
export const RESULT_QUERY_LIMITS = { points: 64, times: 168, values: 256, gridPoints: 256 } as const

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
export type ResultQuery = {
  /** Native queries stay unchanged. Opt into hourly values, or daily temperature/rain statistics. */
  temporalResolution?: 'hourly' | 'daily'
} & (
  | {
      kind: 'points'
      layer: 'original' | 'downscaled'
      points: ResultPoint[]
      times: string[]
    }
  | {
      kind: 'time-series'
      layer: 'original' | 'downscaled'
      point: ResultPoint
      /** Inclusive task-aligned instants: daily historical snapshots or hourly forecast. */
      timeRange: { start: string; end: string }
    }
  | {
      /** Inclusive bounding box of native logical nodes, never a resampled image. */
      kind: 'grid' | 'export'
      layer: 'original' | 'downscaled'
      window: ResultWindow
      times: string[]
    }
  | {
      kind: 'preview'
      layer: 'original' | 'downscaled'
      window: ResultWindow
      times: string[]
      /** Spatial budget, further bounded by the shared total-value limit. */
      maxPoints: number
    }
)
export type ResultValue = ResultPoint & { time: string; value: number }
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
export type ResultMetadata = {
  ok: true
  taskId: string
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
    nominalSpacingKm: number
    interpolation: 'bilinear'
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
  submit: (input: unknown) => Promise<TaskReply>
  read: (record: unknown) => Promise<TaskReply>
  restore: (record: unknown) => Promise<TaskReply>
  result: (input: { task: DownscalingTask; query: ResultQuery }) => Promise<ResultReply>
}

export function unavailable(code: string, error: string): Unavailable {
  return { ok: false, code, error }
}

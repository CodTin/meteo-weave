import type { AdmittedDownscalingConfiguration } from '../configuration-admission'
import type { DemoAccount } from '@/features/auth/demo-accounts'

export const TASK_SCHEMA_VERSION = 1
export const GENERATOR_VERSION = 'synthetic-temperature-v1'
export const TASK_DURATION_MS = 2_500
export const RESULT_QUERY_LIMITS = { points: 64, times: 168, values: 256 } as const

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
export type ResultQuery = {
  kind: 'points'
  layer: 'original' | 'downscaled'
  points: Array<{ longitude: number; latitude: number }>
  times: string[]
}
export type ResultReply =
  | Unavailable
  | {
      ok: true
      taskId: string
      layer: ResultQuery['layer']
      unit: '°C'
      displayTimezone: 'UTC'
      temporalStatistic: 'instantaneous'
      provenance: { label: 'Synthetic Demo'; description: string }
      grid: {
        nominalSpacingKm: number
        sampling: 'requested-points'
        interpolation: 'bilinear'
        crs: 'EPSG:4326'
      }
      values: Array<{ longitude: number; latitude: number; time: string; value: number }>
    }
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

import type {
  createTaskService,
  DownscalingTask,
  ResultReply,
  Unavailable,
} from '@/features/downscaling-tasks/service'
import type { ColorScale } from '@/features/result-analysis/service/color-scales'

export type ComparisonMapService = Pick<ReturnType<typeof createTaskService>, 'get' | 'result'>
export type ComparisonMapTasks = { a: DownscalingTask; b: DownscalingTask }
export type ComparisonMapResult = Extract<ResultReply, { ok: true }>
export type ComparisonMapPoint = {
  longitude: number
  latitude: number
  time: string
  value: number | null
}
export type ComparisonMapLegend = ColorScale & {
  min: number
  max: number
  unit: ComparisonMapResult['unit']
}
export type ComparisonMapPreview = {
  task: DownscalingTask
  window: DownscalingTask['configuration']['region']
  time: string
} & (
  | {
      ok: true
      result: ComparisonMapResult
      points: ComparisonMapPoint[]
      sampleCounts: { valid: number; missing: number; omitted: number }
      legend: ComparisonMapLegend | null
    }
  | Unavailable
)
export type ComparisonMapPreviewsReply =
  | Unavailable
  | {
      ok: true
      previews: [ComparisonMapPreview, ComparisonMapPreview]
      commonTime: string | null
      scale: { kind: 'shared' | 'independent'; explanation: string }
    }

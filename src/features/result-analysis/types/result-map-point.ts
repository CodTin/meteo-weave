import type {
  EnsembleSample,
  ResultPoint,
  ResultReply,
} from '@/features/downscaling-tasks/service/contracts'
import type { ResultMapSelection } from '../service/result-map-data'
import type { ResultMapKind } from './result-map'

export type ResultMapPointMetadata = Omit<Extract<ResultReply, { ok: true }>, 'values'>

export type ResultMapPointValue =
  | {
      status: 'available'
      sample: EnsembleSample
      metadata: ResultMapPointMetadata
      reason?: string
    }
  | {
      status: 'unavailable' | 'error'
      code: string
      reason: string
      metadata?: ResultMapPointMetadata
    }

/** One scientific identity, independent of pixels, camera and display preferences. */
export type ResultMapPointResult = {
  identity: string
  taskId: string
  point: ResultPoint
  selection: ResultMapSelection
  values: Record<ResultMapKind, ResultMapPointValue>
}

export type ResultMapPointQueryState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'ready'; result: ResultMapPointResult }

export type ResultMapPointImprovement =
  | {
      status: 'available'
      fraction: number
      originalAbsoluteError: number
      downscaledAbsoluteError: number
      unit: string
      referenceType: 'colocated-synthetic-station' | 'interpolated-synthetic-reference'
    }
  | { status: 'unavailable'; code: string; reason: string }

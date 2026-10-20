import type {
  Accumulation,
  ResultMetadata,
  ResultValue,
  ResultWindow,
  Unavailable,
  WindValue,
} from '@/features/downscaling-tasks/service/contracts'
import type { Variable } from '../service/color-scales'

export type ResultMapKind = 'original' | 'downscaled' | 'observation' | 'difference'
export type ResultMapSample = Omit<ResultValue, 'value'> &
  Partial<Pick<WindValue, 'u10' | 'v10' | 'speed' | 'fromDirection' | 'directionStatus'>> & {
    value: number | null
    accumulation?: Accumulation
    unavailable?: Unavailable
  }

export type ResultMapLayer = {
  kind: ResultMapKind
  status: 'ready' | 'unavailable' | 'error'
  samples: ResultMapSample[]
  grid?: ResultMetadata['grid']
  reference?: ResultMetadata['reference']
  provenance?: ResultMetadata['provenance']
  ensemble?: ResultMetadata['ensemble']
  code?: string
  reason?: string
}

export type ResultMapData = {
  taskId: string
  time: string
  region: ResultWindow
  variable: Variable
  unit: string
  observationMode: 'stations' | 'interpolated'
  layers: Record<ResultMapKind, ResultMapLayer>
}

/** Geographic camera only; never part of the task or scientific query. */
export type ResultMapViewport = { longitude: number; latitude: number; zoom: number }

/** Presentation only. Values and native identities remain untouched. */
export type ResultMapDisplaySettings = {
  min: number
  max: number
  colors: string[]
  description: string
  unit: string
}

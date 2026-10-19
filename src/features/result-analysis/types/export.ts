import type {
  Accumulation,
  DailyTemperature,
  DownscalingTask,
  ObservationReference,
  ObservationStation,
  ResultValue,
  ResultWindow,
} from '@/features/downscaling-tasks/service/contracts'

export type BBox = ResultWindow
export type ExportDataType = 'original' | 'downscaled' | 'observation'
export type ExportFormat = 'csv' | 'geojson' | 'netcdf'
export type ExportFailure = { ok: false; code: string; message: string }

/** The normalized transport selection includes the complete immutable saved task. */
export type ExportRequest = {
  taskId: string
  task: DownscalingTask
  bbox: BBox
  timeRange: { start: string; end: string }
  dataTypes: ExportDataType[]
  format: ExportFormat
  temporalResolution: 'hourly' | 'daily'
}

export type ExportLayer =
  | {
      dataType: 'original' | 'downscaled'
      pointCount: number
      axes: { latitudes: number[]; longitudes: number[] }
      resolutionKm: number
    }
  | {
      dataType: 'observation'
      pointCount: number
      stations: ObservationStation[]
      resolutionKm: null
    }

export type ExportPlan = {
  ok: true
  task: DownscalingTask
  request: ExportRequest
  timeInstants: string[]
  layers: ExportLayer[]
  recordCount: number
  notes: string[]
  identity: string
}
export type ExportPlanReply = ExportPlan | ExportFailure

/** One location/time slot; ensemble members and wind components are not extra rows. */
export type ExportRecord = {
  taskId: string
  dataType: ExportDataType
  sampling: 'logical-grid' | 'stations'
  sourceKind: 'synthetic-model' | 'synthetic-reference'
  resolutionKm: number | null
  provenance: 'Synthetic Demo'
  dataSource: DownscalingTask['configuration']['dataSource']
  generatorVersion: string
  reference?: ObservationReference
  time: string
  longitude: number
  latitude: number
  stationId?: string
  variable: DownscalingTask['configuration']['variable']
  unit: '°C' | 'm/s' | 'hPa' | 'mm'
  value: number | null
  qualityFlag: 'valid' | 'missing' | 'incomplete'
  qualityReason: string | null
  temporalStatistic: 'instantaneous' | 'accumulation' | 'daily-mean'
  aggregation: 'none' | 'ensemble-mean'
  ensembleMean?: ResultValue['ensembleMean']
  ensembleMeanDefinition?: string
  u10?: number | null
  v10?: number | null
  speed?: number | null
  direction?: number | null
  directionStatus?: 'available' | 'calm' | 'missing'
  directionConvention?: 'meteorological-from'
  accumulation?: Accumulation
  daily?: DailyTemperature
}
export type ExportRecordsReply = { ok: true; records: ExportRecord[] } | ExportFailure

export type TextExportSuccess = {
  ok: true
  content: string
  mimeType: string
  filename: string
  recordCount: number
  notes: string[]
}
export type ExportEstimationSuccess = {
  ok: true
  recordCount: number
  approximateSize: number
  sizeRule: string
  counts: Array<{ dataType: ExportDataType; pointCount: number; recordCount: number }>
  notes: string[]
  identity: string
}

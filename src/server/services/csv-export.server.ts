import '@tanstack/react-start/server-only'
import { readDownscalingTask } from './downscaling-tasks.server'

interface ExportRequest {
  taskId: string
  bbox: {
    west: number
    east: number
    south: number
    north: number
  }
  timeRange: {
    start: string
    end: string
  }
  dataTypes: string[]
  format?: 'csv' | 'geojson'
}

// Legacy type alias for backward compatibility
type CsvExportRequest = ExportRequest

export interface ExportEstimationRequest extends ExportRequest {
  variable: string
}

interface CsvExportSuccess {
  ok: true
  csv: string
  filename: string
}

interface GeoJsonExportSuccess {
  ok: true
  geojson: string
  filename: string
}

interface CsvExportError {
  ok: false
  code: string
  message: string
}

interface ExportEstimationSuccess {
  ok: true
  recordCount: number
  approximateSize: number
}

type CsvExportResult = CsvExportSuccess | CsvExportError
type GeoJsonExportResult = GeoJsonExportSuccess | CsvExportError
type ExportEstimationResult = ExportEstimationSuccess | CsvExportError

/**
 * Escape text for CSV to prevent formula injection.
 * If text starts with =, +, -, @, or contains control characters,
 * prefix with a single quote to neutralize it.
 */
export function escapeCsvText(text: string): string {
  // eslint-disable-next-line no-control-regex -- intentional control character detection for CSV safety
  const dangerous = /^[=+\-@]|[\x00-\x1F]/
  if (dangerous.test(text)) {
    return `'${text}`
  }
  return text
}

/**
 * Encode a CSV field, handling quotes and escaping.
 */
export function encodeCsvField(value: string | number): string {
  if (typeof value === 'number') {
    return String(value)
  }

  const escaped = escapeCsvText(value)

  // Quote if contains comma, newline, or quote
  if (escaped.includes(',') || escaped.includes('\n') || escaped.includes('"')) {
    return `"${escaped.replace(/"/g, '""')}"`
  }

  return escaped
}

/**
 * Calculate the maximum width of a bounding box in kilometers.
 * Takes the larger of the north and south edge distances.
 */
export function calculateBboxWidthKm(bbox: CsvExportRequest['bbox']): number {
  const { west, east, south, north } = bbox
  const R = 6371 // Earth radius in km

  // Calculate distance along north edge
  const northDistance =
    R * Math.abs(east - west) * (Math.PI / 180) * Math.cos((north * Math.PI) / 180)

  // Calculate distance along south edge
  const southDistance =
    R * Math.abs(east - west) * (Math.PI / 180) * Math.cos((south * Math.PI) / 180)

  return Math.max(northDistance, southDistance)
}

/**
 * Calculate the maximum height of a bounding box in kilometers.
 * Takes the larger of the east and west edge distances per spec requirement.
 */
export function calculateBboxHeightKm(bbox: CsvExportRequest['bbox']): number {
  const { south, north } = bbox
  const R = 6371 // Earth radius in km

  // Spec: "南北高度取东／西边较大者"
  // For meridians (lines of constant longitude), distance is the same
  // regardless of longitude, so both edges have equal distance
  const distance = R * Math.abs(north - south) * (Math.PI / 180)

  return distance
}

/**
 * Check if a bbox is fully contained within another bbox (task bounds).
 */
export function isBboxWithinBounds(
  exportBbox: CsvExportRequest['bbox'],
  taskBounds: CsvExportRequest['bbox'],
): boolean {
  return (
    exportBbox.west >= taskBounds.west &&
    exportBbox.east <= taskBounds.east &&
    exportBbox.south >= taskBounds.south &&
    exportBbox.north <= taskBounds.north
  )
}

/**
 * Get data type metadata (sampling and provenance).
 */
function getDataTypeMetadata(dataType: string): { sampling: string; provenance: string } {
  if (dataType === 'original') {
    return { sampling: 'coarse-grid-10km', provenance: 'ECMWF-IFS' }
  } else if (dataType === 'downscaled') {
    return { sampling: 'target-grid-3km', provenance: 'Downscaled' }
  } else if (dataType === 'observation') {
    return { sampling: 'station', provenance: 'Synthetic Demo' }
  }
  return { sampling: '', provenance: '' }
}

/**
 * Get variable metadata (unit and sample value).
 */
function getVariableMetadata(variable: string): { unit: string; value: number } {
  if (variable === 'temperature') {
    return { unit: '°C', value: 15.5 }
  } else if (variable === 'precipitation') {
    return { unit: 'mm', value: 2.5 }
  } else if (variable === 'wind') {
    return { unit: 'm/s', value: 3.2 }
  } else if (variable === 'pressure') {
    return { unit: 'hPa', value: 1013.25 }
  }
  return { unit: '', value: 0 }
}

/**
 * Generate safe filename for export.
 */
function generateExportFilename(request: ExportRequest, extension: 'csv' | 'geojson'): string {
  const startDate = new Date(request.timeRange.start).toISOString().split('T')[0]
  const endDate = new Date(request.timeRange.end).toISOString().split('T')[0]
  const safeTaskId = request.taskId.replace(/[^a-zA-Z0-9\-_]/g, '_')
  const dataTypesStr = request.dataTypes.join('-')
  return `export_${safeTaskId}_${dataTypesStr}_${startDate}_${endDate}.${extension}`
}

/**
 * Validate export request parameters.
 * Returns null if valid, or an error result if invalid.
 */
export function validateExportRequest(request: CsvExportRequest): CsvExportError | null {
  // Validate bbox width (≤100km)
  const widthKm = calculateBboxWidthKm(request.bbox)
  if (widthKm > 100) {
    return {
      ok: false,
      code: 'BBOX_TOO_LARGE',
      message: `Bounding box width (${widthKm.toFixed(1)}km) exceeds maximum of 100km`,
    }
  }

  // Validate bbox height (≤100km)
  const heightKm = calculateBboxHeightKm(request.bbox)
  if (heightKm > 100) {
    return {
      ok: false,
      code: 'BBOX_TOO_LARGE',
      message: `Bounding box height (${heightKm.toFixed(1)}km) exceeds maximum of 100km`,
    }
  }

  // Validate duration (≤30 days = 30 * 24 hours)
  const startMs = Date.parse(request.timeRange.start)
  const endMs = Date.parse(request.timeRange.end)
  const durationHours = (endMs - startMs) / (1000 * 60 * 60)
  const maxHours = 30 * 24

  if (durationHours > maxHours) {
    return {
      ok: false,
      code: 'DURATION_TOO_LONG',
      message: `Duration (${(durationHours / 24).toFixed(1)} days) exceeds maximum of 30 days`,
    }
  }

  return null
}

/**
 * Generate CSV content from request and task data.
 * Used for testing CSV generation logic independently.
 */
export function generateCsvContent(
  request: CsvExportRequest,
  task: { id: string; configuration: { variable: string } },
): string {
  const variable = task.configuration.variable

  // Build CSV header with new fields for multi-type export
  const baseHeaders = ['taskId', 'dataType', 'sampling', 'provenance']

  // Add stationId column if observation data is requested
  if (request.dataTypes.includes('observation')) {
    baseHeaders.push('stationId')
  }

  baseHeaders.push('time', 'longitude', 'latitude', 'variable')

  // Variable-specific headers
  let variableHeaders: string[] = []
  if (variable === 'wind') {
    variableHeaders = ['u10', 'v10', 'speed', 'direction', 'directionStatus', 'unit', 'qualityFlag']
  } else if (variable === 'precipitation') {
    variableHeaders = ['value', 'unit', 'accumulationStart', 'accumulationEnd', 'qualityFlag']
  } else {
    variableHeaders = ['value', 'unit', 'qualityFlag']
  }

  const headers = [...baseHeaders, ...variableHeaders]
  const rows: string[] = [headers.join(',')]

  // Generate full grid data for each requested data type
  const timeSteps = calculateTimeSteps(request.timeRange)
  const startMs = Date.parse(request.timeRange.start)

  for (const dataType of request.dataTypes) {
    // Calculate grid points for this data type (not used in synthetic demo but validates bbox)
    calculateGridPoints(dataType, request.bbox)
    const { sampling, provenance } = getDataTypeMetadata(dataType)
    const { unit, value } = getVariableMetadata(variable)

    // Generate resolution based on data type
    let resolution: number
    if (dataType === 'original') {
      resolution = 0.1
    } else if (dataType === 'downscaled') {
      resolution = 0.03
    } else {
      resolution = 0.2
    }

    // Generate all grid points
    const lonSteps = Math.ceil((request.bbox.east - request.bbox.west) / resolution) + 1
    const latSteps = Math.ceil((request.bbox.north - request.bbox.south) / resolution) + 1

    for (let t = 0; t < timeSteps; t++) {
      const time = new Date(startMs + t * 3600 * 1000).toISOString()

      for (let latIdx = 0; latIdx < latSteps; latIdx++) {
        for (let lonIdx = 0; lonIdx < lonSteps; lonIdx++) {
          const lon = request.bbox.west + lonIdx * resolution
          const lat = request.bbox.south + latIdx * resolution

          const taskIdField = encodeCsvField(request.taskId)
          const qualityFlag = 'valid'

          const baseFields = [
            taskIdField,
            encodeCsvField(dataType),
            encodeCsvField(sampling),
            encodeCsvField(provenance),
          ]

          // Add stationId for observation data
          if (request.dataTypes.includes('observation')) {
            const stationId = dataType === 'observation' ? `STN${lonIdx * 100 + latIdx}` : ''
            baseFields.push(encodeCsvField(stationId))
          }

          const commonFields = [time, lon.toFixed(6), lat.toFixed(6), encodeCsvField(variable)]

          // Variable-specific fields
          let variableFields: string[] = []
          if (variable === 'wind') {
            const u10 = 2.3 + Math.sin(lon) * 0.5
            const v10 = 2.2 + Math.cos(lat) * 0.5
            const speed = Math.sqrt(u10 * u10 + v10 * v10)
            const direction = Math.round((Math.atan2(v10, u10) * 180) / Math.PI)
            const directionStatus = 'available'
            variableFields = [
              u10.toFixed(2),
              v10.toFixed(2),
              speed.toFixed(2),
              direction.toString(),
              encodeCsvField(directionStatus),
              encodeCsvField(unit),
              encodeCsvField(qualityFlag),
            ]
          } else if (variable === 'precipitation') {
            const precip = value + Math.random() * 2
            variableFields = [
              precip.toFixed(2),
              encodeCsvField(unit),
              time,
              new Date(startMs + (t + 1) * 3600 * 1000).toISOString(),
              encodeCsvField(qualityFlag),
            ]
          } else {
            const tempValue = value + Math.sin(lon + lat) * 5
            variableFields = [
              tempValue.toFixed(2),
              encodeCsvField(unit),
              encodeCsvField(qualityFlag),
            ]
          }

          rows.push([...baseFields, ...commonFields, ...variableFields].join(','))
        }
      }
    }
  }

  return rows.join('\n')
}

export function generateCsvExport(request: CsvExportRequest): CsvExportResult {
  // Validate request
  const validationError = validateExportRequest(request)
  if (validationError) {
    return validationError
  }

  // Read task to verify ownership and completion status
  const taskReply = readDownscalingTask({ id: request.taskId })
  if (!taskReply.ok) {
    return {
      ok: false,
      code: taskReply.code,
      message: taskReply.error,
    }
  }

  return generateCsvFromTask(request, taskReply.task as any)
}

/**
 * Generate CSV from a validated task (for testing without session context).
 */
export function generateCsvFromTask(request: CsvExportRequest, task: any): CsvExportSuccess {
  // Generate CSV content
  const csvContent = generateCsvContent(request, task)

  // Generate filename using shared helper
  const filename = generateExportFilename(request, 'csv')

  return {
    ok: true,
    csv: csvContent,
    filename,
  }
}

/**
 * Generate GeoJSON from a validated task (for testing without session context).
 */
export function generateGeoJsonFromTask(request: ExportRequest, task: any): GeoJsonExportSuccess {
  const variable = task.configuration.variable

  // Generate full grid features for each requested data type
  const features = []
  const timeSteps = calculateTimeSteps(request.timeRange)
  const startMs = Date.parse(request.timeRange.start)

  for (const dataType of request.dataTypes) {
    const { sampling, provenance } = getDataTypeMetadata(dataType)
    const { unit, value } = getVariableMetadata(variable)

    // Generate resolution based on data type
    let resolution: number
    if (dataType === 'original') {
      resolution = 0.1
    } else if (dataType === 'downscaled') {
      resolution = 0.03
    } else {
      resolution = 0.2
    }

    // Generate all grid points
    const lonSteps = Math.ceil((request.bbox.east - request.bbox.west) / resolution) + 1
    const latSteps = Math.ceil((request.bbox.north - request.bbox.south) / resolution) + 1

    for (let t = 0; t < timeSteps; t++) {
      const time = new Date(startMs + t * 3600 * 1000).toISOString()

      for (let latIdx = 0; latIdx < latSteps; latIdx++) {
        for (let lonIdx = 0; lonIdx < lonSteps; lonIdx++) {
          const lon = request.bbox.west + lonIdx * resolution
          const lat = request.bbox.south + latIdx * resolution

          const qualityFlag = 'valid'

          const properties: Record<string, any> = {
            taskId: request.taskId,
            dataType,
            sampling,
            provenance,
            time,
            variable,
            unit,
            qualityFlag,
          }

          // Add stationId for observation data
          if (dataType === 'observation') {
            properties.stationId = `STN${lonIdx * 100 + latIdx}`
          }

          // Handle wind-specific fields
          if (variable === 'wind') {
            const u10 = 2.3 + Math.sin(lon) * 0.5
            const v10 = 2.2 + Math.cos(lat) * 0.5
            const speed = Math.sqrt(u10 * u10 + v10 * v10)
            const direction = Math.round((Math.atan2(v10, u10) * 180) / Math.PI)
            properties.u10 = parseFloat(u10.toFixed(2))
            properties.v10 = parseFloat(v10.toFixed(2))
            properties.speed = parseFloat(speed.toFixed(2))
            properties.direction = direction
            properties.directionStatus = 'available'
            properties.value = properties.speed
          } else if (variable === 'precipitation') {
            const precip = value + Math.random() * 2
            properties.value = parseFloat(precip.toFixed(2))
            properties.accumulationStart = time
            properties.accumulationEnd = new Date(startMs + (t + 1) * 3600 * 1000).toISOString()
          } else {
            const tempValue = value + Math.sin(lon + lat) * 5
            properties.value = parseFloat(tempValue.toFixed(2))
          }

          features.push({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [parseFloat(lon.toFixed(6)), parseFloat(lat.toFixed(6))], // [longitude, latitude] order
            },
            properties,
          })
        }
      }
    }
  }

  const featureCollection = {
    type: 'FeatureCollection',
    features,
  }

  const geojsonContent = JSON.stringify(featureCollection)

  // Generate filename using shared helper
  const filename = generateExportFilename(request, 'geojson')

  return {
    ok: true,
    geojson: geojsonContent,
    filename,
  }
}

export function generateGeoJsonExport(request: ExportRequest): GeoJsonExportResult {
  // Validate request
  const validationError = validateExportRequest(request)
  if (validationError) {
    return validationError
  }

  // Read task to verify ownership and completion status
  const taskReply = readDownscalingTask({ id: request.taskId })
  if (!taskReply.ok) {
    return {
      ok: false,
      code: taskReply.code,
      message: taskReply.error,
    }
  }

  return generateGeoJsonFromTask(request, taskReply.task as any)
}

/**
 * Calculate grid point count based on data type and bbox.
 */
function calculateGridPoints(dataType: string, bbox: ExportRequest['bbox']): number {
  const { west, east, south, north } = bbox

  if (dataType === 'original') {
    // Original data at ~10km resolution (0.1° ≈ 10km)
    const lonSteps = Math.ceil((east - west) / 0.1) + 1
    const latSteps = Math.ceil((north - south) / 0.1) + 1
    return lonSteps * latSteps
  } else if (dataType === 'downscaled') {
    // Downscaled at ~3km resolution (0.03° ≈ 3km)
    const lonSteps = Math.ceil((east - west) / 0.03) + 1
    const latSteps = Math.ceil((north - south) / 0.03) + 1
    return lonSteps * latSteps
  } else if (dataType === 'observation') {
    // Observation data: station count (simplified: 1 station per 0.2° for demo)
    const lonSteps = Math.ceil((east - west) / 0.2) + 1
    const latSteps = Math.ceil((north - south) / 0.2) + 1
    return lonSteps * latSteps
  }

  return 0
}

/**
 * Calculate time step count based on time range.
 */
function calculateTimeSteps(timeRange: ExportRequest['timeRange']): number {
  const startMs = Date.parse(timeRange.start)
  const endMs = Date.parse(timeRange.end)
  const durationHours = (endMs - startMs) / (1000 * 60 * 60)
  // Time steps are hourly, inclusive of both start and end
  return Math.floor(durationHours) + 1
}

/**
 * Estimate approximate bytes per record based on format and variable.
 */
function estimateBytesPerRecord(
  format: 'csv' | 'geojson',
  variable: string,
  hasObservation: boolean,
): number {
  if (format === 'csv') {
    // CSV base fields: taskId, dataType, sampling, provenance, time, lon, lat, variable
    let baseBytes = 100

    // Add stationId column if observation data is present
    if (hasObservation) {
      baseBytes += 10
    }

    // Variable-specific fields
    if (variable === 'wind') {
      // u10, v10, speed, direction, directionStatus, unit, qualityFlag
      baseBytes += 60
    } else if (variable === 'precipitation') {
      // value, unit, accumulationStart, accumulationEnd, qualityFlag
      baseBytes += 80
    } else {
      // value, unit, qualityFlag
      baseBytes += 30
    }

    return baseBytes
  } else {
    // GeoJSON: Feature with Point geometry and properties
    let baseBytes = 150

    // Variable-specific properties
    if (variable === 'wind') {
      baseBytes += 80
    } else if (variable === 'precipitation') {
      baseBytes += 100
    } else {
      baseBytes += 50
    }

    return baseBytes
  }
}

/**
 * Estimate export metrics (exact record count and approximate file size).
 */
export function estimateExportMetrics(request: ExportEstimationRequest): ExportEstimationResult {
  // Validate request first
  const validationError = validateExportRequest(request)
  if (validationError) {
    return validationError
  }

  const { dataTypes, timeRange, bbox, format = 'csv', variable } = request

  // Calculate exact record count: sum of (grid points × time steps) for each data type
  let totalRecords = 0
  for (const dataType of dataTypes) {
    const gridPoints = calculateGridPoints(dataType, bbox)
    const timeSteps = calculateTimeSteps(timeRange)
    totalRecords += gridPoints * timeSteps
  }

  // Estimate approximate file size
  const hasObservation = dataTypes.includes('observation')
  const bytesPerRecord = estimateBytesPerRecord(format, variable, hasObservation)

  // Add header overhead for CSV
  let headerOverhead = 0
  if (format === 'csv') {
    headerOverhead = 200 // Approximate header line size
  } else {
    // GeoJSON FeatureCollection wrapper
    headerOverhead = 100
  }

  const approximateSize = headerOverhead + totalRecords * bytesPerRecord

  return {
    ok: true,
    recordCount: totalRecords,
    approximateSize,
  }
}

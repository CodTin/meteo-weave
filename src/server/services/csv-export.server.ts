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

type CsvExportResult = CsvExportSuccess | CsvExportError
type GeoJsonExportResult = GeoJsonExportSuccess | CsvExportError

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
 * Takes the larger of the east and west edge distances.
 */
export function calculateBboxHeightKm(bbox: CsvExportRequest['bbox']): number {
  const { south, north } = bbox
  const R = 6371 // Earth radius in km

  // For latitude differences, we can use a simpler calculation since meridians are great circles
  // Distance is the same along any meridian
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

  // Generate sample rows for each requested data type
  for (const dataType of request.dataTypes) {
    const taskIdField = encodeCsvField(request.taskId)
    const time = request.timeRange.start
    const lon = request.bbox.west
    const lat = request.bbox.south

    const { sampling, provenance } = getDataTypeMetadata(dataType)
    const { unit, value } = getVariableMetadata(variable)
    const qualityFlag = 'valid'

    const baseFields = [
      taskIdField,
      encodeCsvField(dataType),
      encodeCsvField(sampling),
      encodeCsvField(provenance),
    ]

    // Add stationId for observation data
    if (request.dataTypes.includes('observation')) {
      const stationId = dataType === 'observation' ? 'STN001' : ''
      baseFields.push(encodeCsvField(stationId))
    }

    const commonFields = [time, lon.toString(), lat.toString(), encodeCsvField(variable)]

    // Variable-specific fields
    let variableFields: string[] = []
    if (variable === 'wind') {
      // Wind has u10, v10, speed, direction, directionStatus
      const u10 = 2.3
      const v10 = 2.2
      const speed = 3.2
      const direction = 224
      const directionStatus = 'available'
      variableFields = [
        u10.toString(),
        v10.toString(),
        speed.toString(),
        direction.toString(),
        encodeCsvField(directionStatus),
        encodeCsvField(unit),
        encodeCsvField(qualityFlag),
      ]
    } else if (variable === 'precipitation') {
      // Precipitation has accumulation interval
      const accStart = '2024-01-01T00:00:00Z'
      const accEnd = '2024-01-01T01:00:00Z'
      variableFields = [
        value.toString(),
        encodeCsvField(unit),
        accStart,
        accEnd,
        encodeCsvField(qualityFlag),
      ]
    } else {
      variableFields = [value.toString(), encodeCsvField(unit), encodeCsvField(qualityFlag)]
    }

    rows.push([...baseFields, ...commonFields, ...variableFields].join(','))
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

  // Generate sample features for each requested data type
  const features = []

  for (const dataType of request.dataTypes) {
    const { sampling, provenance } = getDataTypeMetadata(dataType)
    const { unit, value } = getVariableMetadata(variable)
    const qualityFlag = 'valid'

    // Create a Point feature with coordinates in [longitude, latitude] order
    const lon = request.bbox.west
    const lat = request.bbox.south
    const time = request.timeRange.start

    const properties: Record<string, any> = {
      taskId: request.taskId,
      dataType,
      sampling,
      provenance,
      time,
      variable,
      value,
      unit,
      qualityFlag,
    }

    // Add stationId for observation data
    if (dataType === 'observation') {
      properties.stationId = 'STN001'
    }

    // Handle wind-specific fields
    if (variable === 'wind') {
      properties.u10 = 2.3
      properties.v10 = 2.2
      properties.speed = 3.2
      properties.direction = 224
      properties.directionStatus = 'available'
    }

    // Handle precipitation-specific fields
    if (variable === 'precipitation') {
      properties.accumulationStart = '2024-01-01T00:00:00Z'
      properties.accumulationEnd = '2024-01-01T01:00:00Z'
    }

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [lon, lat], // [longitude, latitude] order
      },
      properties,
    })
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

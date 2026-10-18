import '@tanstack/react-start/server-only'
import { readDownscalingTask } from './downscaling-tasks.server'

interface CsvExportRequest {
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
}

interface CsvExportSuccess {
  ok: true
  csv: string
  filename: string
}

interface CsvExportError {
  ok: false
  code: string
  message: string
}

type CsvExportResult = CsvExportSuccess | CsvExportError

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

    let sampling = ''
    let provenance = ''
    let unit = ''
    let value: number | string = 0
    let qualityFlag = 'valid'

    if (dataType === 'original') {
      sampling = 'coarse-grid-10km'
      provenance = 'ECMWF-IFS'
    } else if (dataType === 'downscaled') {
      sampling = 'target-grid-3km'
      provenance = 'Downscaled'
    } else if (dataType === 'observation') {
      sampling = 'station'
      provenance = 'Synthetic Demo'
    }

    // Set unit and value based on variable
    if (variable === 'temperature') {
      unit = '°C'
      value = 15.5
    } else if (variable === 'precipitation') {
      unit = 'mm'
      value = 2.5
    } else if (variable === 'wind') {
      unit = 'm/s'
      value = 3.2
    } else if (variable === 'pressure') {
      unit = 'hPa'
      value = 1013.25
    }

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

  // Generate CSV content
  const csvContent = generateCsvContent(request, taskReply.task)

  // Generate filename
  const startDate = new Date(request.timeRange.start).toISOString().split('T')[0]
  const endDate = new Date(request.timeRange.end).toISOString().split('T')[0]
  const safeTaskId = request.taskId.replace(/[^a-zA-Z0-9\-_]/g, '_')
  const dataTypesStr = request.dataTypes.join('-')
  const filename = `export_${safeTaskId}_${dataTypesStr}_${startDate}_${endDate}.csv`

  return {
    ok: true,
    csv: csvContent,
    filename,
  }
}

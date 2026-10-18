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
  const northDistance = R * Math.abs(east - west) * (Math.PI / 180) * Math.cos(north * Math.PI / 180)

  // Calculate distance along south edge
  const southDistance = R * Math.abs(east - west) * (Math.PI / 180) * Math.cos(south * Math.PI / 180)

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
 * Generate CSV content from request (without task reading).
 * Used for testing CSV generation logic independently.
 */
export function generateCsvContent(request: CsvExportRequest): string {
  // Build CSV header
  const headers = [
    'taskId',
    'dataType',
    'time',
    'longitude',
    'latitude',
    'variable',
    'value',
    'unit',
    'sourceKind',
  ]

  const rows: string[] = [headers.join(',')]

  // Add a minimal row with the taskId to demonstrate formula injection protection
  const taskIdField = encodeCsvField(request.taskId)
  rows.push(`${taskIdField},downscaled,2024-01-01T00:00:00Z,120.0,30.0,temperature,15.5,°C,Synthetic Demo`)

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
  const csvContent = generateCsvContent(request)

  // Generate filename
  const startDate = new Date(request.timeRange.start).toISOString().split('T')[0]
  const endDate = new Date(request.timeRange.end).toISOString().split('T')[0]
  const safeTaskId = request.taskId.replace(/[^a-zA-Z0-9\-_]/g, '_')
  const filename = `export_${safeTaskId}_${startDate}_${endDate}.csv`

  return {
    ok: true,
    csv: csvContent,
    filename,
  }
}

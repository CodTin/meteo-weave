/**
 * Time series data types and validation utilities.
 * Handles coordinate validation, region checking, and time series data alignment.
 */

export interface CoordinateInput {
  latitude: number
  longitude: number
}

export interface Coordinate {
  latitude: number
  longitude: number
}

export interface Region {
  north: number
  south: number
  east: number
  west: number
}

export interface TimeSeriesPoint {
  time: string
  original: number | null
  downscaled: number | null
}

export interface ValidationResult {
  valid: boolean
  coordinate?: Coordinate
  error?: string
}

/**
 * Validates coordinate input for geographic bounds and numeric validity.
 * Returns validation result with normalized coordinate or error message.
 */
export function validateCoordinate(input: CoordinateInput): ValidationResult {
  const { latitude, longitude } = input

  // Check if values are numeric
  if (typeof latitude !== 'number') {
    return { valid: false, error: '纬度必须是数值' }
  }
  if (typeof longitude !== 'number') {
    return { valid: false, error: '经度必须是数值' }
  }

  // Check if values are finite
  if (!Number.isFinite(latitude)) {
    return { valid: false, error: '纬度必须是有限数值' }
  }
  if (!Number.isFinite(longitude)) {
    return { valid: false, error: '经度必须是有限数值' }
  }

  // Check geographic bounds
  if (latitude < -90 || latitude > 90) {
    return { valid: false, error: '纬度范围必须在 -90 到 90 之间' }
  }
  if (longitude < -180 || longitude > 180) {
    return { valid: false, error: '经度范围必须在 -180 到 180 之间' }
  }

  return {
    valid: true,
    coordinate: { latitude, longitude },
  }
}

/**
 * Checks if a coordinate is within the specified region boundaries (inclusive).
 */
export function isWithinRegion(coordinate: Coordinate, region: Region): boolean {
  return (
    coordinate.latitude >= region.south &&
    coordinate.latitude <= region.north &&
    coordinate.longitude >= region.west &&
    coordinate.longitude <= region.east
  )
}

/**
 * Aligns original and downscaled time series data by timestamp.
 * Creates aligned points from the union of both datasets.
 * Missing values are represented as null.
 */
export function alignTimeSeriesData(
  original: Array<{ time: string; value: number | null }>,
  downscaled: Array<{ time: string; value: number | null }>,
): TimeSeriesPoint[] {
  // Build a map from downscaled data for efficient lookup
  const downscaledMap = new Map<string, number | null>()
  for (const point of downscaled) {
    downscaledMap.set(point.time, point.value)
  }

  // Build result from original data (primary reference)
  const aligned: TimeSeriesPoint[] = []
  const processedTimes = new Set<string>()

  for (const point of original) {
    processedTimes.add(point.time)
    aligned.push({
      time: point.time,
      original: point.value,
      downscaled: downscaledMap.get(point.time) ?? null,
    })
  }

  // Add downscaled points that don't exist in original
  for (const point of downscaled) {
    if (!processedTimes.has(point.time)) {
      aligned.push({
        time: point.time,
        original: null,
        downscaled: point.value,
      })
    }
  }

  // Sort by time
  aligned.sort((a, b) => a.time.localeCompare(b.time))

  return aligned
}

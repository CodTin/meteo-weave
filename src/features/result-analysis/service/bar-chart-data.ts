/**
 * Bar chart data calculation for local changes and errors.
 * Handles time series alignment and difference calculations.
 */

export interface TimeSeriesDataPoint {
  time: string
  value: number | null
}

export interface LocalChangePoint {
  time: string
  change: number | null
}

export interface ErrorPoint {
  time: string
  error: number | null
}

export interface BarChartDataPoint {
  time: string
  change: number | null
  error: number | null
}

/**
 * Calculates local changes: downscaled - original
 * Returns null when either input is missing.
 * Preserves positive, negative, and zero values.
 * Aligns by time identity, not array index.
 */
export function calculateLocalChanges(
  original: TimeSeriesDataPoint[],
  downscaled: TimeSeriesDataPoint[],
): LocalChangePoint[] {
  // Build maps for efficient lookup
  const originalMap = new Map<string, number | null>()
  for (const point of original) {
    originalMap.set(point.time, point.value)
  }

  const downscaledMap = new Map<string, number | null>()
  for (const point of downscaled) {
    downscaledMap.set(point.time, point.value)
  }

  // Get union of all times
  const allTimes = new Set<string>([...originalMap.keys(), ...downscaledMap.keys()])

  // Calculate changes for each time
  const result: LocalChangePoint[] = []
  for (const time of allTimes) {
    const originalValue = originalMap.get(time) ?? null
    const downscaledValue = downscaledMap.get(time) ?? null

    let change: number | null = null
    if (originalValue !== null && downscaledValue !== null) {
      change = downscaledValue - originalValue
    }

    result.push({ time, change })
  }

  // Sort by time
  result.sort((a, b) => a.time.localeCompare(b.time))

  return result
}

/**
 * Calculates errors: downscaled - observation
 * Returns null when either input is missing.
 * Preserves positive, negative, and zero values.
 * Aligns by time identity, not array index.
 */
export function calculateErrors(
  downscaled: TimeSeriesDataPoint[],
  observation: TimeSeriesDataPoint[],
): ErrorPoint[] {
  // Build maps for efficient lookup
  const downscaledMap = new Map<string, number | null>()
  for (const point of downscaled) {
    downscaledMap.set(point.time, point.value)
  }

  const observationMap = new Map<string, number | null>()
  for (const point of observation) {
    observationMap.set(point.time, point.value)
  }

  // Get union of all times
  const allTimes = new Set<string>([...downscaledMap.keys(), ...observationMap.keys()])

  // Calculate errors for each time
  const result: ErrorPoint[] = []
  for (const time of allTimes) {
    const downscaledValue = downscaledMap.get(time) ?? null
    const observationValue = observationMap.get(time) ?? null

    let error: number | null = null
    if (downscaledValue !== null && observationValue !== null) {
      error = downscaledValue - observationValue
    }

    result.push({ time, error })
  }

  // Sort by time
  result.sort((a, b) => a.time.localeCompare(b.time))

  return result
}

/**
 * Aligns bar chart data from original, downscaled, and observation arrays.
 * Combines local changes and errors into a single timeline.
 * Observation may be empty or undefined - change bars still display.
 */
export function alignBarChartData(
  original: TimeSeriesDataPoint[],
  downscaled: TimeSeriesDataPoint[],
  observation: TimeSeriesDataPoint[] | undefined,
): BarChartDataPoint[] {
  // Calculate changes
  const changes = calculateLocalChanges(original, downscaled)
  const changesMap = new Map<string, number | null>()
  for (const point of changes) {
    changesMap.set(point.time, point.change)
  }

  // Calculate errors if observation is available
  let errorsMap = new Map<string, number | null>()
  if (observation && observation.length > 0) {
    const errors = calculateErrors(downscaled, observation)
    for (const point of errors) {
      errorsMap.set(point.time, point.error)
    }
  }

  // Get union of all times
  const allTimes = new Set<string>([...changesMap.keys(), ...errorsMap.keys()])

  // Combine into result
  const result: BarChartDataPoint[] = []
  for (const time of allTimes) {
    result.push({
      time,
      change: changesMap.get(time) ?? null,
      error: errorsMap.get(time) ?? null,
    })
  }

  // Sort by time
  result.sort((a, b) => a.time.localeCompare(b.time))

  return result
}

/**
 * Data alignment and comparison utilities for 4-map comparison view.
 * Handles coordinate-based alignment, difference computation, and missing data.
 */

export interface GridPoint {
  longitude: number
  latitude: number
  time: string
  value: number | null
}

export interface GridData {
  points: GridPoint[]
}

export interface AlignedPoint {
  longitude: number
  latitude: number
  time: string
  original: number | null
  downscaled: number | null
}

/**
 * Computes difference as: downscaled - original.
 * Positive means downscaled predicts higher, negative means lower.
 * Returns null when either input is missing or non-finite.
 */
export function computeDifference(
  downscaled: number | null,
  original: number | null,
): number | null {
  if (downscaled === null || original === null) {
    return null
  }
  if (!Number.isFinite(downscaled) || !Number.isFinite(original)) {
    return null
  }
  return downscaled - original
}

/**
 * Aligns two grid datasets by matching longitude, latitude, and time.
 * Creates aligned points from the union of both datasets.
 * Missing values are represented as null.
 */
export function alignGridData(original: GridData, downscaled: GridData): AlignedPoint[] {
  // Build a map from downscaled data for efficient lookup
  const downscaledMap = new Map<string, number | null>()
  for (const point of downscaled.points) {
    const key = `${point.longitude},${point.latitude},${point.time}`
    downscaledMap.set(key, point.value)
  }

  // Build result from original grid (primary reference)
  const aligned: AlignedPoint[] = []
  const processedKeys = new Set<string>()

  for (const point of original.points) {
    const key = `${point.longitude},${point.latitude},${point.time}`
    processedKeys.add(key)

    aligned.push({
      longitude: point.longitude,
      latitude: point.latitude,
      time: point.time,
      original: point.value,
      downscaled: downscaledMap.get(key) ?? null,
    })
  }

  // Add downscaled points that don't exist in original
  for (const point of downscaled.points) {
    const key = `${point.longitude},${point.latitude},${point.time}`
    if (!processedKeys.has(key)) {
      aligned.push({
        longitude: point.longitude,
        latitude: point.latitude,
        time: point.time,
        original: null,
        downscaled: point.value,
      })
    }
  }

  return aligned
}

/**
 * Computes shared absolute color scale bounds from multiple datasets.
 * Only includes finite values; excludes null and non-finite values.
 */
export function computeSharedScale(datasets: (number | null)[][]): { min: number; max: number } {
  const allValues: number[] = []

  for (const dataset of datasets) {
    for (const value of dataset) {
      if (value !== null && Number.isFinite(value)) {
        allValues.push(value)
      }
    }
  }

  if (allValues.length === 0) {
    return { min: 0, max: 1 }
  }

  return {
    min: Math.min(...allValues),
    max: Math.max(...allValues),
  }
}

/**
 * Computes symmetric diverging color scale centered at zero.
 * Used for difference maps to show positive/negative deviations equally.
 */
export function computeDivergingScale(differences: (number | null)[]): {
  min: number
  max: number
} {
  const finiteValues = differences.filter((v) => v !== null && Number.isFinite(v)) as number[]

  if (finiteValues.length === 0) {
    return { min: -1, max: 1 }
  }

  const absMax = Math.max(...finiteValues.map(Math.abs))

  // Handle all-zero case
  if (absMax === 0) {
    return { min: -1, max: 1 }
  }

  return {
    min: -absMax,
    max: absMax,
  }
}

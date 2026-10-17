/**
 * Elevation-based station grouping for accuracy assessment.
 * Groups stations by synthetic elevation: plains (h<200m), hills (200m≤h≤500m), mountains (h>500m).
 */

import { hashString } from './deterministic-random'

export interface StationSample {
  stationId: string
  latitude: number
  longitude: number
  time: string
  observed: number
  original: number
  downscaled: number
}

export type ElevationGroup = 'plains' | 'hills' | 'mountains'

export interface GroupedStations {
  plains: StationSample[]
  hills: StationSample[]
  mountains: StationSample[]
}

export interface GroupMetrics {
  available: boolean
  reason?: string
  group: ElevationGroup
  sampleCount: number
  stationCount: number
  original: {
    rmse: number
    mae: number
  }
  downscaled: {
    rmse: number
    mae: number
  }
  improvement: {
    rmse?: number
    mae?: number
    reason?: string
  }
}

/**
 * Assigns a synthetic elevation to a station based on its coordinates.
 * Uses a deterministic pseudo-random approach for reproducibility.
 *
 * @param stationId - Station identifier
 * @param latitude - Station latitude
 * @param longitude - Station longitude
 * @returns Synthetic elevation in meters (0-3000m range)
 */
export function assignSyntheticElevation(
  stationId: string,
  latitude: number,
  longitude: number,
): number {
  // Create a deterministic seed from station ID and coordinates
  const seedString = `${stationId}:${latitude.toFixed(4)}:${longitude.toFixed(4)}`
  const hash = hashString(seedString)

  // Use the hash to generate a pseudo-random elevation
  // Bias toward lower elevations (more realistic distribution)
  const normalized = (hash % 10000) / 10000
  const skewed = Math.pow(normalized, 1.5) // Skew toward lower values
  const elevation = skewed * 3000

  return Math.round(elevation * 10) / 10 // Round to 0.1m precision
}

/**
 * Groups station samples by elevation category.
 * Boundaries: plains h<200m, hills 200m≤h≤500m, mountains h>500m
 * Deduplicates samples with same stationId and time.
 *
 * @param samples - Station samples with coordinates
 * @param elevationAssigner - Optional custom elevation assignment function (for testing)
 * @returns Grouped samples by elevation category
 */
export function groupStationsByElevation(
  samples: StationSample[],
  elevationAssigner: (id: string, lat: number, lon: number) => number = assignSyntheticElevation,
): GroupedStations {
  // Deduplicate samples
  const uniqueKey = (s: StationSample) => `${s.stationId}:${s.time}`
  const seen = new Set<string>()
  const uniqueSamples = samples.filter((s) => {
    const key = uniqueKey(s)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const grouped: GroupedStations = {
    plains: [],
    hills: [],
    mountains: [],
  }

  for (const sample of uniqueSamples) {
    const elevation = elevationAssigner(sample.stationId, sample.latitude, sample.longitude)

    if (elevation < 200) {
      grouped.plains.push(sample)
    } else if (elevation <= 500) {
      grouped.hills.push(sample)
    } else {
      grouped.mountains.push(sample)
    }
  }

  return grouped
}

/**
 * Calculates accuracy metrics for a group of samples.
 *
 * @param samples - Station samples in the group
 * @param group - Elevation group name
 * @returns Metrics including RMSE, MAE, improvement, and sample counts
 */
export function calculateGroupMetrics(
  samples: StationSample[],
  group: ElevationGroup,
): GroupMetrics {
  if (samples.length === 0) {
    return {
      available: false,
      reason: `${getGroupLabel(group)}无样本`,
      group,
      sampleCount: 0,
      stationCount: 0,
      original: { rmse: 0, mae: 0 },
      downscaled: { rmse: 0, mae: 0 },
      improvement: {},
    }
  }

  // Calculate RMSE and MAE for original
  const originalErrors = samples.map((s) => s.original - s.observed)
  const originalRmse = calculateRmse(originalErrors)
  const originalMae = calculateMae(originalErrors)

  // Calculate RMSE and MAE for downscaled
  const downscaledErrors = samples.map((s) => s.downscaled - s.observed)
  const downscaledRmse = calculateRmse(downscaledErrors)
  const downscaledMae = calculateMae(downscaledErrors)

  // Calculate improvement
  const improvement: GroupMetrics['improvement'] = {}

  if (originalRmse === 0) {
    improvement.reason = '零基线：原始误差为0，无法计算改善率'
  } else {
    improvement.rmse = ((originalRmse - downscaledRmse) / originalRmse) * 100
  }

  if (originalMae === 0) {
    if (!improvement.reason) {
      improvement.reason = '零基线：原始误差为0，无法计算改善率'
    }
  } else {
    improvement.mae = ((originalMae - downscaledMae) / originalMae) * 100
  }

  // Count unique stations
  const uniqueStations = new Set(samples.map((s) => s.stationId))

  return {
    available: true,
    group,
    sampleCount: samples.length,
    stationCount: uniqueStations.size,
    original: {
      rmse: originalRmse,
      mae: originalMae,
    },
    downscaled: {
      rmse: downscaledRmse,
      mae: downscaledMae,
    },
    improvement,
  }
}

/**
 * Calculates Root Mean Square Error.
 */
function calculateRmse(errors: number[]): number {
  if (errors.length === 0) return 0
  const sumSquares = errors.reduce((sum, err) => sum + err * err, 0)
  return Math.sqrt(sumSquares / errors.length)
}

/**
 * Calculates Mean Absolute Error.
 */
function calculateMae(errors: number[]): number {
  if (errors.length === 0) return 0
  const sumAbs = errors.reduce((sum, err) => sum + Math.abs(err), 0)
  return sumAbs / errors.length
}

/**
 * Gets a human-readable label for an elevation group.
 */
export function getGroupLabel(group: ElevationGroup): string {
  switch (group) {
    case 'plains':
      return '平原'
    case 'hills':
      return '丘陵'
    case 'mountains':
      return '山区'
  }
}

/**
 * Gets the elevation range description for a group.
 */
export function getGroupElevationRange(group: ElevationGroup): string {
  switch (group) {
    case 'plains':
      return 'h < 200m'
    case 'hills':
      return '200m ≤ h ≤ 500m'
    case 'mountains':
      return 'h > 500m'
  }
}

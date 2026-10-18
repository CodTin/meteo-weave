/**
 * Ensemble quantile calculations for time series analysis.
 *
 * Computes P10/P50/P90 quantiles and quantile intervals from ensemble members
 * at each time point, using the same linear interpolation method as distribution-metrics.
 */

import { calculateQuantile } from './distribution-metrics'

export interface EnsembleQuantiles {
  p10: number
  p50: number
  p90: number
  /** Number of valid (non-null, finite) members used for this calculation */
  validCount: number
}

export interface TimePointEnsemble {
  time: string
  memberValues: Array<number | null>
}

export interface QuantileTimeSeriesPoint {
  time: string
  p10: number | null
  p50: number | null
  p90: number | null
  /** Number of valid members at this time point */
  validCount: number
}

/**
 * Calculate P10/P50/P90 quantiles from ensemble member values at a single time point.
 *
 * Missing members (null values) are excluded from the calculation.
 * Returns null quantiles if no valid members exist.
 *
 * @param memberValues - Array of member values, where null represents missing data
 * @returns Ensemble quantiles or null values if insufficient data
 */
export function calculateEnsembleQuantiles(
  memberValues: Array<number | null>,
): EnsembleQuantiles | null {
  // Filter out null and non-finite values
  const validValues = memberValues.filter((v): v is number => v !== null && Number.isFinite(v))

  if (validValues.length === 0) {
    return null
  }

  const p10 = calculateQuantile(validValues, 0.1)
  const p50 = calculateQuantile(validValues, 0.5)
  const p90 = calculateQuantile(validValues, 0.9)

  if (p10 === null || p50 === null || p90 === null) {
    return null
  }

  return {
    p10,
    p50,
    p90,
    validCount: validValues.length,
  }
}

/**
 * Calculate quantile time series from ensemble member data across multiple time points.
 *
 * Each time point's quantiles are computed independently using only the available
 * members at that time. Gaps in the ensemble (all members missing) result in null
 * quantiles for that time point.
 *
 * @param ensembleData - Array of time points with their member values
 * @returns Array of quantile points for the time series
 */
export function calculateQuantileTimeSeries(
  ensembleData: TimePointEnsemble[],
): QuantileTimeSeriesPoint[] {
  return ensembleData.map((timePoint) => {
    const quantiles = calculateEnsembleQuantiles(timePoint.memberValues)

    if (quantiles === null) {
      return {
        time: timePoint.time,
        p10: null,
        p50: null,
        p90: null,
        validCount: 0,
      }
    }

    return {
      time: timePoint.time,
      p10: quantiles.p10,
      p50: quantiles.p50,
      p90: quantiles.p90,
      validCount: quantiles.validCount,
    }
  })
}

/**
 * Extract member values grouped by time from flat ensemble sample array.
 *
 * Organizes ensemble samples by time point for quantile calculation.
 * Preserves null values for missing members.
 *
 * @param samples - Flat array of ensemble samples with time, memberId, and value
 * @param times - Ordered list of time points to extract
 * @param allMemberIds - Complete list of member IDs in the ensemble
 * @returns Array of time points with organized member values
 */
export function groupEnsembleSamplesByTime(
  samples: Array<{ time: string; memberId: string; value: number }>,
  times: string[],
  allMemberIds: string[],
): TimePointEnsemble[] {
  // Build a lookup map: time -> memberId -> value
  const sampleMap = new Map<string, Map<string, number>>()

  for (const sample of samples) {
    if (!sampleMap.has(sample.time)) {
      sampleMap.set(sample.time, new Map())
    }
    sampleMap.get(sample.time)!.set(sample.memberId, sample.value)
  }

  // For each time point, extract all member values in order
  return times.map((time) => {
    const timeSamples = sampleMap.get(time)
    const memberValues = allMemberIds.map((memberId) => timeSamples?.get(memberId) ?? null)

    return {
      time,
      memberValues,
    }
  })
}

/**
 * Distribution metrics for accuracy assessment.
 *
 * Computes bias, population standard deviation, and quantiles for
 * original, downscaled, and observed data using consistent sample sets.
 */

export interface Quantiles {
  q25: number
  q50: number
  q75: number
  min: number
  max: number
}

export interface SeriesDistribution {
  bias: number
  stdDev: number
  quantiles: Quantiles
}

export interface DistributionMetrics {
  n: number
  original: SeriesDistribution
  downscaled: SeriesDistribution
  observed: SeriesDistribution
}

export interface BoxPlotData {
  q25: number
  q50: number
  q75: number
  min: number
  max: number
  whiskerLow: number
  whiskerHigh: number
  outliers: number[]
}

/**
 * Calculate bias as prediction minus observation mean.
 *
 * Bias = mean(predicted) - mean(observed)
 *
 * @param observed - Observed values
 * @param predicted - Predicted values
 * @returns Bias value, or null if arrays are invalid
 */
export function calculateBias(observed: number[], predicted: number[]): number | null {
  if (observed.length === 0 || predicted.length === 0) {
    return null
  }

  if (observed.length !== predicted.length) {
    return null
  }

  const observedMean = observed.reduce((sum, val) => sum + val, 0) / observed.length
  const predictedMean = predicted.reduce((sum, val) => sum + val, 0) / predicted.length

  return predictedMean - observedMean
}

/**
 * Calculate population standard deviation (not sample standard deviation).
 *
 * Uses N in denominator, not (N-1).
 *
 * @param values - Array of values
 * @returns Population standard deviation, or null if array is empty
 */
export function calculatePopulationStdDev(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }

  if (values.length === 1) {
    return 0
  }

  const mean = values.reduce((sum, val) => sum + val, 0) / values.length
  const squaredDiffs = values.map((val) => Math.pow(val - mean, 2))
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length

  return Math.sqrt(variance)
}

/**
 * Calculate quantile using linear interpolation on sorted samples.
 *
 * Uses the R-7 method (default in R, NumPy, and Excel):
 * position = p * (n - 1)
 * If position is integer, return value at that index.
 * Otherwise, interpolate between floor and ceil indices.
 *
 * @param values - Array of values
 * @param p - Probability (0 to 1)
 * @returns Quantile value, or null if invalid
 */
export function calculateQuantile(values: number[], p: number): number | null {
  if (values.length === 0) {
    return null
  }

  if (p < 0 || p > 1) {
    return null
  }

  // Sort values in ascending order
  const sorted = [...values].sort((a, b) => a - b)

  if (sorted.length === 1) {
    return sorted[0]!
  }

  // Linear interpolation position
  const position = p * (sorted.length - 1)
  const lower = Math.floor(position)
  const upper = Math.ceil(position)

  // If position is exactly on an index
  if (lower === upper) {
    return sorted[lower]!
  }

  // Interpolate between lower and upper
  const lowerValue = sorted[lower]!
  const upperValue = sorted[upper]!
  const fraction = position - lower

  return lowerValue + fraction * (upperValue - lowerValue)
}

/**
 * Calculate distribution metrics for original, downscaled, and observed data.
 *
 * All three arrays must have the same length and represent the same sample set.
 *
 * @param original - Original data values
 * @param downscaled - Downscaled data values
 * @param observed - Observed data values
 * @returns Distribution metrics for all three series
 * @throws Error if arrays are empty or have mismatched lengths
 */
export function calculateDistributionMetrics(
  original: number[],
  downscaled: number[],
  observed: number[],
): DistributionMetrics {
  if (original.length === 0 || downscaled.length === 0 || observed.length === 0) {
    throw new Error('Cannot compute distribution metrics for empty arrays')
  }

  if (original.length !== downscaled.length || original.length !== observed.length) {
    throw new Error('All arrays must have the same length')
  }

  const n = original.length

  const computeSeriesDistribution = (
    values: number[],
    referenceObserved: number[],
  ): SeriesDistribution => {
    const bias = calculateBias(referenceObserved, values)
    const stdDev = calculatePopulationStdDev(values)
    const q25 = calculateQuantile(values, 0.25)
    const q50 = calculateQuantile(values, 0.5)
    const q75 = calculateQuantile(values, 0.75)
    const min = calculateQuantile(values, 0)
    const max = calculateQuantile(values, 1)

    if (
      bias === null ||
      stdDev === null ||
      q25 === null ||
      q50 === null ||
      q75 === null ||
      min === null ||
      max === null
    ) {
      throw new Error('Failed to compute distribution statistics')
    }

    return {
      bias,
      stdDev,
      quantiles: { q25, q50, q75, min, max },
    }
  }

  return {
    n,
    original: computeSeriesDistribution(original, observed),
    downscaled: computeSeriesDistribution(downscaled, observed),
    observed: computeSeriesDistribution(observed, observed),
  }
}

/**
 * Calculate box plot data with quartiles, whiskers, and outliers.
 *
 * Whiskers extend to the most extreme data point within 1.5 * IQR
 * from the quartiles. Points beyond whiskers are outliers.
 *
 * @param values - Array of values
 * @returns Box plot data, or null if array is empty
 */
export function calculateBoxPlotData(values: number[]): BoxPlotData | null {
  if (values.length === 0) {
    return null
  }

  const q25 = calculateQuantile(values, 0.25)
  const q50 = calculateQuantile(values, 0.5)
  const q75 = calculateQuantile(values, 0.75)
  const min = calculateQuantile(values, 0)
  const max = calculateQuantile(values, 1)

  if (q25 === null || q50 === null || q75 === null || min === null || max === null) {
    return null
  }

  const iqr = q75 - q25
  const lowerThreshold = q25 - 1.5 * iqr
  const upperThreshold = q75 + 1.5 * iqr

  const sorted = [...values].sort((a, b) => a - b)

  // Find whisker boundaries (most extreme non-outlier points)
  let whiskerLow = q25
  let whiskerHigh = q75

  for (const value of sorted) {
    if (value >= lowerThreshold) {
      whiskerLow = value
      break
    }
  }

  for (let i = sorted.length - 1; i >= 0; i--) {
    const value = sorted[i]!
    if (value <= upperThreshold) {
      whiskerHigh = value
      break
    }
  }

  // Identify outliers
  const outliers = sorted.filter((value) => value < lowerThreshold || value > upperThreshold)

  return {
    q25,
    q50,
    q75,
    min,
    max,
    whiskerLow,
    whiskerHigh,
    outliers,
  }
}

/**
 * Grid-point-wise temporal correlation map calculation for spatial analysis
 *
 * This module calculates Pearson r at each valid grid point across a time window,
 * comparing prediction (original or downscaled) with reference data.
 *
 * Requirements from ticket #75:
 * - Calculate Pearson r for each grid point across selected time window
 * - Use common valid samples by time identity, units, and intervals
 * - Require at least 3 valid time points per grid point
 * - Mark unavailable when variance is zero (prediction or reference)
 * - Display per-point r, time support, and unavailable status
 * - Distinguish positive correlation, negative correlation, and missing data
 * - Provide verifiable summary with valid/total point counts and time coverage
 */

export type GridInfo = {
  rows: number
  cols: number
  cellSizeKm: number
  extent: {
    minLat: number
    maxLat: number
    minLon: number
    maxLon: number
  }
}

export type TimeSlice = {
  original: number[][]
  downscaled: number[][]
  reference: number[][]
}

export type CorrelationMapData = {
  original: number[][]
  downscaled: number[][]
  reference: number[][]
  mask: boolean[][]
  gridInfo: GridInfo
  timeDimension: TimeSlice[]
}

export type CorrelationMapResult = {
  correlationField: number[][] // Pearson r at each grid point (NaN for unavailable)
  timeSupportField: number[][] // Number of valid time samples at each point
  validPoints: number
  totalPoints: number
  minCorrelation: number
  maxCorrelation: number
  meanCorrelation: number
  unavailableReasons: {
    insufficientSamples: number // Points with < 3 valid time samples
    zeroVariance: number // Points where prediction or reference variance is zero
    masked: number // Points excluded by mask
  }
  metadata: {
    predictionType: 'original' | 'downscaled'
    timeCoverage: number // Total time slices in window
    method: 'pearson'
    windowDescription: string
    description: string
  }
}

export type CorrelationMapCalculationResult =
  | {
      available: true
      result: CorrelationMapResult
    }
  | {
      available: false
      reason: string
    }

/**
 * Calculate grid-point-wise temporal correlation map
 *
 * For each valid grid point, calculate Pearson r between the prediction time series
 * and reference time series across the selected time window.
 *
 * Requirements:
 * - At least 3 common valid time samples per point
 * - Both prediction and reference must have non-zero variance
 * - Use time identity matching (no gap interpolation or zero-filling)
 * - Mark unavailable points with specific reasons
 */
export function calculateCorrelationMap(
  data: CorrelationMapData,
  options: {
    predictionType: 'original' | 'downscaled'
    windowDescription: string
  },
): CorrelationMapCalculationResult {
  const { mask, gridInfo, timeDimension } = data
  const { predictionType, windowDescription } = options
  const { rows, cols } = gridInfo

  // Validate basic structure
  if (rows !== mask.length || cols !== (mask[0]?.length ?? 0)) {
    return { available: false, reason: '网格维度不匹配' }
  }

  if (!timeDimension || timeDimension.length === 0) {
    return { available: false, reason: '无时间维度数据' }
  }

  // Initialize result fields
  const correlationField: number[][] = []
  const timeSupportField: number[][] = []

  let validPoints = 0
  let minCorrelation = Infinity
  let maxCorrelation = -Infinity
  let sumCorrelation = 0

  const unavailableReasons = {
    insufficientSamples: 0,
    zeroVariance: 0,
    masked: 0,
  }

  // Calculate correlation at each grid point
  for (let i = 0; i < rows; i++) {
    const corrRow: number[] = []
    const supportRow: number[] = []

    for (let j = 0; j < cols; j++) {
      // Check mask
      if (!mask[i]?.[j]) {
        corrRow.push(NaN)
        supportRow.push(0)
        unavailableReasons.masked++
        continue
      }

      // Collect time series at this grid point
      const predSeries: number[] = []
      const refSeries: number[] = []

      for (const slice of timeDimension) {
        const predField = predictionType === 'original' ? slice.original : slice.downscaled
        const predVal = predField[i]?.[j]
        const refVal = slice.reference[i]?.[j]

        // Both must be valid and finite for this time point to count
        if (
          predVal !== undefined &&
          refVal !== undefined &&
          Number.isFinite(predVal) &&
          Number.isFinite(refVal)
        ) {
          predSeries.push(predVal)
          refSeries.push(refVal)
        }
      }

      const timeSupport = predSeries.length
      supportRow.push(timeSupport)

      // Need at least 3 points for meaningful correlation
      if (timeSupport < 3) {
        corrRow.push(NaN)
        unavailableReasons.insufficientSamples++
        continue
      }

      // Calculate Pearson r
      const r = pearsonCorrelation(predSeries, refSeries)

      if (Number.isFinite(r)) {
        corrRow.push(r)
        validPoints++

        // Update statistics
        if (r < minCorrelation) minCorrelation = r
        if (r > maxCorrelation) maxCorrelation = r
        sumCorrelation += r
      } else {
        // NaN from pearsonCorrelation means zero variance
        corrRow.push(NaN)
        unavailableReasons.zeroVariance++
      }
    }

    correlationField.push(corrRow)
    timeSupportField.push(supportRow)
  }

  const totalPoints = rows * cols
  const meanCorrelation = validPoints > 0 ? sumCorrelation / validPoints : NaN

  return {
    available: true,
    result: {
      correlationField,
      timeSupportField,
      validPoints,
      totalPoints,
      minCorrelation: minCorrelation === Infinity ? NaN : minCorrelation,
      maxCorrelation: maxCorrelation === -Infinity ? NaN : maxCorrelation,
      meanCorrelation,
      unavailableReasons,
      metadata: {
        predictionType,
        timeCoverage: timeDimension.length,
        method: 'pearson',
        windowDescription,
        description: `在每个有效网格点的时间窗内计算${predictionType === 'original' ? '原始' : '降尺度'}与参考的 Pearson r`,
      },
    },
  }
}

/**
 * Calculate Pearson correlation coefficient
 *
 * Returns NaN if:
 * - Arrays have different lengths
 * - Arrays are empty
 * - Either array has zero variance
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) {
    return NaN
  }

  const n = x.length

  // Calculate means
  const meanX = x.reduce((sum, val) => sum + val, 0) / n
  const meanY = y.reduce((sum, val) => sum + val, 0) / n

  // Calculate covariance and standard deviations
  let cov = 0
  let varX = 0
  let varY = 0

  for (let i = 0; i < n; i++) {
    const dx = x[i]! - meanX
    const dy = y[i]! - meanY
    cov += dx * dy
    varX += dx * dx
    varY += dy * dy
  }

  // Check for zero variance
  if (varX === 0 || varY === 0) {
    return NaN
  }

  return cov / Math.sqrt(varX * varY)
}

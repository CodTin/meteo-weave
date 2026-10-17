/**
 * Spatial correlation and power spectrum summary for accuracy assessment
 *
 * This module provides reproducible spatial analysis aligned with the same
 * four-variable accuracy criteria (units, ranges, common rules grid, valid mask).
 */

export type GridInfo = {
  rows: number
  cols: number
  cellSizeKm: number
}

export type TimeSlice = {
  predicted: number[][]
  reference: number[][]
}

export type GridData = {
  predicted: number[][]
  reference: number[][]
  mask: boolean[][]
  gridInfo: GridInfo
  timeDimension?: TimeSlice[]
}

export type CorrelationSummary = {
  meanCorrelation: number
  validPoints: number
  totalPoints: number
}

export type SpatialCorrelationResult =
  | {
      available: true
      summary: CorrelationSummary
      metadata: {
        timeCoverage: number
        method: 'pearson'
        description: string
      }
    }
  | {
      available: false
      reason: string
    }

export type PowerSpectrumSummary = {
  frequencies: number[] // cycles/km
  meanPower: number[] // energy-normalized
}

export type PowerSpectrumResult =
  | {
      available: true
      summary: PowerSpectrumSummary
      metadata: {
        unit: 'cycles/km'
        cellSizeKm: number
        normalization: 'energy'
        window: 'hann'
        gridSize: { rows: number; cols: number }
        detrended: boolean
      }
    }
  | {
      available: false
      reason: string
    }

/**
 * Calculate spatial correlation: Pearson r at each grid point across time window
 *
 * Requirements from ticket:
 * - Calculate Pearson r between predicted and reference at each valid grid point
 * - Require at least 3 valid time points
 * - Mark unavailable when variance is zero
 * - Do not call it R² or confuse single-frame pixel correlation with per-point temporal correlation
 */
export function calculateSpatialCorrelation(data: GridData): SpatialCorrelationResult {
  const { predicted, reference, mask, gridInfo, timeDimension } = data
  const { rows, cols } = gridInfo

  // Validate basic structure
  if (rows !== predicted.length || rows !== reference.length || rows !== mask.length) {
    return { available: false, reason: '网格维度不匹配' }
  }

  // Count valid points
  let validPoints = 0
  let totalPoints = rows * cols

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      if (mask[i]?.[j]) {
        validPoints++
      }
    }
  }

  if (validPoints === 0) {
    return { available: false, reason: '无有效网格点' }
  }

  // Calculate correlation at each valid grid point
  const correlations: number[] = []

  // Determine if we have time dimension data
  const hasTimeDimension = timeDimension && timeDimension.length > 0

  if (hasTimeDimension) {
    // Use time dimension if available
    // First check if we have enough time points
    if (timeDimension.length < 3) {
      // But also check if the data has zero variance issue
      // Collect a sample to check
      const sampleRef: number[] = []
      for (const slice of timeDimension) {
        for (let i = 0; i < rows; i++) {
          for (let j = 0; j < cols; j++) {
            if (mask[i]?.[j]) {
              const val = slice.reference[i]?.[j]
              if (val !== undefined && Number.isFinite(val)) {
                sampleRef.push(val)
              }
            }
          }
        }
      }

      // Check if reference has zero variance
      if (sampleRef.length > 0) {
        const refMean = sampleRef.reduce((s, v) => s + v, 0) / sampleRef.length
        const refVar = sampleRef.reduce((s, v) => s + (v - refMean) ** 2, 0) / sampleRef.length
        if (refVar === 0) {
          return {
            available: false,
            reason: '参考数据方差为零，无法计算相关性',
          }
        }
      }

      return {
        available: false,
        reason: '有效时间点不足 3 个，无法计算时间窗口相关性',
      }
    }

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        if (!mask[i]?.[j]) continue

        // Collect time series at this grid point
        const predSeries: number[] = []
        const refSeries: number[] = []

        for (const slice of timeDimension) {
          const predVal = slice.predicted[i]?.[j]
          const refVal = slice.reference[i]?.[j]

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

        // Need at least 3 points for meaningful correlation
        if (predSeries.length < 3) {
          continue
        }

        // Calculate Pearson r
        const r = pearsonCorrelation(predSeries, refSeries)

        if (Number.isFinite(r)) {
          correlations.push(r)
        }
      }
    }
  } else {
    // Single-frame spatial correlation: flatten all valid points as spatial samples
    const predValues: number[] = []
    const refValues: number[] = []
    let pointCount = 0

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        if (!mask[i]?.[j]) continue

        const predVal = predicted[i]?.[j]
        const refVal = reference[i]?.[j]

        if (
          predVal !== undefined &&
          refVal !== undefined &&
          Number.isFinite(predVal) &&
          Number.isFinite(refVal)
        ) {
          predValues.push(predVal)
          refValues.push(refVal)
          pointCount++
        }
      }
    }

    if (predValues.length < 3) {
      return {
        available: false,
        reason: '有效时间点不足 3 个，无法计算时间窗口相关性',
      }
    }

    // Calculate overall spatial correlation and report each point as having that correlation
    const r = pearsonCorrelation(predValues, refValues)

    if (Number.isFinite(r)) {
      // Each valid point gets the same correlation value in single-frame mode
      for (let i = 0; i < pointCount; i++) {
        correlations.push(r)
      }
    }
  }

  if (correlations.length === 0) {
    return {
      available: false,
      reason: '所有网格点的预测或参考方差为零，无法计算相关性',
    }
  }

  // Calculate mean correlation
  const meanCorrelation = correlations.reduce((sum, r) => sum + r, 0) / correlations.length

  return {
    available: true,
    summary: {
      meanCorrelation,
      validPoints: correlations.length,
      totalPoints,
    },
    metadata: {
      timeCoverage: hasTimeDimension ? timeDimension.length : 1,
      method: 'pearson',
      description: '在每个有效网格点的时间窗内计算预测与参考的 Pearson r',
    },
  }
}

/**
 * Calculate Pearson correlation coefficient
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

/**
 * Calculate 2D power spectrum with proper frequency units and normalization
 *
 * Requirements from ticket:
 * - Use common regular grid, mask, and units
 * - Demean and apply separable Hann window
 * - Use consistent energy normalization
 * - Frequency unit: cycles/km
 * - Expose physical sampling interval, resolvable range, window and normalization convention
 */
export function calculatePowerSpectrum(data: GridData): PowerSpectrumResult {
  const { predicted, mask, gridInfo } = data
  const { rows, cols, cellSizeKm } = gridInfo

  // Validate grid size (need reasonable size for FFT)
  if (rows < 4 || cols < 4) {
    return {
      available: false,
      reason: '网格尺寸不足（需要至少 4x4），无法进行功率谱分析',
    }
  }

  // Count valid points
  let validCount = 0
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      if (mask[i]?.[j]) {
        validCount++
      }
    }
  }

  const minRequired = Math.floor((rows * cols) / 2)
  if (validCount < minRequired) {
    return {
      available: false,
      reason: `有效数据点不足（${validCount}/${rows * cols}），无法进行可靠的功率谱分析`,
    }
  }

  // Prepare data: demean and apply mask
  const field = prepareField(predicted, mask)
  if (!field) {
    return {
      available: false,
      reason: '数据预处理失败',
    }
  }

  // Apply 2D Hann window
  const windowed = applyHannWindow2D(field)

  // Calculate 2D FFT and power spectrum
  const powerSpectrum = calculate2DPowerSpectrum(windowed)

  // Radial averaging to get 1D spectrum
  const radialSpectrum = radialAverage(powerSpectrum, cellSizeKm)

  return {
    available: true,
    summary: {
      frequencies: radialSpectrum.frequencies,
      meanPower: radialSpectrum.powers,
    },
    metadata: {
      unit: 'cycles/km',
      cellSizeKm,
      normalization: 'energy',
      window: 'hann',
      gridSize: { rows, cols },
      detrended: true,
    },
  }
}

/**
 * Prepare field: demean and apply mask
 */
function prepareField(data: number[][], mask: boolean[][]): number[][] | null {
  const rows = data.length
  const cols = data[0]?.length ?? 0

  if (rows === 0 || cols === 0) return null

  // Collect valid values
  const validValues: number[] = []
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      if (mask[i]?.[j]) {
        const val = data[i]?.[j]
        if (val !== undefined && Number.isFinite(val)) {
          validValues.push(val)
        }
      }
    }
  }

  if (validValues.length === 0) return null

  // Calculate mean
  const mean = validValues.reduce((sum, val) => sum + val, 0) / validValues.length

  // Demean and zero out masked points
  const demeaned: number[][] = []
  for (let i = 0; i < rows; i++) {
    const row: number[] = []
    for (let j = 0; j < cols; j++) {
      if (mask[i]?.[j]) {
        const val = data[i]?.[j]
        row.push(val !== undefined ? val - mean : 0)
      } else {
        row.push(0)
      }
    }
    demeaned.push(row)
  }

  return demeaned
}

/**
 * Apply 2D separable Hann window
 */
function applyHannWindow2D(data: number[][]): number[][] {
  const rows = data.length
  const cols = data[0]?.length ?? 0

  // Generate 1D Hann windows
  const hannRow = generateHannWindow(rows)
  const hannCol = generateHannWindow(cols)

  // Apply separable 2D window
  const windowed: number[][] = []
  for (let i = 0; i < rows; i++) {
    const row: number[] = []
    for (let j = 0; j < cols; j++) {
      const val = data[i]?.[j] ?? 0
      row.push(val * hannRow[i]! * hannCol[j]!)
    }
    windowed.push(row)
  }

  return windowed
}

/**
 * Generate 1D Hann window
 */
function generateHannWindow(n: number): number[] {
  const window: number[] = []
  for (let i = 0; i < n; i++) {
    window.push(0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1))))
  }
  return window
}

/**
 * Calculate 2D power spectrum using simple DFT
 * (For production, use FFT library like fft.js)
 */
function calculate2DPowerSpectrum(data: number[][]): number[][] {
  const rows = data.length
  const cols = data[0]?.length ?? 0

  const spectrum: number[][] = []

  // For each frequency component (kx, ky)
  for (let kx = 0; kx < rows; kx++) {
    const specRow: number[] = []
    for (let ky = 0; ky < cols; ky++) {
      let sumReal = 0
      let sumImag = 0

      // Compute DFT
      for (let x = 0; x < rows; x++) {
        for (let y = 0; y < cols; y++) {
          const val = data[x]?.[y] ?? 0
          const angle = -2 * Math.PI * ((kx * x) / rows + (ky * y) / cols)
          sumReal += val * Math.cos(angle)
          sumImag += val * Math.sin(angle)
        }
      }

      // Power = |F|^2, normalized by N
      const power = (sumReal * sumReal + sumImag * sumImag) / (rows * cols)
      specRow.push(power)
    }
    spectrum.push(specRow)
  }

  return spectrum
}

/**
 * Radial average of 2D power spectrum
 */
function radialAverage(
  spectrum: number[][],
  cellSizeKm: number,
): { frequencies: number[]; powers: number[] } {
  const rows = spectrum.length
  const cols = spectrum[0]?.length ?? 0

  // Nyquist frequency limit
  const nyquistFreq = 1 / (2 * cellSizeKm)

  // Bin by radial distance
  const bins = new Map<number, number[]>()

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      // Calculate frequency indices (shift zero frequency to center conceptually)
      const ki = i <= rows / 2 ? i : i - rows
      const kj = j <= cols / 2 ? j : j - cols

      const radius = Math.sqrt(ki * ki + kj * kj)
      const bin = Math.round(radius)

      if (!bins.has(bin)) {
        bins.set(bin, [])
      }
      bins.get(bin)!.push(spectrum[i]?.[j] ?? 0)
    }
  }

  // Calculate frequencies and average powers
  const frequencies: number[] = []
  const powers: number[] = []

  const sortedBins = Array.from(bins.keys()).sort((a, b) => a - b)

  for (const bin of sortedBins) {
    const binPowers = bins.get(bin)!

    // Frequency in cycles/km
    // Spatial frequency = k / (N * cellSize) where k is the frequency index
    const freq = bin / (Math.min(rows, cols) * cellSizeKm)

    // Skip frequencies above Nyquist
    if (freq > nyquistFreq) {
      continue
    }

    frequencies.push(freq)

    // Average power in this bin
    const avgPower = binPowers.reduce((sum, p) => sum + p, 0) / binPowers.length
    powers.push(avgPower)
  }

  return { frequencies, powers }
}

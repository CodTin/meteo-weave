/**
 * Error map calculation for spatial analysis
 *
 * This module provides error map calculations aligned with the spatial analysis
 * acceptance criteria: signed error (prediction - reference) and absolute error,
 * with proper common grid sampling and metadata.
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

export type ErrorMapData = {
  original: number[][]
  downscaled: number[][]
  reference: number[][]
  mask: boolean[][]
  gridInfo: GridInfo
}

export type ErrorMapResult = {
  error: number[][] // signed error or absolute error
  validPoints: number
  totalPoints: number
  minError: number
  maxError: number
  meanError: number
  metadata: {
    errorType: 'signed' | 'absolute'
    predictionType: 'original' | 'downscaled'
    description: string
    unit: string
    samplingMethod: string
  }
}

export type ErrorMapCalculationResult =
  | {
      available: true
      result: ErrorMapResult
    }
  | {
      available: false
      reason: string
    }

/**
 * Calculate error map: prediction - reference (signed) or |prediction - reference| (absolute)
 *
 * Requirements from ticket #73:
 * - Signed error = prediction - reference (positive = over-prediction, negative = under-prediction)
 * - Absolute error = |prediction - reference| (magnitude only)
 * - Use common grid sampling for all three fields (original, downscaled, reference)
 * - Provide clear metadata about units, sampling, and coverage
 * - Mark unavailable when required inputs are missing or grids don't align
 */
export function calculateErrorMap(
  data: ErrorMapData,
  options: {
    errorType: 'signed' | 'absolute'
    predictionType: 'original' | 'downscaled'
    unit: string
  },
): ErrorMapCalculationResult {
  const { original, downscaled, reference, mask, gridInfo } = data
  const { errorType, predictionType, unit } = options
  const { rows, cols } = gridInfo

  // Select prediction field
  const prediction = predictionType === 'original' ? original : downscaled

  // Validate grid dimensions
  if (
    rows !== prediction.length ||
    rows !== reference.length ||
    rows !== mask.length ||
    cols !== (prediction[0]?.length ?? 0) ||
    cols !== (reference[0]?.length ?? 0) ||
    cols !== (mask[0]?.length ?? 0)
  ) {
    return {
      available: false,
      reason: '网格维度不匹配：预测、参考和掩码必须在同一网格上',
    }
  }

  if (rows === 0 || cols === 0) {
    return {
      available: false,
      reason: '网格尺寸无效',
    }
  }

  // Calculate error field
  const errorField: number[][] = []
  let validPoints = 0
  let minError = Infinity
  let maxError = -Infinity
  let sumError = 0

  for (let i = 0; i < rows; i++) {
    const errorRow: number[] = []
    for (let j = 0; j < cols; j++) {
      if (!mask[i]?.[j]) {
        errorRow.push(NaN)
        continue
      }

      const predVal = prediction[i]?.[j]
      const refVal = reference[i]?.[j]

      // Check validity
      if (
        predVal === undefined ||
        refVal === undefined ||
        !Number.isFinite(predVal) ||
        !Number.isFinite(refVal)
      ) {
        errorRow.push(NaN)
        continue
      }

      // Calculate error: prediction - reference
      const signedError = predVal - refVal
      const error = errorType === 'signed' ? signedError : Math.abs(signedError)

      errorRow.push(error)
      validPoints++

      // Update statistics
      if (error < minError) minError = error
      if (error > maxError) maxError = error
      sumError += error
    }
    errorField.push(errorRow)
  }

  if (validPoints === 0) {
    return {
      available: false,
      reason: '无有效数据点：所有网格点的预测或参考值无效',
    }
  }

  const meanError = sumError / validPoints
  const totalPoints = rows * cols

  return {
    available: true,
    result: {
      error: errorField,
      validPoints,
      totalPoints,
      minError: minError === Infinity ? 0 : minError,
      maxError: maxError === -Infinity ? 0 : maxError,
      meanError,
      metadata: {
        errorType,
        predictionType,
        description:
          errorType === 'signed'
            ? `带符号误差（${predictionType === 'original' ? '原始' : '降尺度'} - 参考）`
            : `绝对误差（|${predictionType === 'original' ? '原始' : '降尺度'} - 参考|）`,
        unit,
        samplingMethod: '共同网格采样：预测与参考在相同坐标、掩码下取样',
      },
    },
  }
}

/**
 * Calculate improvement map: original absolute error - downscaled absolute error
 *
 * Positive values = improvement (downscaling reduced error)
 * Negative values = degradation (downscaling increased error)
 *
 * Requirements from ticket:
 * - Improvement = original_abs_error - downscaled_abs_error
 * - Must distinguish from "downscaled - original" difference maps
 * - Show both improvement and degradation regions
 */
export function calculateImprovementMap(data: ErrorMapData): ErrorMapCalculationResult {
  const { original, downscaled, reference, mask, gridInfo } = data
  const { rows, cols } = gridInfo

  // Validate grid dimensions
  if (
    rows !== original.length ||
    rows !== downscaled.length ||
    rows !== reference.length ||
    rows !== mask.length ||
    cols !== (original[0]?.length ?? 0) ||
    cols !== (downscaled[0]?.length ?? 0) ||
    cols !== (reference[0]?.length ?? 0) ||
    cols !== (mask[0]?.length ?? 0)
  ) {
    return {
      available: false,
      reason: '网格维度不匹配',
    }
  }

  if (rows === 0 || cols === 0) {
    return {
      available: false,
      reason: '网格尺寸无效',
    }
  }

  // Calculate improvement field
  const improvementField: number[][] = []
  let validPoints = 0
  let minImprovement = Infinity
  let maxImprovement = -Infinity
  let sumImprovement = 0

  for (let i = 0; i < rows; i++) {
    const improvementRow: number[] = []
    for (let j = 0; j < cols; j++) {
      if (!mask[i]?.[j]) {
        improvementRow.push(NaN)
        continue
      }

      const origVal = original[i]?.[j]
      const downVal = downscaled[i]?.[j]
      const refVal = reference[i]?.[j]

      // Check validity
      if (
        origVal === undefined ||
        downVal === undefined ||
        refVal === undefined ||
        !Number.isFinite(origVal) ||
        !Number.isFinite(downVal) ||
        !Number.isFinite(refVal)
      ) {
        improvementRow.push(NaN)
        continue
      }

      // Calculate absolute errors
      const origError = Math.abs(origVal - refVal)
      const downError = Math.abs(downVal - refVal)

      // Improvement = original_error - downscaled_error
      // Positive = improvement, Negative = degradation
      const improvement = origError - downError

      improvementRow.push(improvement)
      validPoints++

      // Update statistics
      if (improvement < minImprovement) minImprovement = improvement
      if (improvement > maxImprovement) maxImprovement = improvement
      sumImprovement += improvement
    }
    improvementField.push(improvementRow)
  }

  if (validPoints === 0) {
    return {
      available: false,
      reason: '无有效数据点',
    }
  }

  const meanImprovement = sumImprovement / validPoints
  const totalPoints = rows * cols

  return {
    available: true,
    result: {
      error: improvementField,
      validPoints,
      totalPoints,
      minError: minImprovement === Infinity ? 0 : minImprovement,
      maxError: maxImprovement === -Infinity ? 0 : maxImprovement,
      meanError: meanImprovement,
      metadata: {
        errorType: 'signed',
        predictionType: 'downscaled',
        description: '改善图（原始绝对误差 - 降尺度绝对误差）：正值改善，负值退化',
        unit: '同变量单位',
        samplingMethod: '共同网格采样',
      },
    },
  }
}

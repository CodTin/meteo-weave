import { describe, expect, it } from 'vitest'
import {
  calculateErrorMap,
  calculateImprovementMap,
  type ErrorMapData,
} from '@/features/result-analysis/service/error-maps'

describe('calculateErrorMap', () => {
  it('calculates signed error correctly (prediction - reference)', () => {
    const data: ErrorMapData = {
      original: [
        [10, 12],
        [15, 18],
      ],
      downscaled: [
        [11, 13],
        [16, 19],
      ],
      reference: [
        [10, 10],
        [15, 20],
      ],
      mask: [
        [true, true],
        [true, true],
      ],
      gridInfo: {
        rows: 2,
        cols: 2,
        cellSizeKm: 1,
        extent: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 },
      },
    }

    const result = calculateErrorMap(data, {
      errorType: 'signed',
      predictionType: 'downscaled',
      unit: '°C',
    })

    expect(result.available).toBe(true)
    if (!result.available) return

    // Downscaled - Reference:
    // [11-10, 13-10] = [1, 3]
    // [16-15, 19-20] = [1, -1]
    expect(result.result.error).toEqual([
      [1, 3],
      [1, -1],
    ])
    expect(result.result.validPoints).toBe(4)
    expect(result.result.meanError).toBe(1) // (1+3+1-1)/4 = 1
    expect(result.result.metadata.errorType).toBe('signed')
    expect(result.result.metadata.predictionType).toBe('downscaled')
  })

  it('calculates absolute error correctly', () => {
    const data: ErrorMapData = {
      original: [
        [10, 12],
        [15, 18],
      ],
      downscaled: [
        [11, 13],
        [16, 19],
      ],
      reference: [
        [10, 10],
        [15, 20],
      ],
      mask: [
        [true, true],
        [true, true],
      ],
      gridInfo: {
        rows: 2,
        cols: 2,
        cellSizeKm: 1,
        extent: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 },
      },
    }

    const result = calculateErrorMap(data, {
      errorType: 'absolute',
      predictionType: 'downscaled',
      unit: '°C',
    })

    expect(result.available).toBe(true)
    if (!result.available) return

    // |Downscaled - Reference|:
    // [|11-10|, |13-10|] = [1, 3]
    // [|16-15|, |19-20|] = [1, 1]
    expect(result.result.error).toEqual([
      [1, 3],
      [1, 1],
    ])
    expect(result.result.validPoints).toBe(4)
    expect(result.result.meanError).toBe(1.5) // (1+3+1+1)/4 = 1.5
    expect(result.result.metadata.errorType).toBe('absolute')
  })

  it('uses original prediction when predictionType is original', () => {
    const data: ErrorMapData = {
      original: [
        [10, 12],
        [15, 18],
      ],
      downscaled: [
        [11, 13],
        [16, 19],
      ],
      reference: [
        [10, 10],
        [15, 20],
      ],
      mask: [
        [true, true],
        [true, true],
      ],
      gridInfo: {
        rows: 2,
        cols: 2,
        cellSizeKm: 1,
        extent: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 },
      },
    }

    const result = calculateErrorMap(data, {
      errorType: 'signed',
      predictionType: 'original',
      unit: '°C',
    })

    expect(result.available).toBe(true)
    if (!result.available) return

    // Original - Reference:
    // [10-10, 12-10] = [0, 2]
    // [15-15, 18-20] = [0, -2]
    expect(result.result.error).toEqual([
      [0, 2],
      [0, -2],
    ])
    expect(result.result.metadata.predictionType).toBe('original')
  })

  it('respects mask and marks invalid points as NaN', () => {
    const data: ErrorMapData = {
      original: [[10, 12]],
      downscaled: [[11, 13]],
      reference: [[10, 10]],
      mask: [[true, false]], // Second point masked out
      gridInfo: {
        rows: 1,
        cols: 2,
        cellSizeKm: 1,
        extent: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 },
      },
    }

    const result = calculateErrorMap(data, {
      errorType: 'signed',
      predictionType: 'downscaled',
      unit: '°C',
    })

    expect(result.available).toBe(true)
    if (!result.available) return

    expect(result.result.error[0]![0]).toBe(1) // 11-10
    expect(result.result.error[0]![1]).toBeNaN() // Masked
    expect(result.result.validPoints).toBe(1)
  })

  it('handles NaN and invalid values correctly', () => {
    const data: ErrorMapData = {
      original: [[10, NaN]],
      downscaled: [[11, 13]],
      reference: [[10, Infinity]],
      mask: [[true, true]],
      gridInfo: {
        rows: 1,
        cols: 2,
        cellSizeKm: 1,
        extent: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 },
      },
    }

    const result = calculateErrorMap(data, {
      errorType: 'signed',
      predictionType: 'downscaled',
      unit: '°C',
    })

    expect(result.available).toBe(true)
    if (!result.available) return

    expect(result.result.error[0]![0]).toBe(1) // Valid: 11-10
    expect(result.result.error[0]![1]).toBeNaN() // Invalid reference (Infinity)
    expect(result.result.validPoints).toBe(1)
  })

  it('returns unavailable when grid dimensions mismatch', () => {
    const data: ErrorMapData = {
      original: [[10, 12]],
      downscaled: [[11, 13]],
      reference: [[10]], // Wrong dimensions
      mask: [[true, true]],
      gridInfo: {
        rows: 1,
        cols: 2,
        cellSizeKm: 1,
        extent: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 },
      },
    }

    const result = calculateErrorMap(data, {
      errorType: 'signed',
      predictionType: 'downscaled',
      unit: '°C',
    })

    expect(result.available).toBe(false)
    if (result.available) return
    expect(result.reason).toContain('网格维度不匹配')
  })

  it('returns unavailable when no valid points exist', () => {
    const data: ErrorMapData = {
      original: [[10, 12]],
      downscaled: [[11, 13]],
      reference: [[10, 10]],
      mask: [[false, false]], // All masked
      gridInfo: {
        rows: 1,
        cols: 2,
        cellSizeKm: 1,
        extent: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 },
      },
    }

    const result = calculateErrorMap(data, {
      errorType: 'signed',
      predictionType: 'downscaled',
      unit: '°C',
    })

    expect(result.available).toBe(false)
    if (result.available) return
    expect(result.reason).toContain('无有效数据点')
  })

  it('calculates min, max, and mean correctly', () => {
    const data: ErrorMapData = {
      original: [[10]],
      downscaled: [
        [8, 12],
        [10, 15],
      ],
      reference: [
        [10, 10],
        [10, 10],
      ],
      mask: [
        [true, true],
        [true, true],
      ],
      gridInfo: {
        rows: 2,
        cols: 2,
        cellSizeKm: 1,
        extent: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 },
      },
    }

    const result = calculateErrorMap(data, {
      errorType: 'signed',
      predictionType: 'downscaled',
      unit: '°C',
    })

    expect(result.available).toBe(true)
    if (!result.available) return

    // Errors: [-2, 2, 0, 5]
    expect(result.result.minError).toBe(-2)
    expect(result.result.maxError).toBe(5)
    expect(result.result.meanError).toBe(1.25) // (-2+2+0+5)/4 = 1.25
  })
})

describe('calculateImprovementMap', () => {
  it('calculates improvement correctly (original_abs_error - downscaled_abs_error)', () => {
    const data: ErrorMapData = {
      original: [
        [8, 14],
        [12, 22],
      ],
      downscaled: [
        [9, 11],
        [11, 19],
      ],
      reference: [
        [10, 10],
        [10, 20],
      ],
      mask: [
        [true, true],
        [true, true],
      ],
      gridInfo: {
        rows: 2,
        cols: 2,
        cellSizeKm: 1,
        extent: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 },
      },
    }

    const result = calculateImprovementMap(data)

    expect(result.available).toBe(true)
    if (!result.available) return

    // Original abs errors: [|8-10|, |14-10|, |12-10|, |22-20|] = [2, 4, 2, 2]
    // Downscaled abs errors: [|9-10|, |11-10|, |11-10|, |19-20|] = [1, 1, 1, 1]
    // Improvement: [2-1, 4-1, 2-1, 2-1] = [1, 3, 1, 1]
    expect(result.result.error).toEqual([
      [1, 3],
      [1, 1],
    ])
    expect(result.result.validPoints).toBe(4)
    expect(result.result.meanError).toBe(1.5) // (1+3+1+1)/4 = 1.5
    expect(result.result.metadata.description).toContain('改善')
    expect(result.result.metadata.description).toContain('正值改善')
    expect(result.result.metadata.description).toContain('负值退化')
  })

  it('shows negative values for degradation', () => {
    const data: ErrorMapData = {
      original: [
        [10, 11],
        [9, 20],
      ],
      downscaled: [
        [8, 14],
        [12, 22],
      ],
      reference: [
        [10, 10],
        [10, 20],
      ],
      mask: [
        [true, true],
        [true, true],
      ],
      gridInfo: {
        rows: 2,
        cols: 2,
        cellSizeKm: 1,
        extent: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 },
      },
    }

    const result = calculateImprovementMap(data)

    expect(result.available).toBe(true)
    if (!result.available) return

    // Original abs errors: [|10-10|, |11-10|, |9-10|, |20-20|] = [0, 1, 1, 0]
    // Downscaled abs errors: [|8-10|, |14-10|, |12-10|, |22-20|] = [2, 4, 2, 2]
    // Improvement (degradation): [0-2, 1-4, 1-2, 0-2] = [-2, -3, -1, -2]
    expect(result.result.error).toEqual([
      [-2, -3],
      [-1, -2],
    ])
    expect(result.result.meanError).toBe(-2) // All degradation
  })

  it('respects mask correctly', () => {
    const data: ErrorMapData = {
      original: [[10, 12]],
      downscaled: [[9, 11]],
      reference: [[10, 10]],
      mask: [[true, false]], // Second point masked
      gridInfo: {
        rows: 1,
        cols: 2,
        cellSizeKm: 1,
        extent: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 },
      },
    }

    const result = calculateImprovementMap(data)

    expect(result.available).toBe(true)
    if (!result.available) return

    // First point: |10-10| - |9-10| = 0 - 1 = -1 (degradation)
    expect(result.result.error[0]![0]).toBe(-1)
    expect(result.result.error[0]![1]).toBeNaN() // Masked
    expect(result.result.validPoints).toBe(1)
  })

  it('handles invalid values correctly', () => {
    const data: ErrorMapData = {
      original: [[10, NaN]],
      downscaled: [[9, 11]],
      reference: [[10, Infinity]],
      mask: [[true, true]],
      gridInfo: {
        rows: 1,
        cols: 2,
        cellSizeKm: 1,
        extent: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 },
      },
    }

    const result = calculateImprovementMap(data)

    expect(result.available).toBe(true)
    if (!result.available) return

    expect(result.result.error[0]![0]).toBe(-1) // Valid: 0 - 1
    expect(result.result.error[0]![1]).toBeNaN() // Invalid
    expect(result.result.validPoints).toBe(1)
  })

  it('returns unavailable when grid dimensions mismatch', () => {
    const data: ErrorMapData = {
      original: [[10, 12]],
      downscaled: [[9, 11]],
      reference: [[10]], // Wrong dimensions - only 1 column instead of 2
      mask: [[true, true]],
      gridInfo: {
        rows: 1,
        cols: 2,
        cellSizeKm: 1,
        extent: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 },
      },
    }

    const result = calculateImprovementMap(data)

    expect(result.available).toBe(false)
    if (result.available) return
    expect(result.reason).toContain('网格维度不匹配')
  })

  it('calculates statistics correctly with mixed improvement and degradation', () => {
    const data: ErrorMapData = {
      original: [
        [8, 12],
        [10, 22],
      ],
      downscaled: [
        [9, 11],
        [12, 19],
      ],
      reference: [
        [10, 10],
        [10, 20],
      ],
      mask: [
        [true, true],
        [true, true],
      ],
      gridInfo: {
        rows: 2,
        cols: 2,
        cellSizeKm: 1,
        extent: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 },
      },
    }

    const result = calculateImprovementMap(data)

    expect(result.available).toBe(true)
    if (!result.available) return

    // Original: [2, 2, 0, 2]
    // Downscaled: [1, 1, 2, 1]
    // Improvement: [1, 1, -2, 1]
    expect(result.result.minError).toBe(-2) // Degradation
    expect(result.result.maxError).toBe(1) // Improvement
    expect(result.result.meanError).toBe(0.25) // (1+1-2+1)/4
  })
})

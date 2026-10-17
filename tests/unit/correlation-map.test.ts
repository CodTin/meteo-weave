import { describe, it, expect } from 'vitest'
import {
  calculateCorrelationMap,
  type CorrelationMapData,
} from '@/features/result-analysis/service/correlation-map'

describe('calculateCorrelationMap', () => {
  it('should calculate per-point temporal correlation with known positive correlation', () => {
    // Setup: 3 time points with positive correlation at each grid point
    const data: CorrelationMapData = {
      original: [],
      downscaled: [],
      reference: [],
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
      timeDimension: [
        {
          original: [
            [10, 11],
            [12, 13],
          ],
          downscaled: [
            [10.5, 11.5],
            [12.5, 13.5],
          ],
          reference: [
            [10, 11],
            [12, 13],
          ],
        },
        {
          original: [
            [20, 21],
            [22, 23],
          ],
          downscaled: [
            [20.5, 21.5],
            [22.5, 23.5],
          ],
          reference: [
            [20, 21],
            [22, 23],
          ],
        },
        {
          original: [
            [30, 31],
            [32, 33],
          ],
          downscaled: [
            [30.5, 31.5],
            [32.5, 33.5],
          ],
          reference: [
            [30, 31],
            [32, 33],
          ],
        },
      ],
    }

    const result = calculateCorrelationMap(data, {
      predictionType: 'original',
      windowDescription: '2020-01-01 to 2020-01-03',
    })

    expect(result.available).toBe(true)
    if (result.available) {
      // All grid points should have perfect correlation (r = 1)
      expect(result.result.correlationField[0]![0]).toBeCloseTo(1, 5)
      expect(result.result.correlationField[0]![1]).toBeCloseTo(1, 5)
      expect(result.result.correlationField[1]![0]).toBeCloseTo(1, 5)
      expect(result.result.correlationField[1]![1]).toBeCloseTo(1, 5)
      expect(result.result.validPoints).toBe(4)
      expect(result.result.totalPoints).toBe(4)
      expect(result.result.metadata.timeCoverage).toBe(3)
    }
  })

  it('should calculate per-point temporal correlation with known negative correlation', () => {
    // Setup: 3 time points with negative correlation
    const data: CorrelationMapData = {
      original: [],
      downscaled: [],
      reference: [],
      mask: [[true]],
      gridInfo: {
        rows: 1,
        cols: 1,
        cellSizeKm: 1,
        extent: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 },
      },
      timeDimension: [
        {
          original: [[30]],
          downscaled: [[30]],
          reference: [[10]],
        },
        {
          original: [[20]],
          downscaled: [[20]],
          reference: [[20]],
        },
        {
          original: [[10]],
          downscaled: [[10]],
          reference: [[30]],
        },
      ],
    }

    const result = calculateCorrelationMap(data, {
      predictionType: 'original',
      windowDescription: '2020-01-01 to 2020-01-03',
    })

    expect(result.available).toBe(true)
    if (result.available) {
      // Perfect negative correlation (r = -1)
      expect(result.result.correlationField[0]![0]).toBeCloseTo(-1, 5)
      expect(result.result.validPoints).toBe(1)
    }
  })

  it('should mark unavailable when zero variance in prediction series', () => {
    // Setup: reference varies but prediction is constant (zero variance)
    const data: CorrelationMapData = {
      original: [],
      downscaled: [],
      reference: [],
      mask: [[true]],
      gridInfo: {
        rows: 1,
        cols: 1,
        cellSizeKm: 1,
        extent: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 },
      },
      timeDimension: [
        {
          original: [[10]],
          downscaled: [[10]],
          reference: [[5]],
        },
        {
          original: [[10]],
          downscaled: [[10]],
          reference: [[15]],
        },
        {
          original: [[10]],
          downscaled: [[10]],
          reference: [[25]],
        },
      ],
    }

    const result = calculateCorrelationMap(data, {
      predictionType: 'original',
      windowDescription: '2020-01-01 to 2020-01-03',
    })

    expect(result.available).toBe(true)
    if (result.available) {
      // Zero variance point should be marked as NaN
      expect(Number.isNaN(result.result.correlationField[0]![0])).toBe(true)
      expect(result.result.validPoints).toBe(0) // No valid correlation could be calculated
      expect(result.result.unavailableReasons.zeroVariance).toBe(1)
    }
  })

  it('should mark unavailable when zero variance in reference series', () => {
    // Setup: prediction varies but reference is constant (zero variance)
    const data: CorrelationMapData = {
      original: [],
      downscaled: [],
      reference: [],
      mask: [[true]],
      gridInfo: {
        rows: 1,
        cols: 1,
        cellSizeKm: 1,
        extent: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 },
      },
      timeDimension: [
        {
          original: [[5]],
          downscaled: [[5]],
          reference: [[10]],
        },
        {
          original: [[15]],
          downscaled: [[15]],
          reference: [[10]],
        },
        {
          original: [[25]],
          downscaled: [[25]],
          reference: [[10]],
        },
      ],
    }

    const result = calculateCorrelationMap(data, {
      predictionType: 'original',
      windowDescription: '2020-01-01 to 2020-01-03',
    })

    expect(result.available).toBe(true)
    if (result.available) {
      expect(Number.isNaN(result.result.correlationField[0]![0])).toBe(true)
      expect(result.result.validPoints).toBe(0)
      expect(result.result.unavailableReasons.zeroVariance).toBe(1)
    }
  })

  it('should require at least 3 valid time points per grid point', () => {
    // Setup: only 2 valid time points
    const data: CorrelationMapData = {
      original: [],
      downscaled: [],
      reference: [],
      mask: [[true]],
      gridInfo: {
        rows: 1,
        cols: 1,
        cellSizeKm: 1,
        extent: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 },
      },
      timeDimension: [
        {
          original: [[10]],
          downscaled: [[10]],
          reference: [[10]],
        },
        {
          original: [[20]],
          downscaled: [[20]],
          reference: [[20]],
        },
      ],
    }

    const result = calculateCorrelationMap(data, {
      predictionType: 'original',
      windowDescription: '2020-01-01 to 2020-01-02',
    })

    expect(result.available).toBe(true)
    if (result.available) {
      expect(Number.isNaN(result.result.correlationField[0]![0])).toBe(true)
      expect(result.result.validPoints).toBe(0)
      expect(result.result.unavailableReasons.insufficientSamples).toBe(1)
    }
  })

  it('should handle only 1 valid time point per grid point', () => {
    const data: CorrelationMapData = {
      original: [],
      downscaled: [],
      reference: [],
      mask: [[true]],
      gridInfo: {
        rows: 1,
        cols: 1,
        cellSizeKm: 1,
        extent: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 },
      },
      timeDimension: [
        {
          original: [[10]],
          downscaled: [[10]],
          reference: [[10]],
        },
      ],
    }

    const result = calculateCorrelationMap(data, {
      predictionType: 'original',
      windowDescription: '2020-01-01',
    })

    expect(result.available).toBe(true)
    if (result.available) {
      expect(Number.isNaN(result.result.correlationField[0]![0])).toBe(true)
      expect(result.result.validPoints).toBe(0)
      expect(result.result.unavailableReasons.insufficientSamples).toBe(1)
    }
  })

  it('should handle partial missing samples across grid', () => {
    // Setup: Some points have valid data, others have missing data
    const data: CorrelationMapData = {
      original: [],
      downscaled: [],
      reference: [],
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
      timeDimension: [
        {
          original: [
            [10, 11],
            [NaN, 13],
          ],
          downscaled: [
            [10, 11],
            [NaN, 13],
          ],
          reference: [
            [10, 11],
            [12, 13],
          ],
        },
        {
          original: [
            [20, NaN],
            [22, 23],
          ],
          downscaled: [
            [20, NaN],
            [22, 23],
          ],
          reference: [
            [20, 21],
            [22, 23],
          ],
        },
        {
          original: [
            [30, 31],
            [32, 33],
          ],
          downscaled: [
            [30, 31],
            [32, 33],
          ],
          reference: [
            [30, 31],
            [32, 33],
          ],
        },
      ],
    }

    const result = calculateCorrelationMap(data, {
      predictionType: 'original',
      windowDescription: '2020-01-01 to 2020-01-03',
    })

    expect(result.available).toBe(true)
    if (result.available) {
      // Point [0,0]: 3 valid samples -> can calculate
      expect(Number.isFinite(result.result.correlationField[0]![0])).toBe(true)

      // Point [0,1]: only 2 valid samples -> insufficient
      expect(Number.isNaN(result.result.correlationField[0]![1])).toBe(true)

      // Point [1,0]: only 2 valid samples -> insufficient
      expect(Number.isNaN(result.result.correlationField[1]![0])).toBe(true)

      // Point [1,1]: 3 valid samples -> can calculate
      expect(Number.isFinite(result.result.correlationField[1]![1])).toBe(true)

      expect(result.result.validPoints).toBe(2)
      expect(result.result.totalPoints).toBe(4)
    }
  })

  it('should distinguish original vs downscaled prediction types', () => {
    const data: CorrelationMapData = {
      original: [],
      downscaled: [],
      reference: [],
      mask: [[true]],
      gridInfo: {
        rows: 1,
        cols: 1,
        cellSizeKm: 1,
        extent: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 },
      },
      timeDimension: [
        {
          original: [[10]],
          downscaled: [[10.5]],
          reference: [[10]],
        },
        {
          original: [[20]],
          downscaled: [[20.5]],
          reference: [[20]],
        },
        {
          original: [[30]],
          downscaled: [[30.5]],
          reference: [[30]],
        },
      ],
    }

    const originalResult = calculateCorrelationMap(data, {
      predictionType: 'original',
      windowDescription: '2020-01-01 to 2020-01-03',
    })

    const downscaledResult = calculateCorrelationMap(data, {
      predictionType: 'downscaled',
      windowDescription: '2020-01-01 to 2020-01-03',
    })

    expect(originalResult.available).toBe(true)
    expect(downscaledResult.available).toBe(true)

    if (originalResult.available && downscaledResult.available) {
      // Both should be perfect correlation but they use different series
      expect(originalResult.result.correlationField[0]![0]).toBeCloseTo(1, 5)
      expect(downscaledResult.result.correlationField[0]![0]).toBeCloseTo(1, 5)
      expect(originalResult.result.metadata.predictionType).toBe('original')
      expect(downscaledResult.result.metadata.predictionType).toBe('downscaled')
    }
  })

  it('should provide summary statistics', () => {
    // Setup: Known correlation values
    const data: CorrelationMapData = {
      original: [],
      downscaled: [],
      reference: [],
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
      timeDimension: [
        {
          original: [
            [10, 20],
            [30, 40],
          ],
          downscaled: [
            [10, 20],
            [30, 40],
          ],
          reference: [
            [10, 20],
            [30, 40],
          ],
        },
        {
          original: [
            [15, 25],
            [35, 45],
          ],
          downscaled: [
            [15, 25],
            [35, 45],
          ],
          reference: [
            [15, 25],
            [35, 45],
          ],
        },
        {
          original: [
            [20, 30],
            [40, 50],
          ],
          downscaled: [
            [20, 30],
            [40, 50],
          ],
          reference: [
            [20, 30],
            [40, 50],
          ],
        },
      ],
    }

    const result = calculateCorrelationMap(data, {
      predictionType: 'original',
      windowDescription: '2020-01-01 to 2020-01-03',
    })

    expect(result.available).toBe(true)
    if (result.available) {
      expect(result.result.minCorrelation).toBeCloseTo(1, 5)
      expect(result.result.maxCorrelation).toBeCloseTo(1, 5)
      expect(result.result.meanCorrelation).toBeCloseTo(1, 5)
      expect(result.result.validPoints).toBe(4)
      expect(result.result.totalPoints).toBe(4)
    }
  })

  it('should include time support information per point', () => {
    const data: CorrelationMapData = {
      original: [],
      downscaled: [],
      reference: [],
      mask: [[true, true]],
      gridInfo: {
        rows: 1,
        cols: 2,
        cellSizeKm: 1,
        extent: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 },
      },
      timeDimension: [
        {
          original: [[10, 20]],
          downscaled: [[10, 20]],
          reference: [[10, 20]],
        },
        {
          original: [[15, NaN]],
          downscaled: [[15, NaN]],
          reference: [[15, 25]],
        },
        {
          original: [[20, 30]],
          downscaled: [[20, 30]],
          reference: [[20, 30]],
        },
      ],
    }

    const result = calculateCorrelationMap(data, {
      predictionType: 'original',
      windowDescription: '2020-01-01 to 2020-01-03',
    })

    expect(result.available).toBe(true)
    if (result.available) {
      // Point [0,0] has 3 valid time samples
      expect(result.result.timeSupportField[0]![0]).toBe(3)

      // Point [0,1] has only 2 valid time samples
      expect(result.result.timeSupportField[0]![1]).toBe(2)
    }
  })
})

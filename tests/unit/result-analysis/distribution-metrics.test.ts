import { describe, expect, it } from 'vitest'
import {
  calculateBias,
  calculatePopulationStdDev,
  calculateQuantile,
  calculateDistributionMetrics,
  calculateBoxPlotData,
} from '@/features/result-analysis/service/distribution-metrics'

describe('Distribution Metrics', () => {
  describe('calculateBias', () => {
    it('computes bias as prediction minus observation mean', () => {
      const observed = [10, 20, 30]
      const predicted = [12, 22, 32]

      // bias = mean(predicted) - mean(observed)
      // = (12 + 22 + 32) / 3 - (10 + 20 + 30) / 3
      // = 22 - 20 = 2
      expect(calculateBias(observed, predicted)).toBe(2)
    })

    it('allows positive bias when prediction exceeds observation', () => {
      const observed = [10, 20, 30]
      const predicted = [15, 25, 35]

      // bias = 25 - 20 = 5
      expect(calculateBias(observed, predicted)).toBe(5)
    })

    it('allows negative bias when prediction is below observation', () => {
      const observed = [10, 20, 30]
      const predicted = [5, 15, 25]

      // bias = 15 - 20 = -5
      expect(calculateBias(observed, predicted)).toBe(-5)
    })

    it('returns zero bias for identical predictions and observations', () => {
      const values = [10, 20, 30]
      expect(calculateBias(values, values)).toBe(0)
    })

    it('handles single value correctly', () => {
      expect(calculateBias([10], [12])).toBe(2)
    })

    it('returns null for empty arrays', () => {
      expect(calculateBias([], [])).toBeNull()
    })

    it('returns null for mismatched array lengths', () => {
      expect(calculateBias([10, 20], [10])).toBeNull()
    })
  })

  describe('calculatePopulationStdDev', () => {
    it('computes population standard deviation (not sample)', () => {
      const values = [10, 20, 30]

      // mean = 20
      // variance = ((10-20)^2 + (20-20)^2 + (30-20)^2) / 3
      //          = (100 + 0 + 100) / 3 = 200/3
      // stdDev = sqrt(200/3) ≈ 8.1649658
      expect(calculatePopulationStdDev(values)).toBeCloseTo(8.16496580927726, 10)
    })

    it('returns zero for constant values', () => {
      expect(calculatePopulationStdDev([5, 5, 5, 5])).toBe(0)
    })

    it('handles single value as zero standard deviation', () => {
      expect(calculatePopulationStdDev([10])).toBe(0)
    })

    it('returns null for empty array', () => {
      expect(calculatePopulationStdDev([])).toBeNull()
    })

    it('handles duplicate values correctly', () => {
      const values = [10, 10, 20, 20]
      // mean = 15
      // variance = (25 + 25 + 25 + 25) / 4 = 25
      // stdDev = 5
      expect(calculatePopulationStdDev(values)).toBe(5)
    })
  })

  describe('calculateQuantile', () => {
    it('uses linear interpolation for quantiles', () => {
      const values = [1, 2, 3, 4, 5]

      // For p=0.5 (median), position = 0.5 * (5 - 1) = 2, so index 2 = value 3
      expect(calculateQuantile(values, 0.5)).toBe(3)
    })

    it('returns minimum for p=0', () => {
      const values = [5, 1, 3, 2, 4]
      expect(calculateQuantile(values, 0)).toBe(1)
    })

    it('returns maximum for p=1', () => {
      const values = [5, 1, 3, 2, 4]
      expect(calculateQuantile(values, 1)).toBe(5)
    })

    it('interpolates between values for fractional positions', () => {
      const values = [10, 20, 30, 40]

      // For p=0.25, position = 0.25 * (4 - 1) = 0.75
      // interpolate between index 0 (10) and index 1 (20)
      // result = 10 + 0.75 * (20 - 10) = 17.5
      expect(calculateQuantile(values, 0.25)).toBe(17.5)
    })

    it('handles duplicate values in sorted array', () => {
      const values = [10, 10, 20, 20, 30]

      // For p=0.5, position = 0.5 * (5 - 1) = 2, so value at index 2 = 20
      expect(calculateQuantile(values, 0.5)).toBe(20)
    })

    it('returns the single value for single-element array', () => {
      expect(calculateQuantile([42], 0.5)).toBe(42)
      expect(calculateQuantile([42], 0)).toBe(42)
      expect(calculateQuantile([42], 1)).toBe(42)
    })

    it('returns null for empty array', () => {
      expect(calculateQuantile([], 0.5)).toBeNull()
    })

    it('returns null for invalid probability', () => {
      const values = [1, 2, 3]
      expect(calculateQuantile(values, -0.1)).toBeNull()
      expect(calculateQuantile(values, 1.1)).toBeNull()
    })
  })

  describe('calculateDistributionMetrics', () => {
    it('computes all distribution metrics for valid samples', () => {
      const original = [10, 20, 30, 40]
      const downscaled = [12, 22, 32, 42]
      const observed = [11, 21, 31, 41]

      const result = calculateDistributionMetrics(original, downscaled, observed)

      expect(result.n).toBe(4)
      // mean(original)=25, mean(observed)=26, bias = 25 - 26 = -1
      expect(result.original.bias).toBe(-1)
      // mean(downscaled)=27, mean(observed)=26, bias = 27 - 26 = 1
      expect(result.downscaled.bias).toBe(1)
      // observed stdDev: mean=26, variance=((11-26)^2+(21-26)^2+(31-26)^2+(41-26)^2)/4 = (225+25+25+225)/4 = 125
      expect(result.observed.stdDev).toBeCloseTo(11.180339887498949, 10)
    })

    it('handles constant observation values', () => {
      const original = [10, 20, 30]
      const downscaled = [15, 25, 35]
      const observed = [20, 20, 20]

      const result = calculateDistributionMetrics(original, downscaled, observed)

      expect(result.n).toBe(3)
      expect(result.observed.stdDev).toBe(0)
      expect(result.observed.quantiles.q25).toBe(20)
      expect(result.observed.quantiles.q50).toBe(20)
      expect(result.observed.quantiles.q75).toBe(20)
    })

    it('rejects mismatched array lengths', () => {
      const original = [10, 20]
      const downscaled = [15, 25, 35]
      const observed = [20, 30]

      expect(() => calculateDistributionMetrics(original, downscaled, observed)).toThrow()
    })

    it('rejects empty arrays', () => {
      expect(() => calculateDistributionMetrics([], [], [])).toThrow()
    })

    it('computes negative bias correctly', () => {
      const original = [100, 200, 300]
      const downscaled = [90, 190, 290]
      const observed = [95, 195, 295]

      const result = calculateDistributionMetrics(original, downscaled, observed)

      expect(result.original.bias).toBeCloseTo(5, 10) // 200 - 195
      expect(result.downscaled.bias).toBeCloseTo(-5, 10) // 190 - 195
    })
  })

  describe('calculateBoxPlotData', () => {
    it('computes box plot with quartiles, whiskers, and outliers', () => {
      // Standard dataset without outliers
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9]

      const result = calculateBoxPlotData(values)

      if (!result) throw new Error('Expected box plot data')

      expect(result.q25).toBe(3)
      expect(result.q50).toBe(5)
      expect(result.q75).toBe(7)
      expect(result.min).toBe(1)
      expect(result.max).toBe(9)

      // IQR = 7 - 3 = 4
      // Lower whisker = max(min, q25 - 1.5*IQR) = max(1, 3 - 6) = 1
      // Upper whisker = min(max, q75 + 1.5*IQR) = min(9, 7 + 6) = 9
      expect(result.whiskerLow).toBe(1)
      expect(result.whiskerHigh).toBe(9)
      expect(result.outliers).toEqual([])
    })

    it('identifies outliers beyond 1.5*IQR', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100]

      const result = calculateBoxPlotData(values)

      if (!result) throw new Error('Expected box plot data')

      expect(result.q25).toBe(3.25)
      expect(result.q50).toBe(5.5)
      expect(result.q75).toBe(7.75)

      // IQR = 7.75 - 3.25 = 4.5
      // Upper whisker threshold = 7.75 + 1.5*4.5 = 14.5
      // 100 is beyond threshold, so it's an outlier
      expect(result.outliers).toContain(100)
      expect(result.whiskerHigh).toBeLessThan(100)
    })

    it('handles constant values (zero IQR)', () => {
      const values = [5, 5, 5, 5, 5]

      const result = calculateBoxPlotData(values)

      if (!result) throw new Error('Expected box plot data')

      expect(result.q25).toBe(5)
      expect(result.q50).toBe(5)
      expect(result.q75).toBe(5)
      expect(result.min).toBe(5)
      expect(result.max).toBe(5)
      expect(result.whiskerLow).toBe(5)
      expect(result.whiskerHigh).toBe(5)
      expect(result.outliers).toEqual([])
    })

    it('handles single value', () => {
      const result = calculateBoxPlotData([42])

      if (!result) throw new Error('Expected box plot data')

      expect(result.q25).toBe(42)
      expect(result.q50).toBe(42)
      expect(result.q75).toBe(42)
      expect(result.min).toBe(42)
      expect(result.max).toBe(42)
      expect(result.whiskerLow).toBe(42)
      expect(result.whiskerHigh).toBe(42)
      expect(result.outliers).toEqual([])
    })

    it('returns null for empty array', () => {
      expect(calculateBoxPlotData([])).toBeNull()
    })

    it('handles duplicate values correctly', () => {
      const values = [1, 1, 2, 2, 3, 3, 4, 4]

      const result = calculateBoxPlotData(values)

      if (!result) throw new Error('Expected box plot data')

      expect(result.q25).toBe(1.75)
      expect(result.q50).toBe(2.5)
      expect(result.q75).toBe(3.25)
      expect(result.outliers).toEqual([])
    })

    it('identifies multiple outliers on both ends', () => {
      const values = [-100, -50, 1, 2, 3, 4, 5, 6, 7, 50, 100]

      const result = calculateBoxPlotData(values)

      if (!result) throw new Error('Expected box plot data')

      // Should identify -100, -50, 50, 100 as outliers
      expect(result.outliers.length).toBeGreaterThan(0)
      expect(result.outliers).toContain(-100)
      expect(result.outliers).toContain(100)
    })
  })
})

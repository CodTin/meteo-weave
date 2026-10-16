import { describe, test, expect } from 'vitest'
import { calculateAccuracyMetrics } from '@/features/result-analysis/service/accuracy-metrics'

describe('calculateAccuracyMetrics', () => {
  test('computes RMSE for simple valid samples', () => {
    const observed = [10, 20, 30]
    const predicted = [12, 18, 32]

    const result = calculateAccuracyMetrics(observed, predicted)

    // RMSE = sqrt(((12-10)^2 + (18-20)^2 + (32-30)^2) / 3)
    // = sqrt((4 + 4 + 4) / 3) = sqrt(4) = 2
    expect(result.available).toBe(true)
    if (result.available) {
      expect(result.metrics.rmse).toBe(2)
    }
  })

  test('computes MAE and R² alongside RMSE', () => {
    const observed = [10, 20, 30]
    const predicted = [12, 18, 32]

    const result = calculateAccuracyMetrics(observed, predicted)

    expect(result.available).toBe(true)
    if (result.available) {
      // MAE = (|12-10| + |18-20| + |32-30|) / 3 = (2 + 2 + 2) / 3 = 2
      expect(result.metrics.mae).toBe(2)

      // Mean of observed = 20
      // SST = (10-20)^2 + (20-20)^2 + (30-20)^2 = 100 + 0 + 100 = 200
      // SSE = (12-10)^2 + (18-20)^2 + (32-30)^2 = 4 + 4 + 4 = 12
      // R² = 1 - 12/200 = 1 - 0.06 = 0.94
      expect(result.metrics.r2).toBe(0.94)

      expect(result.metrics.n).toBe(3)
    }
  })

  test('allows negative R² when predictions are worse than mean', () => {
    const observed = [10, 20, 30]
    const predicted = [5, 25, 5] // Poor predictions

    const result = calculateAccuracyMetrics(observed, predicted)

    expect(result.available).toBe(true)
    if (result.available) {
      // Mean of observed = 20
      // SST = (10-20)^2 + (20-20)^2 + (30-20)^2 = 200
      // SSE = (5-10)^2 + (25-20)^2 + (5-30)^2 = 25 + 25 + 625 = 675
      // R² = 1 - 675/200 = 1 - 3.375 = -2.375
      expect(result.metrics.r2).toBeLessThan(0)
      expect(result.metrics.r2).toBe(-2.375)
    }
  })

  test('returns unavailable when observed variance is zero', () => {
    const observed = [20, 20, 20] // Constant
    const predicted = [18, 22, 19]

    const result = calculateAccuracyMetrics(observed, predicted)

    expect(result.available).toBe(true)
    if (result.available) {
      // R² is undefined (NaN) when SST = 0
      expect(Number.isNaN(result.metrics.r2)).toBe(true)
      // But RMSE and MAE are still valid
      expect(result.metrics.rmse).toBeGreaterThan(0)
      expect(result.metrics.mae).toBeGreaterThan(0)
    }
  })

  test('returns unavailable when no common samples', () => {
    const observed: number[] = []
    const predicted: number[] = []

    const result = calculateAccuracyMetrics(observed, predicted)

    expect(result.available).toBe(false)
    if (!result.available) {
      expect(result.reason).toBe('No common valid samples')
    }
  })

  test('returns unavailable when sample counts mismatch', () => {
    const observed = [10, 20, 30]
    const predicted = [12, 18]

    const result = calculateAccuracyMetrics(observed, predicted)

    expect(result.available).toBe(false)
    if (!result.available) {
      expect(result.reason).toBe('Sample count mismatch')
    }
  })
})

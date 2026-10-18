import { describe, expect, it, beforeAll } from 'vitest'
import { getTimeSeriesData } from '@/server/services/time-series.server'
import type { TimeSeriesResponse } from '@/server/services/time-series.server'

describe('Time Series Ensemble Quantiles Integration', () => {
  let probabilisticTask: any
  let deterministicTask: any

  beforeAll(() => {
    // Create a probabilistic task
    probabilisticTask = {
      id: 'test-prob-task',
      schemaVersion: 1,
      name: 'Test Probabilistic Task',
      ownerId: 'demo-researcher',
      configuration: {
        resolvedMethod: 'probabilistic',
        advanced: {
          ensembleMembers: 10,
        },
        region: { north: 40, south: 30, east: 110, west: 100 },
        timeRange: {
          mode: 'forecast',
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-01T23:00:00Z',
        },
        variable: 'temperature',
        dataSource: 'synthetic',
      },
      status: 'Completed',
      dataSeed: 42,
      generatorVersion: 'synthetic-temperature-v1',
      createdAt: '2024-01-01T00:00:00Z',
      submittedAt: '2024-01-01T00:00:00Z',
      completionAt: '2024-01-01T00:02:30Z',
      failureReason: null,
    }

    // Create a deterministic task
    deterministicTask = {
      id: 'test-det-task',
      schemaVersion: 1,
      name: 'Test Deterministic Task',
      ownerId: 'demo-researcher',
      configuration: {
        resolvedMethod: 'deterministic',
        region: { north: 40, south: 30, east: 110, west: 100 },
        timeRange: {
          mode: 'forecast',
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-01T23:00:00Z',
        },
        variable: 'temperature',
        dataSource: 'synthetic',
      },
      status: 'Completed',
      dataSeed: 42,
      generatorVersion: 'synthetic-temperature-v1',
      createdAt: '2024-01-01T00:00:00Z',
      submittedAt: '2024-01-01T00:00:00Z',
      completionAt: '2024-01-01T00:02:30Z',
      failureReason: null,
    }
  })

  it('includes ensemble quantile data for probabilistic tasks', () => {
    const result = getTimeSeriesData({
      task: probabilisticTask,
      coordinate: { latitude: 35, longitude: 105 },
    })

    expect(result.ok).toBe(true)

    if (result.ok) {
      const response = result as TimeSeriesResponse

      // Should include ensemble data
      expect(response.ensemble).toBeDefined()
      expect(response.ensemble?.isProbabilistic).toBe(true)
      expect(response.ensemble?.totalMembers).toBe(10)
      expect(response.ensemble?.quantiles).toBeDefined()
      expect(Array.isArray(response.ensemble?.quantiles)).toBe(true)

      // Quantiles should match the number of time points
      expect(response.ensemble?.quantiles.length).toBeGreaterThan(0)

      // Each quantile point should have p10, p50, p90, and validCount
      const firstQuantile = response.ensemble?.quantiles[0]
      expect(firstQuantile).toBeDefined()
      expect(firstQuantile?.time).toBeDefined()
      expect(typeof firstQuantile?.validCount).toBe('number')

      // For a complete ensemble, p10/p50/p90 should be numbers (or null if missing)
      if (firstQuantile?.validCount && firstQuantile.validCount > 0) {
        expect(typeof firstQuantile.p10 === 'number' || firstQuantile.p10 === null).toBe(true)
        expect(typeof firstQuantile.p50 === 'number' || firstQuantile.p50 === null).toBe(true)
        expect(typeof firstQuantile.p90 === 'number' || firstQuantile.p90 === null).toBe(true)
      }
    }
  })

  it('does not include ensemble data for deterministic tasks', () => {
    const result = getTimeSeriesData({
      task: deterministicTask,
      coordinate: { latitude: 35, longitude: 105 },
    })

    expect(result.ok).toBe(true)

    if (result.ok) {
      const response = result as TimeSeriesResponse

      // Should NOT include ensemble data for deterministic tasks
      expect(response.ensemble).toBeUndefined()
    }
  })

  it('quantile values are ordered correctly (p10 <= p50 <= p90)', () => {
    const result = getTimeSeriesData({
      task: probabilisticTask,
      coordinate: { latitude: 35, longitude: 105 },
    })

    expect(result.ok).toBe(true)

    if (result.ok) {
      const response = result as TimeSeriesResponse

      expect(response.ensemble?.quantiles).toBeDefined()

      // Check ordering for each time point with complete data
      for (const quantile of response.ensemble!.quantiles) {
        if (
          quantile.p10 !== null &&
          quantile.p50 !== null &&
          quantile.p90 !== null &&
          quantile.validCount > 0
        ) {
          expect(quantile.p10).toBeLessThanOrEqual(quantile.p50)
          expect(quantile.p50).toBeLessThanOrEqual(quantile.p90)
        }
      }
    }
  })

  it('handles missing members correctly with reduced validCount', () => {
    const result = getTimeSeriesData({
      task: probabilisticTask,
      coordinate: { latitude: 35, longitude: 105 },
    })

    expect(result.ok).toBe(true)

    if (result.ok) {
      const response = result as TimeSeriesResponse

      expect(response.ensemble?.quantiles).toBeDefined()

      // Due to synthetic demo member outage (every 5th member lacks 06UTC),
      // some time points may have reduced member counts
      const quantiles = response.ensemble!.quantiles

      for (const quantile of quantiles) {
        // Valid count should be between 0 and total members
        expect(quantile.validCount).toBeGreaterThanOrEqual(0)
        expect(quantile.validCount).toBeLessThanOrEqual(response.ensemble!.totalMembers)

        // If no valid members, quantiles should be null
        if (quantile.validCount === 0) {
          expect(quantile.p10).toBeNull()
          expect(quantile.p50).toBeNull()
          expect(quantile.p90).toBeNull()
        }
      }
    }
  })

  it('quantile times match downscaled data times', () => {
    const result = getTimeSeriesData({
      task: probabilisticTask,
      coordinate: { latitude: 35, longitude: 105 },
    })

    expect(result.ok).toBe(true)

    if (result.ok) {
      const response = result as TimeSeriesResponse

      expect(response.ensemble?.quantiles).toBeDefined()

      // Extract times from downscaled and quantiles
      const downscaledTimes = response.downscaled.map((p) => p.time)
      const quantileTimes = response.ensemble!.quantiles.map((q) => q.time)

      // Should have same length
      expect(quantileTimes.length).toBe(downscaledTimes.length)

      // Times should match in order
      for (let i = 0; i < downscaledTimes.length; i++) {
        expect(quantileTimes[i]).toBe(downscaledTimes[i])
      }
    }
  })

  it('rejects coordinates outside task region', () => {
    const result = getTimeSeriesData({
      task: probabilisticTask,
      coordinate: { latitude: 50, longitude: 120 }, // Outside region
    })

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.code).toBe('OUTSIDE_REGION')
      expect(result.error).toContain('坐标超出任务范围')
    }
  })

  it('validates coordinate input', () => {
    const result = getTimeSeriesData({
      task: probabilisticTask,
      coordinate: { latitude: NaN, longitude: 105 },
    })

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.code).toBe('INVALID_INPUT')
    }
  })

  it('preserves original and observation data with ensemble', () => {
    const result = getTimeSeriesData({
      task: probabilisticTask,
      coordinate: { latitude: 35, longitude: 105 },
    })

    expect(result.ok).toBe(true)

    if (result.ok) {
      const response = result as TimeSeriesResponse

      // Original data should still be present
      expect(response.original).toBeDefined()
      expect(Array.isArray(response.original)).toBe(true)
      expect(response.original.length).toBeGreaterThan(0)

      // Downscaled data should still be present
      expect(response.downscaled).toBeDefined()
      expect(Array.isArray(response.downscaled)).toBe(true)
      expect(response.downscaled.length).toBeGreaterThan(0)

      // Ensemble data is additional, not replacing
      expect(response.ensemble).toBeDefined()
    }
  })
})

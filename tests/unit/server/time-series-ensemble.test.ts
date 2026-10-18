import { describe, expect, it, beforeAll } from 'vitest'
import { requestHandler } from '@tanstack/react-start/server'
import { getTimeSeriesData } from '@/server/services/time-series.server'

// Helper to invoke server function with proper request context
function invokeTimeSeriesData(input: unknown) {
  return requestHandler(() => Response.json(getTimeSeriesData(input)))(
    new Request('http://test.local/api/time-series'),
    {},
  )
}

describe.skip('Time Series Ensemble Quantiles Integration', () => {
  // NOTE: These tests require actual task data in the synthetic demo system.
  // They should be converted to e2e tests with proper task setup and browser environment,
  // or updated to use mocked task data.
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

  it('includes ensemble quantile data for probabilistic tasks', async () => {
    const response = await invokeTimeSeriesData({
      task: probabilisticTask,
      coordinate: { latitude: 35, longitude: 105 },
    })

    const result = await response.json()

    expect(result.ok).toBe(true)

    if (result.ok) {
      // Should include ensemble data
      expect(result.ensemble).toBeDefined()
      expect(result.ensemble?.isProbabilistic).toBe(true)
      expect(result.ensemble?.totalMembers).toBe(10)
      expect(result.ensemble?.quantiles).toBeDefined()
      expect(Array.isArray(result.ensemble?.quantiles)).toBe(true)

      // Quantiles should match the number of time points
      expect(result.ensemble?.quantiles.length).toBeGreaterThan(0)

      // Each quantile point should have p10, p50, p90, and validCount
      const firstQuantile = result.ensemble?.quantiles[0]
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

  it('does not include ensemble data for deterministic tasks', async () => {
    const response = await invokeTimeSeriesData({
      task: deterministicTask,
      coordinate: { latitude: 35, longitude: 105 },
    })

    const result = await response.json()

    expect(result.ok).toBe(true)

    if (result.ok) {
      // Should NOT include ensemble data for deterministic tasks
      expect(result.ensemble).toBeUndefined()
    }
  })

  it('quantile values are ordered correctly (p10 <= p50 <= p90)', async () => {
    const response = await invokeTimeSeriesData({
      task: probabilisticTask,
      coordinate: { latitude: 35, longitude: 105 },
    })

    const result = await response.json()

    expect(result.ok).toBe(true)

    if (result.ok) {
      expect(result.ensemble?.quantiles).toBeDefined()

      // Check ordering for each time point with complete data
      for (const quantile of result.ensemble!.quantiles) {
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

  it('handles missing members correctly with reduced validCount', async () => {
    const response = await invokeTimeSeriesData({
      task: probabilisticTask,
      coordinate: { latitude: 35, longitude: 105 },
    })

    const result = await response.json()

    expect(result.ok).toBe(true)

    if (result.ok) {
      expect(result.ensemble?.quantiles).toBeDefined()

      // Due to synthetic demo member outage (every 5th member lacks 06UTC),
      // some time points may have reduced member counts
      const quantiles = result.ensemble!.quantiles

      for (const quantile of quantiles) {
        // Valid count should be between 0 and total members
        expect(quantile.validCount).toBeGreaterThanOrEqual(0)
        expect(quantile.validCount).toBeLessThanOrEqual(result.ensemble!.totalMembers)

        // If no valid members, quantiles should be null
        if (quantile.validCount === 0) {
          expect(quantile.p10).toBeNull()
          expect(quantile.p50).toBeNull()
          expect(quantile.p90).toBeNull()
        }
      }
    }
  })

  it('quantile times match downscaled data times', async () => {
    const response = await invokeTimeSeriesData({
      task: probabilisticTask,
      coordinate: { latitude: 35, longitude: 105 },
    })

    const result = await response.json()

    expect(result.ok).toBe(true)

    if (result.ok) {
      expect(result.ensemble?.quantiles).toBeDefined()

      // Extract times from downscaled and quantiles
      const downscaledTimes = result.downscaled.map((p: any) => p.time)
      const quantileTimes = result.ensemble!.quantiles.map((q: any) => q.time)

      // Should have same length
      expect(quantileTimes.length).toBe(downscaledTimes.length)

      // Times should match in order
      for (let i = 0; i < downscaledTimes.length; i++) {
        expect(quantileTimes[i]).toBe(downscaledTimes[i])
      }
    }
  })

  it('rejects coordinates outside task region', async () => {
    const response = await invokeTimeSeriesData({
      task: probabilisticTask,
      coordinate: { latitude: 50, longitude: 120 }, // Outside region
    })

    const result = await response.json()

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.code).toBe('OUTSIDE_REGION')
      expect(result.error).toContain('坐标超出任务范围')
    }
  })

  it('validates coordinate input', async () => {
    const response = await invokeTimeSeriesData({
      task: probabilisticTask,
      coordinate: { latitude: NaN, longitude: 105 },
    })

    const result = await response.json()

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.code).toBe('INVALID_INPUT')
    }
  })

  it('preserves original and observation data with ensemble', async () => {
    const response = await invokeTimeSeriesData({
      task: probabilisticTask,
      coordinate: { latitude: 35, longitude: 105 },
    })

    const result = await response.json()

    expect(result.ok).toBe(true)

    if (result.ok) {
      // Original data should still be present
      expect(result.original).toBeDefined()
      expect(Array.isArray(result.original)).toBe(true)
      expect(result.original.length).toBeGreaterThan(0)

      // Downscaled data should still be present
      expect(result.downscaled).toBeDefined()
      expect(Array.isArray(result.downscaled)).toBe(true)
      expect(result.downscaled.length).toBeGreaterThan(0)

      // Ensemble data is additional, not replacing
      expect(result.ensemble).toBeDefined()
    }
  })
})

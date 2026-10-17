/**
 * Unit tests for elevation-based station grouping.
 * Tests the core grouping logic, metrics calculation, and edge cases.
 */

import { describe, it, expect } from 'vitest'
import {
  assignSyntheticElevation,
  groupStationsByElevation,
  calculateGroupMetrics,
  type StationSample,
} from '@/features/result-analysis/service/elevation-grouping'

describe('assignSyntheticElevation', () => {
  it('assigns reproducible elevation based on station coordinates', () => {
    const stationId = 'station-001'
    const lat = 45.5
    const lon = -120.5

    const elevation1 = assignSyntheticElevation(stationId, lat, lon)
    const elevation2 = assignSyntheticElevation(stationId, lat, lon)

    expect(elevation1).toBe(elevation2)
    expect(elevation1).toBeGreaterThanOrEqual(0)
    expect(elevation1).toBeLessThanOrEqual(3000)
  })

  it('assigns different elevations to different stations', () => {
    const station1 = assignSyntheticElevation('station-001', 45.5, -120.5)
    const station2 = assignSyntheticElevation('station-002', 45.6, -120.6)

    expect(station1).not.toBe(station2)
  })

  it('handles boundary cases for coordinates', () => {
    const minCoords = assignSyntheticElevation('station-min', -90, -180)
    const maxCoords = assignSyntheticElevation('station-max', 90, 180)
    const zero = assignSyntheticElevation('station-zero', 0, 0)

    expect(minCoords).toBeGreaterThanOrEqual(0)
    expect(maxCoords).toBeGreaterThanOrEqual(0)
    expect(zero).toBeGreaterThanOrEqual(0)
  })
})

describe('groupStationsByElevation', () => {
  it('assigns plains group for elevation < 200m', () => {
    const samples: StationSample[] = [
      {
        stationId: 'station-001',
        latitude: 45.5,
        longitude: -120.5,
        time: '2024-01-01T00:00:00Z',
        observed: 10,
        original: 12,
        downscaled: 11,
      },
    ]

    // Mock elevation assignment to return 150m (plains)
    const grouped = groupStationsByElevation(samples, () => {
      return 150
    })

    expect(grouped.plains).toHaveLength(1)
    expect(grouped.hills).toHaveLength(0)
    expect(grouped.mountains).toHaveLength(0)
  })

  it('assigns hills group for elevation 200m <= h <= 500m', () => {
    const samples: StationSample[] = [
      {
        stationId: 'station-200',
        latitude: 45.5,
        longitude: -120.5,
        time: '2024-01-01T00:00:00Z',
        observed: 10,
        original: 12,
        downscaled: 11,
      },
      {
        stationId: 'station-500',
        latitude: 45.6,
        longitude: -120.6,
        time: '2024-01-01T00:00:00Z',
        observed: 15,
        original: 17,
        downscaled: 16,
      },
    ]

    // Mock elevations at exact boundaries
    const elevationMap = new Map([
      ['station-200', 200],
      ['station-500', 500],
    ])

    const grouped = groupStationsByElevation(samples, (id) => {
      return elevationMap.get(id) || 0
    })

    expect(grouped.plains).toHaveLength(0)
    expect(grouped.hills).toHaveLength(2)
    expect(grouped.mountains).toHaveLength(0)
  })

  it('assigns mountains group for elevation > 500m', () => {
    const samples: StationSample[] = [
      {
        stationId: 'station-001',
        latitude: 45.5,
        longitude: -120.5,
        time: '2024-01-01T00:00:00Z',
        observed: 10,
        original: 12,
        downscaled: 11,
      },
    ]

    const grouped = groupStationsByElevation(samples, () => 800)

    expect(grouped.plains).toHaveLength(0)
    expect(grouped.hills).toHaveLength(0)
    expect(grouped.mountains).toHaveLength(1)
  })

  it('handles edge case of 199.9m as plains and 200.0m as hills', () => {
    const samples: StationSample[] = [
      {
        stationId: 'station-199',
        latitude: 45.5,
        longitude: -120.5,
        time: '2024-01-01T00:00:00Z',
        observed: 10,
        original: 12,
        downscaled: 11,
      },
      {
        stationId: 'station-200',
        latitude: 45.6,
        longitude: -120.6,
        time: '2024-01-01T00:00:00Z',
        observed: 15,
        original: 17,
        downscaled: 16,
      },
    ]

    const elevationMap = new Map([
      ['station-199', 199.9],
      ['station-200', 200.0],
    ])

    const grouped = groupStationsByElevation(samples, (id) => {
      return elevationMap.get(id) || 0
    })

    expect(grouped.plains).toHaveLength(1)
    expect(grouped.hills).toHaveLength(1)
  })

  it('handles edge case of 500.0m as hills and 500.1m as mountains', () => {
    const samples: StationSample[] = [
      {
        stationId: 'station-500',
        latitude: 45.5,
        longitude: -120.5,
        time: '2024-01-01T00:00:00Z',
        observed: 10,
        original: 12,
        downscaled: 11,
      },
      {
        stationId: 'station-501',
        latitude: 45.6,
        longitude: -120.6,
        time: '2024-01-01T00:00:00Z',
        observed: 15,
        original: 17,
        downscaled: 16,
      },
    ]

    const elevationMap = new Map([
      ['station-500', 500.0],
      ['station-501', 500.1],
    ])

    const grouped = groupStationsByElevation(samples, (id) => {
      return elevationMap.get(id) || 0
    })

    expect(grouped.hills).toHaveLength(1)
    expect(grouped.mountains).toHaveLength(1)
  })

  it('deduplicates samples with same stationId and time', () => {
    const samples: StationSample[] = [
      {
        stationId: 'station-001',
        latitude: 45.5,
        longitude: -120.5,
        time: '2024-01-01T00:00:00Z',
        observed: 10,
        original: 12,
        downscaled: 11,
      },
      {
        stationId: 'station-001',
        latitude: 45.5,
        longitude: -120.5,
        time: '2024-01-01T00:00:00Z',
        observed: 10,
        original: 12,
        downscaled: 11,
      },
    ]

    const grouped = groupStationsByElevation(samples, () => 150)

    expect(grouped.plains).toHaveLength(1)
  })
})

describe('calculateGroupMetrics', () => {
  it('calculates RMSE for a group', () => {
    const samples: StationSample[] = [
      {
        stationId: 's1',
        latitude: 0,
        longitude: 0,
        time: 't1',
        observed: 10,
        original: 12,
        downscaled: 11,
      },
      {
        stationId: 's2',
        latitude: 0,
        longitude: 0,
        time: 't2',
        observed: 20,
        original: 22,
        downscaled: 21,
      },
    ]

    const metrics = calculateGroupMetrics(samples, 'plains')

    // Original RMSE: sqrt(((12-10)^2 + (22-20)^2) / 2) = sqrt((4 + 4) / 2) = sqrt(4) = 2
    expect(metrics.original.rmse).toBeCloseTo(2.0, 2)
    // Downscaled RMSE: sqrt(((11-10)^2 + (21-20)^2) / 2) = sqrt((1 + 1) / 2) = sqrt(1) = 1
    expect(metrics.downscaled.rmse).toBeCloseTo(1.0, 2)
  })

  it('calculates MAE for a group', () => {
    const samples: StationSample[] = [
      {
        stationId: 's1',
        latitude: 0,
        longitude: 0,
        time: 't1',
        observed: 10,
        original: 12,
        downscaled: 11,
      },
      {
        stationId: 's2',
        latitude: 0,
        longitude: 0,
        time: 't2',
        observed: 20,
        original: 24,
        downscaled: 21,
      },
    ]

    const metrics = calculateGroupMetrics(samples, 'plains')

    // Original MAE: (|12-10| + |24-20|) / 2 = (2 + 4) / 2 = 3
    expect(metrics.original.mae).toBe(3)
    // Downscaled MAE: (|11-10| + |21-20|) / 2 = (1 + 1) / 2 = 1
    expect(metrics.downscaled.mae).toBe(1)
  })

  it('calculates improvement as (original - downscaled) / original * 100', () => {
    const samples: StationSample[] = [
      {
        stationId: 's1',
        latitude: 0,
        longitude: 0,
        time: 't1',
        observed: 10,
        original: 14,
        downscaled: 11,
      },
      {
        stationId: 's2',
        latitude: 0,
        longitude: 0,
        time: 't2',
        observed: 20,
        original: 26,
        downscaled: 21,
      },
    ]

    const metrics = calculateGroupMetrics(samples, 'plains')

    // Original RMSE: sqrt(((14-10)^2 + (26-20)^2) / 2) = sqrt((16 + 36) / 2) = sqrt(26) ≈ 5.099
    // Downscaled RMSE: sqrt(((11-10)^2 + (21-20)^2) / 2) = sqrt(2/2) = 1
    // Improvement: (5.099 - 1) / 5.099 * 100 ≈ 80.38%
    expect(metrics.improvement.rmse).toBeCloseTo(80.38, 1)
  })

  it('preserves negative improvement when downscaled is worse', () => {
    const samples: StationSample[] = [
      {
        stationId: 's1',
        latitude: 0,
        longitude: 0,
        time: 't1',
        observed: 10,
        original: 11,
        downscaled: 14,
      },
      {
        stationId: 's2',
        latitude: 0,
        longitude: 0,
        time: 't2',
        observed: 20,
        original: 21,
        downscaled: 24,
      },
    ]

    const metrics = calculateGroupMetrics(samples, 'plains')

    // Original RMSE: sqrt(((11-10)^2 + (21-20)^2) / 2) = 1
    // Downscaled RMSE: sqrt(((14-10)^2 + (24-20)^2) / 2) = sqrt((16 + 16) / 2) = 4
    // Improvement: (1 - 4) / 1 * 100 = -300%
    expect(metrics.improvement.rmse).toBeLessThan(0)
    expect(metrics.improvement.rmse).toBeCloseTo(-300, 1)
  })

  it('handles empty group with appropriate messaging', () => {
    const samples: StationSample[] = []

    const metrics = calculateGroupMetrics(samples, 'plains')

    expect(metrics.available).toBe(false)
    expect(metrics.reason).toContain('无样本')
  })

  it('handles zero baseline with appropriate messaging', () => {
    const samples: StationSample[] = [
      {
        stationId: 's1',
        latitude: 0,
        longitude: 0,
        time: 't1',
        observed: 10,
        original: 10,
        downscaled: 10,
      },
    ]

    const metrics = calculateGroupMetrics(samples, 'plains')

    expect(metrics.original.rmse).toBe(0)
    expect(metrics.improvement.rmse).toBeUndefined()
    expect(metrics.improvement.reason).toContain('零基线')
  })

  it('includes sample count and station support', () => {
    const samples: StationSample[] = [
      {
        stationId: 's1',
        latitude: 0,
        longitude: 0,
        time: 't1',
        observed: 10,
        original: 12,
        downscaled: 11,
      },
      {
        stationId: 's1',
        latitude: 0,
        longitude: 0,
        time: 't2',
        observed: 11,
        original: 13,
        downscaled: 12,
      },
      {
        stationId: 's2',
        latitude: 0,
        longitude: 0,
        time: 't1',
        observed: 20,
        original: 22,
        downscaled: 21,
      },
    ]

    const metrics = calculateGroupMetrics(samples, 'plains')

    expect(metrics.sampleCount).toBe(3)
    expect(metrics.stationCount).toBe(2)
  })
})

import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AccuracyAssessmentPanel } from '@/features/result-analysis/components/accuracy-assessment-panel'

describe('AccuracyAssessmentPanel', () => {
  test('displays metrics when available', () => {
    const data = {
      available: true as const,
      metrics: {
        original: { rmse: 2.5, mae: 2.0, r2: 0.85 },
        downscaled: { rmse: 1.5, mae: 1.2, r2: 0.92 },
      },
      samples: {
        n: 150,
        stationCount: 10,
        timeCoverage: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-07T23:00:00Z',
          actualTimes: 8,
        },
      },
      stations: [{ stationId: 'S001', location: { lon: 120.5, lat: 30.5 }, elevation: 100 }],
      sampling: {
        budget: { maxPoints: 50, maxTimes: 10 },
        actual: { points: 10, times: 8 },
        plan: '预算内均匀采样：8 个时刻',
      },
      method: {
        matching: '台站坐标 25km 内取样',
        unit: '°C',
        dataSource: 'Synthetic Demo' as const,
      },
    }

    render(<AccuracyAssessmentPanel data={data} variable="temperature" />)

    // Check that RMSE, MAE, R² are displayed
    expect(screen.getByText(/RMSE/)).toBeInTheDocument()
    expect(screen.getByText(/MAE/)).toBeInTheDocument()
    expect(screen.getByText(/R²/)).toBeInTheDocument()

    // Check station count and sample count are displayed
    expect(screen.getByText(/10.*个独立台站/)).toBeInTheDocument()
    expect(screen.getByText(/150.*个站时样本/)).toBeInTheDocument()

    // Check Synthetic Demo data source
    expect(screen.getByText(/Synthetic Demo/)).toBeInTheDocument()
  })

  test('shows improvement percentages', () => {
    const data = {
      available: true as const,
      metrics: {
        original: { rmse: 2.0, mae: 1.8, r2: 0.8 },
        downscaled: { rmse: 1.0, mae: 0.9, r2: 0.95 },
      },
      samples: {
        n: 100,
        stationCount: 5,
        timeCoverage: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-07T23:00:00Z',
          actualTimes: 10,
        },
      },
      stations: [],
      sampling: {
        budget: { maxPoints: 50, maxTimes: 10 },
        actual: { points: 5, times: 10 },
        plan: '完整时间覆盖：10 个时刻',
      },
      method: {
        matching: '台站坐标 25km 内取样',
        unit: '°C',
        dataSource: 'Synthetic Demo' as const,
      },
    }

    render(<AccuracyAssessmentPanel data={data} variable="temperature" />)

    // RMSE improvement: (2.0 - 1.0) / 2.0 = 50%
    const improvements = screen.getAllByText(/50\.0%/)
    expect(improvements.length).toBeGreaterThan(0)
  })

  test('displays unavailable reason when no data', () => {
    const data = {
      available: false as const,
      reason: 'No common valid samples',
    }

    render(<AccuracyAssessmentPanel data={data} variable="temperature" />)

    expect(screen.getByText(/No common valid samples/)).toBeInTheDocument()
    expect(screen.queryByText(/RMSE/)).not.toBeInTheDocument()
  })

  test('shows degradation when downscaled is worse', () => {
    const data = {
      available: true as const,
      metrics: {
        original: { rmse: 1.0, mae: 0.9, r2: 0.95 },
        downscaled: { rmse: 2.0, mae: 1.8, r2: 0.8 },
      },
      samples: {
        n: 100,
        stationCount: 5,
        timeCoverage: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-07T23:00:00Z',
          actualTimes: 10,
        },
      },
      stations: [],
      sampling: {
        budget: { maxPoints: 50, maxTimes: 10 },
        actual: { points: 5, times: 10 },
        plan: '完整时间覆盖：10 个时刻',
      },
      method: {
        matching: '台站坐标 25km 内取样',
        unit: '°C',
        dataSource: 'Synthetic Demo' as const,
      },
    }

    render(<AccuracyAssessmentPanel data={data} variable="temperature" />)

    // Should indicate degradation (negative improvement) - all three metrics are worse
    const degradations = screen.getAllByText('(退化)')
    expect(degradations.length).toBe(3) // One for each metric (RMSE, MAE, R²)
    const negativeImprovements = screen.getAllByText(/-100\.0%/)
    expect(negativeImprovements.length).toBeGreaterThan(0)
  })
})

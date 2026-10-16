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
        timeCoverage: { start: '2024-01-01T00:00:00Z', end: '2024-01-07T23:00:00Z' },
      },
      method: {
        matching: 'station-within-25km',
        unit: '°C',
      },
    }

    render(<AccuracyAssessmentPanel data={data} variable="temperature" />)

    // Check that RMSE, MAE, R² are displayed
    expect(screen.getByText(/RMSE/)).toBeInTheDocument()
    expect(screen.getByText(/MAE/)).toBeInTheDocument()
    expect(screen.getByText(/R²/)).toBeInTheDocument()

    // Check sample count is displayed
    expect(screen.getByText(/150/)).toBeInTheDocument()

    // Check Synthetic Demo disclaimer
    expect(screen.getByText(/Synthetic Demo/i)).toBeInTheDocument()
  })

  test('shows improvement percentages', () => {
    const data = {
      available: true as const,
      metrics: {
        original: { rmse: 2.0, mae: 1.8, r2: 0.80 },
        downscaled: { rmse: 1.0, mae: 0.9, r2: 0.95 },
      },
      samples: {
        n: 100,
        timeCoverage: { start: '2024-01-01T00:00:00Z', end: '2024-01-07T23:00:00Z' },
      },
      method: {
        matching: 'station-within-25km',
        unit: '°C',
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
        downscaled: { rmse: 2.0, mae: 1.8, r2: 0.80 },
      },
      samples: {
        n: 100,
        timeCoverage: { start: '2024-01-01T00:00:00Z', end: '2024-01-07T23:00:00Z' },
      },
      method: {
        matching: 'station-within-25km',
        unit: '°C',
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

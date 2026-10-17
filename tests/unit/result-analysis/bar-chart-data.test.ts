import { describe, it, expect } from 'vitest'
import {
  calculateLocalChanges,
  calculateErrors,
  alignBarChartData,
} from '@/features/result-analysis/service/bar-chart-data'

describe('calculateLocalChanges', () => {
  it('calculates downscaled - original for valid pairs', () => {
    const result = calculateLocalChanges(
      [
        { time: '2024-01-01T00:00:00Z', value: 10 },
        { time: '2024-01-02T00:00:00Z', value: 15 },
      ],
      [
        { time: '2024-01-01T00:00:00Z', value: 12 },
        { time: '2024-01-02T00:00:00Z', value: 18 },
      ],
    )

    expect(result).toEqual([
      { time: '2024-01-01T00:00:00Z', change: 2 },
      { time: '2024-01-02T00:00:00Z', change: 3 },
    ])
  })

  it('preserves positive values', () => {
    const result = calculateLocalChanges(
      [{ time: '2024-01-01T00:00:00Z', value: 10 }],
      [{ time: '2024-01-01T00:00:00Z', value: 15 }],
    )

    expect(result[0]?.change).toBe(5)
  })

  it('preserves negative values', () => {
    const result = calculateLocalChanges(
      [{ time: '2024-01-01T00:00:00Z', value: 20 }],
      [{ time: '2024-01-01T00:00:00Z', value: 15 }],
    )

    expect(result[0]?.change).toBe(-5)
  })

  it('preserves zero values', () => {
    const result = calculateLocalChanges(
      [{ time: '2024-01-01T00:00:00Z', value: 10 }],
      [{ time: '2024-01-01T00:00:00Z', value: 10 }],
    )

    expect(result[0]?.change).toBe(0)
  })

  it('returns null when original is missing', () => {
    const result = calculateLocalChanges(
      [{ time: '2024-01-01T00:00:00Z', value: null }],
      [{ time: '2024-01-01T00:00:00Z', value: 12 }],
    )

    expect(result[0]?.change).toBe(null)
  })

  it('returns null when downscaled is missing', () => {
    const result = calculateLocalChanges(
      [{ time: '2024-01-01T00:00:00Z', value: 10 }],
      [{ time: '2024-01-01T00:00:00Z', value: null }],
    )

    expect(result[0]?.change).toBe(null)
  })

  it('returns null when both are missing', () => {
    const result = calculateLocalChanges(
      [{ time: '2024-01-01T00:00:00Z', value: null }],
      [{ time: '2024-01-01T00:00:00Z', value: null }],
    )

    expect(result[0]?.change).toBe(null)
  })

  it('aligns by time identity not array index', () => {
    const result = calculateLocalChanges(
      [
        { time: '2024-01-01T00:00:00Z', value: 10 },
        { time: '2024-01-03T00:00:00Z', value: 30 },
      ],
      [
        { time: '2024-01-02T00:00:00Z', value: 20 },
        { time: '2024-01-03T00:00:00Z', value: 33 },
      ],
    )

    expect(result).toHaveLength(3)
    expect(result.find((r) => r.time === '2024-01-01T00:00:00Z')?.change).toBe(null)
    expect(result.find((r) => r.time === '2024-01-02T00:00:00Z')?.change).toBe(null)
    expect(result.find((r) => r.time === '2024-01-03T00:00:00Z')?.change).toBe(3)
  })

  it('calculates with unformatted raw values before rounding', () => {
    const result = calculateLocalChanges(
      [{ time: '2024-01-01T00:00:00Z', value: 10.123456 }],
      [{ time: '2024-01-01T00:00:00Z', value: 12.987654 }],
    )

    // Exact calculation: 12.987654 - 10.123456 = 2.864198
    expect(result[0]?.change).toBeCloseTo(2.864198, 6)
  })
})

describe('calculateErrors', () => {
  it('calculates downscaled - observation for valid pairs', () => {
    const result = calculateErrors(
      [
        { time: '2024-01-01T00:00:00Z', value: 12 },
        { time: '2024-01-02T00:00:00Z', value: 18 },
      ],
      [
        { time: '2024-01-01T00:00:00Z', value: 11 },
        { time: '2024-01-02T00:00:00Z', value: 17 },
      ],
    )

    expect(result).toEqual([
      { time: '2024-01-01T00:00:00Z', error: 1 },
      { time: '2024-01-02T00:00:00Z', error: 1 },
    ])
  })

  it('preserves positive errors', () => {
    const result = calculateErrors(
      [{ time: '2024-01-01T00:00:00Z', value: 15 }],
      [{ time: '2024-01-01T00:00:00Z', value: 10 }],
    )

    expect(result[0]?.error).toBe(5)
  })

  it('preserves negative errors', () => {
    const result = calculateErrors(
      [{ time: '2024-01-01T00:00:00Z', value: 15 }],
      [{ time: '2024-01-01T00:00:00Z', value: 20 }],
    )

    expect(result[0]?.error).toBe(-5)
  })

  it('preserves zero errors', () => {
    const result = calculateErrors(
      [{ time: '2024-01-01T00:00:00Z', value: 15 }],
      [{ time: '2024-01-01T00:00:00Z', value: 15 }],
    )

    expect(result[0]?.error).toBe(0)
  })

  it('returns null when downscaled is missing', () => {
    const result = calculateErrors(
      [{ time: '2024-01-01T00:00:00Z', value: null }],
      [{ time: '2024-01-01T00:00:00Z', value: 11 }],
    )

    expect(result[0]?.error).toBe(null)
  })

  it('returns null when observation is missing', () => {
    const result = calculateErrors(
      [{ time: '2024-01-01T00:00:00Z', value: 12 }],
      [{ time: '2024-01-01T00:00:00Z', value: null }],
    )

    expect(result[0]?.error).toBe(null)
  })

  it('returns null when both are missing', () => {
    const result = calculateErrors(
      [{ time: '2024-01-01T00:00:00Z', value: null }],
      [{ time: '2024-01-01T00:00:00Z', value: null }],
    )

    expect(result[0]?.error).toBe(null)
  })

  it('aligns by time identity not array index', () => {
    const result = calculateErrors(
      [
        { time: '2024-01-01T00:00:00Z', value: 12 },
        { time: '2024-01-03T00:00:00Z', value: 36 },
      ],
      [
        { time: '2024-01-02T00:00:00Z', value: 22 },
        { time: '2024-01-03T00:00:00Z', value: 33 },
      ],
    )

    expect(result).toHaveLength(3)
    expect(result.find((r) => r.time === '2024-01-01T00:00:00Z')?.error).toBe(null)
    expect(result.find((r) => r.time === '2024-01-02T00:00:00Z')?.error).toBe(null)
    expect(result.find((r) => r.time === '2024-01-03T00:00:00Z')?.error).toBe(3)
  })

  it('calculates with unformatted raw values before rounding', () => {
    const result = calculateErrors(
      [{ time: '2024-01-01T00:00:00Z', value: 12.987654 }],
      [{ time: '2024-01-01T00:00:00Z', value: 10.123456 }],
    )

    // Exact calculation: 12.987654 - 10.123456 = 2.864198
    expect(result[0]?.error).toBeCloseTo(2.864198, 6)
  })
})

describe('alignBarChartData', () => {
  it('handles empty observation array - change bars still display', () => {
    const result = alignBarChartData(
      [{ time: '2024-01-01T00:00:00Z', value: 10 }],
      [{ time: '2024-01-01T00:00:00Z', value: 12 }],
      [],
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.change).toBe(2)
    expect(result[0]?.error).toBe(null)
  })

  it('handles undefined observation array', () => {
    const result = alignBarChartData(
      [{ time: '2024-01-01T00:00:00Z', value: 10 }],
      [{ time: '2024-01-01T00:00:00Z', value: 12 }],
      undefined,
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.change).toBe(2)
    expect(result[0]?.error).toBe(null)
  })

  it('combines change and error for same time', () => {
    const result = alignBarChartData(
      [{ time: '2024-01-01T00:00:00Z', value: 10 }],
      [{ time: '2024-01-01T00:00:00Z', value: 12 }],
      [{ time: '2024-01-01T00:00:00Z', value: 11 }],
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.time).toBe('2024-01-01T00:00:00Z')
    expect(result[0]?.change).toBe(2)
    expect(result[0]?.error).toBe(1)
  })

  it('sorts by time ascending', () => {
    const result = alignBarChartData(
      [
        { time: '2024-01-03T00:00:00Z', value: 30 },
        { time: '2024-01-01T00:00:00Z', value: 10 },
      ],
      [
        { time: '2024-01-01T00:00:00Z', value: 12 },
        { time: '2024-01-03T00:00:00Z', value: 33 },
      ],
      [{ time: '2024-01-02T00:00:00Z', value: 22 }],
    )

    expect(result.map((r) => r.time)).toEqual([
      '2024-01-01T00:00:00Z',
      '2024-01-02T00:00:00Z',
      '2024-01-03T00:00:00Z',
    ])
  })
})

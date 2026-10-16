import { describe, test, expect } from 'vitest'
import { alignAccuracySamples } from '@/features/result-analysis/service/accuracy-samples'

describe('alignAccuracySamples', () => {
  test('aligns samples by stationId and time', () => {
    const original = [
      { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 10 },
      { stationId: 'S2', time: '2024-01-01T00:00:00Z', value: 15 },
    ]
    const downscaled = [
      { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 12 },
      { stationId: 'S2', time: '2024-01-01T00:00:00Z', value: 14 },
    ]
    const observation = [
      { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 11 },
      { stationId: 'S2', time: '2024-01-01T00:00:00Z', value: 16 },
    ]

    const result = alignAccuracySamples(original, downscaled, observation)

    expect(result.samples).toHaveLength(2)
    expect(result.samples[0]).toEqual({
      stationId: 'S1',
      time: '2024-01-01T00:00:00Z',
      original: 10,
      downscaled: 12,
      observed: 11,
    })
    expect(result.samples[1]).toEqual({
      stationId: 'S2',
      time: '2024-01-01T00:00:00Z',
      original: 15,
      downscaled: 14,
      observed: 16,
    })
  })

  test('excludes samples when any value is missing', () => {
    const original = [
      { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 10 },
      { stationId: 'S2', time: '2024-01-01T00:00:00Z', value: 15 },
    ]
    const downscaled = [
      { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 12 },
      // S2 missing in downscaled
    ]
    const observation = [
      { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 11 },
      { stationId: 'S2', time: '2024-01-01T00:00:00Z', value: 16 },
    ]

    const result = alignAccuracySamples(original, downscaled, observation)

    // Only S1 has all three values
    expect(result.samples).toHaveLength(1)
    expect(result.samples[0]?.stationId).toBe('S1')
    expect(result.excluded).toBe(1)
  })

  test('excludes non-finite values', () => {
    const original = [
      { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 10 },
      { stationId: 'S2', time: '2024-01-01T00:00:00Z', value: NaN },
    ]
    const downscaled = [
      { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 12 },
      { stationId: 'S2', time: '2024-01-01T00:00:00Z', value: 14 },
    ]
    const observation = [
      { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 11 },
      { stationId: 'S2', time: '2024-01-01T00:00:00Z', value: 16 },
    ]

    const result = alignAccuracySamples(original, downscaled, observation)

    expect(result.samples).toHaveLength(1)
    expect(result.samples[0]?.stationId).toBe('S1')
    expect(result.excluded).toBe(1)
  })

  test('deduplicates when same station matched by multiple request points', () => {
    const original = [
      { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 10 },
      { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 10 }, // Duplicate
    ]
    const downscaled = [
      { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 12 },
      { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 12 },
    ]
    const observation = [
      { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 11 },
      { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 11 },
    ]

    const result = alignAccuracySamples(original, downscaled, observation)

    // Should only count station S1 at time once
    expect(result.samples).toHaveLength(1)
    // One duplicate per layer: 3 total
    expect(result.duplicatesRemoved).toBe(3)
  })
})

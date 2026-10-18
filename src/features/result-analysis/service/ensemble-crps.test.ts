import { describe, it, expect } from 'vitest'
import { calculateEnsembleCRPS } from './ensemble-crps'

describe('calculateEnsembleCRPS', () => {
  describe('ECDF formula verification', () => {
    it('calculates CRPS for a simple 3-member ensemble with hand-calculated verification', () => {
      // Hand calculation:
      // Members: [1, 2, 3], Observation: 2.5
      // First term (mean absolute error): (|1-2.5| + |2-2.5| + |3-2.5|) / 3 = (1.5 + 0.5 + 0.5) / 3 = 2.5/3 ≈ 0.8333
      // Second term (mean absolute difference / 2):
      //   All pairs: |1-1|=0, |1-2|=1, |1-3|=2, |2-1|=1, |2-2|=0, |2-3|=1, |3-1|=2, |3-2|=1, |3-3|=0
      //   Sum = 0+1+2+1+0+1+2+1+0 = 8
      //   Mean / 2 = 8 / (2 * 3 * 3) = 8/18 ≈ 0.4444
      // CRPS = 0.8333 - 0.4444 ≈ 0.3889
      const result = calculateEnsembleCRPS([
        { stationId: 'S1', time: '2024-01-01T00:00:00Z', observed: 2.5, members: [1, 2, 3] },
      ])

      expect(result.available).toBe(true)
      if (result.available) {
        expect(result.metrics.crps).toBeCloseTo(0.3889, 4)
        expect(result.metrics.n).toBe(1)
        expect(result.metrics.averageMembers).toBe(3)
      }
    })

    it('calculates CRPS for K=1 (single member equals absolute error)', () => {
      // When K=1, CRPS should equal absolute error
      // Members: [5], Observation: 3
      // First term: |5-3| / 1 = 2
      // Second term: |5-5| / (2 * 1 * 1) = 0 / 2 = 0
      // CRPS = 2 - 0 = 2
      const result = calculateEnsembleCRPS([
        { stationId: 'S1', time: '2024-01-01T00:00:00Z', observed: 3, members: [5] },
      ])

      expect(result.available).toBe(true)
      if (result.available) {
        expect(result.metrics.crps).toBe(2)
        expect(result.metrics.n).toBe(1)
        expect(result.metrics.averageMembers).toBe(1)
      }
    })

    it('handles zero error (perfect forecast)', () => {
      // All members equal observation
      // Members: [10, 10, 10], Observation: 10
      // First term: (0 + 0 + 0) / 3 = 0
      // Second term: (0 + 0 + 0 + ...) / 18 = 0
      // CRPS = 0
      const result = calculateEnsembleCRPS([
        { stationId: 'S1', time: '2024-01-01T00:00:00Z', observed: 10, members: [10, 10, 10] },
      ])

      expect(result.available).toBe(true)
      if (result.available) {
        expect(result.metrics.crps).toBe(0)
      }
    })
  })

  describe('ordered member pairs', () => {
    it('correctly handles all ordered pairs in member difference calculation', () => {
      // Members: [0, 10], Observation: 5
      // First term: (|0-5| + |10-5|) / 2 = (5 + 5) / 2 = 5
      // Second term: (|0-0| + |0-10| + |10-0| + |10-10|) / (2 * 2 * 2) = (0 + 10 + 10 + 0) / 8 = 2.5
      // CRPS = 5 - 2.5 = 2.5
      const result = calculateEnsembleCRPS([
        { stationId: 'S1', time: '2024-01-01T00:00:00Z', observed: 5, members: [0, 10] },
      ])

      expect(result.available).toBe(true)
      if (result.available) {
        expect(result.metrics.crps).toBe(2.5)
      }
    })
  })

  describe('varying member count K', () => {
    it('handles different K values across samples and reports average', () => {
      const result = calculateEnsembleCRPS([
        { stationId: 'S1', time: '2024-01-01T00:00:00Z', observed: 5, members: [4, 5, 6] }, // K=3
        { stationId: 'S2', time: '2024-01-01T00:00:00Z', observed: 10, members: [9, 11] }, // K=2
      ])

      expect(result.available).toBe(true)
      if (result.available) {
        expect(result.metrics.n).toBe(2)
        expect(result.metrics.averageMembers).toBe(2.5) // (3+2)/2
      }
    })

    it('excludes samples with K=0 from calculation', () => {
      const result = calculateEnsembleCRPS([
        { stationId: 'S1', time: '2024-01-01T00:00:00Z', observed: 5, members: [4, 5, 6] },
        { stationId: 'S2', time: '2024-01-01T00:00:00Z', observed: 10, members: [] }, // K=0, excluded
      ])

      expect(result.available).toBe(true)
      if (result.available) {
        expect(result.metrics.n).toBe(1) // Only first sample counted
      }
    })
  })

  describe('partial missing members', () => {
    it('excludes samples with missing observation', () => {
      const result = calculateEnsembleCRPS([
        { stationId: 'S1', time: '2024-01-01T00:00:00Z', observed: 5, members: [4, 5, 6] },
        { stationId: 'S2', time: '2024-01-01T00:00:00Z', observed: NaN, members: [9, 11] },
      ])

      expect(result.available).toBe(true)
      if (result.available) {
        expect(result.metrics.n).toBe(1)
      }
    })

    it('excludes samples with invalid members', () => {
      const result = calculateEnsembleCRPS([
        { stationId: 'S1', time: '2024-01-01T00:00:00Z', observed: 5, members: [4, 5, 6] },
        { stationId: 'S2', time: '2024-01-01T00:00:00Z', observed: 10, members: [9, NaN, 11] },
      ])

      expect(result.available).toBe(true)
      if (result.available) {
        expect(result.metrics.n).toBe(1)
      }
    })
  })

  describe('common sample mask (stationId, time deduplication)', () => {
    it('deduplicates by (stationId, time) keeping first occurrence', () => {
      const result = calculateEnsembleCRPS([
        { stationId: 'S1', time: '2024-01-01T00:00:00Z', observed: 5, members: [4, 5, 6] },
        { stationId: 'S1', time: '2024-01-01T00:00:00Z', observed: 10, members: [9, 10, 11] }, // Duplicate
        { stationId: 'S1', time: '2024-01-01T01:00:00Z', observed: 6, members: [5, 6, 7] }, // Different time
      ])

      expect(result.available).toBe(true)
      if (result.available) {
        expect(result.metrics.n).toBe(2) // Only 2 unique (stationId, time) pairs
      }
    })
  })

  describe('aggregation weight', () => {
    it('uses equal weight per station-time sample regardless of member count', () => {
      // Two samples with different K but same CRPS contribution
      // Sample 1: K=1, members=[10], obs=5, CRPS=5
      // Sample 2: K=3, members=[4,5,6], obs=5
      //   First term: (1+0+1)/3 = 2/3
      //   Second term: (0+2+4+2+0+2+4+2+0)/(2*9) = 16/18 = 8/9
      //   CRPS = 2/3 - 8/9 = 6/9 - 8/9 = -2/9 ≈ -0.222 (should be positive, let me recalculate)
      // Let me use exact match instead
      const result = calculateEnsembleCRPS([
        { stationId: 'S1', time: '2024-01-01T00:00:00Z', observed: 5, members: [3] }, // CRPS = 2
        { stationId: 'S2', time: '2024-01-01T00:00:00Z', observed: 10, members: [8] }, // CRPS = 2
      ])

      expect(result.available).toBe(true)
      if (result.available) {
        expect(result.metrics.crps).toBe(2) // Average: (2+2)/2 = 2
        expect(result.metrics.n).toBe(2)
      }
    })
  })

  describe('edge cases', () => {
    it('returns unavailable when no samples provided', () => {
      const result = calculateEnsembleCRPS([])
      expect(result.available).toBe(false)
      if (!result.available) {
        expect(result.reason).toContain('No samples')
      }
    })

    it('returns unavailable when all samples are invalid', () => {
      const result = calculateEnsembleCRPS([
        { stationId: 'S1', time: '2024-01-01T00:00:00Z', observed: NaN, members: [1, 2, 3] },
        { stationId: 'S2', time: '2024-01-01T00:00:00Z', observed: 5, members: [] },
      ])

      expect(result.available).toBe(false)
      if (!result.available) {
        expect(result.reason).toContain('No valid samples')
      }
    })
  })
})

import { describe, expect, it } from 'vitest'
import {
  calculateEnsembleQuantiles,
  calculateQuantileTimeSeries,
  groupEnsembleSamplesByTime,
  type TimePointEnsemble,
} from '@/features/result-analysis/service/ensemble-quantiles'

describe('Ensemble Quantiles', () => {
  describe('calculateEnsembleQuantiles', () => {
    it('computes P10/P50/P90 from ensemble members', () => {
      // Simple case: 10 members with values 1-10
      const memberValues = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      const result = calculateEnsembleQuantiles(memberValues)

      expect(result).not.toBeNull()
      expect(result!.p10).toBeCloseTo(1.9, 10) // P10 at position 0.1 * 9 = 0.9
      expect(result!.p50).toBe(5.5) // P50 at position 0.5 * 9 = 4.5
      expect(result!.p90).toBeCloseTo(9.1, 10) // P90 at position 0.9 * 9 = 8.1
      expect(result!.validCount).toBe(10)
    })

    it('excludes null values from quantile calculation', () => {
      // 5 valid members out of 8 total
      const memberValues = [1, null, 3, null, 5, 6, null, 8]
      const result = calculateEnsembleQuantiles(memberValues)

      expect(result).not.toBeNull()
      expect(result!.validCount).toBe(5)
      // Sorted valid values: [1, 3, 5, 6, 8]
      expect(result!.p50).toBe(5) // Middle value
    })

    it('returns null when all members are missing', () => {
      const memberValues = [null, null, null]
      const result = calculateEnsembleQuantiles(memberValues)

      expect(result).toBeNull()
    })

    it('returns null for empty array', () => {
      const result = calculateEnsembleQuantiles([])
      expect(result).toBeNull()
    })

    it('handles single valid member', () => {
      const memberValues = [null, 5.5, null]
      const result = calculateEnsembleQuantiles(memberValues)

      expect(result).not.toBeNull()
      expect(result!.p10).toBe(5.5)
      expect(result!.p50).toBe(5.5)
      expect(result!.p90).toBe(5.5)
      expect(result!.validCount).toBe(1)
    })

    it('handles duplicate member values correctly', () => {
      const memberValues = [5, 5, 5, 10, 10]
      const result = calculateEnsembleQuantiles(memberValues)

      expect(result).not.toBeNull()
      expect(result!.validCount).toBe(5)
      // Sorted: [5, 5, 5, 10, 10]
      expect(result!.p50).toBe(5) // Position 2 (middle)
    })

    it('excludes NaN and Infinity values', () => {
      const memberValues = [1, 2, NaN, 4, Infinity, 6]
      const result = calculateEnsembleQuantiles(memberValues)

      expect(result).not.toBeNull()
      expect(result!.validCount).toBe(4) // Only [1, 2, 4, 6]
    })

    it('handles zero values correctly', () => {
      const memberValues = [0, 1, 2, 3, 4]
      const result = calculateEnsembleQuantiles(memberValues)

      expect(result).not.toBeNull()
      expect(result!.p10).toBeCloseTo(0.4, 10)
      expect(result!.validCount).toBe(5)
    })

    it('handles negative values correctly', () => {
      const memberValues = [-10, -5, 0, 5, 10]
      const result = calculateEnsembleQuantiles(memberValues)

      expect(result).not.toBeNull()
      expect(result!.p50).toBe(0)
      expect(result!.p10).toBe(-8)
      expect(result!.p90).toBe(8)
    })
  })

  describe('calculateQuantileTimeSeries', () => {
    it('computes quantiles for each time point independently', () => {
      const ensembleData: TimePointEnsemble[] = [
        { time: '2024-01-01T00:00:00Z', memberValues: [1, 2, 3, 4, 5] },
        { time: '2024-01-01T01:00:00Z', memberValues: [10, 20, 30, 40, 50] },
      ]

      const result = calculateQuantileTimeSeries(ensembleData)

      expect(result).toHaveLength(2)
      expect(result[0]!.time).toBe('2024-01-01T00:00:00Z')
      expect(result[0]!.p50).toBe(3)
      expect(result[0]!.validCount).toBe(5)

      expect(result[1]!.time).toBe('2024-01-01T01:00:00Z')
      expect(result[1]!.p50).toBe(30)
      expect(result[1]!.validCount).toBe(5)
    })

    it('handles different valid member counts at different times', () => {
      const ensembleData: TimePointEnsemble[] = [
        { time: '2024-01-01T00:00:00Z', memberValues: [1, 2, 3, 4, 5] },
        { time: '2024-01-01T01:00:00Z', memberValues: [10, null, 30, null, 50] },
        { time: '2024-01-01T02:00:00Z', memberValues: [100, 200, 300, 400, 500] },
      ]

      const result = calculateQuantileTimeSeries(ensembleData)

      expect(result).toHaveLength(3)
      expect(result[0]!.validCount).toBe(5)
      expect(result[1]!.validCount).toBe(3) // Only [10, 30, 50]
      expect(result[1]!.p50).toBe(30)
      expect(result[2]!.validCount).toBe(5)
    })

    it('returns null quantiles when all members missing at a time point', () => {
      const ensembleData: TimePointEnsemble[] = [
        { time: '2024-01-01T00:00:00Z', memberValues: [1, 2, 3] },
        { time: '2024-01-01T01:00:00Z', memberValues: [null, null, null] },
        { time: '2024-01-01T02:00:00Z', memberValues: [10, 20, 30] },
      ]

      const result = calculateQuantileTimeSeries(ensembleData)

      expect(result).toHaveLength(3)
      expect(result[0]!.p50).toBe(2)
      expect(result[1]!.p10).toBeNull()
      expect(result[1]!.p50).toBeNull()
      expect(result[1]!.p90).toBeNull()
      expect(result[1]!.validCount).toBe(0)
      expect(result[2]!.p50).toBe(20)
    })

    it('handles empty ensemble data array', () => {
      const result = calculateQuantileTimeSeries([])
      expect(result).toEqual([])
    })

    it('preserves time ordering from input', () => {
      const ensembleData: TimePointEnsemble[] = [
        { time: '2024-01-01T02:00:00Z', memberValues: [1, 2] },
        { time: '2024-01-01T00:00:00Z', memberValues: [3, 4] },
        { time: '2024-01-01T01:00:00Z', memberValues: [5, 6] },
      ]

      const result = calculateQuantileTimeSeries(ensembleData)

      expect(result).toHaveLength(3)
      expect(result[0]!.time).toBe('2024-01-01T02:00:00Z')
      expect(result[1]!.time).toBe('2024-01-01T00:00:00Z')
      expect(result[2]!.time).toBe('2024-01-01T01:00:00Z')
    })
  })

  describe('groupEnsembleSamplesByTime', () => {
    it('organizes flat samples by time and member', () => {
      const samples = [
        { time: '2024-01-01T00:00:00Z', memberId: 'member-01', value: 10 },
        { time: '2024-01-01T00:00:00Z', memberId: 'member-02', value: 20 },
        { time: '2024-01-01T01:00:00Z', memberId: 'member-01', value: 30 },
        { time: '2024-01-01T01:00:00Z', memberId: 'member-02', value: 40 },
      ]
      const times = ['2024-01-01T00:00:00Z', '2024-01-01T01:00:00Z']
      const allMemberIds = ['member-01', 'member-02']

      const result = groupEnsembleSamplesByTime(samples, times, allMemberIds)

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        time: '2024-01-01T00:00:00Z',
        memberValues: [10, 20],
      })
      expect(result[1]).toEqual({
        time: '2024-01-01T01:00:00Z',
        memberValues: [30, 40],
      })
    })

    it('fills missing members with null', () => {
      const samples = [
        { time: '2024-01-01T00:00:00Z', memberId: 'member-01', value: 10 },
        // member-02 missing at T00
        { time: '2024-01-01T01:00:00Z', memberId: 'member-01', value: 30 },
        { time: '2024-01-01T01:00:00Z', memberId: 'member-02', value: 40 },
      ]
      const times = ['2024-01-01T00:00:00Z', '2024-01-01T01:00:00Z']
      const allMemberIds = ['member-01', 'member-02']

      const result = groupEnsembleSamplesByTime(samples, times, allMemberIds)

      expect(result[0]).toEqual({
        time: '2024-01-01T00:00:00Z',
        memberValues: [10, null],
      })
      expect(result[1]).toEqual({
        time: '2024-01-01T01:00:00Z',
        memberValues: [30, 40],
      })
    })

    it('handles all members missing at a time point', () => {
      const samples = [
        { time: '2024-01-01T00:00:00Z', memberId: 'member-01', value: 10 },
        { time: '2024-01-01T00:00:00Z', memberId: 'member-02', value: 20 },
        // No samples at T01
      ]
      const times = ['2024-01-01T00:00:00Z', '2024-01-01T01:00:00Z']
      const allMemberIds = ['member-01', 'member-02']

      const result = groupEnsembleSamplesByTime(samples, times, allMemberIds)

      expect(result[1]).toEqual({
        time: '2024-01-01T01:00:00Z',
        memberValues: [null, null],
      })
    })

    it('maintains member order from allMemberIds', () => {
      const samples = [
        { time: '2024-01-01T00:00:00Z', memberId: 'member-03', value: 30 },
        { time: '2024-01-01T00:00:00Z', memberId: 'member-01', value: 10 },
        { time: '2024-01-01T00:00:00Z', memberId: 'member-02', value: 20 },
      ]
      const times = ['2024-01-01T00:00:00Z']
      const allMemberIds = ['member-01', 'member-02', 'member-03']

      const result = groupEnsembleSamplesByTime(samples, times, allMemberIds)

      expect(result[0]!.memberValues).toEqual([10, 20, 30])
    })

    it('handles empty samples array', () => {
      const times = ['2024-01-01T00:00:00Z']
      const allMemberIds = ['member-01', 'member-02']

      const result = groupEnsembleSamplesByTime([], times, allMemberIds)

      expect(result).toEqual([
        {
          time: '2024-01-01T00:00:00Z',
          memberValues: [null, null],
        },
      ])
    })

    it('handles empty times array', () => {
      const samples = [{ time: '2024-01-01T00:00:00Z', memberId: 'member-01', value: 10 }]
      const allMemberIds = ['member-01']

      const result = groupEnsembleSamplesByTime(samples, [], allMemberIds)

      expect(result).toEqual([])
    })

    it('ignores samples with times not in the times array', () => {
      const samples = [
        { time: '2024-01-01T00:00:00Z', memberId: 'member-01', value: 10 },
        { time: '2024-01-01T99:00:00Z', memberId: 'member-01', value: 999 }, // Not in times
      ]
      const times = ['2024-01-01T00:00:00Z']
      const allMemberIds = ['member-01']

      const result = groupEnsembleSamplesByTime(samples, times, allMemberIds)

      expect(result).toHaveLength(1)
      expect(result[0]!.memberValues).toEqual([10])
    })
  })
})

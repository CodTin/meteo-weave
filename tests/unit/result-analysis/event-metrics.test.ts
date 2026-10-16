import { describe, it, expect } from 'vitest'
import {
  type EventThreshold,
  type EventCounts,
  classifyEvents,
  calculateEventMetrics,
} from '@/features/result-analysis/service/event-metrics'

describe('Event Metrics', () => {
  describe('classifyEvents', () => {
    it('should classify events with greater-than threshold', () => {
      const threshold: EventThreshold = {
        value: 25,
        direction: 'greater',
        inclusive: false,
        unit: '°C',
        variable: 'temperature',
      }

      const observed = [20, 30, 26, 22] // Events at indices 1, 2
      const predicted = [28, 32, 24, 23] // Events at indices 0, 1

      const result = classifyEvents(observed, predicted, threshold)

      expect(result).toEqual({
        truePositives: 1, // Index 1: both > 25
        falsePositives: 1, // Index 0: predicted > 25, observed <= 25
        falseNegatives: 1, // Index 2: observed > 25, predicted <= 25
        trueNegatives: 1, // Index 3: both <= 25
      })
    })

    it('should classify events with less-than threshold', () => {
      const threshold: EventThreshold = {
        value: 10,
        direction: 'less',
        inclusive: true,
        unit: 'mm',
        variable: 'precipitation',
      }

      const observed = [5, 12, 10, 8] // Events at indices 0, 2, 3
      const predicted = [6, 11, 15, 10] // Events at indices 0, 3

      const result = classifyEvents(observed, predicted, threshold)

      expect(result).toEqual({
        truePositives: 2, // Indices 0, 3: both <= 10
        falsePositives: 0, // No cases where predicted <= 10 but observed > 10
        falseNegatives: 1, // Index 2: observed <= 10, predicted > 10
        trueNegatives: 1, // Index 1: both > 10
      })
    })

    it('should handle inclusive vs exclusive boundaries correctly', () => {
      const thresholdExclusive: EventThreshold = {
        value: 25,
        direction: 'greater',
        inclusive: false,
        unit: '°C',
        variable: 'temperature',
      }

      const thresholdInclusive: EventThreshold = {
        value: 25,
        direction: 'greater',
        inclusive: true,
        unit: '°C',
        variable: 'temperature',
      }

      const observed = [25, 26]
      const predicted = [25, 26]

      const exclusive = classifyEvents(observed, predicted, thresholdExclusive)
      const inclusive = classifyEvents(observed, predicted, thresholdInclusive)

      // Exclusive: 25 is not an event (> 25 required)
      expect(exclusive.truePositives).toBe(1) // Only index 1
      expect(exclusive.trueNegatives).toBe(1) // Only index 0

      // Inclusive: 25 is an event (>= 25 qualifies)
      expect(inclusive.truePositives).toBe(2) // Both indices
      expect(inclusive.trueNegatives).toBe(0)
    })

    it('should reject mismatched sample lengths', () => {
      const threshold: EventThreshold = {
        value: 25,
        direction: 'greater',
        inclusive: false,
        unit: '°C',
        variable: 'temperature',
      }

      expect(() => {
        classifyEvents([20, 30], [28], threshold)
      }).toThrow('Sample count mismatch')
    })

    it('should reject empty samples', () => {
      const threshold: EventThreshold = {
        value: 25,
        direction: 'greater',
        inclusive: false,
        unit: '°C',
        variable: 'temperature',
      }

      expect(() => {
        classifyEvents([], [], threshold)
      }).toThrow('No samples provided')
    })

    it('should handle samples with NaN values by excluding them', () => {
      const threshold: EventThreshold = {
        value: 25,
        direction: 'greater',
        inclusive: false,
        unit: '°C',
        variable: 'temperature',
      }

      const observed = [20, NaN, 30, 26]
      const predicted = [28, 32, 32, 24]

      const result = classifyEvents(observed, predicted, threshold)

      // Index 0: obs=20 (not event), pred=28 (event) → FP
      // Index 1: excluded due to NaN
      // Index 2: obs=30 (event), pred=32 (event) → TP
      // Index 3: obs=26 (event), pred=24 (not event) → FN
      expect(result.truePositives).toBe(1) // Index 2
      expect(result.falsePositives).toBe(1) // Index 0
      expect(result.falseNegatives).toBe(1) // Index 3
      expect(result.trueNegatives).toBe(0) // No TN cases
    })
  })

  describe('calculateEventMetrics', () => {
    it('should calculate hit rate and precision correctly', () => {
      const counts: EventCounts = {
        truePositives: 8,
        falsePositives: 2,
        falseNegatives: 3,
        trueNegatives: 7,
      }

      const metrics = calculateEventMetrics(counts)

      expect(metrics.available).toBe(true)
      if (metrics.available) {
        expect(metrics.hitRate).toBe(8 / (8 + 3)) // TP / (TP + FN) = 8/11
        expect(metrics.precision).toBe(8 / (8 + 2)) // TP / (TP + FP) = 8/10
        expect(metrics.counts).toEqual(counts)
      }
    })

    it('should handle no observed events (hit rate unavailable)', () => {
      const counts: EventCounts = {
        truePositives: 0,
        falsePositives: 5,
        falseNegatives: 0,
        trueNegatives: 10,
      }

      const metrics = calculateEventMetrics(counts)

      expect(metrics.available).toBe(false)
      if (!metrics.available) {
        expect(metrics.reason).toContain('命中率不可用')
        expect(metrics.reason).toContain('无观测事件')
        expect(metrics.counts).toEqual(counts)
      }
    })

    it('should handle no predicted events (precision unavailable)', () => {
      const counts: EventCounts = {
        truePositives: 0,
        falsePositives: 0,
        falseNegatives: 8,
        trueNegatives: 12,
      }

      const metrics = calculateEventMetrics(counts)

      expect(metrics.available).toBe(false)
      if (!metrics.available) {
        expect(metrics.reason).toContain('精确率不可用')
        expect(metrics.reason).toContain('无预测预警')
        expect(metrics.counts).toEqual(counts)
      }
    })

    it('should handle both no events and no predictions', () => {
      const counts: EventCounts = {
        truePositives: 0,
        falsePositives: 0,
        falseNegatives: 0,
        trueNegatives: 20,
      }

      const metrics = calculateEventMetrics(counts)

      expect(metrics.available).toBe(false)
      if (!metrics.available) {
        expect(metrics.reason).toContain('命中率不可用')
        expect(metrics.reason).toContain('精确率不可用')
        expect(metrics.counts).toEqual(counts)
      }
    })

    it('should preserve counts even when metrics are unavailable', () => {
      const counts: EventCounts = {
        truePositives: 0,
        falsePositives: 3,
        falseNegatives: 0,
        trueNegatives: 17,
      }

      const metrics = calculateEventMetrics(counts)

      expect(metrics.available).toBe(false)
      if (!metrics.available) {
        expect(metrics.counts).toEqual(counts)
        expect(metrics.counts.falsePositives).toBe(3)
      }
    })

    it('should never produce Infinity or NaN', () => {
      const counts: EventCounts = {
        truePositives: 0,
        falsePositives: 0,
        falseNegatives: 0,
        trueNegatives: 10,
      }

      const metrics = calculateEventMetrics(counts)

      if (metrics.available) {
        expect(Number.isFinite(metrics.hitRate)).toBe(true)
        expect(Number.isFinite(metrics.precision)).toBe(true)
      }
    })
  })

  describe('edge cases', () => {
    it('should handle perfect prediction', () => {
      const threshold: EventThreshold = {
        value: 25,
        direction: 'greater',
        inclusive: false,
        unit: '°C',
        variable: 'temperature',
      }

      const observed = [20, 30, 26, 22]
      const predicted = [20, 30, 26, 22]

      const counts = classifyEvents(observed, predicted, threshold)
      const metrics = calculateEventMetrics(counts)

      expect(metrics.available).toBe(true)
      if (metrics.available) {
        expect(metrics.hitRate).toBe(1.0)
        expect(metrics.precision).toBe(1.0)
      }
    })

    it('should handle all false positives', () => {
      const threshold: EventThreshold = {
        value: 25,
        direction: 'greater',
        inclusive: false,
        unit: '°C',
        variable: 'temperature',
      }

      const observed = [20, 21, 22, 23]
      const predicted = [30, 31, 32, 33]

      const counts = classifyEvents(observed, predicted, threshold)
      const metrics = calculateEventMetrics(counts)

      expect(counts.truePositives).toBe(0)
      expect(counts.falsePositives).toBe(4)
      expect(counts.falseNegatives).toBe(0)
      expect(metrics.available).toBe(false)
    })

    it('should handle all false negatives', () => {
      const threshold: EventThreshold = {
        value: 25,
        direction: 'greater',
        inclusive: false,
        unit: '°C',
        variable: 'temperature',
      }

      const observed = [30, 31, 32, 33]
      const predicted = [20, 21, 22, 23]

      const counts = classifyEvents(observed, predicted, threshold)
      const metrics = calculateEventMetrics(counts)

      expect(counts.truePositives).toBe(0)
      expect(counts.falsePositives).toBe(0)
      expect(counts.falseNegatives).toBe(4)
      expect(metrics.available).toBe(false)
    })
  })
})

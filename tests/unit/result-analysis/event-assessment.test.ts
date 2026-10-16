import { describe, it, expect } from 'vitest'
import {
  type EventAssessmentDefinition,
  assessEvents,
} from '@/features/result-analysis/service/event-metrics'

describe('Event Assessment with Accumulation', () => {
  describe('assessEvents with precipitation accumulation', () => {
    it('should assess precipitation events with 24h accumulation', () => {
      const definition: EventAssessmentDefinition = {
        threshold: {
          value: 50,
          direction: 'greater',
          inclusive: false,
          unit: 'mm',
          variable: 'precipitation',
        },
        accumulation: {
          interval: '24h',
          description: '24小时累计降水',
        },
      }

      const observed = [45, 55, 60, 48]
      const predicted = [52, 58, 45, 47]

      const result = assessEvents(observed, predicted, definition)

      expect(result.available).toBe(true)
      if (result.available) {
        expect(result.counts.truePositives).toBe(1) // Index 1
        expect(result.counts.falsePositives).toBe(1) // Index 0
        expect(result.counts.falseNegatives).toBe(1) // Index 2
        expect(result.hitRate).toBeCloseTo(0.5) // 1/(1+1)
        expect(result.precision).toBeCloseTo(0.5) // 1/(1+1)
        expect(result.definition).toEqual(definition)
      }
    })

    it('should include definition in result', () => {
      const definition: EventAssessmentDefinition = {
        threshold: {
          value: 35,
          direction: 'greater',
          inclusive: true,
          unit: '°C',
          variable: 'temperature',
        },
      }

      const observed = [34, 35, 36]
      const predicted = [35, 36, 37]

      const result = assessEvents(observed, predicted, definition)

      expect(result.available).toBe(true)
      if (result.available) {
        expect(result.definition).toEqual(definition)
      }
    })
  })

  describe('assessEvents with wind speed', () => {
    it('should assess wind speed events', () => {
      const definition: EventAssessmentDefinition = {
        threshold: {
          value: 10,
          direction: 'greater',
          inclusive: true,
          unit: 'm/s',
          variable: 'wind',
        },
      }

      const observed = [8, 12, 15, 9]
      const predicted = [11, 13, 8, 7]

      const result = assessEvents(observed, predicted, definition)

      expect(result.available).toBe(true)
      if (result.available) {
        expect(result.counts.truePositives).toBe(1) // Index 1
        expect(result.counts.falsePositives).toBe(1) // Index 0
        expect(result.counts.falseNegatives).toBe(1) // Index 2
        expect(result.counts.trueNegatives).toBe(1) // Index 3
      }
    })
  })

  describe('assessEvents edge cases', () => {
    it('should return unavailable when no observed events', () => {
      const definition: EventAssessmentDefinition = {
        threshold: {
          value: 100,
          direction: 'greater',
          inclusive: false,
          unit: 'mm',
          variable: 'precipitation',
        },
      }

      const observed = [10, 20, 30, 40]
      const predicted = [110, 120, 30, 40]

      const result = assessEvents(observed, predicted, definition)

      expect(result.available).toBe(false)
      if (!result.available) {
        expect(result.reason).toContain('命中率不可用')
        expect(result.counts.falsePositives).toBe(2)
        expect(result.definition).toEqual(definition)
      }
    })

    it('should return unavailable when no predicted events', () => {
      const definition: EventAssessmentDefinition = {
        threshold: {
          value: 100,
          direction: 'greater',
          inclusive: false,
          unit: 'mm',
          variable: 'precipitation',
        },
      }

      const observed = [110, 120, 30, 40]
      const predicted = [10, 20, 30, 40]

      const result = assessEvents(observed, predicted, definition)

      expect(result.available).toBe(false)
      if (!result.available) {
        expect(result.reason).toContain('精确率不可用')
        expect(result.counts.falseNegatives).toBe(2)
        expect(result.definition).toEqual(definition)
      }
    })

    it('should preserve definition in unavailable results', () => {
      const definition: EventAssessmentDefinition = {
        threshold: {
          value: 50,
          direction: 'greater',
          inclusive: false,
          unit: 'mm',
          variable: 'precipitation',
        },
        accumulation: {
          interval: '6h',
          description: '6小时累计降水',
        },
      }

      const observed = [10, 20]
      const predicted = [10, 20]

      const result = assessEvents(observed, predicted, definition)

      expect(result.available).toBe(false)
      if (!result.available) {
        expect(result.definition).toEqual(definition)
        expect(result.definition.accumulation).toEqual({
          interval: '6h',
          description: '6小时累计降水',
        })
      }
    })
  })

  describe('sample count validation', () => {
    it('should include sample count in result', () => {
      const definition: EventAssessmentDefinition = {
        threshold: {
          value: 25,
          direction: 'greater',
          inclusive: false,
          unit: '°C',
          variable: 'temperature',
        },
      }

      const observed = [20, 30, 26, 22]
      const predicted = [28, 32, 24, 23]

      const result = assessEvents(observed, predicted, definition)

      expect(result.available).toBe(true)
      if (result.available) {
        expect(result.n).toBe(4)
      }
    })

    it('should exclude NaN samples from count', () => {
      const definition: EventAssessmentDefinition = {
        threshold: {
          value: 25,
          direction: 'greater',
          inclusive: false,
          unit: '°C',
          variable: 'temperature',
        },
      }

      const observed = [20, NaN, 30, 26]
      const predicted = [28, 32, NaN, 24]

      const result = assessEvents(observed, predicted, definition)

      expect(result.available).toBe(true)
      if (result.available) {
        // Only indices 0 and 3 are valid (index 1 has NaN in observed, index 2 has NaN in predicted)
        expect(result.n).toBe(2)
      }
    })
  })
})

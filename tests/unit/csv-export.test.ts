import { describe, it, expect } from 'vitest'
import {
  validateExportRequest,
  generateCsvContent,
  encodeCsvField,
} from '@/server/services/csv-export.server'

describe('CSV Export', () => {
  describe('validation', () => {
    it('rejects export request when bbox width exceeds 100km', () => {
      // 1.1 degrees at 30°N latitude is ~106km
      const result = validateExportRequest({
        taskId: 'test-task-id',
        bbox: {
          west: 120.0,
          east: 121.1, // ~106km at 30°N
          south: 30.0,
          north: 30.1,
        },
        timeRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-02T00:00:00Z',
        },
        dataTypes: ['downscaled'],
      })

      expect(result).not.toBeNull()
      expect(result?.code).toBe('BBOX_TOO_LARGE')
    })

    it('rejects export request when bbox height exceeds 100km', () => {
      // 0.91 degrees latitude is ~101km
      const result = validateExportRequest({
        taskId: 'test-task-id',
        bbox: {
          west: 120.0,
          east: 120.5,
          south: 30.0,
          north: 30.91, // ~101km height
        },
        timeRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-02T00:00:00Z',
        },
        dataTypes: ['downscaled'],
      })

      expect(result).not.toBeNull()
      expect(result?.code).toBe('BBOX_TOO_LARGE')
    })

    it('rejects export request when duration exceeds 30 days', () => {
      const result = validateExportRequest({
        taskId: 'test-task-id',
        bbox: {
          west: 120.0,
          east: 120.5,
          south: 30.0,
          north: 30.5,
        },
        timeRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-02-01T00:00:00Z', // 31 days
        },
        dataTypes: ['downscaled'],
      })

      expect(result).not.toBeNull()
      expect(result?.code).toBe('DURATION_TOO_LONG')
    })

    it('accepts valid export request within limits', () => {
      const result = validateExportRequest({
        taskId: 'test-task-id',
        bbox: {
          west: 120.0,
          east: 120.5, // ~43km at 30°N
          south: 30.0,
          north: 30.5, // ~55km
        },
        timeRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-15T00:00:00Z', // 14 days
        },
        dataTypes: ['downscaled'],
      })

      expect(result).toBeNull()
    })
  })

  describe('CSV encoding', () => {
    it('protects against formula injection in text fields', () => {
      const csv = generateCsvContent({
        taskId: '=cmd|something',
        bbox: {
          west: 120.0,
          east: 120.5,
          south: 30.0,
          north: 30.5,
        },
        timeRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-02T00:00:00Z',
        },
        dataTypes: ['downscaled'],
      })

      // CSV should not contain the raw formula - it should be escaped
      expect(csv).not.toMatch(/^=cmd\|something/)
      expect(csv).not.toMatch(/,=cmd\|something,/)
      // It should be escaped with a leading single quote
      expect(csv).toContain("'=cmd|something")
    })

    it('escapes dangerous formula characters', () => {
      expect(encodeCsvField('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)")
      expect(encodeCsvField('+1234')).toBe("'+1234")
      expect(encodeCsvField('-5678')).toBe("'-5678")
      expect(encodeCsvField('@cell')).toBe("'@cell")
    })

    it('handles negative numbers correctly', () => {
      expect(encodeCsvField(-15.5)).toBe('-15.5')
    })

    it('quotes fields with commas', () => {
      expect(encodeCsvField('hello, world')).toBe('"hello, world"')
    })

    it('escapes quotes in quoted fields', () => {
      expect(encodeCsvField('say "hello"')).toBe('"say ""hello"""')
    })
  })
})

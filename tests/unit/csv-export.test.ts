import { describe, it, expect } from 'vitest'
import {
  validateExportRequest,
  generateCsvContent,
  encodeCsvField,
} from '@/server/services/csv-export.server'
import type { DownscalingTask } from '@/features/downscaling-tasks/service/contracts'

const mockTask: DownscalingTask = {
  schemaVersion: 1,
  id: 'test-task',
  name: 'Test Task',
  ownerId: 'researcher',
  configuration: {
    dataSource: 'ecmwf',
    variable: 'temperature',
    region: { west: 119.5, east: 120.5, south: 29.5, north: 30.5 },
    timeRange: { mode: 'forecast', start: '2024-01-01T00:00:00Z', end: '2024-01-03T00:00:00Z' },
    method: 'recommended',
    resolvedMethod: 'deterministic',
    resolution: '3km',
  },
  createdAt: '2024-01-01T00:00:00Z',
  submittedAt: '2024-01-01T00:00:00Z',
  completionAt: '2024-01-01T00:00:10Z',
  status: 'Completed',
  failureReason: null,
  dataSeed: 12345,
  generatorVersion: 'synthetic-temperature-v1',
  referenceSeed: 1729,
  referenceVersion: 'synthetic-observations-v1',
}

describe('CSV Export', () => {
  describe('data type selection', () => {
    it('exports downscaled data type with proper metadata', () => {
      const csv = generateCsvContent(
        {
          taskId: 'test-task',
          bbox: { west: 120.0, east: 120.1, south: 30.0, north: 30.1 },
          timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' },
          dataTypes: ['downscaled'],
        },
        mockTask,
      )

      const lines = csv.split('\n')
      expect(lines[0]).toContain('dataType')
      expect(lines[0]).toContain('sampling')
      expect(lines[0]).toContain('provenance')

      // Check that at least one data row has downscaled type
      const dataRows = lines.slice(1).filter((line) => line.trim())
      const hasDownscaled = dataRows.some((row) => row.includes('downscaled'))
      expect(hasDownscaled).toBe(true)
    })

    it('exports original data type with coarse grid metadata', () => {
      const csv = generateCsvContent(
        {
          taskId: 'test-task',
          bbox: { west: 120.0, east: 120.1, south: 30.0, north: 30.1 },
          timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' },
          dataTypes: ['original'],
        },
        mockTask,
      )

      const lines = csv.split('\n')
      const dataRows = lines.slice(1).filter((line) => line.trim())
      const hasOriginal = dataRows.some((row) => row.includes('original'))
      expect(hasOriginal).toBe(true)
    })

    it('exports observation data type with station metadata', () => {
      const csv = generateCsvContent(
        {
          taskId: 'test-task',
          bbox: { west: 120.0, east: 120.1, south: 30.0, north: 30.1 },
          timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' },
          dataTypes: ['observation'],
        },
        mockTask,
      )

      const lines = csv.split('\n')
      expect(lines[0]).toContain('stationId')

      const dataRows = lines.slice(1).filter((line) => line.trim())
      const hasObservation = dataRows.some((row) => row.includes('observation'))
      expect(hasObservation).toBe(true)
    })

    it('exports combined data types with distinct metadata', () => {
      const csv = generateCsvContent(
        {
          taskId: 'test-task',
          bbox: { west: 120.0, east: 120.1, south: 30.0, north: 30.1 },
          timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' },
          dataTypes: ['original', 'downscaled', 'observation'],
        },
        mockTask,
      )

      const lines = csv.split('\n')
      const dataRows = lines.slice(1).filter((line) => line.trim())

      const hasOriginal = dataRows.some((row) => row.includes('original'))
      const hasDownscaled = dataRows.some((row) => row.includes('downscaled'))
      const hasObservation = dataRows.some((row) => row.includes('observation'))

      expect(hasOriginal).toBe(true)
      expect(hasDownscaled).toBe(true)
      expect(hasObservation).toBe(true)
    })
  })

  describe('variable support', () => {
    it('exports temperature with °C unit', () => {
      const tempTask = {
        ...mockTask,
        configuration: { ...mockTask.configuration, variable: 'temperature' },
      }
      const csv = generateCsvContent(
        {
          taskId: 'test-task',
          bbox: { west: 120.0, east: 120.1, south: 30.0, north: 30.1 },
          timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' },
          dataTypes: ['downscaled'],
        },
        tempTask,
      )

      expect(csv).toContain('temperature')
      expect(csv).toContain('°C')
    })

    it('exports precipitation with mm unit and accumulation metadata', () => {
      const precipTask = {
        ...mockTask,
        configuration: { ...mockTask.configuration, variable: 'precipitation' },
      }
      const csv = generateCsvContent(
        {
          taskId: 'test-task',
          bbox: { west: 120.0, east: 120.1, south: 30.0, north: 30.1 },
          timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' },
          dataTypes: ['downscaled'],
        },
        precipTask,
      )

      const lines = csv.split('\n')
      expect(lines[0]).toContain('accumulationStart')
      expect(lines[0]).toContain('accumulationEnd')
      expect(csv).toContain('precipitation')
      expect(csv).toContain('mm')
    })

    it('exports wind with u10, v10, speed, direction fields and m/s unit', () => {
      const windTask = {
        ...mockTask,
        configuration: { ...mockTask.configuration, variable: 'wind' },
      }
      const csv = generateCsvContent(
        {
          taskId: 'test-task',
          bbox: { west: 120.0, east: 120.1, south: 30.0, north: 30.1 },
          timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' },
          dataTypes: ['downscaled'],
        },
        windTask,
      )

      const lines = csv.split('\n')
      expect(lines[0]).toContain('u10')
      expect(lines[0]).toContain('v10')
      expect(lines[0]).toContain('speed')
      expect(lines[0]).toContain('direction')
      expect(csv).toContain('m/s')
    })

    it('exports pressure with hPa unit', () => {
      const pressureTask = {
        ...mockTask,
        configuration: { ...mockTask.configuration, variable: 'pressure' },
      }
      const csv = generateCsvContent(
        {
          taskId: 'test-task',
          bbox: { west: 120.0, east: 120.1, south: 30.0, north: 30.1 },
          timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' },
          dataTypes: ['downscaled'],
        },
        pressureTask,
      )

      expect(csv).toContain('pressure')
      expect(csv).toContain('hPa')
    })

    it('handles wind direction null for calm conditions', () => {
      const windTask = {
        ...mockTask,
        configuration: { ...mockTask.configuration, variable: 'wind' },
      }
      const csv = generateCsvContent(
        {
          taskId: 'test-task',
          bbox: { west: 120.0, east: 120.1, south: 30.0, north: 30.1 },
          timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' },
          dataTypes: ['downscaled'],
        },
        windTask,
      )

      // Wind direction can be null for calm conditions (speed ~0)
      // Verify the CSV structure allows for null direction
      const lines = csv.split('\n')
      expect(lines[0]).toContain('directionStatus')
    })
  })

  describe('missing data handling', () => {
    it('preserves missing data as empty value with quality indicator', () => {
      const csv = generateCsvContent(
        {
          taskId: 'test-task',
          bbox: { west: 120.0, east: 120.1, south: 30.0, north: 30.1 },
          timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' },
          dataTypes: ['downscaled'],
        },
        mockTask,
      )

      const lines = csv.split('\n')
      expect(lines[0]).toContain('qualityFlag')
    })

    it('distinguishes scientific missing data from generation failures', () => {
      const csv = generateCsvContent(
        {
          taskId: 'test-task',
          bbox: { west: 120.0, east: 120.1, south: 30.0, north: 30.1 },
          timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' },
          dataTypes: ['observation'],
        },
        mockTask,
      )

      // Quality flags should allow distinguishing missing observations from system failures
      const lines = csv.split('\n')
      expect(lines[0]).toContain('qualityFlag')
    })
  })

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
      const csv = generateCsvContent(
        {
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
        },
        mockTask,
      )

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

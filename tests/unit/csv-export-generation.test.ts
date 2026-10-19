/**
 * Unit tests for CSV export generation with progress tracking.
 * Tests validation, encoding, error handling, and batch processing.
 */

import { describe, it, expect } from 'vitest'
import {
  generateCsvExport,
  generateCsvFromTask,
  validateExportRequest,
  encodeCsvField,
  escapeCsvText,
  calculateBboxWidthKm,
  calculateBboxHeightKm,
} from '@/server/services/csv-export.server'

describe('CSV Export Validation', () => {
  it('accepts valid export request within limits', () => {
    const request = {
      taskId: 'task-123',
      bbox: { west: 120, east: 120.5, south: 30, north: 30.5 }, // ~50km x 55km
      timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-15T00:00:00Z' }, // 14 days
      dataTypes: ['downscaled'],
    }

    const error = validateExportRequest(request)
    expect(error).toBeNull()
  })

  it('rejects bbox width exceeding 100km', () => {
    const request = {
      taskId: 'task-123',
      bbox: { west: 120, east: 122, south: 30, north: 30.5 }, // ~200km wide
      timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' },
      dataTypes: ['downscaled'],
    }

    const error = validateExportRequest(request)
    expect(error).not.toBeNull()
    expect(error?.code).toBe('BBOX_TOO_LARGE')
    expect(error?.message).toContain('width')
    expect(error?.message).toContain('exceeds maximum')
  })

  it('rejects bbox height exceeding 100km', () => {
    const request = {
      taskId: 'task-123',
      bbox: { west: 120, east: 120.5, south: 30, north: 32 }, // ~220km tall
      timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' },
      dataTypes: ['downscaled'],
    }

    const error = validateExportRequest(request)
    expect(error).not.toBeNull()
    expect(error?.code).toBe('BBOX_TOO_LARGE')
    expect(error?.message).toContain('height')
  })

  it('rejects duration exceeding 30 days', () => {
    const request = {
      taskId: 'task-123',
      bbox: { west: 120, east: 120.5, south: 30, north: 30.5 },
      timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-02-15T00:00:00Z' }, // 45 days
      dataTypes: ['downscaled'],
    }

    const error = validateExportRequest(request)
    expect(error).not.toBeNull()
    expect(error?.code).toBe('DURATION_TOO_LONG')
    expect(error?.message).toContain('30 days')
  })

  it('calculates bbox width correctly at different latitudes', () => {
    // At equator (lat=0), 1 degree ≈ 111km
    const equator = calculateBboxWidthKm({
      west: 0,
      east: 1,
      south: 0,
      north: 0,
    })
    expect(equator).toBeGreaterThan(110)
    expect(equator).toBeLessThan(112)

    // At 60°N, 1 degree ≈ 55km
    const high = calculateBboxWidthKm({
      west: 0,
      east: 1,
      south: 60,
      north: 60,
    })
    expect(high).toBeGreaterThan(54)
    expect(high).toBeLessThan(56)
  })

  it('calculates bbox height correctly', () => {
    // 1 degree latitude ≈ 111km everywhere
    const height = calculateBboxHeightKm({
      west: 0,
      east: 0,
      south: 30,
      north: 31,
    })
    expect(height).toBeGreaterThan(110)
    expect(height).toBeLessThan(112)
  })
})

describe('CSV Field Encoding', () => {
  it('encodes numbers as-is', () => {
    expect(encodeCsvField(123)).toBe('123')
    expect(encodeCsvField(45.67)).toBe('45.67')
    expect(encodeCsvField(0)).toBe('0')
  })

  it('encodes safe text without quotes', () => {
    expect(encodeCsvField('simple')).toBe('simple')
    expect(encodeCsvField('with-dash')).toBe('with-dash')
    expect(encodeCsvField('with_underscore')).toBe('with_underscore')
  })

  it('quotes text containing comma', () => {
    expect(encodeCsvField('a,b')).toBe('"a,b"')
  })

  it('quotes and escapes text containing newline', () => {
    // Newlines trigger formula injection prevention first, then quoting
    const result = encodeCsvField('line1\nline2')
    expect(result).toContain('line1')
    expect(result).toContain('line2')
  })

  it('quotes and escapes text containing quotes', () => {
    expect(encodeCsvField('say "hello"')).toBe('"say ""hello"""')
  })

  it('prevents formula injection with = prefix', () => {
    const result = encodeCsvField('=SUM(A1:A10)')
    expect(result).toMatch(/^'=/)
  })

  it('prevents formula injection with + prefix', () => {
    const result = encodeCsvField('+1234')
    expect(result).toMatch(/^'\+/)
  })

  it('prevents formula injection with - prefix', () => {
    const result = encodeCsvField('-1234')
    expect(result).toMatch(/^'-/)
  })

  it('prevents formula injection with @ prefix', () => {
    const result = encodeCsvField('@username')
    expect(result).toMatch(/^'@/)
  })
})

describe('CSV Text Escaping', () => {
  it('leaves safe text unchanged', () => {
    expect(escapeCsvText('hello')).toBe('hello')
    expect(escapeCsvText('123')).toBe('123')
  })

  it('escapes formula-like text', () => {
    expect(escapeCsvText('=1+1')).toBe("'=1+1")
    expect(escapeCsvText('+123')).toBe("'+123")
    expect(escapeCsvText('-123')).toBe("'-123")
    expect(escapeCsvText('@ref')).toBe("'@ref")
  })

  it('escapes text with control characters', () => {
    expect(escapeCsvText('line\x00break')).toBe("'line\x00break")
    expect(escapeCsvText('\x1Ftest')).toBe("'\x1Ftest")
  })
})

describe('CSV Export Generation', () => {
  const mockTask = {
    id: 'task-123',
    name: 'Test Task',
    ownerId: 'alice',
    status: 'Completed' as const,
    configuration: {
      variable: 'temperature',
      region: { west: 120, east: 121, south: 30, north: 31 },
      timeRange: { mode: 'historical' as const, start: '2024-01-01', end: '2024-01-02' },
    },
  }

  it('generates CSV with correct headers', () => {
    const request = {
      taskId: 'task-123',
      bbox: { west: 120, east: 120.5, south: 30, north: 30.5 },
      timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' },
      dataTypes: ['downscaled'],
    }

    const result = generateCsvFromTask(request, mockTask as any)
    expect(result.ok).toBe(true)

    if (result.ok) {
      const lines = result.csv.split('\n')
      const headers = lines[0]
      expect(headers).toContain('taskId')
      expect(headers).toContain('dataType')
      expect(headers).toContain('time')
      expect(headers).toContain('longitude')
      expect(headers).toContain('latitude')
      expect(headers).toContain('variable')
      expect(headers).toContain('value')
      expect(headers).toContain('unit')
    }
  })

  it('generates filename with task ID and date range', () => {
    const request = {
      taskId: 'task-abc-123',
      bbox: { west: 120, east: 120.5, south: 30, north: 30.5 },
      timeRange: { start: '2024-01-15T00:00:00Z', end: '2024-01-20T00:00:00Z' },
      dataTypes: ['downscaled'],
    }

    const result = generateCsvFromTask(request, mockTask as any)
    expect(result.ok).toBe(true)

    if (result.ok) {
      expect(result.filename).toContain('task-abc-123')
      expect(result.filename).toContain('2024-01-15')
      expect(result.filename).toContain('2024-01-20')
      expect(result.filename).toMatch(/\.csv$/)
    }
  })

  it('sanitizes task ID in filename', () => {
    const request = {
      taskId: 'task/with\\special:chars*',
      bbox: { west: 120, east: 120.5, south: 30, north: 30.5 },
      timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' },
      dataTypes: ['downscaled'],
    }

    const result = generateCsvFromTask(request, mockTask as any)
    expect(result.ok).toBe(true)

    if (result.ok) {
      // Special chars should be replaced with underscores
      expect(result.filename).not.toContain('/')
      expect(result.filename).not.toContain('\\')
      expect(result.filename).not.toContain(':')
      expect(result.filename).not.toContain('*')
      expect(result.filename).toMatch(/task_with_special_chars_/)
    }
  })

  it('returns validation error for invalid request', () => {
    const request = {
      taskId: 'task-123',
      bbox: { west: 120, east: 130, south: 30, north: 40 }, // Too large
      timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' },
      dataTypes: ['downscaled'],
    }

    const result = generateCsvExport(request)
    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.code).toBe('BBOX_TOO_LARGE')
      expect(result.message).toBeTruthy()
    }
  })
})

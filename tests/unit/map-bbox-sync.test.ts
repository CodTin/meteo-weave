import { describe, it, expect } from 'vitest'
import {
  validateExportRequest,
  calculateBboxWidthKm,
  calculateBboxHeightKm,
  isBboxWithinBounds,
} from '@/server/services/csv-export.server'
import { exportRequest, exportTask } from '../factories/export-task'

describe('Map bbox synchronization', () => {
  describe('bbox validation for map-drawn regions', () => {
    it('accepts valid bbox within 100km limit', () => {
      const task = exportTask({
        region: { west: 119, east: 123, south: 29, north: 33 },
        timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-01-05' },
      })
      const request = {
        ...exportRequest(task, { dataTypes: ['original'] }),
        bbox: {
          west: 120.0,
          east: 120.8, // ~85km at 30°N
          south: 30.0,
          north: 30.8, // ~89km
        },
        timeRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-05T00:00:00Z',
        },
      }

      const result = validateExportRequest(request)
      expect(result).toBeNull()
    })

    it('rejects bbox exceeding 100km width', () => {
      const task = exportTask({
        region: { west: 119, east: 123, south: 29, north: 33 },
        timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-01-05' },
      })
      const request = {
        ...exportRequest(task, { dataTypes: ['original'] }),
        bbox: {
          west: 120.0,
          east: 122.0, // ~200km at 30°N
          south: 30.0,
          north: 30.5,
        },
        timeRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-05T00:00:00Z',
        },
      }

      const result = validateExportRequest(request)
      expect(result).not.toBeNull()
      expect(result?.code).toBe('BBOX_TOO_LARGE')
      expect(result?.message).toMatch(/width.*100km/i)
    })

    it('rejects bbox exceeding 100km height', () => {
      const task = exportTask({
        region: { west: 119, east: 123, south: 29, north: 33 },
        timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-01-05' },
      })
      const request = {
        ...exportRequest(task, { dataTypes: ['original'] }),
        bbox: {
          west: 120.0,
          east: 120.5,
          south: 30.0,
          north: 32.0, // ~222km
        },
        timeRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-05T00:00:00Z',
        },
      }

      const result = validateExportRequest(request)
      expect(result).not.toBeNull()
      expect(result?.code).toBe('BBOX_TOO_LARGE')
      expect(result?.message).toMatch(/height.*100km/i)
    })
  })

  describe('bbox dimension calculations', () => {
    it('calculates width correctly for equatorial regions', () => {
      const bbox = { west: 0, east: 1, south: 0, north: 0.5 }
      const width = calculateBboxWidthKm(bbox)

      // At equator, 1 degree ≈ 111km
      expect(width).toBeCloseTo(111, 0)
    })

    it('calculates width correctly for mid-latitude regions', () => {
      const bbox = { west: 120, east: 121, south: 30, north: 31 }
      const width = calculateBboxWidthKm(bbox)

      // At 30°N, 1 degree longitude ≈ 96km
      expect(width).toBeCloseTo(96, 0)
    })

    it('calculates height correctly regardless of longitude', () => {
      const bbox = { west: 120, east: 121, south: 30, north: 31 }
      const height = calculateBboxHeightKm(bbox)

      // 1 degree latitude ≈ 111km everywhere
      expect(height).toBeCloseTo(111, 0)
    })
  })

  describe('bbox boundary validation', () => {
    it('detects bbox outside task bounds on west side', () => {
      const taskBounds = { west: 120, east: 130, south: 25, north: 35 }
      const exportBbox = { west: 119, east: 125, south: 27, north: 32 }

      const isValid = isBboxWithinBounds(exportBbox, taskBounds)
      expect(isValid).toBe(false)
    })

    it('detects bbox outside task bounds on east side', () => {
      const taskBounds = { west: 120, east: 130, south: 25, north: 35 }
      const exportBbox = { west: 125, east: 131, south: 27, north: 32 }

      const isValid = isBboxWithinBounds(exportBbox, taskBounds)
      expect(isValid).toBe(false)
    })

    it('detects bbox outside task bounds on south side', () => {
      const taskBounds = { west: 120, east: 130, south: 25, north: 35 }
      const exportBbox = { west: 122, east: 128, south: 24, north: 30 }

      const isValid = isBboxWithinBounds(exportBbox, taskBounds)
      expect(isValid).toBe(false)
    })

    it('detects bbox outside task bounds on north side', () => {
      const taskBounds = { west: 120, east: 130, south: 25, north: 35 }
      const exportBbox = { west: 122, east: 128, south: 30, north: 36 }

      const isValid = isBboxWithinBounds(exportBbox, taskBounds)
      expect(isValid).toBe(false)
    })

    it('accepts bbox fully within task bounds', () => {
      const taskBounds = { west: 120, east: 130, south: 25, north: 35 }
      const exportBbox = { west: 122, east: 128, south: 27, north: 32 }

      const isValid = isBboxWithinBounds(exportBbox, taskBounds)
      expect(isValid).toBe(true)
    })

    it('accepts bbox equal to task bounds', () => {
      const taskBounds = { west: 120, east: 130, south: 25, north: 35 }
      const exportBbox = { west: 120, east: 130, south: 25, north: 35 }

      const isValid = isBboxWithinBounds(exportBbox, taskBounds)
      expect(isValid).toBe(true)
    })
  })
})

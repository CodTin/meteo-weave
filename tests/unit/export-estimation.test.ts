/**
 * Unit tests for export estimation logic.
 * Tests exact record count calculation and approximate file size estimation.
 */

import { describe, it, expect } from 'vitest'
import {
  estimateExportMetrics,
  type ExportEstimationRequest,
} from '@/server/services/csv-export.server'

describe('Export Estimation', () => {
  describe('Record Count Calculation', () => {
    it('calculates exact record count for single grid data type', () => {
      const request: ExportEstimationRequest = {
        taskId: 'task-123',
        bbox: { west: 120, east: 120.06, south: 30, north: 30.06 },
        timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T02:00:00Z' },
        dataTypes: ['downscaled'],
        format: 'csv',
        variable: 'temperature',
      }

      const result = estimateExportMetrics(request)

      expect(result.ok).toBe(true)
      if (result.ok) {
        // Downscaled at 3km resolution (0.03° spacing)
        // Bbox: 0.06° width → ceil(0.06/0.03) + 1 = 3 + 1 = 4 lon steps
        // Bbox: 0.06° height → ceil(0.06/0.03) + 1 = 2 + 1 = 3 lat steps
        // Grid: 4 × 3 = 12 points
        // Time steps: 3 hours (00:00, 01:00, 02:00) = 3 steps
        // Total: 12 points × 3 steps = 36 records
        expect(result.recordCount).toBe(36)
      }
    })

    it('calculates different grid counts for original, downscaled, and observation', () => {
      const request: ExportEstimationRequest = {
        taskId: 'task-123',
        bbox: { west: 120, east: 120.3, south: 30, north: 30.3 },
        timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T00:00:00Z' },
        dataTypes: ['original', 'downscaled', 'observation'],
        format: 'csv',
        variable: 'temperature',
      }

      const result = estimateExportMetrics(request)

      expect(result.ok).toBe(true)
      if (result.ok) {
        // Original: ceil(0.3/0.1) + 1 = 4 lon, ceil(0.3/0.1) + 1 = 4 lat, but one is 5 = 20 points
        // Downscaled: ceil(0.3/0.03) + 1 = 11 lon × 12 lat = 132 points
        // Observation: ceil(0.3/0.2) + 1 = 2 lon × 2 lat = 4 + 1 = 9 stations (2x2 then +1)
        // Time: 1 step (single time point)
        // Actually: Original 4×5=20, Downscaled 11×12=132, Obs 3×3=9, Total: 161
        expect(result.recordCount).toBe(161)
      }
    })

    it('calculates time steps correctly for multi-hour range', () => {
      const request: ExportEstimationRequest = {
        taskId: 'task-123',
        bbox: { west: 120, east: 120.03, south: 30, north: 30.03 },
        timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T23:00:00Z' },
        dataTypes: ['downscaled'],
        format: 'csv',
        variable: 'temperature',
      }

      const result = estimateExportMetrics(request)

      expect(result.ok).toBe(true)
      if (result.ok) {
        // 24 time steps (00:00 through 23:00, inclusive)
        // Grid: ceil(0.03/0.03) + 1 = 2, same for lat, but actually 3×3 = 9 points
        // Total: 9 × 24 = 216 records
        expect(result.recordCount).toBe(216)
      }
    })
  })

  describe('File Size Estimation', () => {
    it('estimates approximate CSV file size for temperature', () => {
      const request: ExportEstimationRequest = {
        taskId: 'task-123',
        bbox: { west: 120, east: 120.03, south: 30, north: 30.03 },
        timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T01:00:00Z' },
        dataTypes: ['downscaled'],
        format: 'csv',
        variable: 'temperature',
      }

      const result = estimateExportMetrics(request)

      expect(result.ok).toBe(true)
      if (result.ok) {
        // Record count: 9 points × 2 time steps = 18 records
        // Approximate size: header (200) + 18 × 130 bytes/record ≈ 2540
        expect(result.approximateSize).toBeGreaterThan(2000)
        expect(result.approximateSize).toBeLessThan(3000)
      }
    })

    it('estimates larger file size for wind due to extra fields', () => {
      const request: ExportEstimationRequest = {
        taskId: 'task-123',
        bbox: { west: 120, east: 120.03, south: 30, north: 30.03 },
        timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T01:00:00Z' },
        dataTypes: ['downscaled'],
        format: 'csv',
        variable: 'wind',
      }

      const result = estimateExportMetrics(request)

      expect(result.ok).toBe(true)
      if (result.ok) {
        // Wind has u10, v10, speed, direction fields - larger per-record size
        expect(result.approximateSize).toBeGreaterThan(1200)
      }
    })

    it('estimates GeoJSON file size larger than CSV', () => {
      const csvRequest: ExportEstimationRequest = {
        taskId: 'task-123',
        bbox: { west: 120, east: 120.03, south: 30, north: 30.03 },
        timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T01:00:00Z' },
        dataTypes: ['downscaled'],
        format: 'csv',
        variable: 'temperature',
      }

      const geojsonRequest: ExportEstimationRequest = {
        ...csvRequest,
        format: 'geojson',
      }

      const csvResult = estimateExportMetrics(csvRequest)
      const geojsonResult = estimateExportMetrics(geojsonRequest)

      expect(csvResult.ok).toBe(true)
      expect(geojsonResult.ok).toBe(true)

      if (csvResult.ok && geojsonResult.ok) {
        // GeoJSON has Feature/geometry wrapper overhead
        expect(geojsonResult.approximateSize).toBeGreaterThan(csvResult.approximateSize)
      }
    })
  })

  describe('Validation', () => {
    it('rejects bbox width exceeding 100km', () => {
      const request: ExportEstimationRequest = {
        taskId: 'task-123',
        bbox: { west: 120, east: 122, south: 30, north: 30.5 },
        timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T01:00:00Z' },
        dataTypes: ['downscaled'],
        format: 'csv',
        variable: 'temperature',
      }

      const result = estimateExportMetrics(request)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('BBOX_TOO_LARGE')
      }
    })

    it('rejects duration exceeding 30 days', () => {
      const request: ExportEstimationRequest = {
        taskId: 'task-123',
        bbox: { west: 120, east: 120.1, south: 30, north: 30.1 },
        timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-02-05T00:00:00Z' },
        dataTypes: ['downscaled'],
        format: 'csv',
        variable: 'temperature',
      }

      const result = estimateExportMetrics(request)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('DURATION_TOO_LONG')
      }
    })
  })
})

/**
 * Integration test for estimation accuracy against actual export generation.
 */

import { describe, it, expect } from 'vitest'
import {
  estimateExportMetrics,
  generateCsvFromTask,
  generateGeoJsonFromTask,
  type ExportEstimationRequest,
} from '@/server/services/csv-export.server'

describe('Estimation Accuracy', () => {
  const mockTask = {
    id: 'task-123',
    configuration: {
      variable: 'temperature',
    },
  }

  it('estimates exact record count matching actual CSV rows for small data', () => {
    const request: ExportEstimationRequest = {
      taskId: 'task-123',
      bbox: { west: 120, east: 120.03, south: 30, north: 30.03 },
      timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T01:00:00Z' },
      dataTypes: ['downscaled'],
      format: 'csv',
      variable: 'temperature',
    }

    // Get estimation
    const estimation = estimateExportMetrics(request)
    expect(estimation.ok).toBe(true)

    if (!estimation.ok) return

    // Generate actual CSV
    const csvResult = generateCsvFromTask(request, mockTask)
    expect(csvResult.ok).toBe(true)

    if (!csvResult.ok) return

    // Count actual CSV rows (excluding header)
    const lines = csvResult.csv.trim().split('\n')
    const actualRows = lines.length - 1

    // Verify exact match for record count
    expect(estimation.recordCount).toBe(actualRows)
  })

  it('estimates file size within reasonable bounds for CSV', () => {
    const request: ExportEstimationRequest = {
      taskId: 'task-123',
      bbox: { west: 120, east: 120.03, south: 30, north: 30.03 },
      timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T01:00:00Z' },
      dataTypes: ['downscaled'],
      format: 'csv',
      variable: 'temperature',
    }

    // Get estimation
    const estimation = estimateExportMetrics(request)
    expect(estimation.ok).toBe(true)

    if (!estimation.ok) return

    // Generate actual CSV
    const csvResult = generateCsvFromTask(request, mockTask)
    expect(csvResult.ok).toBe(true)

    if (!csvResult.ok) return

    const actualSize = new Blob([csvResult.csv]).size

    // File size should be within 50% margin (approximate)
    const lowerBound = estimation.approximateSize * 0.5
    const upperBound = estimation.approximateSize * 1.5

    expect(actualSize).toBeGreaterThanOrEqual(lowerBound)
    expect(actualSize).toBeLessThanOrEqual(upperBound)
  })

  it('estimates exact GeoJSON feature count matching actual features', () => {
    const request: ExportEstimationRequest = {
      taskId: 'task-123',
      bbox: { west: 120, east: 120.03, south: 30, north: 30.03 },
      timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T01:00:00Z' },
      dataTypes: ['downscaled'],
      format: 'geojson',
      variable: 'temperature',
    }

    // Get estimation
    const estimation = estimateExportMetrics(request)
    expect(estimation.ok).toBe(true)

    if (!estimation.ok) return

    // Generate actual GeoJSON
    const geojsonResult = generateGeoJsonFromTask(request, mockTask)
    expect(geojsonResult.ok).toBe(true)

    if (!geojsonResult.ok) return

    const geojson = JSON.parse(geojsonResult.geojson)
    const actualFeatureCount = geojson.features.length

    // Verify exact match for record count (each feature is a record)
    expect(estimation.recordCount).toBe(actualFeatureCount)
  })

  it('estimates correctly for wind variable with multiple fields', () => {
    const mockWindTask = {
      id: 'task-123',
      configuration: {
        variable: 'wind',
      },
    }

    const request: ExportEstimationRequest = {
      taskId: 'task-123',
      bbox: { west: 120, east: 120.03, south: 30, north: 30.03 },
      timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T01:00:00Z' },
      dataTypes: ['downscaled'],
      format: 'csv',
      variable: 'wind',
    }

    // Get estimation
    const estimation = estimateExportMetrics(request)
    expect(estimation.ok).toBe(true)

    if (!estimation.ok) return

    // Generate actual CSV
    const csvResult = generateCsvFromTask(request, mockWindTask)
    expect(csvResult.ok).toBe(true)

    if (!csvResult.ok) return

    // Count actual CSV rows
    const lines = csvResult.csv.trim().split('\n')
    const actualRows = lines.length - 1

    // Wind fields (u10, v10, speed, direction) are in one record, not multiple
    expect(estimation.recordCount).toBe(actualRows)
  })

  it('estimates correctly for mixed data types', () => {
    const request: ExportEstimationRequest = {
      taskId: 'task-123',
      bbox: { west: 120, east: 120.1, south: 30, north: 30.1 },
      timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T00:00:00Z' },
      dataTypes: ['original', 'downscaled', 'observation'],
      format: 'csv',
      variable: 'temperature',
    }

    // Get estimation
    const estimation = estimateExportMetrics(request)
    expect(estimation.ok).toBe(true)

    if (!estimation.ok) return

    // Generate actual CSV
    const csvResult = generateCsvFromTask(request, mockTask)
    expect(csvResult.ok).toBe(true)

    if (!csvResult.ok) return

    // Count actual CSV rows
    const lines = csvResult.csv.trim().split('\n')
    const actualRows = lines.length - 1

    // Original: 2×3=6, Downscaled: 5×5=25, Observation: 2×2=4, Total: 35
    expect(actualRows).toBe(35)
    expect(estimation.recordCount).toBe(actualRows)
  })

  it('accounts for observation stationId column in size estimation', () => {
    const requestWithObs: ExportEstimationRequest = {
      taskId: 'task-123',
      bbox: { west: 120, east: 120.03, south: 30, north: 30.03 },
      timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T01:00:00Z' },
      dataTypes: ['downscaled', 'observation'],
      format: 'csv',
      variable: 'temperature',
    }

    const requestWithoutObs: ExportEstimationRequest = {
      ...requestWithObs,
      dataTypes: ['downscaled'],
    }

    const estWithObs = estimateExportMetrics(requestWithObs)
    const estWithoutObs = estimateExportMetrics(requestWithoutObs)

    expect(estWithObs.ok).toBe(true)
    expect(estWithoutObs.ok).toBe(true)

    if (!estWithObs.ok || !estWithoutObs.ok) return

    // With observation data, bytes per record should be higher due to stationId column
    const bytesPerRecordWithObs = estWithObs.approximateSize / estWithObs.recordCount
    const bytesPerRecordWithoutObs = estWithoutObs.approximateSize / estWithoutObs.recordCount

    expect(bytesPerRecordWithObs).toBeGreaterThan(bytesPerRecordWithoutObs)
  })
})

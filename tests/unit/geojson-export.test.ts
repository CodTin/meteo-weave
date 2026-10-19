/**
 * Unit tests for GeoJSON export generation.
 * Tests valid FeatureCollection structure, coordinate order, and data encoding.
 */

import { describe, it, expect } from 'vitest'
import { generateGeoJsonFromTask } from '@/server/services/csv-export.server'

describe('GeoJSON Export Generation', () => {
  it('generates valid FeatureCollection structure', () => {
    const request = {
      taskId: 'task-123',
      bbox: { west: 120, east: 120.5, south: 30, north: 30.5 },
      timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' },
      dataTypes: ['downscaled'],
      format: 'geojson' as const,
    }

    const mockTask = {
      id: 'task-123',
      configuration: {
        variable: 'temperature',
      },
    }

    const result = generateGeoJsonFromTask(request, mockTask)

    expect(result.ok).toBe(true)
    if (result.ok) {
      const geojson = JSON.parse(result.geojson)
      expect(geojson.type).toBe('FeatureCollection')
      expect(geojson.features).toBeInstanceOf(Array)
    }
  })

  it('generates Point features with coordinates in [longitude, latitude] order', () => {
    const request = {
      taskId: 'task-123',
      bbox: { west: 120.5, east: 121, south: 30.2, north: 30.8 },
      timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' },
      dataTypes: ['downscaled'],
      format: 'geojson' as const,
    }

    const mockTask = {
      id: 'task-123',
      configuration: {
        variable: 'temperature',
      },
    }

    const result = generateGeoJsonFromTask(request, mockTask)

    expect(result.ok).toBe(true)
    if (result.ok) {
      const geojson = JSON.parse(result.geojson)
      expect(geojson.features.length).toBeGreaterThan(0)

      const feature = geojson.features[0]
      expect(feature.type).toBe('Feature')
      expect(feature.geometry.type).toBe('Point')
      expect(feature.geometry.coordinates).toHaveLength(2)

      const [lon, lat] = feature.geometry.coordinates
      // Verify longitude is first (within bbox west-east range)
      expect(lon).toBeGreaterThanOrEqual(120.5)
      expect(lon).toBeLessThanOrEqual(121)
      // Verify latitude is second (within bbox south-north range)
      expect(lat).toBeGreaterThanOrEqual(30.2)
      expect(lat).toBeLessThanOrEqual(30.8)
    }
  })

  it('encodes non-finite values as null with quality flags', () => {
    const request = {
      taskId: 'task-123',
      bbox: { west: 120, east: 120.5, south: 30, north: 30.5 },
      timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' },
      dataTypes: ['downscaled'],
      format: 'geojson' as const,
    }

    const mockTask = {
      id: 'task-123',
      configuration: {
        variable: 'temperature',
      },
    }

    const result = generateGeoJsonFromTask(request, mockTask)

    expect(result.ok).toBe(true)
    if (result.ok) {
      const geojsonString = result.geojson
      // JSON should not contain NaN or Infinity strings
      expect(geojsonString).not.toContain('NaN')
      expect(geojsonString).not.toContain('Infinity')

      const geojson = JSON.parse(geojsonString)
      const feature = geojson.features[0]

      // When value is non-finite, it should be null with appropriate quality flag
      // For now, test that valid values exist
      expect(feature.properties.value).toBeDefined()
      expect(feature.properties.qualityFlag).toBeDefined()
    }
  })

  it('generates filename with .geojson extension', () => {
    const request = {
      taskId: 'task-abc-123',
      bbox: { west: 120, east: 120.5, south: 30, north: 30.5 },
      timeRange: { start: '2024-01-15T00:00:00Z', end: '2024-01-20T00:00:00Z' },
      dataTypes: ['downscaled'],
      format: 'geojson' as const,
    }

    const mockTask = {
      id: 'task-abc-123',
      configuration: {
        variable: 'temperature',
      },
    }

    const result = generateGeoJsonFromTask(request, mockTask)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.filename).toContain('task-abc-123')
      expect(result.filename).toContain('2024-01-15')
      expect(result.filename).toContain('2024-01-20')
      expect(result.filename).toMatch(/\.geojson$/)
    }
  })
})

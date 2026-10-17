import { describe, it, expect } from 'vitest'
import {
  generateRepresentativePoints,
  type RepresentativePoint,
} from '@/features/result-analysis/service/representative-points'
import type { Region } from '@/features/result-analysis/service/time-series-data'

describe('generateRepresentativePoints', () => {
  const region: Region = {
    north: 40,
    south: 30,
    east: 130,
    west: 110,
  }

  const taskId = 'test-task-123'

  it('generates three representative points for a region', () => {
    const points = generateRepresentativePoints(region, taskId)
    expect(points).toHaveLength(3)
  })

  it('generates points with distinct terrain types', () => {
    const points = generateRepresentativePoints(region, taskId)
    const types = points.map((p) => p.terrainType)
    
    expect(types).toContain('city')
    expect(types).toContain('mountain')
    expect(types).toContain('plain')
    
    // All types should be unique
    expect(new Set(types).size).toBe(3)
  })

  it('generates points within region boundaries', () => {
    const points = generateRepresentativePoints(region, taskId)
    
    for (const point of points) {
      expect(point.coordinate.latitude).toBeGreaterThanOrEqual(region.south)
      expect(point.coordinate.latitude).toBeLessThanOrEqual(region.north)
      expect(point.coordinate.longitude).toBeGreaterThanOrEqual(region.west)
      expect(point.coordinate.longitude).toBeLessThanOrEqual(region.east)
    }
  })

  it('generates reproducible points for same task and region', () => {
    const points1 = generateRepresentativePoints(region, taskId)
    const points2 = generateRepresentativePoints(region, taskId)
    
    expect(points1).toEqual(points2)
  })

  it('generates different points for different tasks', () => {
    const points1 = generateRepresentativePoints(region, 'task-a')
    const points2 = generateRepresentativePoints(region, 'task-b')
    
    expect(points1).not.toEqual(points2)
  })

  it('generates different points for different regions', () => {
    const region2: Region = {
      north: 50,
      south: 40,
      east: 140,
      west: 120,
    }
    
    const points1 = generateRepresentativePoints(region, taskId)
    const points2 = generateRepresentativePoints(region2, taskId)
    
    expect(points1).not.toEqual(points2)
  })

  it('assigns Chinese labels to terrain types', () => {
    const points = generateRepresentativePoints(region, taskId)
    
    const cityPoint = points.find((p) => p.terrainType === 'city')
    const mountainPoint = points.find((p) => p.terrainType === 'mountain')
    const plainPoint = points.find((p) => p.terrainType === 'plain')
    
    expect(cityPoint?.label).toMatch(/城市|市区/)
    expect(mountainPoint?.label).toMatch(/山区|山地/)
    expect(plainPoint?.label).toMatch(/平原/)
  })

  it('handles small regions correctly', () => {
    const smallRegion: Region = {
      north: 30.5,
      south: 30.0,
      east: 120.5,
      west: 120.0,
    }
    
    const points = generateRepresentativePoints(smallRegion, taskId)
    
    expect(points).toHaveLength(3)
    for (const point of points) {
      expect(point.coordinate.latitude).toBeGreaterThanOrEqual(smallRegion.south)
      expect(point.coordinate.latitude).toBeLessThanOrEqual(smallRegion.north)
      expect(point.coordinate.longitude).toBeGreaterThanOrEqual(smallRegion.west)
      expect(point.coordinate.longitude).toBeLessThanOrEqual(smallRegion.east)
    }
  })
})

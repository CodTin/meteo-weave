import { describe, test, expect } from 'vitest'
import {
  validateBoundingBox,
  calculateRegionDimensions,
  type BoundingBox,
} from '@/features/spatial-region/validation'

describe('validateBoundingBox', () => {
  test('accepts valid bounding box', () => {
    const bbox: BoundingBox = { west: 100, south: 20, east: 120, north: 40 }
    const result = validateBoundingBox(bbox)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.bbox).toEqual(bbox)
    }
  })

  test('rejects west >= east', () => {
    const bbox: BoundingBox = { west: 120, south: 20, east: 100, north: 40 }
    const result = validateBoundingBox(bbox)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.west).toBeDefined()
      expect(result.errors.east).toBeDefined()
    }
  })

  test('rejects south >= north', () => {
    const bbox: BoundingBox = { west: 100, south: 40, east: 120, north: 20 }
    const result = validateBoundingBox(bbox)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.south).toBeDefined()
      expect(result.errors.north).toBeDefined()
    }
  })

  test('rejects longitude out of bounds', () => {
    const result1 = validateBoundingBox({ west: -181, south: 20, east: 120, north: 40 })
    expect(result1.valid).toBe(false)
    if (!result1.valid) {
      expect(result1.errors.west).toContain('180')
    }

    const result2 = validateBoundingBox({ west: 100, south: 20, east: 181, north: 40 })
    expect(result2.valid).toBe(false)
    if (!result2.valid) {
      expect(result2.errors.east).toContain('180')
    }
  })

  test('rejects latitude out of bounds', () => {
    const result1 = validateBoundingBox({ west: 100, south: -91, east: 120, north: 40 })
    expect(result1.valid).toBe(false)
    if (!result1.valid) {
      expect(result1.errors.south).toContain('90')
    }

    const result2 = validateBoundingBox({ west: 100, south: 20, east: 120, north: 91 })
    expect(result2.valid).toBe(false)
    if (!result2.valid) {
      expect(result2.errors.north).toContain('90')
    }
  })

  test('rejects zero-area region (same coordinates)', () => {
    const bbox: BoundingBox = { west: 100, south: 20, east: 100, north: 20 }
    const result = validateBoundingBox(bbox)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.west || result.errors.east).toBeDefined()
      expect(result.errors.south || result.errors.north).toBeDefined()
    }
  })

  test('rejects non-finite numbers', () => {
    const result1 = validateBoundingBox({ west: NaN, south: 20, east: 120, north: 40 })
    expect(result1.valid).toBe(false)

    const result2 = validateBoundingBox({ west: 100, south: 20, east: Infinity, north: 40 })
    expect(result2.valid).toBe(false)
  })

  test('rejects dateline-crossing regions', () => {
    const bbox: BoundingBox = { west: 170, south: 20, east: -170, north: 40 }
    const result = validateBoundingBox(bbox)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.west || result.errors.east).toContain('日期变更线')
    }
  })
})

describe('calculateRegionDimensions', () => {
  test('calculates approximate dimensions in kilometers', () => {
    // Beijing area: roughly 100km x 100km
    const bbox: BoundingBox = { west: 115.5, south: 39.5, east: 116.5, north: 40.5 }
    const dimensions = calculateRegionDimensions(bbox)

    expect(dimensions.widthKm).toBeGreaterThan(80)
    expect(dimensions.widthKm).toBeLessThan(120)
    expect(dimensions.heightKm).toBeGreaterThan(100)
    expect(dimensions.heightKm).toBeLessThan(120)
  })

  test('calculates dimensions near equator', () => {
    // 1 degree longitude at equator ≈ 111km
    const bbox: BoundingBox = { west: 0, south: 0, east: 1, north: 1 }
    const dimensions = calculateRegionDimensions(bbox)

    expect(dimensions.widthKm).toBeGreaterThan(110)
    expect(dimensions.widthKm).toBeLessThan(112)
    expect(dimensions.heightKm).toBeGreaterThan(110)
    expect(dimensions.heightKm).toBeLessThan(112)
  })

  test('accounts for latitude when calculating width', () => {
    // Same longitude span, different latitudes
    const equator: BoundingBox = { west: 0, south: 0, east: 1, north: 1 }
    const highLat: BoundingBox = { west: 0, south: 60, east: 1, north: 61 }

    const dimEquator = calculateRegionDimensions(equator)
    const dimHighLat = calculateRegionDimensions(highLat)

    // Width should be smaller at high latitude due to convergence
    expect(dimHighLat.widthKm).toBeLessThan(dimEquator.widthKm)
    // Height should be similar
    expect(Math.abs(dimHighLat.heightKm - dimEquator.heightKm)).toBeLessThan(5)
  })
})

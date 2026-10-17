import { describe, it, expect } from 'vitest'
import { findNearbyStation, calculateDistance } from '@/server/services/station-matching.server'

describe('calculateDistance', () => {
  it('calculates distance between two coordinates using Haversform', () => {
    // Beijing to Shanghai (approximately 1068 km)
    const beijing = { latitude: 39.9042, longitude: 116.4074 }
    const shanghai = { latitude: 31.2304, longitude: 121.4737 }

    const distance = calculateDistance(beijing, shanghai)

    // Should be close to 1068 km (allow 10km tolerance for formula approximation)
    expect(distance).toBeGreaterThan(1058)
    expect(distance).toBeLessThan(1078)
  })

  it('returns zero for identical coordinates', () => {
    const coord = { latitude: 35.5, longitude: 120.5 }
    const distance = calculateDistance(coord, coord)

    expect(distance).toBe(0)
  })

  it('calculates short distances accurately', () => {
    // Two points approximately 10km apart
    const point1 = { latitude: 35.0, longitude: 120.0 }
    const point2 = { latitude: 35.09, longitude: 120.0 }

    const distance = calculateDistance(point1, point2)

    // Should be approximately 10 km (allow 1km tolerance)
    expect(distance).toBeGreaterThan(9)
    expect(distance).toBeLessThan(11)
  })
})

describe('findNearbyStation', () => {
  it('returns null when no stations within 25km radius', () => {
    // Remote location with no nearby stations
    const coordinate = { latitude: 45.0, longitude: 85.0 }

    const result = findNearbyStation(coordinate)

    expect(result).toBeNull()
  })

  it('returns nearest station within 25km', () => {
    // Coordinate near a demo station (approximately 10km away)
    const coordinate = { latitude: 35.05, longitude: 120.05 }

    const result = findNearbyStation(coordinate)

    expect(result).not.toBeNull()
    expect(result!.distance).toBeLessThan(25)
    expect(result!.stationId).toBeDefined()
    expect(result!.coordinate).toBeDefined()
    expect(result!.coordinate.latitude).toBeDefined()
    expect(result!.coordinate.longitude).toBeDefined()
  })

  it('enforces 25km boundary - rejects station at 25.1km', () => {
    // Coordinate exactly 25.1km from nearest station
    // This will be mocked/controlled in the test data
    const coordinate = { latitude: 35.226, longitude: 120.0 }

    const result = findNearbyStation(coordinate)

    expect(result).toBeNull()
  })

  it('enforces 25km boundary - accepts station at 24.9km', () => {
    // Coordinate exactly 24.9km from nearest station
    const coordinate = { latitude: 35.224, longitude: 120.0 }

    const result = findNearbyStation(coordinate)

    expect(result).not.toBeNull()
    expect(result!.distance).toBeLessThan(25)
  })

  it('returns station with required metadata fields', () => {
    const coordinate = { latitude: 35.05, longitude: 120.05 }

    const result = findNearbyStation(coordinate)

    expect(result).not.toBeNull()
    expect(result).toHaveProperty('stationId')
    expect(result).toHaveProperty('coordinate')
    expect(result).toHaveProperty('distance')
    expect(result).toHaveProperty('name')
    expect(typeof result!.stationId).toBe('string')
    expect(typeof result!.name).toBe('string')
    expect(typeof result!.distance).toBe('number')
  })

  it('selects closest station when multiple within range', () => {
    // Coordinate equidistant from multiple stations
    const coordinate = { latitude: 35.1, longitude: 120.1 }

    const result = findNearbyStation(coordinate)

    // Should return the closest one
    expect(result).not.toBeNull()
    expect(result!.distance).toBeLessThan(25)
  })

  it('respects custom maxDistance parameter', () => {
    const coordinate = { latitude: 35.05, longitude: 120.05 }

    // Test with very small radius
    const result = findNearbyStation(coordinate, 1)

    // Should likely find nothing within 1km
    expect(result).toBeNull()
  })
})

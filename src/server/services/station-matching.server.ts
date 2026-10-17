import '@tanstack/react-start/server-only'
import type { Coordinate, StationMetadata, DemoStation } from '@/server/types/station-types'

/**
 * Demo synthetic stations for observation reference.
 * These are synthetic stations used for demonstration purposes only.
 */
const DEMO_STATIONS: DemoStation[] = [
  { id: 'DEMO-001', name: '合成站点-A', latitude: 35.0, longitude: 120.0 },
  { id: 'DEMO-002', name: '合成站点-B', latitude: 35.5, longitude: 120.5 },
  { id: 'DEMO-003', name: '合成站点-C', latitude: 36.0, longitude: 121.0 },
  { id: 'DEMO-004', name: '合成站点-D', latitude: 34.5, longitude: 119.5 },
  { id: 'DEMO-005', name: '合成站点-E', latitude: 36.5, longitude: 121.5 },
]

const EARTH_RADIUS_KM = 6371

/**
 * Calculates the great-circle distance between two coordinates using the Haversine formula.
 * Returns distance in kilometers.
 */
export function calculateDistance(coord1: Coordinate, coord2: Coordinate): number {
  const lat1Rad = toRadians(coord1.latitude)
  const lat2Rad = toRadians(coord2.latitude)
  const deltaLat = toRadians(coord2.latitude - coord1.latitude)
  const deltaLon = toRadians(coord2.longitude - coord1.longitude)

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return EARTH_RADIUS_KM * c
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180)
}

/**
 * Finds the nearest station within the specified maximum distance.
 * Returns null if no station is found within the radius.
 *
 * @param coordinate - The target coordinate to search from
 * @param maxDistance - Maximum distance in kilometers (default: 25km)
 */
export function findNearbyStation(
  coordinate: Coordinate,
  maxDistance: number = 25,
): StationMetadata | null {
  let nearestStation: StationMetadata | null = null
  let minDistance = Infinity

  for (const station of DEMO_STATIONS) {
    const distance = calculateDistance(coordinate, {
      latitude: station.latitude,
      longitude: station.longitude,
    })

    if (distance <= maxDistance && distance < minDistance) {
      minDistance = distance
      nearestStation = {
        stationId: station.id,
        name: station.name,
        coordinate: {
          latitude: station.latitude,
          longitude: station.longitude,
        },
        distance,
      }
    }
  }

  return nearestStation
}

/**
 * Station data types for observation reference matching.
 */

export interface Coordinate {
  latitude: number
  longitude: number
}

export interface StationMetadata {
  stationId: string
  name: string
  coordinate: Coordinate
  distance: number
}

export interface DemoStation {
  id: string
  name: string
  latitude: number
  longitude: number
}

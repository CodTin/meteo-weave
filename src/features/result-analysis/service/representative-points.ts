/**
 * Representative terrain points generation.
 * Generates reproducible synthetic representative points (city, mountain, plain)
 * within a task region based on deterministic pseudo-random sampling.
 */

import type { Coordinate, Region } from './time-series-data'

export type TerrainType = 'city' | 'mountain' | 'plain'

export interface RepresentativePoint {
  terrainType: TerrainType
  label: string
  coordinate: Coordinate
}

/**
 * Simple pseudo-random number generator with seed support.
 * Uses a linear congruential generator for reproducibility.
 */
function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

/**
 * Generates a deterministic hash from a string.
 */
function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash)
}

/**
 * Generates three representative points (city, mountain, plain) within the task region.
 * Points are deterministically generated based on taskId and region to ensure reproducibility.
 *
 * @param region - The task's spatial region
 * @param taskId - The task identifier for reproducible generation
 * @returns Array of three representative points with distinct terrain types
 */
export function generateRepresentativePoints(
  region: Region,
  taskId: string,
): RepresentativePoint[] {
  // Create a deterministic seed from taskId and region
  const seedString = `${taskId}:${region.north}:${region.south}:${region.east}:${region.west}`
  const seed = hashString(seedString)
  const random = seededRandom(seed)

  const terrainTypes: TerrainType[] = ['city', 'mountain', 'plain']
  const points: RepresentativePoint[] = []

  // Calculate region dimensions
  const latRange = region.north - region.south
  const lonRange = region.east - region.west

  // Generate one point for each terrain type with spatial distribution
  for (let i = 0; i < terrainTypes.length; i++) {
    const terrainType = terrainTypes[i]

    // Use different portions of the region for each terrain type to ensure spatial spread
    // City: northwest quadrant bias
    // Mountain: northeast quadrant bias
    // Plain: southern region bias
    let latBias: number
    let lonBias: number

    switch (terrainType) {
      case 'city':
        // Northwest bias
        latBias = 0.6 + random() * 0.3 // Upper 30% of region
        lonBias = 0.1 + random() * 0.3 // Western 30% of region
        break
      case 'mountain':
        // Northeast bias
        latBias = 0.6 + random() * 0.3 // Upper 30% of region
        lonBias = 0.6 + random() * 0.3 // Eastern 30% of region
        break
      case 'plain':
        // Southern/central bias
        latBias = 0.1 + random() * 0.3 // Lower 30% of region
        lonBias = 0.4 + random() * 0.2 // Central 20% of region
        break
    }

    const latitude = region.south + latRange * latBias
    const longitude = region.west + lonRange * lonBias

    points.push({
      terrainType,
      label: getTerrainLabel(terrainType),
      coordinate: {
        latitude: Number(latitude.toFixed(4)),
        longitude: Number(longitude.toFixed(4)),
      },
    })
  }

  return points
}

/**
 * Returns a Chinese label for the terrain type.
 */
function getTerrainLabel(terrainType: TerrainType): string {
  switch (terrainType) {
    case 'city':
      return '城市代表点'
    case 'mountain':
      return '山区代表点'
    case 'plain':
      return '平原代表点'
  }
}

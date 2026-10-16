/**
 * Wind-specific data alignment and comparison for 4-map view.
 * Handles wind vector computation, alignment, and difference calculation.
 */

import {
  computeWindVector,
  computeWindSpeedDifference,
  type WindComponents,
  type WindVectorResult,
} from '@/lib/wind/wind-vector'
import { computeDivergingScale } from './comparison-data'

export interface WindGridPoint {
  longitude: number
  latitude: number
  time: string
  u10: number | null
  v10: number | null
}

export interface WindGridData {
  points: WindGridPoint[]
}

export interface AlignedWindPoint {
  longitude: number
  latitude: number
  time: string
  original: WindVectorResult
  downscaled: WindVectorResult
  speedDifference: number | null
}

/**
 * Aligns two wind grid datasets and computes wind vectors at each point.
 * Returns aligned points with computed speed, direction, and difference.
 */
export function alignWindGridData(
  original: WindGridData,
  downscaled: WindGridData,
): AlignedWindPoint[] {
  // Build a map from downscaled data for efficient lookup
  const downscaledMap = new Map<string, WindComponents>()
  for (const point of downscaled.points) {
    const key = `${point.longitude},${point.latitude},${point.time}`
    downscaledMap.set(key, { u10: point.u10, v10: point.v10 })
  }

  const aligned: AlignedWindPoint[] = []
  const processedKeys = new Set<string>()

  // Helper to create aligned point
  const createAlignedPoint = (
    lon: number,
    lat: number,
    time: string,
    origComp: WindComponents,
    downComp: WindComponents,
  ): AlignedWindPoint => ({
    longitude: lon,
    latitude: lat,
    time,
    original: computeWindVector(origComp.u10, origComp.v10),
    downscaled: computeWindVector(downComp.u10, downComp.v10),
    speedDifference: computeWindSpeedDifference(downComp, origComp),
  })

  // Build result from original grid (primary reference)
  for (const point of original.points) {
    const key = `${point.longitude},${point.latitude},${point.time}`
    processedKeys.add(key)

    const originalComponents: WindComponents = { u10: point.u10, v10: point.v10 }
    const downscaledComponents: WindComponents = downscaledMap.get(key) ?? { u10: null, v10: null }

    aligned.push(
      createAlignedPoint(
        point.longitude,
        point.latitude,
        point.time,
        originalComponents,
        downscaledComponents,
      ),
    )
  }

  // Add downscaled points that don't exist in original
  for (const point of downscaled.points) {
    const key = `${point.longitude},${point.latitude},${point.time}`
    if (!processedKeys.has(key)) {
      aligned.push(
        createAlignedPoint(
          point.longitude,
          point.latitude,
          point.time,
          { u10: null, v10: null },
          { u10: point.u10, v10: point.v10 },
        ),
      )
    }
  }

  return aligned
}

/**
 * Computes shared wind speed scale from multiple datasets.
 * Only includes finite speed values; excludes null and calm winds get 0.
 */
export function computeSharedWindSpeedScale(datasets: AlignedWindPoint[]): {
  min: number
  max: number
} {
  const allSpeeds: number[] = []

  for (const point of datasets) {
    if (point.original.speed !== null && Number.isFinite(point.original.speed)) {
      allSpeeds.push(point.original.speed)
    }
    if (point.downscaled.speed !== null && Number.isFinite(point.downscaled.speed)) {
      allSpeeds.push(point.downscaled.speed)
    }
  }

  if (allSpeeds.length === 0) {
    return { min: 0, max: 10 }
  }

  return {
    min: 0, // Wind speed scale always starts at 0
    max: Math.max(...allSpeeds),
  }
}

/**
 * Computes symmetric diverging scale for wind speed differences.
 * Delegates to shared computeDivergingScale function.
 */
export function computeWindSpeedDifferenceScale(differences: (number | null)[]): {
  min: number
  max: number
} {
  return computeDivergingScale(differences)
}

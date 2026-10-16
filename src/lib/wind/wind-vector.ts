/**
 * Wind vector computation from U10/V10 components.
 * Follows meteorological conventions and proper vector arithmetic.
 */

export interface WindComponents {
  u10: number | null
  v10: number | null
}

export interface WindVector {
  speed: number
  fromDirection: number | null
  directionStatus: 'calm' | 'available'
}

export interface WindVectorResult {
  speed: number | null
  fromDirection: number | null
  directionStatus: 'calm' | 'available' | 'unavailable'
}

/**
 * Computes wind speed and direction from U10/V10 components.
 * Returns null values when any component is missing.
 * Calm wind (speed=0) has no determinable direction.
 *
 * @param u10 East-west wind component (m/s), null if missing
 * @param v10 North-south wind component (m/s), null if missing
 * @returns Wind vector with speed, from-direction, and status
 */
export function computeWindVector(u10: number | null, v10: number | null): WindVectorResult {
  // Missing component means unavailable result
  if (u10 === null || v10 === null) {
    return {
      speed: null,
      fromDirection: null,
      directionStatus: 'unavailable',
    }
  }

  // Check for non-finite values
  if (!Number.isFinite(u10) || !Number.isFinite(v10)) {
    return {
      speed: null,
      fromDirection: null,
      directionStatus: 'unavailable',
    }
  }

  // Compute wind speed
  const speed = Math.hypot(u10, v10)

  // Calm wind has no determinable direction
  if (speed === 0) {
    return {
      speed: 0,
      fromDirection: null,
      directionStatus: 'calm',
    }
  }

  // Compute meteorological from-direction (0° = north, 90° = east, etc.)
  // atan2(-u, -v) gives the direction the wind is coming FROM
  const fromDirection = ((Math.atan2(-u10, -v10) * 180) / Math.PI + 360) % 360

  return {
    speed,
    fromDirection,
    directionStatus: 'available',
  }
}

/**
 * Averages wind vectors from ensemble members.
 * Averages U10 and V10 components separately, then computes speed/direction.
 * Does NOT average wind speeds or directions directly.
 *
 * @param members Array of wind component pairs from ensemble members
 * @returns Average wind vector
 */
export function averageWindVectors(members: WindComponents[]): WindVectorResult {
  if (members.length === 0) {
    return {
      speed: null,
      fromDirection: null,
      directionStatus: 'unavailable',
    }
  }

  // Filter out members with missing components
  const validMembers = members.filter((m) => m.u10 !== null && m.v10 !== null)

  if (validMembers.length === 0) {
    return {
      speed: null,
      fromDirection: null,
      directionStatus: 'unavailable',
    }
  }

  // Average U10 and V10 components separately
  const avgU = validMembers.reduce((sum, m) => sum + m.u10!, 0) / validMembers.length
  const avgV = validMembers.reduce((sum, m) => sum + m.v10!, 0) / validMembers.length

  // Compute speed and direction from averaged components
  return computeWindVector(avgU, avgV)
}

/**
 * Computes wind speed difference (downscaled - original).
 * Returns null if either input has missing components.
 *
 * @param downscaled Downscaled wind components
 * @param original Original wind components
 * @returns Speed difference in m/s, or null if unavailable
 */
export function computeWindSpeedDifference(
  downscaled: WindComponents,
  original: WindComponents,
): number | null {
  const downscaledWind = computeWindVector(downscaled.u10, downscaled.v10)
  const originalWind = computeWindVector(original.u10, original.v10)

  if (downscaledWind.speed === null || originalWind.speed === null) {
    return null
  }

  return downscaledWind.speed - originalWind.speed
}

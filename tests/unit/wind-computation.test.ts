import { describe, expect, it } from 'vitest'
import {
  computeWindVector,
  averageWindVectors,
  computeWindSpeedDifference,
  type WindComponents,
} from '@/lib/wind/wind-vector'

/**
 * Wind computation tests for four-map comparison.
 * Tests proper vector computation for wind speed/direction from U10/V10 components.
 */

describe('Wind Computation - Speed and Direction from U10/V10', () => {
  describe('wind speed computation', () => {
    it('computes wind speed from U10 and V10 components', () => {
      // Known sample: U10 = 3.0 m/s, V10 = 4.0 m/s
      // Expected speed: sqrt(3^2 + 4^2) = 5.0 m/s
      const result = computeWindVector(3.0, 4.0)

      expect(result.speed).toBe(5.0)
      expect(result.directionStatus).toBe('available')
    })

    it('computes zero speed for calm wind', () => {
      const result = computeWindVector(0.0, 0.0)

      expect(result.speed).toBe(0.0)
      expect(result.directionStatus).toBe('calm')
      expect(result.fromDirection).toBeNull()
    })

    it('handles negative components correctly', () => {
      // U10 = -3.0, V10 = -4.0 should give same magnitude
      const result = computeWindVector(-3.0, -4.0)
      expect(result.speed).toBe(5.0)
    })

    it('does not treat missing component as zero', () => {
      // If any component is missing, wind speed must be unavailable
      const result = computeWindVector(3.0, null)

      expect(result.speed).toBeNull()
      expect(result.directionStatus).toBe('unavailable')
    })
  })

  describe('wind direction computation', () => {
    it('computes meteorological from-direction for westerly wind', () => {
      // U10 = 5.0 (positive eastward component) means wind FROM west TO east
      // From-direction should be 270° (west)
      const result = computeWindVector(5.0, 0.0)

      expect(result.fromDirection).toBe(270)
      expect(result.directionStatus).toBe('available')
    })

    it('computes meteorological from-direction for southerly wind', () => {
      // V10 = 5.0 (positive northward component) means wind FROM south TO north
      // From-direction should be 180° (south)
      const result = computeWindVector(0.0, 5.0)

      expect(result.fromDirection).toBe(180)
      expect(result.directionStatus).toBe('available')
    })

    it('computes meteorological from-direction for northerly wind', () => {
      // V10 = -5.0 (negative northward component) means wind FROM north TO south
      // From-direction should be 0° (north)
      const result = computeWindVector(0.0, -5.0)

      expect(result.fromDirection).toBe(0)
      expect(result.directionStatus).toBe('available')
    })

    it('computes meteorological from-direction for easterly wind', () => {
      // U10 = -5.0 (negative eastward component) means wind FROM east TO west
      // From-direction should be 90° (east)
      const result = computeWindVector(-5.0, 0.0)

      expect(result.fromDirection).toBe(90)
      expect(result.directionStatus).toBe('available')
    })

    it('returns null direction for calm wind', () => {
      // Calm wind has no determinable direction
      const result = computeWindVector(0.0, 0.0)

      expect(result.fromDirection).toBeNull()
      expect(result.directionStatus).toBe('calm')
    })

    it('does not compute direction when any component is missing', () => {
      // Missing component means unavailable, not zero
      const result = computeWindVector(3.0, null)

      expect(result.fromDirection).toBeNull()
      expect(result.directionStatus).toBe('unavailable')
    })
  })

  describe('vector averaging for ensemble mean', () => {
    it('averages U10 and V10 components separately before computing speed', () => {
      // Ensemble members with different wind vectors
      // Member 1: U10=3, V10=0 (speed=3, dir=90°)
      // Member 2: U10=0, V10=4 (speed=4, dir=0°)
      // Correct: Average U/V first: U_avg=1.5, V_avg=2.0, then speed=sqrt(1.5^2+2^2)=2.5
      // Wrong: Average speeds: (3+4)/2 = 3.5

      const members: WindComponents[] = [
        { u10: 3.0, v10: 0.0 },
        { u10: 0.0, v10: 4.0 },
      ]

      const result = averageWindVectors(members)

      // Correct vector averaging gives 2.5
      expect(result.speed).toBe(2.5)

      // Wrong scalar averaging would give 3.5
      const member1_speed = Math.hypot(3.0, 0.0)
      const member2_speed = Math.hypot(0.0, 4.0)
      const wrong_speed = (member1_speed + member2_speed) / 2

      expect(wrong_speed).toBe(3.5)
      expect(result.speed).not.toBe(wrong_speed)
    })

    it('does not average direction angles directly', () => {
      // Wind from NE (45°) and from NW (315°)
      // Scalar average of angles: (45 + 315) / 2 = 180° (south) - WRONG
      // Vector average: should give north (0°) - CORRECT

      // NE wind: 45° from-direction
      const u1 = -Math.sin((45 * Math.PI) / 180)
      const v1 = -Math.cos((45 * Math.PI) / 180)

      // NW wind: 315° from-direction
      const u2 = -Math.sin((315 * Math.PI) / 180)
      const v2 = -Math.cos((315 * Math.PI) / 180)

      const members: WindComponents[] = [
        { u10: u1, v10: v1 },
        { u10: u2, v10: v2 },
      ]

      const result = averageWindVectors(members)

      // Vector average should give direction close to 0° (north)
      expect(result.fromDirection).not.toBeNull()
      expect(Math.abs(result.fromDirection! - 0)).toBeLessThan(1)

      // Wrong scalar average would give 180°
      const wrong_direction = (45 + 315) / 2
      expect(wrong_direction).toBe(180)
      expect(Math.abs(result.fromDirection! - wrong_direction)).toBeGreaterThan(100)
    })
  })

  describe('wind speed difference computation', () => {
    it('computes difference as downscaled minus original wind speed', () => {
      // Original: U10=3, V10=4, speed=5
      // Downscaled: U10=6, V10=8, speed=10
      // Difference: 10 - 5 = 5 m/s

      const original: WindComponents = { u10: 3.0, v10: 4.0 }
      const downscaled: WindComponents = { u10: 6.0, v10: 8.0 }

      const difference = computeWindSpeedDifference(downscaled, original)

      expect(difference).toBe(5.0)
    })

    it('returns positive difference when downscaled speed is higher', () => {
      const original: WindComponents = { u10: 2.0, v10: 1.0 }
      const downscaled: WindComponents = { u10: 4.0, v10: 3.0 }

      const difference = computeWindSpeedDifference(downscaled, original)

      expect(difference).not.toBeNull()
      expect(difference!).toBeGreaterThan(0)
    })

    it('returns negative difference when downscaled speed is lower', () => {
      const original: WindComponents = { u10: 4.0, v10: 3.0 }
      const downscaled: WindComponents = { u10: 2.0, v10: 1.0 }

      const difference = computeWindSpeedDifference(downscaled, original)

      expect(difference).not.toBeNull()
      expect(difference!).toBeLessThan(0)
    })

    it('does not use wind direction difference for difference map', () => {
      // Difference map should show speed difference, not direction difference
      const original: WindComponents = { u10: 3.0, v10: 4.0 }
      const downscaled: WindComponents = { u10: 4.0, v10: 3.0 }

      const speed_diff = computeWindSpeedDifference(downscaled, original)

      // This is correct
      expect(speed_diff).not.toBeNull()

      // Verify it's speed difference, not direction difference
      const originalWind = computeWindVector(original.u10, original.v10)
      const downscaledWind = computeWindVector(downscaled.u10, downscaled.v10)

      expect(originalWind.speed).toBe(5.0)
      expect(downscaledWind.speed).toBe(5.0)
      expect(speed_diff).toBe(0.0)
    })

    it('returns null when any component is missing', () => {
      // If either original or downscaled has missing component, difference is unavailable
      const original: WindComponents = { u10: 3.0, v10: null }
      const downscaled: WindComponents = { u10: 6.0, v10: 8.0 }

      const difference = computeWindSpeedDifference(downscaled, original)

      expect(difference).toBeNull()
    })
  })

  describe('component missing vs calm wind distinction', () => {
    it('distinguishes between missing component and calm wind', () => {
      // Calm wind: both components are valid zero
      const calmResult = computeWindVector(0.0, 0.0)

      expect(calmResult.speed).toBe(0.0)
      expect(calmResult.directionStatus).toBe('calm')
      expect(calmResult.fromDirection).toBeNull()

      // Missing component: at least one component is null
      const missingResult = computeWindVector(null, 4.0)

      expect(missingResult.speed).toBeNull()
      expect(missingResult.directionStatus).toBe('unavailable')
      expect(missingResult.fromDirection).toBeNull()
    })

    it('does not treat missing component as zero for speed computation', () => {
      // If U10 is missing and we wrongly treat it as zero:
      // Wrong: speed = sqrt(0^2 + 4^2) = 4.0
      // Correct: speed is unavailable

      const result = computeWindVector(null, 4.0)

      // Verify we don't compute a fake speed
      expect(result.speed).toBeNull()
      expect(result.directionStatus).toBe('unavailable')

      // If we wrongly used 0 for missing:
      const wrong_result = computeWindVector(0, 4.0)
      expect(wrong_result.speed).toBe(4.0)

      // But treating missing as zero would be WRONG
      expect(result.speed).not.toBe(wrong_result.speed)
    })
  })
})

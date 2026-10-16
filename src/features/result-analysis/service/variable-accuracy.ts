import type { WindValue, Accumulation } from '@/features/downscaling-tasks/service/contracts'

/**
 * Returns the correct unit for each variable according to the public results contract.
 * Temperature: °C, Pressure: hPa, Wind: m/s, Precipitation: mm
 */
export function getVariableUnit(variable: string): string {
  switch (variable) {
    case 'temperature':
      return '°C'
    case 'pressure':
      return 'hPa'
    case 'wind':
      return 'm/s'
    case 'precipitation':
      return 'mm'
    default:
      return ''
  }
}

/**
 * Extracts wind speed from a WindValue using the derived speed field.
 * Wind is evaluated by speed derived from U10/V10, not by treating
 * wind direction as a scalar error. Valid zero wind speed (calm wind)
 * is preserved as an effective sample.
 */
export function extractWindSpeed(windValue: WindValue): number {
  // Use the derived speed field from the contract
  // This already handles the sqrt(u10^2 + v10^2) calculation
  if (!Number.isFinite(windValue.u10) || !Number.isFinite(windValue.v10)) {
    return NaN
  }

  // Return the derived speed, which correctly handles calm wind (0.0)
  return windValue.speed
}

export type AccumulationValidation =
  | { valid: true; complete: boolean }
  | { valid: false; reason: string }

/**
 * Validates that precipitation accumulation intervals are complete and aligned.
 * Incomplete, misaligned, or incomparable samples should be excluded.
 * Valid zero precipitation with complete coverage is retained.
 */
export function validateAccumulationCoverage(accumulation: Accumulation): AccumulationValidation {
  // Check if actual interval matches requested interval (check alignment first)
  if (
    accumulation.start !== accumulation.requestedStart ||
    accumulation.end !== accumulation.requestedEnd
  ) {
    return {
      valid: false,
      reason: 'Misaligned accumulation: interval does not match requested coverage',
    }
  }

  // Check if accumulation is complete
  if (!accumulation.complete) {
    return {
      valid: false,
      reason: 'Incomplete accumulation: partial coverage cannot be compared',
    }
  }

  // Valid complete accumulation (including valid zero precipitation)
  return { valid: true, complete: true }
}

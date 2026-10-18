/**
 * Threshold definition for probabilistic analysis.
 * Supports configurable meteorological condition thresholds with strict comparison.
 */

import type { ResultReply } from '@/features/downscaling-tasks/service/contracts'

export type ThresholdVariable = 'temperature' | 'precipitation' | 'pressure' | 'wind'
export type ThresholdDirection = 'greater-than' | 'less-than'
export type ThresholdQuantity = 'T2M' | 'TP' | 'MSL' | 'U10/V10-speed'

/**
 * Complete threshold definition including variable, value, direction, unit, and applicable interval.
 */
export interface ThresholdDefinition {
  /** Variable type for this threshold */
  variable: ThresholdVariable
  /** Physical quantity being measured */
  quantity: ThresholdQuantity
  /** Threshold value (finite number) */
  value: number
  /** Comparison direction: strictly greater than or strictly less than */
  direction: ThresholdDirection
  /** Unit of measurement */
  unit: string
  /** Applicable time moment or interval description */
  interval: 'instantaneous' | 'daily' | 'accumulation'
}

/**
 * Result of threshold evaluation for a single location and time.
 */
export interface ThresholdProbability {
  /** Longitude of the evaluated point */
  longitude: number
  /** Latitude of the evaluated point */
  latitude: number
  /** ISO timestamp of the evaluated moment */
  time: string
  /** Number of members meeting the threshold condition */
  exceedingMembers: number
  /** Total number of valid members at this location/time */
  validMembers: number
  /** Empirical probability (exceedingMembers / validMembers), or null if validMembers = 0 */
  probability: number | null
  /** List of member IDs that were unavailable */
  unavailableMemberIds: string[]
}

/**
 * Grid point proportion summary for a single member.
 * Represents the fraction of grid points where the meteorological condition is met.
 */
export interface MemberImpactArea {
  /** Member identifier */
  memberId: string
  /** Number of grid points meeting the threshold condition */
  exceedingPoints: number
  /** Total number of valid grid points for this member */
  validPoints: number
  /** Proportion of grid points meeting the condition (exceedingPoints / validPoints) */
  proportion: number
}

/**
 * Ensemble summary of impact areas across all members.
 */
export interface ImpactAreaSummary {
  /** Per-member impact area statistics */
  members: MemberImpactArea[]
  /** Mean proportion across all members */
  meanProportion: number
  /** Minimum proportion across members */
  minProportion: number
  /** Maximum proportion across members */
  maxProportion: number
  /** Number of valid members in this summary */
  validMembers: number
  /** Total grid points evaluated (should be consistent across members) */
  totalGridPoints: number
  /** Description of grid coverage and sampling rules */
  coverageNote: string
}

/**
 * Complete threshold analysis result.
 */
export interface ThresholdAnalysis {
  /** The threshold definition used for this analysis */
  threshold: ThresholdDefinition
  /** Point-wise threshold probabilities */
  pointProbabilities: ThresholdProbability[]
  /** Grid-based impact area summary */
  impactArea: ImpactAreaSummary | null
  /** Whether this analysis is based on preview/decimated data */
  isPreview: boolean
}

/**
 * Validation result for threshold applicability.
 */
export interface ThresholdValidation {
  /** Whether the threshold is applicable to the given result */
  valid: boolean
  /** Error message if not valid */
  error?: string
  /** Specific reason code */
  code?:
    | 'NOT_PROBABILISTIC'
    | 'VARIABLE_MISMATCH'
    | 'QUANTITY_MISMATCH'
    | 'UNIT_MISMATCH'
    | 'INTERVAL_MISMATCH'
    | 'INVALID_VALUE'
}

/**
 * Validate that a threshold definition is applicable to a result reply.
 */
export function validateThreshold(
  threshold: ThresholdDefinition,
  result: ResultReply,
): ThresholdValidation {
  if (!result.ok) {
    return { valid: false, code: 'NOT_PROBABILISTIC', error: 'Result is unavailable' }
  }

  if (!result.ensemble || result.ensemble.kind === 'mean' || result.ensemble.kind === 'stddev') {
    return {
      valid: false,
      code: 'NOT_PROBABILISTIC',
      error: 'Threshold analysis requires member-level ensemble data',
    }
  }

  if (threshold.variable !== result.variable) {
    return {
      valid: false,
      code: 'VARIABLE_MISMATCH',
      error: `Threshold variable '${threshold.variable}' does not match result variable '${result.variable}'`,
    }
  }

  // Validate quantity match
  if (result.variable === 'wind') {
    if (threshold.quantity !== 'U10/V10-speed') {
      return {
        valid: false,
        code: 'QUANTITY_MISMATCH',
        error: 'Wind thresholds must use speed quantity, not direction',
      }
    }
  } else if (threshold.quantity !== result.quantity) {
    return {
      valid: false,
      code: 'QUANTITY_MISMATCH',
      error: `Threshold quantity '${threshold.quantity}' does not match result quantity '${result.quantity}'`,
    }
  }

  // Validate unit match
  const expectedUnit = result.variable === 'wind' ? result.unit : result.unit
  if (threshold.unit !== expectedUnit) {
    return {
      valid: false,
      code: 'UNIT_MISMATCH',
      error: `Threshold unit '${threshold.unit}' does not match result unit '${expectedUnit}'`,
    }
  }

  // Validate interval compatibility
  const resultInterval = result.temporalStatistic
  if (threshold.interval === 'instantaneous' && resultInterval !== 'instantaneous') {
    return {
      valid: false,
      code: 'INTERVAL_MISMATCH',
      error: 'Instantaneous threshold cannot be applied to aggregated data',
    }
  }
  if (threshold.interval === 'daily' && resultInterval !== 'daily-mean') {
    return {
      valid: false,
      code: 'INTERVAL_MISMATCH',
      error: 'Daily threshold requires daily temperature statistics',
    }
  }
  if (threshold.interval === 'accumulation' && resultInterval !== 'accumulation') {
    return {
      valid: false,
      code: 'INTERVAL_MISMATCH',
      error: 'Accumulation threshold requires precipitation accumulation data',
    }
  }

  // Validate threshold value is finite
  if (!Number.isFinite(threshold.value)) {
    return {
      valid: false,
      code: 'INVALID_VALUE',
      error: 'Threshold value must be a finite number',
    }
  }

  return { valid: true }
}

/**
 * Check if a value meets the threshold condition (strict comparison).
 * Equal values do NOT meet the condition for either direction.
 */
export function meetsThreshold(value: number, threshold: ThresholdDefinition): boolean {
  if (!Number.isFinite(value)) return false

  if (threshold.direction === 'greater-than') {
    return value > threshold.value
  } else {
    return value < threshold.value
  }
}

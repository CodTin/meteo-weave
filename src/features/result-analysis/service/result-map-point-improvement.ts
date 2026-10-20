import { resultMapCompatibility } from './result-map-compatibility'
import type { ResultMapPointImprovement, ResultMapPointResult } from '../types/result-map-point'

/** Reference-error reduction is a fraction; Difference is a separate field-value change. */
export function calculateResultMapPointImprovement(
  result: ResultMapPointResult,
): ResultMapPointImprovement {
  const { original, downscaled, observation } = result.values
  if (
    result.selection.ensemble?.kind === 'stddev' ||
    downscaled.metadata?.ensemble?.kind === 'stddev'
  )
    return {
      status: 'unavailable',
      code: 'INCOMPATIBLE_STATISTIC',
      reason:
        'Standard Deviation is ensemble spread, not a prediction; no reference-error improvement.',
    }
  if (original.status !== 'available')
    return { status: 'unavailable', code: original.code, reason: `Original: ${original.reason}` }
  if (downscaled.status !== 'available')
    return {
      status: 'unavailable',
      code: downscaled.code,
      reason: `Downscaled: ${downscaled.reason}`,
    }
  if (observation.status !== 'available')
    return {
      status: 'unavailable',
      code: observation.code,
      reason: `Reference: ${observation.reason}`,
    }
  if ([original, downscaled, observation].some((value) => !Number.isFinite(value.sample.value)))
    return {
      status: 'unavailable',
      code: 'NONFINITE_INPUT',
      reason: 'Original, downscaled and reference samples must all be finite; missing is not zero.',
    }
  const incompatible = resultMapCompatibility(
    [original, downscaled, observation].map((value) => ({
      context: value.metadata,
      samples: [value.sample],
      ensemble: value.metadata.ensemble,
    })),
  )
  if (incompatible) return incompatible
  if (
    [original, downscaled, observation].some(
      (value, index) =>
        value.metadata.taskId !== result.taskId ||
        value.metadata.layer !== (['original', 'downscaled', 'observation'] as const)[index] ||
        value.sample.longitude !== result.point.longitude ||
        value.sample.latitude !== result.point.latitude ||
        !Number.isFinite(Date.parse(value.sample.time)) ||
        Date.parse(value.sample.time) !== Date.parse(result.selection.time),
    )
  )
    return {
      status: 'unavailable',
      code: 'RESULT_CONTEXT_MISMATCH',
      reason: 'Reference-error inputs must match the requested point, task and UTC time.',
    }
  const support = observation.sample.observation
  if (
    !support ||
    !observation.metadata.reference ||
    (support.mode === 'interpolated' && support.stations.length === 0)
  )
    return {
      status: 'unavailable',
      code: 'INVALID_REFERENCE',
      reason:
        'A valid synthetic reference identity and actual station or interpolation support are required.',
    }
  if (
    support?.mode === 'stations' &&
    (support.station.longitude !== result.point.longitude ||
      support.station.latitude !== result.point.latitude ||
      support.distanceKm !== 0)
  )
    return {
      status: 'unavailable',
      code: 'NONCOLOCATED_REFERENCE',
      reason: `Actual synthetic station ${support.station.longitude}, ${support.station.latitude} is ${support.distanceKm} km from the requested point; not colocated.`,
    }
  const originalAbsoluteError = Math.abs(original.sample.value - observation.sample.value)
  const downscaledAbsoluteError = Math.abs(downscaled.sample.value - observation.sample.value)
  if (originalAbsoluteError === 0)
    return {
      status: 'unavailable',
      code: 'ZERO_ORIGINAL_ERROR',
      reason:
        'Original absolute error is zero; improvement has no denominator. Valid zero is not missing.',
    }
  return {
    status: 'available',
    fraction: (originalAbsoluteError - downscaledAbsoluteError) / originalAbsoluteError,
    originalAbsoluteError,
    downscaledAbsoluteError,
    unit: original.metadata.unit,
    referenceType:
      support?.mode === 'interpolated'
        ? 'interpolated-synthetic-reference'
        : 'colocated-synthetic-station',
  }
}

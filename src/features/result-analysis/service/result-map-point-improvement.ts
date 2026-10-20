import type { EnsembleSample } from '@/features/downscaling-tasks/service/contracts'
import type { ResultMapPointImprovement, ResultMapPointResult } from '../types/result-map-point'

function interval(sample: EnsembleSample) {
  const bounds = sample.accumulation ?? sample.daily
  if (!bounds) return undefined
  return [
    bounds.start,
    bounds.end,
    bounds.bounds,
    bounds.sampledHours,
    bounds.expectedHours,
    sample.accumulation?.requestedStart,
    sample.accumulation?.requestedEnd,
  ]
}

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
  if (
    [downscaled, observation].some(
      (value) =>
        value.metadata.variable !== original.metadata.variable ||
        value.metadata.quantity !== original.metadata.quantity ||
        value.metadata.unit !== original.metadata.unit ||
        value.metadata.temporalStatistic !== original.metadata.temporalStatistic,
    )
  )
    return {
      status: 'unavailable',
      code: 'INCOMPATIBLE_STATISTIC',
      reason:
        'Reference-error comparison requires the same physical quantity, unit and temporal statistic.',
    }
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
  if (
    [original, downscaled, observation].some(
      (value) =>
        value.sample.accumulation?.complete === false || value.sample.daily?.completeDay === false,
    )
  )
    return {
      status: 'unavailable',
      code: 'INCOMPLETE_INTERVAL',
      reason:
        'Reference-error comparison requires the complete requested interval; partial accumulation or daily mean is unavailable.',
    }
  const intervals = [original, downscaled, observation].map((value) => interval(value.sample))
  if (intervals.some((value) => JSON.stringify(value) !== JSON.stringify(intervals[0])))
    return {
      status: 'unavailable',
      code: 'INTERVAL_MISMATCH',
      reason:
        'Actual and requested interval bounds and sampled/expected hour counts must match for all three inputs.',
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

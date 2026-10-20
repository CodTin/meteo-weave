import type {
  EnsembleMetadata,
  EnsembleSample,
} from '@/features/downscaling-tasks/service/contracts'
import type { ResultMapDisplayContext } from '../types/result-map'

type ScientificInput = {
  context: ResultMapDisplayContext
  samples: readonly Pick<EnsembleSample, 'accumulation' | 'daily'>[]
  ensemble?: Pick<EnsembleMetadata, 'kind'>
}

function intervalKey(sample: ScientificInput['samples'][number]) {
  const accumulation = sample.accumulation
  const daily = sample.daily
  return JSON.stringify([
    accumulation && [
      accumulation.start,
      accumulation.end,
      accumulation.requestedStart,
      accumulation.requestedEnd,
      accumulation.bounds,
      accumulation.sampledHours,
      accumulation.expectedHours,
      accumulation.complete,
    ],
    daily && [
      daily.start,
      daily.end,
      daily.bounds,
      daily.sampledHours,
      daily.expectedHours,
      daily.completeDay,
    ],
  ])
}

/** One scientific comparison rule for map/point Difference, reference error and display unions. */
export function resultMapCompatibility(inputs: readonly ScientificInput[]) {
  const first = inputs[0]?.context
  if (
    inputs.some(
      ({ context, ensemble }) =>
        ensemble?.kind === 'stddev' ||
        (['variable', 'quantity', 'unit', 'temporalStatistic'] as const).some(
          (key) => context[key] !== first?.[key],
        ),
    )
  )
    return {
      status: 'unavailable' as const,
      code: 'INCOMPATIBLE_STATISTIC',
      reason:
        'Comparison requires the same physical quantity, unit and temporal statistic; ensemble spread is not a prediction.',
    }
  if (
    inputs.some(({ samples }) =>
      samples.some(
        (sample) => sample.accumulation?.complete === false || sample.daily?.completeDay === false,
      ),
    )
  )
    return {
      status: 'unavailable' as const,
      code: 'INCOMPLETE_INTERVAL',
      reason:
        'Comparison requires the complete requested interval; partial accumulation or daily mean is unavailable.',
    }
  const intervals = inputs.map(({ samples }) =>
    JSON.stringify(
      [
        ...new Set(
          samples.filter((sample) => sample.accumulation || sample.daily).map(intervalKey),
        ),
      ].sort(),
    ),
  )
  if (intervals.some((interval) => interval !== intervals[0]))
    return {
      status: 'unavailable' as const,
      code: 'INTERVAL_MISMATCH',
      reason:
        'Actual and requested interval bounds, sampled/expected hour counts and completeness must match.',
    }
  return undefined
}

import type {
  DownscalingTask,
  ResultPoint,
  ResultQuery,
} from '@/features/downscaling-tasks/service/contracts'
import type { ResultMapSelection, ResultMapSource } from './result-map-data'
import type { ResultMapPointResult, ResultMapPointValue } from '../types/result-map-point'

import { resultMapCompatibility } from './result-map-compatibility'

export async function readResultMapPointQuery(
  source: ResultMapSource,
  task: DownscalingTask,
  selection: ResultMapSelection,
  point: ResultPoint,
): Promise<ResultMapPointResult> {
  const selected = {
    ...selection,
    time: new Date(selection.time).toISOString(),
    temporalResolution:
      selection.temporalResolution ??
      (task.configuration.timeRange.mode === 'forecast' ? 'hourly' : undefined),
  }
  const identity = JSON.stringify([task, selected, point])
  const invalid =
    !Number.isFinite(point.longitude) ||
    !Number.isFinite(point.latitude) ||
    point.longitude < -180 ||
    point.longitude > 180 ||
    point.latitude < -90 ||
    point.latitude > 90
  if (invalid) {
    const value: ResultMapPointValue = {
      status: 'unavailable',
      code: 'INVALID_POINT',
      reason: 'Enter finite longitude (−180 to 180) and latitude (−90 to 90).',
    }
    return {
      identity,
      taskId: task.id,
      point,
      selection: selected,
      values: { original: value, downscaled: value, observation: value, difference: value },
    }
  }
  const query = {
    kind: 'points' as const,
    points: [point],
    times: [selected.time],
    temporalResolution: selected.temporalResolution,
  }
  async function read(query: ResultQuery): Promise<ResultMapPointValue> {
    let reply
    try {
      reply = await source.result(task.id, query)
    } catch (error) {
      return {
        status: 'error',
        code: 'QUERY_FAILED',
        reason: error instanceof Error ? error.message : 'Point query failed.',
      }
    }
    if (!reply.ok) return { status: 'unavailable', code: reply.code, reason: reply.error }
    if (
      reply.taskId !== task.id ||
      reply.layer !== query.layer ||
      reply.variable !== task.configuration.variable
    )
      return {
        status: 'error',
        code: 'RESULT_CONTEXT_MISMATCH',
        reason: 'Public result does not match the requested task, layer and variable.',
      }
    const { values, ...metadata } = reply
    const sample = values.find(
      (value) =>
        value.longitude === point.longitude &&
        value.latitude === point.latitude &&
        new Date(value.time).toISOString() === selected.time &&
        (selected.ensemble?.kind !== 'members' ||
          query.layer !== 'downscaled' ||
          !selected.ensemble.memberIds?.length ||
          selected.ensemble.memberIds.includes(value.memberId ?? '')),
    )
    if (!sample) {
      const missing = reply.ensemble?.unavailable.find(
        (value) =>
          value.longitude === point.longitude &&
          value.latitude === point.latitude &&
          new Date(value.time).toISOString() === selected.time,
      )
      return {
        status: 'unavailable',
        code: missing?.code ?? 'MISSING_DATA',
        reason: missing?.error ?? 'No point value returned.',
        metadata,
      }
    }
    if (!Number.isFinite(sample.value))
      return {
        status: 'unavailable',
        code: 'MISSING_DATA',
        reason: 'Scientific sample is nonfinite; unavailable is not zero.',
        metadata,
      }
    return { status: 'available', sample, metadata }
  }
  const [original, queriedDownscaled, observation] = await Promise.all([
    read({ ...query, layer: 'original' }),
    read({ ...query, layer: 'downscaled', ensemble: selected.ensemble }),
    read({ ...query, layer: 'observation', observationMode: selected.observationMode }),
  ])
  const downscaled: ResultMapPointValue =
    task.configuration.variable === 'wind' && selected.ensemble?.kind === 'stddev'
      ? {
          status: 'unavailable',
          code: 'UNAVAILABLE_WIND_SPREAD',
          reason:
            'Wind Standard Deviation is unavailable: the public result projects mean-vector speed, not member-speed spread.',
        }
      : queriedDownscaled
  const incompatible = resultMapCompatibility(
    [original, downscaled].flatMap((value) =>
      value.status === 'available'
        ? [{ context: value.metadata, samples: [value.sample], ensemble: value.metadata.ensemble }]
        : [],
    ),
  )
  const difference: ResultMapPointValue =
    selected.ensemble?.kind === 'stddev'
      ? {
          status: 'unavailable',
          code: 'INCOMPATIBLE_STATISTIC',
          reason:
            'Ensemble spread is not a prediction. Difference is unavailable in Standard Deviation view.',
        }
      : incompatible
        ? incompatible
        : original.status === 'available' && downscaled.status === 'available'
          ? {
              status: 'available',
              sample: {
                ...downscaled.sample,
                value: downscaled.sample.value - original.sample.value,
              },
              metadata: downscaled.metadata,
              reason: 'Downscaled − Original at the same point; not accuracy improvement.',
            }
          : original.status !== 'available'
            ? {
                ...original,
                reason: `Original unavailable; Difference cannot be compared: ${original.reason}`,
              }
            : downscaled.status !== 'available'
              ? {
                  ...downscaled,
                  reason: `Downscaled unavailable; Difference cannot be compared: ${downscaled.reason}`,
                }
              : {
                  status: 'unavailable',
                  code: 'MISSING_DATA',
                  reason: 'Difference inputs unavailable.',
                }
  return {
    identity,
    taskId: task.id,
    point,
    selection: selected,
    values: { original, downscaled, observation, difference },
  }
}

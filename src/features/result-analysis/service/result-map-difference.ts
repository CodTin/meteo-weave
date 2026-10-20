import { RESULT_QUERY_LIMITS, type DownscalingTask } from '@/features/downscaling-tasks/service'
import type { ResultMapLayer } from '../types/result-map'
import type { ResultMapSource, ResultMapSelection } from './result-map-data'
import { computeDifference, intervalsMatch } from './comparison-data'
import { MapQueryUnavailable, readMapPoints } from './result-map-query'

/** Compare at the target preview coordinates through the public scientific sampling rule. */
export async function readMapDifference(
  source: ResultMapSource,
  task: DownscalingTask,
  selection: ResultMapSelection,
  downscaled: ResultMapLayer,
): Promise<ResultMapLayer> {
  if (downscaled.status !== 'ready')
    return {
      ...downscaled,
      kind: 'difference',
      reason: 'Downscaled data unavailable; Difference cannot be compared.',
    }
  if (selection.ensemble?.kind === 'stddev')
    return {
      kind: 'difference',
      status: 'unavailable',
      samples: [],
      reason:
        'Ensemble spread is not a prediction. Difference is unavailable in Standard Deviation view.',
    }
  const samples = []
  for (let offset = 0; offset < downscaled.samples.length; offset += RESULT_QUERY_LIMITS.points) {
    const chunk = downscaled.samples.slice(offset, offset + RESULT_QUERY_LIMITS.points)
    try {
      const result = await readMapPoints(source, task.id, {
        kind: 'points',
        layer: 'original',
        temporalResolution:
          selection.temporalResolution ??
          (task.configuration.timeRange.mode === 'forecast' ? 'hourly' : undefined),
        points: chunk.map(({ longitude, latitude }) => ({ longitude, latitude })),
        times: [selection.time],
      })
      const original = new Map(
        result.samples.map((point) => [
          `${point.longitude},${point.latitude},${point.time}`,
          point,
        ]),
      )
      for (const point of chunk) {
        const value = original.get(`${point.longitude},${point.latitude},${point.time}`)
        if (point.accumulation?.complete === false || value?.accumulation?.complete === false)
          return {
            kind: 'difference',
            status: 'unavailable',
            samples: [],
            code: 'INCOMPLETE_INTERVAL',
            reason:
              'Accumulation coverage is partial; Difference cannot represent the full requested interval.',
          }
        if (
          point.value !== null &&
          value?.value !== null &&
          !intervalsMatch(
            point.accumulation,
            value && 'accumulation' in value ? value.accumulation : undefined,
          )
        )
          return {
            kind: 'difference',
            status: 'unavailable',
            samples: [],
            code: 'INTERVAL_MISMATCH',
            reason: 'Accumulation intervals do not match; Difference is unavailable.',
          }
        samples.push({
          longitude: point.longitude,
          latitude: point.latitude,
          time: point.time,
          accumulation: point.accumulation,
          value: computeDifference(point.value, value?.value ?? null),
          unavailable: point.unavailable ?? value?.unavailable,
        })
      }
    } catch (error) {
      if (error instanceof MapQueryUnavailable)
        return {
          kind: 'difference',
          status: 'unavailable',
          samples: [],
          code: error.reply.code,
          reason: error.reply.error,
        }
      return {
        kind: 'difference',
        status: 'error',
        samples: [],
        reason: error instanceof Error ? error.message : 'Difference read failed.',
      }
    }
  }
  return {
    kind: 'difference',
    status: 'ready',
    samples,
    grid: downscaled.grid,
    provenance: downscaled.provenance,
    reason:
      'Original bilinear sampling at Downscaled preview locations; Downscaled − Original, not accuracy improvement.',
  }
}

import {
  RESULT_QUERY_LIMITS,
  type DownscalingTask,
  type ResultQuery,
  type ResultReply,
} from '@/features/downscaling-tasks/service'
import type { EnsembleSelection } from '@/features/downscaling-tasks/service/contracts'
import type { ResultMapData, ResultMapLayer } from '../types/result-map'
import { getVariableUnit } from './color-scales'
import { readMapDifference } from './result-map-difference'
import {
  MapQueryUnavailable,
  mapReplySamples,
  missingMapCodes,
  recoverMapPreview,
} from './result-map-query'

/** The same result seam used by the workspace task service, not a task repository. */
export type ResultMapSource = {
  result: (taskId: string, query: ResultQuery) => Promise<ResultReply>
}
export type ResultMapSelection = {
  time: string
  observationMode: 'stations' | 'interpolated'
  ensemble?: EnsembleSelection
  temporalResolution?: ResultQuery['temporalResolution']
}

async function readLayer(
  source: ResultMapSource,
  task: DownscalingTask,
  query: ResultQuery,
): Promise<ResultMapLayer> {
  try {
    let result = await source.result(task.id, query)
    let samples
    if (!result.ok && missingMapCodes.has(result.code) && query.kind === 'preview') {
      const recovered = await recoverMapPreview(source, task.id, query, result.planned)
      if (recovered) {
        result = recovered.metadata
        samples = recovered.samples
      }
    }
    if (!result.ok)
      return {
        kind: query.layer,
        status: 'unavailable',
        samples: [],
        code: result.code,
        reason: result.error,
        grid: result.planned?.grid,
        reference: result.planned?.reference,
        provenance: result.planned?.provenance,
        ensemble: result.planned?.ensemble,
      }
    return {
      kind: query.layer,
      displayContext: {
        variable: result.variable,
        quantity: result.quantity,
        unit: result.unit,
        temporalStatistic: result.temporalStatistic,
      },
      status: 'ready',
      samples: samples ?? mapReplySamples(result),
      grid: result.grid,
      reference: result.reference,
      provenance: result.provenance,
      ensemble: result.ensemble,
    }
  } catch (error) {
    if (error instanceof MapQueryUnavailable)
      return {
        kind: query.layer,
        status: 'unavailable',
        samples: [],
        code: error.reply.code,
        reason: error.reply.error,
      }
    return {
      kind: query.layer,
      status: 'error',
      samples: [],
      reason: error instanceof Error ? error.message : 'Result read failed.',
    }
  }
}

export async function readResultMapData(
  source: ResultMapSource,
  task: DownscalingTask,
  selection: ResultMapSelection,
): Promise<ResultMapData> {
  const time = new Date(selection.time).toISOString()
  const preview = {
    kind: 'preview' as const,
    window: task.configuration.region,
    times: [time],
    temporalResolution:
      selection.temporalResolution ??
      (task.configuration.timeRange.mode === 'forecast' ? ('hourly' as const) : undefined),
    maxPoints: RESULT_QUERY_LIMITS.gridPoints,
  }
  const [original, downscaled, observation] = await Promise.all([
    readLayer(source, task, { ...preview, layer: 'original' }),
    readLayer(source, task, { ...preview, layer: 'downscaled', ensemble: selection.ensemble }),
    readLayer(source, task, {
      ...preview,
      layer: 'observation',
      observationMode: selection.observationMode,
    }),
  ])
  if (task.configuration.variable === 'wind' && selection.ensemble?.kind === 'stddev') {
    downscaled.status = 'unavailable'
    downscaled.samples = []
    downscaled.code = 'UNAVAILABLE_WIND_SPREAD'
    downscaled.reason =
      'Wind Standard Deviation is unavailable: the public result currently projects mean-vector speed, not member-speed spread. It is not relabelled as spread.'
  }
  return {
    taskId: task.id,
    time,
    region: task.configuration.region,
    variable: task.configuration.variable,
    unit: getVariableUnit(task.configuration.variable),
    observationMode: selection.observationMode,
    layers: {
      original,
      downscaled,
      observation,
      difference: await readMapDifference(source, task, { ...selection, time }, downscaled),
    },
  }
}

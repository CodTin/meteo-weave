import {
  ENSEMBLE_GENERATOR_VERSION,
  GENERATOR_VERSION,
  OBSERVATION_REFERENCE,
  TASK_SCHEMA_VERSION,
  VARIABLE_GENERATOR_VERSION,
  type DownscalingTask,
} from '@/features/downscaling-tasks/service/contracts'
import type { ExportRequest } from '@/features/result-analysis/types/export'

type ExportTaskOptions = {
  id?: string
  name?: string
  ownerId?: DownscalingTask['ownerId']
  variable?: DownscalingTask['configuration']['variable']
  resolution?: DownscalingTask['configuration']['resolution']
  region?: DownscalingTask['configuration']['region']
  timeRange?: DownscalingTask['configuration']['timeRange']
  ensembleMembers?: 5 | 10 | 20
  dataSeed?: number
  generatorVersion?: string
  status?: DownscalingTask['status']
  referenceVersion?: string
}

/** Complete saved records, never id-only tasks or mismatched variable/generator toys. */
export function exportTask(options: ExportTaskOptions = {}): DownscalingTask {
  const variable = options.variable ?? 'temperature'
  const configuration = {
    dataSource: 'ecmwf' as const,
    variable,
    resolution: options.resolution ?? '3km',
    region: options.region ?? { west: 120, east: 120.12, south: 30, north: 30.08 },
    timeRange: options.timeRange ?? {
      mode: 'forecast' as const,
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-01-03T00:00:00.000Z',
    },
  }
  return {
    schemaVersion: TASK_SCHEMA_VERSION,
    id: options.id ?? 'export-task',
    name: options.name ?? 'Synthetic Demo · Export fixture',
    ownerId: options.ownerId ?? 'researcher',
    configuration: options.ensembleMembers
      ? {
          ...configuration,
          method: 'probabilistic',
          resolvedMethod: 'probabilistic',
          advanced: { uncertaintyQuantification: true, ensembleMembers: options.ensembleMembers },
        }
      : { ...configuration, method: 'recommended', resolvedMethod: 'deterministic' },
    createdAt: '2024-01-01T00:00:00.000Z',
    submittedAt: '2024-01-01T00:00:00.000Z',
    completionAt: '2024-01-01T00:00:02.500Z',
    status: options.status ?? 'Completed',
    failureReason: options.status === 'Failed' ? 'Declared task failure' : null,
    dataSeed: options.dataSeed ?? 12345,
    generatorVersion:
      options.generatorVersion ??
      (options.ensembleMembers
        ? ENSEMBLE_GENERATOR_VERSION
        : variable === 'temperature'
          ? GENERATOR_VERSION
          : VARIABLE_GENERATOR_VERSION),
    ...OBSERVATION_REFERENCE,
    referenceVersion: options.referenceVersion ?? OBSERVATION_REFERENCE.referenceVersion,
  }
}

export function exportRequest(
  task = exportTask(),
  selection: Partial<Omit<ExportRequest, 'task' | 'taskId'>> = {},
): ExportRequest {
  return {
    taskId: task.id,
    task,
    bbox: task.configuration.region,
    timeRange: { start: '2024-01-01T00:00:00.000Z', end: '2024-01-01T02:00:00.000Z' },
    dataTypes: ['original', 'downscaled', 'observation'],
    format: 'csv',
    temporalResolution: 'hourly',
    ...selection,
  }
}

import '@tanstack/react-start/server-only'
import type { DownscalingTask } from '@/features/downscaling-tasks/service/contracts'
import type {
  ExportEstimationSuccess,
  ExportFailure,
  ExportPlan,
  ExportRecord,
  ExportRequest,
  TextExportSuccess,
} from '@/features/result-analysis/types/export'
import { authenticateExportPlan, createExportPlan } from './result-export-plan.server'
import { readExportRecords } from './result-export-records.server'

export {
  calculateBboxWidthKm,
  calculateBboxHeightKm,
  isBboxWithinBounds,
} from './result-export-plan.server'
export type { ExportRequest } from '@/features/result-analysis/types/export'
export type ExportEstimationRequest = ExportRequest
export type CsvExportResult = (TextExportSuccess & { csv: string }) | ExportFailure
export type GeoJsonExportResult = (TextExportSuccess & { geojson: string }) | ExportFailure

/** Neutralize untrusted spreadsheet text, but never alter numeric scientific fields. */
export function escapeCsvText(text: string): string {
  // eslint-disable-next-line no-control-regex -- intentional control character detection for CSV safety
  const dangerous = /^[=+\-@]|[\x00-\x1F]/
  if (dangerous.test(text)) {
    return `'${text}`
  }
  return text
}

/**
 * Encode a CSV field, handling quotes and escaping.
 */
export function encodeCsvField(value: string | number | null): string {
  if (value === null) return ''
  if (typeof value === 'number') {
    return String(value)
  }

  const escaped = escapeCsvText(value)

  // Quote if contains comma, newline, or quote
  if (escaped.includes(',') || escaped.includes('\n') || escaped.includes('"')) {
    return `"${escaped.replace(/"/g, '""')}"`
  }

  return escaped
}

function filename(plan: ExportPlan, extension: 'csv' | 'geojson'): string {
  const id = plan.task.id.replace(/[^a-zA-Z0-9_-]/g, '_')
  const variable = plan.task.configuration.variable
  const start = plan.request.timeRange.start.replace(/[:.]/g, '-')
  return `meteo_${id}_${variable}_${plan.request.dataTypes.join('-')}_${start}.${extension}`
}

function csvColumns(plan: ExportPlan): string[] {
  return [
    'taskId',
    'dataType',
    'sampling',
    'sourceKind',
    'resolutionKm',
    'provenance',
    'dataSource',
    'generatorVersion',
    'time',
    'longitude',
    'latitude',
    'stationId',
    'variable',
    'value',
    'unit',
    'qualityFlag',
    'qualityReason',
    'temporalStatistic',
    'aggregation',
    'referenceSeed',
    'referenceVersion',
    'sampleCount',
    'validMemberIds',
    'unavailableMemberIds',
    'ensembleMeanDefinition',
    'meanMemberSpeed',
    ...(plan.task.configuration.variable === 'wind'
      ? ['u10', 'v10', 'speed', 'direction', 'directionStatus', 'directionConvention']
      : []),
    ...(plan.task.configuration.variable === 'precipitation'
      ? [
          'accumulationStart',
          'accumulationEnd',
          'requestedStart',
          'requestedEnd',
          'bounds',
          'sampledHours',
          'expectedHours',
          'complete',
        ]
      : []),
    ...(plan.request.temporalResolution === 'daily' &&
    plan.task.configuration.variable === 'temperature'
      ? [
          'dailyMean',
          'dailyMinimum',
          'dailyStart',
          'dailyEnd',
          'bounds',
          'sampledHours',
          'expectedHours',
          'completeDay',
        ]
      : []),
  ]
}

function csvRow(record: ExportRecord, columns: string[]): string {
  const fields: Record<string, unknown> = {
    ...record,
    referenceSeed: record.reference?.referenceSeed,
    referenceVersion: record.reference?.referenceVersion,
    sampleCount: record.ensembleMean?.sampleCount,
    validMemberIds: record.ensembleMean?.validMemberIds.join('|'),
    unavailableMemberIds: record.ensembleMean?.unavailableMemberIds.join('|'),
    meanMemberSpeed: record.ensembleMean?.meanMemberSpeed,
    accumulationStart: record.accumulation?.start,
    accumulationEnd: record.accumulation?.end,
    requestedStart: record.accumulation?.requestedStart,
    requestedEnd: record.accumulation?.requestedEnd,
    bounds: record.accumulation?.bounds ?? record.daily?.bounds,
    sampledHours: record.accumulation?.sampledHours ?? record.daily?.sampledHours,
    expectedHours: record.accumulation?.expectedHours ?? record.daily?.expectedHours,
    complete: record.accumulation?.complete,
    dailyMean: record.daily?.mean,
    dailyMinimum: record.daily?.minimum,
    dailyStart: record.daily?.start,
    dailyEnd: record.daily?.end,
    completeDay: record.daily?.completeDay,
  }
  return columns
    .map((column) => {
      const value = fields[column]
      return encodeCsvField(
        value === undefined || value === null
          ? null
          : typeof value === 'number'
            ? value
            : String(value),
      )
    })
    .join(',')
}

function feature(record: ExportRecord) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [record.longitude, record.latitude] },
    properties: record,
  }
}

function geojsonMetadata(plan: ExportPlan) {
  return {
    taskId: plan.task.id,
    provenance: 'Synthetic Demo',
    variable: plan.task.configuration.variable,
    dataSource: plan.task.configuration.dataSource,
    generatorVersion: plan.task.generatorVersion,
    bbox: plan.request.bbox,
    timeRange: plan.request.timeRange,
    temporalResolution: plan.request.temporalResolution,
    counts: plan.layers.map(({ dataType, pointCount, resolutionKm }) => ({
      dataType,
      pointCount,
      resolutionKm,
    })),
    notes: plan.notes,
  }
}

export async function generateCsvPlan(
  plan: ExportPlan,
  signal?: AbortSignal,
): Promise<CsvExportResult> {
  const result = await readExportRecords(plan, signal)
  if (!result.ok) return result
  signal?.throwIfAborted()
  const columns = csvColumns(plan)
  const content = [
    columns.join(','),
    ...result.records.map((record) => csvRow(record, columns)),
  ].join('\n')
  return {
    ok: true,
    content,
    csv: content,
    mimeType: 'text/csv;charset=utf-8',
    filename: filename(plan, 'csv'),
    recordCount: plan.recordCount,
    notes: plan.notes,
  }
}

export async function generateGeoJsonPlan(
  plan: ExportPlan,
  signal?: AbortSignal,
): Promise<GeoJsonExportResult> {
  const result = await readExportRecords(plan, signal)
  if (!result.ok) return result
  signal?.throwIfAborted()
  const content = JSON.stringify({
    type: 'FeatureCollection',
    metadata: geojsonMetadata(plan),
    features: result.records.map(feature),
  })
  return {
    ok: true,
    content,
    geojson: content,
    mimeType: 'application/geo+json',
    filename: filename(plan, 'geojson'),
    recordCount: plan.recordCount,
    notes: plan.notes,
  }
}

export async function generateCsvExport(
  input: unknown,
  signal?: AbortSignal,
): Promise<CsvExportResult> {
  const plan = authenticateExportPlan(input)
  return plan.ok ? generateCsvPlan(plan, signal) : plan
}

export async function generateGeoJsonExport(
  input: unknown,
  signal?: AbortSignal,
): Promise<GeoJsonExportResult> {
  const plan = authenticateExportPlan(input)
  return plan.ok ? generateGeoJsonPlan(plan, signal) : plan
}

/** Compatibility seams delegate to the same full-task validation and shared records. */
export async function generateCsvFromTask(
  input: unknown,
  task: DownscalingTask,
  signal?: AbortSignal,
): Promise<CsvExportResult> {
  const plan = createExportPlan(input, task)
  return plan.ok ? generateCsvPlan(plan, signal) : plan
}

export async function generateGeoJsonFromTask(
  input: unknown,
  task: DownscalingTask,
  signal?: AbortSignal,
): Promise<GeoJsonExportResult> {
  const plan = createExportPlan(input, task)
  return plan.ok ? generateGeoJsonPlan(plan, signal) : plan
}

export async function generateCsvContent(
  input: unknown,
  task: DownscalingTask,
  signal?: AbortSignal,
): Promise<string> {
  const result = await generateCsvFromTask(input, task, signal)
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`)
  return result.content
}

export function validateExportRequest(input: unknown): ExportFailure | null {
  if (!input || typeof input !== 'object' || !('task' in input))
    return { ok: false, code: 'INVALID_REQUEST', message: 'The complete saved task is required.' }
  const task = input.task
  // The unknown transport record is validated by createExportPlan before any field is read.
  const plan = createExportPlan(input, task as DownscalingTask)
  return plan.ok ? null : plan
}

/** Fixed representative science values, not synthetic generation or preview reads. */
function representativeRecord(plan: ExportPlan, layer: ExportPlan['layers'][number]): ExportRecord {
  const { variable } = plan.task.configuration
  const longitude =
    layer.dataType === 'observation' ? layer.stations[0]!.longitude : layer.axes.longitudes[0]!
  const latitude =
    layer.dataType === 'observation' ? layer.stations[0]!.latitude : layer.axes.latitudes[0]!
  const time = plan.timeInstants[0]!
  const duration = plan.request.temporalResolution === 'daily' ? 24 : 1
  const end = new Date(Date.parse(time) + duration * 3_600_000).toISOString()
  const probabilistic =
    layer.dataType === 'downscaled' && plan.task.configuration.resolvedMethod === 'probabilistic'
  const record: ExportRecord = {
    taskId: plan.task.id,
    dataType: layer.dataType,
    sampling: layer.dataType === 'observation' ? 'stations' : 'logical-grid',
    sourceKind: layer.dataType === 'observation' ? 'synthetic-reference' : 'synthetic-model',
    resolutionKm: layer.resolutionKm,
    provenance: 'Synthetic Demo',
    dataSource: plan.task.configuration.dataSource,
    generatorVersion: plan.task.generatorVersion,
    ...(layer.dataType === 'observation'
      ? {
          stationId: layer.stations[0]!.id,
          reference: {
            referenceSeed: plan.task.referenceSeed ?? 1729,
            referenceVersion: plan.task.referenceVersion ?? 'synthetic-observations-v1',
          },
        }
      : {}),
    time,
    longitude,
    latitude,
    variable,
    unit: { temperature: '°C', wind: 'm/s', pressure: 'hPa', precipitation: 'mm' }[
      variable
    ] as ExportRecord['unit'],
    value: { temperature: 20.1234, wind: 5.1234, pressure: 1013.1234, precipitation: 1.1234 }[
      variable
    ],
    qualityFlag: 'valid',
    qualityReason: null,
    temporalStatistic:
      variable === 'precipitation'
        ? 'accumulation'
        : plan.request.temporalResolution === 'daily'
          ? 'daily-mean'
          : 'instantaneous',
    aggregation: probabilistic ? 'ensemble-mean' : 'none',
    ...(variable === 'wind'
      ? {
          u10: -3.1234,
          v10: 4.1234,
          speed: 5.1234,
          direction: 323.1234,
          directionStatus: 'available',
          directionConvention: 'meteorological-from',
        }
      : {}),
    ...(variable === 'precipitation'
      ? {
          accumulation: {
            start: time,
            end,
            requestedStart: time,
            requestedEnd: end,
            bounds: '[start,end)',
            sampledHours: duration,
            expectedHours: duration,
            complete: true,
          },
        }
      : {}),
    ...(variable === 'temperature' && plan.request.temporalResolution === 'daily'
      ? {
          daily: {
            mean: 20.1234,
            minimum: 10.1234,
            start: time,
            end,
            bounds: '[start,end)',
            sampledHours: 24,
            expectedHours: 24,
            completeDay: true,
          },
        }
      : {}),
  }
  if (probabilistic && plan.task.configuration.resolvedMethod === 'probabilistic') {
    record.ensembleMean = {
      sampleCount: plan.task.configuration.advanced.ensembleMembers,
      validMemberIds: Array.from(
        { length: plan.task.configuration.advanced.ensembleMembers },
        (_, index) => `member-${String(index + 1).padStart(2, '0')}`,
      ),
      unavailableMemberIds: [],
      ...(variable === 'wind' ? { meanMemberSpeed: 5.1234 } : {}),
    }
    record.ensembleMeanDefinition =
      'Arithmetic mean of available member samples per location/time; unavailable member samples are excluded.'
  }
  return record
}

/** Exact plan count with bounded representative serialization, never a full file/science read. */
export function estimateTextPlan(plan: ExportPlan): ExportEstimationSuccess | ExportFailure {
  if (plan.request.format === 'netcdf')
    return {
      ok: false,
      code: 'UNSUPPORTED_FORMAT',
      message: 'NetCDF sizing belongs to the binary adapter; use its measured descriptor.',
    }
  const utf8 = (text: string) => new TextEncoder().encode(text).byteLength
  const columns = csvColumns(plan)
  let approximateSize =
    plan.request.format === 'csv'
      ? utf8(columns.join(','))
      : utf8(
          JSON.stringify({
            type: 'FeatureCollection',
            metadata: geojsonMetadata(plan),
            features: [],
          }),
        )
  for (const layer of plan.layers) {
    if (!layer.pointCount) continue
    const record = representativeRecord(plan, layer)
    const bytes =
      plan.request.format === 'csv'
        ? utf8(csvRow(record, columns)) + 1
        : utf8(JSON.stringify(feature(record))) + 1
    approximateSize += layer.pointCount * plan.timeInstants.length * bytes
  }
  if (plan.request.format === 'geojson') approximateSize-- // No comma after the final feature.
  return {
    ok: true,
    recordCount: plan.recordCount,
    approximateSize,
    sizeRule:
      'Approximate UTF-8 bytes: actual fixed wrapper/header plus one representative valid row per nonempty layer, serialized by the same encoder and multiplied by its exact record count; no scientific reads. Representative scalars use four fractional digits. Actual number widths, missing/coverage status and ensemble details vary; allow 35% or 512 bytes, whichever is larger, for fixed small fixtures (not an exact size guarantee).',
    counts: plan.layers.map(({ dataType, pointCount }) => ({
      dataType,
      pointCount,
      recordCount: pointCount * plan.timeInstants.length,
    })),
    notes: plan.notes,
    identity: plan.identity,
  }
}

export function estimateExportMetrics(input: unknown): ExportEstimationSuccess | ExportFailure {
  const plan = authenticateExportPlan(input)
  return plan.ok ? estimateTextPlan(plan) : plan
}

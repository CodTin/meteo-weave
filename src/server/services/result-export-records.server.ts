import '@tanstack/react-start/server-only'
import {
  RESULT_QUERY_LIMITS,
  type Accumulation,
  type DailyTemperature,
  type ResultPoint,
  type ResultReply,
  type ResultValue,
  type WindValue,
} from '@/features/downscaling-tasks/service/contracts'
import { queryTaskResult } from '@/features/downscaling-tasks/service/result-queries'
import { observationReference } from '@/features/downscaling-tasks/service/observation-reference'
import type {
  ExportFailure,
  ExportLayer,
  ExportPlan,
  ExportRecord,
  ExportRecordsReply,
} from '@/features/result-analysis/types/export'

const missingCodes = new Set([
  'MISSING_DATA',
  'MISSING_COMPONENT',
  'MISSING_ENSEMBLE',
  'MISSING_MEMBER',
  'NO_OBSERVATION',
])
type PublicResult = Extract<ResultReply, { ok: true }>
type PublicValue = ResultValue &
  Partial<WindValue> & {
    accumulation?: Accumulation
    daily?: DailyTemperature
  }

async function cooperate(signal?: AbortSignal) {
  signal?.throwIfAborted()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  signal?.throwIfAborted()
}

export function createExportBaseRecord(
  plan: ExportPlan,
  layer: ExportLayer,
  point: ResultPoint,
  time: string,
): ExportRecord {
  const { variable } = plan.task.configuration
  return {
    taskId: plan.task.id,
    dataType: layer.dataType,
    sampling: layer.dataType === 'observation' ? 'stations' : 'logical-grid',
    sourceKind: layer.dataType === 'observation' ? 'synthetic-reference' : 'synthetic-model',
    resolutionKm: layer.resolutionKm,
    provenance: 'Synthetic Demo',
    dataSource: plan.task.configuration.dataSource,
    generatorVersion: plan.task.generatorVersion,
    ...(layer.dataType === 'observation' ? { reference: observationReference(plan.task) } : {}),
    time,
    longitude: point.longitude,
    latitude: point.latitude,
    ...(layer.dataType === 'observation'
      ? {
          stationId: layer.stations.find(
            (station) =>
              station.longitude === point.longitude && station.latitude === point.latitude,
          )?.id,
        }
      : {}),
    variable,
    unit: { temperature: '°C', wind: 'm/s', pressure: 'hPa', precipitation: 'mm' }[
      variable
    ] as ExportRecord['unit'],
    value: null,
    qualityFlag: 'missing',
    qualityReason: null,
    temporalStatistic:
      variable === 'precipitation'
        ? 'accumulation'
        : plan.request.temporalResolution === 'daily'
          ? 'daily-mean'
          : 'instantaneous',
    aggregation:
      layer.dataType === 'downscaled' && plan.task.configuration.resolvedMethod === 'probabilistic'
        ? 'ensemble-mean'
        : 'none',
  }
}

function pointAt(layer: ExportLayer, index: number): ResultPoint {
  if (layer.dataType === 'observation') {
    const station = layer.stations[index]!
    return { longitude: station.longitude, latitude: station.latitude }
  }
  return {
    longitude: layer.axes.longitudes[index % layer.axes.longitudes.length]!,
    latitude: layer.axes.latitudes[Math.floor(index / layer.axes.longitudes.length)]!,
  }
}

function scientificFailure(reply: PublicResult): ExportFailure | undefined {
  const fatal = reply.ensemble?.unavailable.find((failure) => !missingCodes.has(failure.code))
  return fatal ? { ok: false, code: fatal.code, message: fatal.error } : undefined
}

function recordFromValue(
  plan: ExportPlan,
  layer: ExportLayer,
  reply: PublicResult,
  value: PublicValue,
): ExportRecord | ExportFailure {
  if (!Number.isFinite(value.value))
    return {
      ok: false,
      code: 'GENERATION_FAILED',
      message: 'A public result contains a nonfinite scientific value.',
    }
  const record: ExportRecord = {
    ...createExportBaseRecord(plan, layer, value, value.time),
    value: value.value,
    unit: reply.unit,
    temporalStatistic: reply.temporalStatistic,
    qualityFlag: 'valid' as const,
    qualityReason: null,
    ...(value.ensembleMean
      ? { ensembleMean: value.ensembleMean, ensembleMeanDefinition: reply.ensemble?.meanDefinition }
      : {}),
    ...(value.accumulation ? { accumulation: value.accumulation } : {}),
    ...(value.daily ? { daily: value.daily } : {}),
  }
  if (
    (value.accumulation && !value.accumulation.complete) ||
    (value.daily && !value.daily.completeDay)
  ) {
    // The public partial statistic is not a complete requested day/interval. Retain its
    // coverage/statistic metadata, but never present its partial total as dry zero.
    record.value = null
    record.qualityFlag = 'incomplete'
    record.qualityReason = 'INCOMPLETE_COVERAGE'
  }
  if (reply.variable === 'wind') {
    if (
      !Number.isFinite(value.u10) ||
      !Number.isFinite(value.v10) ||
      !Number.isFinite(value.speed) ||
      (value.fromDirection !== null && !Number.isFinite(value.fromDirection))
    )
      return {
        ok: false,
        code: 'GENERATION_FAILED',
        message: 'The public wind result contains nonfinite or missing components.',
      }
    record.u10 = value.u10!
    record.v10 = value.v10!
    record.speed = value.speed!
    record.direction = value.fromDirection!
    record.directionStatus = value.directionStatus!
    record.directionConvention = 'meteorological-from'
  }
  return record
}

function missingRecord(
  plan: ExportPlan,
  layer: ExportLayer,
  point: ResultPoint,
  time: string,
  code: string,
): ExportRecord {
  return {
    ...createExportBaseRecord(plan, layer, point, time),
    qualityReason: code,
    ...(plan.task.configuration.variable === 'wind'
      ? {
          u10: null,
          v10: null,
          speed: null,
          direction: null,
          directionStatus: 'missing' as const,
          directionConvention: 'meteorological-from' as const,
        }
      : {}),
  }
}

async function publicBatch(
  plan: ExportPlan,
  layer: ExportLayer,
  points: ResultPoint[],
  time: string,
  signal?: AbortSignal,
): Promise<ResultReply> {
  await cooperate(signal)
  const selection = {
    temporalResolution: plan.request.temporalResolution,
    times: [time],
  }
  if (layer.dataType === 'observation') {
    // Native station windows use exact stationAt identity; points may choose a different
    // available nearest station during an outage, which must never replace an export slot.
    return queryTaskResult(plan.task, {
      ...selection,
      kind: 'export',
      layer: 'observation',
      observationMode: 'stations',
      window: {
        west: Math.min(...points.map((point) => point.longitude)),
        east: Math.max(...points.map((point) => point.longitude)),
        south: Math.min(...points.map((point) => point.latitude)),
        north: Math.max(...points.map((point) => point.latitude)),
      },
    })
  }
  return queryTaskResult(plan.task, { ...selection, kind: 'points', layer: layer.dataType, points })
}

/** Public daily failure has no payload; recover coverage from the same hourly seam,
 * never from a fresh rain formula or a zero-filled sum. The daily scientific value stays null.
 */
async function missingRainCoverage(
  plan: ExportPlan,
  layer: ExportLayer,
  point: ResultPoint,
  time: string,
  signal?: AbortSignal,
): Promise<Accumulation | ExportFailure> {
  const start = Date.parse(time)
  const expectedHours = plan.request.temporalResolution === 'daily' ? 24 : 1
  const hours: number[] = []
  if (expectedHours === 24) {
    const hourlyPlan = {
      ...plan,
      request: { ...plan.request, temporalResolution: 'hourly' as const },
    }
    for (let index = 0; index < expectedHours; index++) {
      const instant = start + index * 3_600_000
      const reply = await publicBatch(
        hourlyPlan,
        layer,
        [point],
        new Date(instant).toISOString(),
        signal,
      )
      if (!reply.ok) {
        if (!missingCodes.has(reply.code))
          return { ok: false, code: reply.code, message: reply.error }
        continue
      }
      const fatal = scientificFailure(reply)
      if (fatal) return fatal
      if (reply.values.length !== 1 || !Number.isFinite(reply.values[0]!.value))
        return {
          ok: false,
          code: 'GENERATION_FAILED',
          message: 'Invalid public hourly coverage sample.',
        }
      hours.push(instant)
    }
  }
  return {
    start: new Date(hours[0] ?? start).toISOString(),
    end: new Date(hours.length ? hours.at(-1)! + 3_600_000 : start).toISOString(),
    requestedStart: time,
    requestedEnd: new Date(start + expectedHours * 3_600_000).toISOString(),
    bounds: '[start,end)',
    sampledHours: hours.length,
    expectedHours,
    complete: false,
  }
}

/** Actual public mean/science, cooperatively read in bounded native location/time batches. */
export async function readExportRecords(
  plan: ExportPlan,
  signal?: AbortSignal,
): Promise<ExportRecordsReply> {
  const records: ExportRecord[] = []
  try {
    for (const layer of plan.layers) {
      const memberFactor =
        layer.dataType === 'downscaled' &&
        plan.task.configuration.resolvedMethod === 'probabilistic'
          ? plan.task.configuration.advanced.ensembleMembers + 1
          : 1
      const batchSize = Math.min(
        RESULT_QUERY_LIMITS.points,
        Math.floor(RESULT_QUERY_LIMITS.values / memberFactor),
      )
      for (const time of plan.timeInstants) {
        for (let offset = 0; offset < layer.pointCount; offset += batchSize) {
          const points = Array.from(
            { length: Math.min(batchSize, layer.pointCount - offset) },
            (_, index) => pointAt(layer, offset + index),
          )
          const reply = await publicBatch(plan, layer, points, time, signal)
          if (!reply.ok) {
            if (!missingCodes.has(reply.code))
              return { ok: false, code: reply.code, message: reply.error }
            for (const point of points) {
              const slot =
                points.length === 1 ? reply : await publicBatch(plan, layer, [point], time, signal)
              if (!slot.ok) {
                if (!missingCodes.has(slot.code))
                  return { ok: false, code: slot.code, message: slot.error }
                const record = missingRecord(plan, layer, point, time, slot.code)
                if (record.variable === 'precipitation') {
                  const coverage = await missingRainCoverage(plan, layer, point, time, signal)
                  if ('ok' in coverage) return coverage
                  record.accumulation = coverage
                }
                records.push(record)
                continue
              }
              const fatal = scientificFailure(slot)
              if (fatal) return fatal
              if (slot.values.length !== 1)
                return {
                  ok: false,
                  code: 'EXPORT_READ_FAILED',
                  message: 'The public result did not return the planned slot.',
                }
              const record = recordFromValue(plan, layer, slot, slot.values[0]!)
              if ('ok' in record) return record
              records.push(record)
            }
            continue
          }
          const fatal = scientificFailure(reply)
          if (fatal) return fatal
          if (reply.values.length !== points.length)
            return {
              ok: false,
              code: 'EXPORT_READ_FAILED',
              message: 'The public result did not return every planned location/time slot.',
            }
          for (const value of reply.values) {
            const record = recordFromValue(plan, layer, reply, value)
            if ('ok' in record) return record
            records.push(record)
          }
        }
      }
    }
    signal?.throwIfAborted()
    if (records.length !== plan.recordCount)
      return {
        ok: false,
        code: 'EXPORT_READ_FAILED',
        message: 'The result record count no longer matches the authoritative plan.',
      }
    return { ok: true, records }
  } catch (error) {
    signal?.throwIfAborted()
    return {
      ok: false,
      code: 'EXPORT_READ_FAILED',
      message: error instanceof Error ? error.message : 'Public result reading failed.',
    }
  }
}

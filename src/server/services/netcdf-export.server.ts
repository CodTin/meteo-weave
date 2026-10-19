import '@tanstack/react-start/server-only'
import type { DownscalingTask } from '@/features/downscaling-tasks/service/contracts'
import type {
  ExportEstimationSuccess,
  ExportFailure,
  ExportLayer,
  ExportPlan,
  ExportRecord,
  ExportRequest,
} from '@/features/result-analysis/types/export'
import {
  encodeNetCDF,
  measureNetCDF,
  type NetCDFSchema,
  type NetCDFVariable,
} from '@/server/services/netcdf-encoding.server'
import {
  authenticateExportPlan,
  createExportPlan,
} from '@/server/services/result-export-plan.server'
import {
  estimateTextPlan,
  generateCsvPlan,
  generateGeoJsonPlan,
} from '@/server/services/csv-export.server'
import { readExportRecords } from '@/server/services/result-export-records.server'

const FILL_VALUE = -9999
const TIME_UNITS = 'seconds since 1970-01-01 00:00:00'
const CALENDAR = 'proleptic_gregorian'
const PRECISION_NOTE = 'IEEE 754 float32; absolute comparison tolerance 0.001 in the stated unit'

export type NetCDFExportResult = {
  ok: true
  data: Uint8Array
  filename: string
  mimeType: 'application/x-netcdf'
  recordCount: number
  notes: string[]
}
export type NetCDFExportError = ExportFailure & { error: string }

type VariableSchema = NetCDFSchema['variables'][number]
type ArrayData = NetCDFVariable['data']
type RecordIndex = Map<string, ExportRecord>
type BoundVariable = {
  schema: VariableSchema
  read: (records: RecordIndex) => ArrayData
}
type Dataset = {
  schema: NetCDFSchema
  variables: BoundVariable[]
}

function failure(code: string, message: string): NetCDFExportError {
  return { ok: false, code, message, error: message }
}
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'NetCDF 编码失败，请缩小区域或时间范围后重试。'
}
function key(dataType: string, time: string, longitude: number, latitude: number) {
  return `${dataType}|${time}|${longitude}|${latitude}`
}
function positions(layer: ExportLayer) {
  return layer.dataType === 'observation'
    ? layer.stations
    : layer.axes.latitudes.flatMap((latitude) =>
        layer.axes.longitudes.map((longitude) => ({ latitude, longitude })),
      )
}
function slots(plan: ExportPlan, layer: ExportLayer, records: RecordIndex) {
  const points = positions(layer)
  return plan.timeInstants.flatMap((time) =>
    points.map(({ longitude, latitude }) => {
      const record = records.get(key(layer.dataType, time, longitude, latitude))
      if (!record) throw new Error('导出记录与选择计划错配；没有生成部分文件。')
      return record
    }),
  )
}

/** One schema describes both capacity/size estimation and the final binary layout. */
function dataset(plan: ExportPlan, created: string): Dataset {
  const task = plan.task
  const dimensions = [{ name: 'time', size: plan.timeInstants.length }]
  if (task.configuration.variable === 'precipitation') dimensions.push({ name: 'bounds', size: 2 })
  const variables: BoundVariable[] = []
  const add = (schema: VariableSchema, read: BoundVariable['read']) => {
    variables.push({ schema, read })
  }
  const coordinate = (name: string, values: number[], units: string) => {
    dimensions.push({ name, size: values.length })
    add(
      { name, type: 'double', dimensions: [name], attributes: { units } },
      () => new Float64Array(values),
    )
  }
  add(
    {
      name: 'time',
      type: 'double',
      dimensions: ['time'],
      attributes: { units: TIME_UNITS, calendar: CALENDAR, timezone: 'UTC' },
    },
    () => new Float64Array(plan.timeInstants.map((time) => Date.parse(time) / 1000)),
  )

  for (const layer of plan.layers) {
    // A CDF-1 dimension of zero denotes an unlimited dimension, not zero stations.
    if (!layer.pointCount) continue
    const suffix = layer.dataType
    let spatialDimensions: string[]
    let coordinates: string
    if (layer.dataType === 'observation') {
      dimensions.push({ name: 'station', size: layer.pointCount })
      const encoder = new TextEncoder()
      const ids = layer.stations.map((station) => encoder.encode(station.id))
      const width = Math.max(...ids.map((id) => id.length))
      dimensions.push({ name: 'stationId_len', size: width })
      add(
        {
          name: 'stationId',
          type: 'char',
          dimensions: ['station', 'stationId_len'],
          attributes: {
            long_name: 'Synthetic Demo reference station identifier',
            encoding: 'UTF-8; NUL padded rows',
          },
        },
        () => {
          const bytes = new Uint8Array(width * ids.length)
          ids.forEach((id, index) => bytes.set(id, index * width))
          return bytes
        },
      )
      for (const [axis, units] of [
        ['latitude', 'degrees_north'],
        ['longitude', 'degrees_east'],
      ] as const) {
        add(
          {
            name: `station_${axis}`,
            type: 'double',
            dimensions: ['station'],
            attributes: { units },
          },
          () => new Float64Array(layer.stations.map((station) => station[axis])),
        )
      }
      spatialDimensions = ['station']
      coordinates = 'time station_latitude station_longitude stationId'
    } else {
      coordinate(`${suffix}_latitude`, layer.axes.latitudes, 'degrees_north')
      coordinate(`${suffix}_longitude`, layer.axes.longitudes, 'degrees_east')
      spatialDimensions = [`${suffix}_latitude`, `${suffix}_longitude`]
      coordinates = `time ${suffix}_latitude ${suffix}_longitude`
    }
    const shape = ['time', ...spatialDimensions]
    const sourceAttributes: Record<string, string | number> = {
      dataType: suffix,
      source: 'Synthetic Demo',
      source_kind: suffix === 'observation' ? 'synthetic-reference' : 'synthetic-model',
      sampling: suffix === 'observation' ? 'stations' : 'logical-grid',
      coordinates,
      generatorVersion: task.generatorVersion,
      aggregation:
        suffix === 'downscaled' && task.configuration.resolvedMethod === 'probabilistic'
          ? 'public ensemble mean; members are not extra records'
          : 'none',
    }
    if (layer.resolutionKm !== null) sourceAttributes.resolutionKm = layer.resolutionKm
    if (suffix === 'observation') {
      sourceAttributes.referenceSeed = task.referenceSeed ?? 1729
      sourceAttributes.referenceVersion = task.referenceVersion ?? 'synthetic-observations-v1'
    }
    const numeric = (
      name: string,
      attributes: Record<string, string | number>,
      select: (record: ExportRecord) => number | null | undefined,
      type: 'float' | 'double' = 'float',
    ) => {
      add(
        {
          name: `${name}_${suffix}`,
          type,
          dimensions: shape,
          attributes: {
            ...sourceAttributes,
            ancillary_variables: `quality_flag_${suffix}`,
            ...attributes,
            _FillValue: FILL_VALUE,
            precision: PRECISION_NOTE,
          },
        },
        (records) => {
          const values = slots(plan, layer, records).map((record) => {
            const value = select(record)
            if (value === null || value === undefined) return FILL_VALUE
            if (!Number.isFinite(value)) throw new Error(`非有限 ${name} 值无法编码。`)
            return value
          })
          return type === 'double' ? new Float64Array(values) : new Float32Array(values)
        },
      )
    }
    if (suffix === 'downscaled' && task.configuration.resolvedMethod === 'probabilistic') {
      numeric(
        'ensemble_sample_count',
        {
          units: '1',
          long_name: 'Public ensemble mean denominator per location/time',
          configured_member_count: task.configuration.advanced.ensembleMembers,
        },
        (record) => record.ensembleMean?.sampleCount,
      )
    }
    numeric(
      'quality_flag',
      {
        units: '1',
        flag_values: '0 1 2',
        flag_meanings: 'valid missing incomplete',
        long_name: 'Scientific slot quality',
      },
      (record) => (record.qualityFlag === 'valid' ? 0 : record.qualityFlag === 'missing' ? 1 : 2),
    )
    switch (task.configuration.variable) {
      case 'temperature':
        numeric(
          'temperature',
          {
            units: '°C',
            quantity: 'T2M',
            long_name: '2 metre air temperature',
            standard_name: 'air_temperature',
            temporal_statistic:
              plan.request.temporalResolution === 'daily' ? 'daily-mean' : 'instantaneous',
          },
          (record) => record.value,
        )
        break
      case 'wind':
        numeric(
          'u10',
          {
            units: 'm/s',
            quantity: 'U10',
            long_name: 'Eastward 10 metre wind component',
            standard_name: 'eastward_wind',
          },
          (record) => record.u10,
        )
        numeric(
          'v10',
          {
            units: 'm/s',
            quantity: 'V10',
            long_name: 'Northward 10 metre wind component',
            standard_name: 'northward_wind',
          },
          (record) => record.v10,
        )
        numeric(
          'speed',
          { units: 'm/s', long_name: '10 metre wind speed', formula: 'sqrt(U10^2 + V10^2)' },
          (record) => record.speed,
        )
        numeric(
          'direction',
          {
            units: 'degrees',
            long_name: 'Meteorological wind from direction',
            convention: 'meteorological-from',
            formula: '(atan2(-U10,-V10) * 180/pi + 360) % 360; calm direction is unavailable',
            ancillary_variables: `direction_status_${suffix}`,
          },
          (record) => record.direction,
        )
        numeric(
          'direction_status',
          { units: '1', long_name: 'Direction availability: 0 available, 1 calm, 2 missing' },
          (record) =>
            record.directionStatus === 'calm' ? 1 : record.directionStatus === 'available' ? 0 : 2,
        )
        break
      case 'pressure':
        numeric(
          'msl',
          {
            units: 'hPa',
            quantity: 'MSL',
            long_name: 'Mean sea-level pressure (not surface pressure)',
            standard_name: 'air_pressure_at_mean_sea_level',
          },
          (record) => record.value,
        )
        break
      case 'precipitation': {
        numeric(
          'precipitation',
          {
            units: 'mm',
            quantity: 'TP',
            long_name: 'Total precipitation in the stated accumulation interval',
            temporal_statistic: 'accumulation',
            interval_bounds: `accumulation_bounds_${suffix}`,
            requested_interval_bounds: `requested_accumulation_bounds_${suffix}`,
            ancillary_variables: `sampled_hours_${suffix} expected_hours_${suffix} complete_coverage_${suffix}`,
          },
          (record) => record.value,
        )
        for (const requested of [false, true]) {
          add(
            {
              name: `${requested ? 'requested_' : ''}accumulation_bounds_${suffix}`,
              type: 'double',
              dimensions: [...shape, 'bounds'],
              attributes: {
                units: TIME_UNITS,
                calendar: CALENDAR,
                boundary_convention: '[start,end)',
                long_name: requested
                  ? 'Requested precipitation interval'
                  : 'Actual covered precipitation interval',
                coordinates,
                missing_note: 'Unknown covered bounds use IEEE NaN, not a fabricated zero interval',
              },
            },
            (records) =>
              new Float64Array(
                slots(plan, layer, records).flatMap((record) => {
                  const coverage = record.accumulation
                  if (!coverage) return [NaN, NaN]
                  return [
                    Date.parse(requested ? coverage.requestedStart : coverage.start) / 1000,
                    Date.parse(requested ? coverage.requestedEnd : coverage.end) / 1000,
                  ]
                }),
              ),
          )
        }
        numeric(
          'sampled_hours',
          { units: 'hours', long_name: 'Number of actual hourly samples in accumulation' },
          (record) => record.accumulation?.sampledHours,
        )
        numeric(
          'expected_hours',
          { units: 'hours', long_name: 'Expected hourly samples in requested accumulation' },
          (record) => record.accumulation?.expectedHours,
        )
        numeric(
          'complete_coverage',
          {
            units: '1',
            long_name: 'Accumulation coverage: 1 complete, 0 incomplete, fill unknown',
          },
          (record) => (record.accumulation ? Number(record.accumulation.complete) : null),
        )
        break
      }
      default:
        throw new Error('该变量的 NetCDF 表示尚未支持。')
    }
  }
  const globalAttributes = {
    title: `MeteoWeave ${task.configuration.variable} export`,
    taskId: task.id,
    generatorVersion: task.generatorVersion,
    seed: task.dataSeed,
    dataSource: task.configuration.dataSource,
    variable: task.configuration.variable,
    requestedMethod: task.configuration.method,
    actualMethod: task.configuration.resolvedMethod,
    aggregation:
      task.configuration.resolvedMethod === 'probabilistic' &&
      plan.request.dataTypes.includes('downscaled')
        ? 'public-default-ensemble-mean'
        : 'none',
    resolution: task.configuration.resolution,
    export_bbox: JSON.stringify(plan.request.bbox),
    export_start: plan.request.timeRange.start,
    export_end: plan.request.timeRange.end,
    export_time_bounds: '[start,end)',
    temporalResolution: plan.request.temporalResolution,
    requested_layers: plan.request.dataTypes.join(','),
    layers: plan.layers
      .filter((layer) => layer.pointCount)
      .map((layer) => layer.dataType)
      .join(','),
    recordCount: plan.recordCount,
    created,
    source: 'Synthetic Demo',
    observation_coverage: plan.notes.join('; ') || 'Requested layers contain native positions',
    precision: PRECISION_NOTE,
    conventions_note: 'Self-describing CDF-1; full CF compliance has not been certified',
  }
  return {
    schema: {
      dimensions,
      variables: variables.map((variable) => variable.schema),
      globalAttributes,
    },
    variables,
  }
}

export function estimateNetCDFPlan(plan: ExportPlan): ExportEstimationSuccess | ExportFailure {
  try {
    const layout = dataset(plan, new Date().toISOString())
    return {
      ok: true,
      recordCount: plan.recordCount,
      approximateSize: measureNetCDF(layout.schema),
      sizeRule:
        '约数：按同一 CDF-1 布局计算 UTF-8 header、坐标、标识、类型和四字节对齐开销；创建时间固定宽度，字节误差≤256 B。未生成科学数据或整个文件。',
      counts: plan.layers.map((layer) => ({
        dataType: layer.dataType,
        pointCount: layer.pointCount,
        recordCount: layer.pointCount * plan.timeInstants.length,
      })),
      notes: plan.notes,
      identity: plan.identity,
    }
  } catch (error) {
    return failure('NETCDF_CAPACITY_EXCEEDED', `${errorMessage(error)} 请缩小导出区域或时段。`)
  }
}

export async function generateNetCDFPlan(
  plan: ExportPlan,
  signal?: AbortSignal,
): Promise<NetCDFExportResult | NetCDFExportError> {
  let layout: Dataset
  try {
    signal?.throwIfAborted()
    layout = dataset(plan, new Date().toISOString())
    // The same layout must pass before scientific reads and output buffers are allocated.
    measureNetCDF(layout.schema)
  } catch (error) {
    return failure(signal?.aborted ? 'CANCELLED' : 'NETCDF_CAPACITY_EXCEEDED', errorMessage(error))
  }
  let reply: Awaited<ReturnType<typeof readExportRecords>>
  try {
    reply = await readExportRecords(plan, signal)
  } catch (error) {
    return failure(signal?.aborted ? 'CANCELLED' : 'EXPORT_READ_FAILED', errorMessage(error))
  }
  if (!reply.ok) return failure(reply.code, reply.message)
  try {
    signal?.throwIfAborted()
    if (reply.records.length !== plan.recordCount) {
      return failure('RECORD_LAYOUT_MISMATCH', '记录数与选择计划不一致，没有生成部分 NetCDF 文件。')
    }
    const records = new Map(
      reply.records.map((record) => [
        key(record.dataType, record.time, record.longitude, record.latitude),
        record,
      ]),
    )
    if (records.size !== plan.recordCount) {
      return failure('RECORD_LAYOUT_MISMATCH', '重复的导出记录身份，没有生成部分 NetCDF 文件。')
    }
    const data = encodeNetCDF({
      ...layout.schema,
      variables: layout.variables.map((variable) => ({
        ...variable.schema,
        data: variable.read(records),
      })),
    })
    signal?.throwIfAborted()
    const safeId = plan.task.id.replace(/[^a-zA-Z0-9_-]/g, '_')
    const filename = `${safeId}-${plan.task.configuration.variable}-${plan.request.dataTypes.join('-')}-${plan.request.timeRange.start.slice(0, 10)}.nc`
    return {
      ok: true,
      data,
      filename,
      mimeType: 'application/x-netcdf',
      recordCount: plan.recordCount,
      notes: plan.notes,
    }
  } catch (error) {
    return failure(signal?.aborted ? 'CANCELLED' : 'ENCODING_FAILED', errorMessage(error))
  }
}

/** Confirmed from-task generation seam; installed RPCs authenticate the same full record first. */
export async function exportTaskAsNetCDF(
  task: DownscalingTask,
  request: ExportRequest,
  signal?: AbortSignal,
): Promise<NetCDFExportResult | NetCDFExportError> {
  const plan = createExportPlan(request, task)
  if (!plan.ok) return failure(plan.code, plan.message)
  return generateNetCDFPlan(plan, signal)
}

/** The single installed generation dispatcher; admission and records are shared by all formats. */
export async function generateResultExport(input: unknown, signal?: AbortSignal) {
  const plan = authenticateExportPlan(input)
  if (!plan.ok) return plan
  if (plan.request.format === 'netcdf') {
    const result = await generateNetCDFPlan(plan, signal)
    if (!result.ok) return result
    return {
      ok: true as const,
      content: result.data,
      mimeType: result.mimeType,
      filename: result.filename,
      recordCount: result.recordCount,
      notes: result.notes,
    }
  }
  return plan.request.format === 'geojson'
    ? generateGeoJsonPlan(plan, signal)
    : generateCsvPlan(plan, signal)
}

export function estimateResultExport(input: unknown) {
  const plan = authenticateExportPlan(input)
  if (!plan.ok) return plan
  return plan.request.format === 'netcdf' ? estimateNetCDFPlan(plan) : estimateTextPlan(plan)
}

import '@tanstack/react-start/server-only'
import { z } from 'zod'
import {
  bboxSchema,
  calculateBboxWidthKm,
  calculateBboxHeightKm,
  isBboxWithinBounds,
} from '@/features/spatial-region/geometry'
export {
  calculateBboxWidthKm,
  calculateBboxHeightKm,
  isBboxWithinBounds,
} from '@/features/spatial-region/geometry'
import { requireDemoAccount } from './demo-session.server'
import { readDownscalingTask } from './downscaling-tasks.server'
import {
  OBSERVATION_REFERENCE,
  type DownscalingTask,
} from '@/features/downscaling-tasks/service/contracts'
import { validateTaskRecord } from '@/features/downscaling-tasks/service/record-validation'
import { resultAvailability } from '@/features/downscaling-tasks/service/result-queries'
import { gridWindowLayout } from '@/features/downscaling-tasks/service/result-grid'
import {
  observationReference,
  stationAt,
  stationWindowLayout,
} from '@/features/downscaling-tasks/service/observation-reference'
import type {
  ExportDataType,
  ExportFailure,
  ExportLayer,
  ExportPlanReply,
  ExportRequest,
} from '@/features/result-analysis/types/export'

export const EXPORT_MAX_RECORDS = 100_000
const HOUR = 3_600_000
const DAY = 24 * HOUR
const dataTypes: ExportDataType[] = ['original', 'downscaled', 'observation']
const requestSchema = z.strictObject({
  task: z.unknown().optional(),
  taskId: z.string().min(1).max(128),
  bbox: bboxSchema,
  timeRange: z.strictObject({
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
  }),
  dataTypes: z
    .array(z.enum(['original', 'downscaled', 'observation']))
    .min(1)
    .max(3),
  format: z.enum(['csv', 'geojson', 'netcdf']).default('csv'),
  temporalResolution: z.enum(['hourly', 'daily']).default('hourly'),
})

/** Pure public from-task seam: saved metadata is validated, never an id-only lookup. */
export function createExportPlan(input: unknown, task: DownscalingTask): ExportPlanReply {
  const record = validateTaskRecord(task)
  if (!record.ok) return { ok: false, code: record.code, message: record.error }
  task = record.task
  const parsed = requestSchema.safeParse(input)
  if (!parsed.success)
    return {
      ok: false,
      code: 'INVALID_REQUEST',
      message: 'Provide a valid task, WGS84 bbox, ISO time range, format and data types.',
    }
  const request: ExportRequest = {
    ...parsed.data,
    task,
    dataTypes: dataTypes.filter((type) => parsed.data.dataTypes.includes(type)),
    timeRange: {
      start: new Date(parsed.data.timeRange.start).toISOString(),
      end: new Date(parsed.data.timeRange.end).toISOString(),
    },
  }
  if (request.taskId !== task.id)
    return {
      ok: false,
      code: 'TASK_ID_MISMATCH',
      message: 'taskId must match the complete saved task.',
    }
  if (task.status !== 'Completed')
    return {
      ok: false,
      code: task.status.toUpperCase(),
      message: task.failureReason ?? 'Task is still running.',
    }
  const availability = resultAvailability(task)
  if (availability) return { ok: false, code: availability.code, message: availability.error }
  const width = calculateBboxWidthKm(request.bbox)
  const height = calculateBboxHeightKm(request.bbox)
  if (width > 100 + 1e-9 || height > 100 + 1e-9)
    return {
      ok: false,
      code: 'BBOX_TOO_LARGE',
      message: `Export ${width > 100 + 1e-9 ? 'width' : 'height'} exceeds 100km; shrink the area.`,
    }
  if (!isBboxWithinBounds(request.bbox, task.configuration.region))
    return {
      ok: false,
      code: 'OUTSIDE_COVERAGE',
      message: 'The export bbox must be entirely inside the task; it is not clipped.',
    }
  const start = Date.parse(request.timeRange.start)
  const end = Date.parse(request.timeRange.end)
  const step = request.temporalResolution === 'daily' ? DAY : HOUR
  if (end <= start || start % step !== 0 || end % step !== 0)
    return {
      ok: false,
      code: 'INVALID_TIME_RANGE',
      message:
        'Select whole UTC-aligned hourly/daily half-open intervals [start,end); no snapping is applied.',
    }
  if (end - start > 30 * DAY)
    return {
      ok: false,
      code: 'TIME_RANGE_TOO_LARGE',
      message: 'Export duration exceeds 720 hours; shorten the time range.',
    }
  const coverage = task.configuration.timeRange
  const coverageEnd =
    Date.parse(coverage.end) +
    (/^\d{4}-\d{2}-\d{2}$/.test(coverage.end) && coverage.mode === 'historical' ? DAY : 0)
  if (start < Date.parse(coverage.start) || end > coverageEnd)
    return {
      ok: false,
      code: 'OUTSIDE_COVERAGE',
      message: 'The entire export interval must be inside task coverage; it is not clipped.',
    }
  if (
    request.temporalResolution === 'daily' &&
    !['temperature', 'precipitation'].includes(task.configuration.variable)
  )
    return {
      ok: false,
      code: 'UNAVAILABLE_QUERY',
      message: 'Daily export supports temperature and precipitation only.',
    }
  if (
    request.dataTypes.includes('observation') &&
    observationReference(task).referenceVersion !== OBSERVATION_REFERENCE.referenceVersion
  )
    return {
      ok: false,
      code: 'INCOMPATIBLE_REFERENCE',
      message: 'The saved observation reference version is unavailable; it will not be replaced.',
    }
  const timeCount = (end - start) / step
  const layouts = request.dataTypes.map((dataType) =>
    dataType === 'observation'
      ? { dataType, layout: stationWindowLayout(request.bbox) }
      : { dataType, layout: gridWindowLayout(task, dataType, request.bbox) },
  )
  const recordCount = layouts.reduce((count, item) => count + item.layout.count * timeCount, 0)
  if (!Number.isSafeInteger(recordCount) || recordCount > EXPORT_MAX_RECORDS)
    return {
      ok: false,
      code: 'EXPORT_LIMIT_EXCEEDED',
      message:
        'Export exceeds 100,000 location/time records; shrink the area or time range before reading data.',
    }
  const notes = layouts
    .filter(({ layout }) => layout.count === 0)
    .map(({ dataType }) => `No native ${dataType} locations in the selected bbox (0 records).`)
  if (!recordCount)
    return {
      ok: false,
      code: 'NO_EXPORT_DATA',
      message:
        'No selected native grid locations or reference stations; enlarge the bbox or change data types.',
    }
  const layers: ExportLayer[] = layouts.map((item) => {
    if (item.dataType === 'observation') {
      const layout = stationWindowLayout(request.bbox)
      return {
        dataType: item.dataType,
        pointCount: layout.count,
        resolutionKm: null,
        stations: Array.from({ length: layout.rows }, (_, row) =>
          Array.from({ length: layout.columns }, (_, column) =>
            stationAt(layout.firstColumn + column - 180, layout.firstRow + row - 89),
          ),
        ).flat(),
      }
    }
    const layout = gridWindowLayout(task, item.dataType, request.bbox)
    return {
      dataType: item.dataType,
      pointCount: layout.count,
      resolutionKm:
        item.dataType === 'original' ? 10 : Number.parseInt(task.configuration.resolution),
      axes: {
        longitudes: Array.from({ length: layout.columns }, (_, index) =>
          layout.longitude(layout.x.first + index),
        ),
        latitudes: Array.from({ length: layout.rows }, (_, index) =>
          layout.latitude(layout.y.first + index),
        ),
      },
    }
  })
  return {
    ok: true,
    task,
    request,
    layers,
    recordCount,
    notes,
    timeInstants: Array.from({ length: timeCount }, (_, index) =>
      new Date(start + index * step).toISOString(),
    ),
    identity: JSON.stringify(request),
  }
}

export type { ExportFailure }

/** Installed estimate/generate dispatch share this actual-request ownership boundary. */
export function authenticateExportPlan(input: unknown): ExportPlanReply {
  requireDemoAccount()
  const envelope = z.object({ task: z.unknown() }).safeParse(input)
  if (!envelope.success || envelope.data.task === undefined)
    return {
      ok: false,
      code: 'INVALID_REQUEST',
      message: 'The complete saved task is required, not an id-only lookup.',
    }
  const read = readDownscalingTask(envelope.data.task)
  if (!read.ok) return { ok: false, code: read.code, message: read.error }
  return createExportPlan(input, read.task)
}

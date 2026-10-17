import '@tanstack/react-start/server-only'
import { z } from 'zod'
import { queryDownscalingTaskResult } from './downscaling-tasks.server'

const coordinateSchema = z.strictObject({
  latitude: z.number().min(-90).max(90).finite(),
  longitude: z.number().min(-180).max(180).finite(),
})

const timeSeriesRequestSchema = z.strictObject({
  task: z.unknown(),
  coordinate: coordinateSchema,
})

export interface TimeSeriesDataPoint {
  time: string
  value: number | null
}

export interface TimeSeriesResponse {
  ok: true
  coordinate: { latitude: number; longitude: number }
  timeRange: { start: string; end: string }
  granularity: 'hourly' | 'daily'
  timezone: string
  unit: string
  semantics: 'instantaneous' | 'daily-mean' | 'daily-minimum'
  original: TimeSeriesDataPoint[]
  downscaled: TimeSeriesDataPoint[]
}

export interface TimeSeriesError {
  ok: false
  code: string
  error: string
}

export type TimeSeriesResult = TimeSeriesResponse | TimeSeriesError

/**
 * Fetches time series data for a specific coordinate from a completed task.
 * Returns both original and downscaled data using the same sampling rules.
 */
export function getTimeSeriesData(input: unknown): TimeSeriesResult {
  // Validate input
  const parsed = timeSeriesRequestSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: '坐标必须是有效的经纬度数值',
    }
  }

  const { task, coordinate } = parsed.data

  // Extract task configuration to determine time range and granularity
  const taskObj = task as any
  if (!taskObj?.configuration?.timeRange || !taskObj?.configuration?.region) {
    return {
      ok: false,
      code: 'INVALID_TASK',
      error: '任务配置不完整',
    }
  }

  const { timeRange, region, variable } = taskObj.configuration

  // Check if coordinate is within task region
  if (
    coordinate.latitude < region.south ||
    coordinate.latitude > region.north ||
    coordinate.longitude < region.west ||
    coordinate.longitude > region.east
  ) {
    return {
      ok: false,
      code: 'OUTSIDE_REGION',
      error: '坐标超出任务范围',
    }
  }

  // Determine granularity based on time range mode
  const granularity = timeRange.mode === 'historical' ? 'daily' : 'hourly'
  const temporalResolution = granularity

  // Query original data
  const originalResult = queryDownscalingTaskResult({
    task,
    query: {
      kind: 'time-series',
      layer: 'original',
      point: coordinate,
      timeRange: { start: timeRange.start, end: timeRange.end },
      temporalResolution,
    },
  })

  if (!originalResult.ok) {
    return originalResult
  }

  // Query downscaled data
  const downscaledResult = queryDownscalingTaskResult({
    task,
    query: {
      kind: 'time-series',
      layer: 'downscaled',
      point: coordinate,
      timeRange: { start: timeRange.start, end: timeRange.end },
      temporalResolution,
    },
  })

  if (!downscaledResult.ok) {
    return downscaledResult
  }

  // Extract values from result
  const originalPoints = extractTimeSeriesPoints(originalResult)
  const downscaledPoints = extractTimeSeriesPoints(downscaledResult)

  // Determine unit and semantics based on variable and granularity
  const { unit, semantics } = getVariableMetadata(variable, granularity)

  return {
    ok: true,
    coordinate,
    timeRange: { start: timeRange.start, end: timeRange.end },
    granularity,
    timezone: 'UTC',
    unit,
    semantics,
    original: originalPoints,
    downscaled: downscaledPoints,
  }
}

function extractTimeSeriesPoints(result: any): TimeSeriesDataPoint[] {
  if (!result.values || !Array.isArray(result.values)) {
    return []
  }

  return result.values.map((item: any) => ({
    time: item.time,
    value: item.value,
  }))
}

function getVariableMetadata(
  variable: string,
  granularity: 'hourly' | 'daily',
): { unit: string; semantics: 'instantaneous' | 'daily-mean' | 'daily-minimum' } {
  switch (variable) {
    case 'temperature':
      return {
        unit: '°C',
        semantics: granularity === 'daily' ? 'daily-mean' : 'instantaneous',
      }
    case 'wind':
      return {
        unit: 'm/s',
        semantics: 'instantaneous',
      }
    case 'pressure':
      return {
        unit: 'hPa',
        semantics: 'instantaneous',
      }
    case 'precipitation':
      return {
        unit: 'mm',
        semantics: granularity === 'daily' ? 'daily-mean' : 'instantaneous',
      }
    default:
      return {
        unit: '',
        semantics: 'instantaneous',
      }
  }
}

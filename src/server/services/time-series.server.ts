import '@tanstack/react-start/server-only'
import { z } from 'zod'
import { queryDownscalingTaskResult } from './downscaling-tasks.server'
import { findNearbyStation } from './station-matching.server'
import type { StationMetadata } from '@/server/types/station-types'
import {
  groupEnsembleSamplesByTime,
  calculateQuantileTimeSeries,
  type QuantileTimeSeriesPoint,
} from '@/features/result-analysis/service/ensemble-quantiles'

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

export interface EnsembleQuantileData {
  quantiles: QuantileTimeSeriesPoint[]
  /** Total number of members in the ensemble */
  totalMembers: number
  /** Indicates this is a probabilistic task with ensemble data */
  isProbabilistic: boolean
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
  observation?: TimeSeriesDataPoint[]
  stationInfo?: StationMetadata
  /** Ensemble quantile bands (P10/P50/P90) for probabilistic tasks */
  ensemble?: EnsembleQuantileData
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

  // Try to find nearby station for observation reference
  const stationInfo = findNearbyStation(coordinate, 25)

  // Query observation data if station found
  let observationPoints: TimeSeriesDataPoint[] | undefined
  if (stationInfo) {
    const observationResult = queryDownscalingTaskResult({
      task,
      query: {
        kind: 'time-series',
        layer: 'observation',
        point: stationInfo.coordinate,
        timeRange: { start: timeRange.start, end: timeRange.end },
        temporalResolution,
      },
    })

    if (observationResult.ok) {
      observationPoints = extractTimeSeriesPoints(observationResult)
    }
  }

  // Query ensemble member data for probabilistic tasks
  let ensembleData: EnsembleQuantileData | undefined
  if (taskObj.configuration.resolvedMethod === 'probabilistic') {
    const ensembleResult = queryDownscalingTaskResult({
      task,
      query: {
        kind: 'time-series',
        layer: 'downscaled',
        ensemble: { kind: 'members' },
        point: coordinate,
        timeRange: { start: timeRange.start, end: timeRange.end },
        temporalResolution,
      },
    })

    if (ensembleResult.ok && ensembleResult.ensemble) {
      const { ensemble, values } = ensembleResult as any

      // Extract all member samples with their values
      const memberSamples = (values || [])
        .filter((v: any) => v.memberId && typeof v.value === 'number')
        .map((v: any) => ({
          time: v.time,
          memberId: v.memberId,
          value: v.value,
        }))

      // Get list of times from downscaled points
      const times = downscaledPoints.map((p) => p.time)

      // Group samples by time
      const groupedData = groupEnsembleSamplesByTime(
        memberSamples,
        times,
        ensemble.allMemberIds || [],
      )

      // Calculate quantiles for each time point
      const quantiles = calculateQuantileTimeSeries(groupedData)

      ensembleData = {
        quantiles,
        totalMembers: ensemble.allMemberIds?.length || 0,
        isProbabilistic: true,
      }
    }
  }

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
    observation: observationPoints,
    stationInfo: stationInfo || undefined,
    ensemble: ensembleData,
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

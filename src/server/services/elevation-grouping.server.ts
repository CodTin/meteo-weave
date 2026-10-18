import '@tanstack/react-start/server-only'
import {
  groupStationsByElevation,
  calculateGroupMetrics,
  type StationSample,
  type GroupMetrics,
} from '@/features/result-analysis/service/elevation-grouping'
import {
  queryAndAlignSamples,
  initializeAndValidateTask,
  wrapValidationFailure,
  wrapSampleQueryFailure,
} from '@/server/services/shared/assessment-service-helpers'
import { getVariableUnit } from '@/features/result-analysis/service/variable-accuracy'

export interface ElevationGroupingData {
  available: true
  groups: {
    plains: GroupMetrics
    hills: GroupMetrics
    mountains: GroupMetrics
  }
  overall: {
    rmse: { original: number; downscaled: number; improvement: number | null }
    mae: { original: number; downscaled: number; improvement: number | null }
    sampleCount: number
    stationCount: number
  }
  metadata: {
    elevationRule: string
    elevationRuleVersion: string
    unit: string
    thresholds: {
      plains: string
      hills: string
      mountains: string
    }
    timeCoverage: { start: string; end: string }
    demoNotice: string
  }
}

export type ElevationGroupingResponse =
  | {
      ok: true
      data: ElevationGroupingData
    }
  | {
      ok: true
      data: {
        available: false
        reason: string
      }
    }

/**
 * Fetches elevation-grouped accuracy assessment data for a task.
 * Groups stations by synthetic elevation and calculates metrics for each group.
 */
export async function getElevationGroupingData(taskId: string): Promise<ElevationGroupingResponse> {
  // Initialize service and validate task
  const taskValidation = await initializeAndValidateTask(taskId)
  const validationFailure = wrapValidationFailure(taskValidation)
  if (validationFailure) return validationFailure

  if (!taskValidation.ok) throw new Error('Unreachable')
  const { task, service } = taskValidation

  try {
    // Get time range for queries
    const { start, end } = task.configuration.timeRange
    const times = [start] // Query first time only to stay within budget

    // Query and align samples
    const sampleResult = await queryAndAlignSamples(
      service,
      {
        taskId,
        region: task.configuration.region,
        times,
        maxPoints: 50,
      },
      task.configuration.variable,
      '没有共同有效样本用于高程分组分析',
    )

    const sampleFailure = wrapSampleQueryFailure(sampleResult)
    if (sampleFailure) return sampleFailure

    if (!sampleResult.ok) throw new Error('Unreachable')
    const { samples: alignedSamples } = sampleResult

    // Query station metadata to get coordinates
    // For now, we'll use the observation layer which should have station info
    const observationResult = await service.result(taskId, {
      layer: 'observation',
      observationMode: 'stations',
      kind: 'preview',
      window: task.configuration.region,
      times,
      maxPoints: 50,
    })

    if (!observationResult.ok) {
      return {
        ok: true,
        data: {
          available: false,
          reason: '无法获取台站坐标信息',
        },
      }
    }

    // Extract station coordinates from observation data
    const stationCoords = new Map<string, { latitude: number; longitude: number }>()

    for (const value of observationResult.values) {
      if (value.observation && value.observation.mode === 'stations') {
        const station = value.observation.station
        stationCoords.set(station.id, {
          latitude: station.latitude,
          longitude: station.longitude,
        })
      }
    }

    // Create StationSample array with coordinates
    const stationSamples: StationSample[] = alignedSamples
      .map((sample) => {
        const coords = stationCoords.get(sample.stationId)
        if (!coords) return null

        return {
          stationId: sample.stationId,
          latitude: coords.latitude,
          longitude: coords.longitude,
          time: sample.time,
          observed: sample.observed,
          original: sample.original,
          downscaled: sample.downscaled,
        }
      })
      .filter((s): s is StationSample => s !== null)

    if (stationSamples.length === 0) {
      return {
        ok: true,
        data: {
          available: false,
          reason: '无法匹配台站坐标，无法进行高程分组',
        },
      }
    }

    // Group stations by elevation
    const grouped = groupStationsByElevation(stationSamples)

    // Calculate metrics for each group
    const plainsMetrics = calculateGroupMetrics(grouped.plains, 'plains')
    const hillsMetrics = calculateGroupMetrics(grouped.hills, 'hills')
    const mountainsMetrics = calculateGroupMetrics(grouped.mountains, 'mountains')

    // Calculate overall metrics (for cross-reference with accuracy tab)
    const overallMetrics = calculateGroupMetrics(stationSamples, 'plains') // Use any group label, it's just for calculation

    // Calculate overall station count
    const allStations = new Set(stationSamples.map((s) => s.stationId))

    return {
      ok: true,
      data: {
        available: true,
        groups: {
          plains: plainsMetrics,
          hills: hillsMetrics,
          mountains: mountainsMetrics,
        },
        overall: {
          rmse: {
            original: overallMetrics.original.rmse,
            downscaled: overallMetrics.downscaled.rmse,
            improvement:
              overallMetrics.improvement.rmse !== undefined
                ? overallMetrics.improvement.rmse
                : null,
          },
          mae: {
            original: overallMetrics.original.mae,
            downscaled: overallMetrics.downscaled.mae,
            improvement:
              overallMetrics.improvement.mae !== undefined ? overallMetrics.improvement.mae : null,
          },
          sampleCount: overallMetrics.sampleCount,
          stationCount: allStations.size,
        },
        metadata: {
          elevationRule: 'synthetic-demo-v1',
          elevationRuleVersion: '1.0.0',
          unit: getVariableUnit(task.configuration.variable),
          thresholds: {
            plains: 'h < 200m',
            hills: '200m ≤ h ≤ 500m',
            mountains: 'h > 500m',
          },
          timeCoverage: { start, end },
          demoNotice:
            '合成高程分组：基于台站坐标的演示性规则生成，不代表真实地形分类。200m与500m阈值仅用于功能演示，非通用地貌分类标准。',
        },
      },
    }
  } catch (error) {
    return {
      ok: true,
      data: {
        available: false,
        reason: `高程分组分析失败: ${error instanceof Error ? error.message : '未知错误'}`,
      },
    }
  }
}

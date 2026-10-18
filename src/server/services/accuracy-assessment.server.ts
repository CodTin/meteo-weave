import '@tanstack/react-start/server-only'
import { calculateAccuracyMetrics } from '@/features/result-analysis/service/accuracy-metrics'
import { getVariableUnit } from '@/features/result-analysis/service/variable-accuracy'
import {
  queryAndAlignSamples,
  initializeAndValidateTask,
  wrapValidationFailure,
  wrapSampleQueryFailure,
} from '@/server/services/shared/assessment-service-helpers'

/**
 * Station metadata for terrain grouping and reproducibility
 */
export type StationMetadata = {
  stationId: string
  location: { lon: number; lat: number }
  elevation?: number
}

type AccuracyData =
  | {
      available: true
      metrics: {
        original: { rmse: number; mae: number; r2: number }
        downscaled: { rmse: number; mae: number; r2: number }
      }
      samples: {
        n: number
        stationCount: number
        timeCoverage: { start: string; end: string; actualTimes: number }
      }
      stations: StationMetadata[]
      sampling: {
        budget: { maxPoints: number; maxTimes: number }
        actual: { points: number; times: number }
        plan: string
      }
      method: {
        matching: string
        unit: string
        dataSource: 'Synthetic Demo'
      }
    }
  | {
      available: false
      reason: string
    }

type AccuracyResponse = {
  ok: true
  data: AccuracyData
}

/**
 * Determines sampling plan based on task time range and budget
 */
function determineSamplingPlan(
  startTime: string,
  endTime: string,
  maxTimes: number,
): { times: string[]; plan: string } {
  const start = new Date(startTime)
  const end = new Date(endTime)
  const totalHours = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60))

  // Budget-aware sampling: distribute time samples evenly within budget
  if (totalHours <= maxTimes) {
    // Query all hours within budget
    const times: string[] = []
    for (let h = 0; h <= totalHours; h++) {
      const time = new Date(start.getTime() + h * 60 * 60 * 1000)
      times.push(time.toISOString())
    }
    return {
      times,
      plan: `完整时间覆盖：${times.length} 个时刻`,
    }
  } else {
    // Sample evenly across the range
    const times: string[] = []
    const interval = Math.floor(totalHours / (maxTimes - 1))
    for (let i = 0; i < maxTimes; i++) {
      const hours = i === maxTimes - 1 ? totalHours : i * interval
      const time = new Date(start.getTime() + hours * 60 * 60 * 1000)
      times.push(time.toISOString())
    }
    return {
      times,
      plan: `预算内均匀采样：${times.length} 个时刻（总时长 ${totalHours + 1} 小时，间隔 ${interval} 小时）`,
    }
  }
}

/**
 * Extracts unique station metadata from aligned samples
 */
function extractStationMetadata(
  samples: Array<{
    stationId: string
    time: string
    location?: { lon: number; lat: number }
    elevation?: number
  }>,
): StationMetadata[] {
  const stationMap = new Map<string, StationMetadata>()

  for (const sample of samples) {
    if (!stationMap.has(sample.stationId) && sample.location) {
      stationMap.set(sample.stationId, {
        stationId: sample.stationId,
        location: sample.location,
        elevation: sample.elevation,
      })
    }
  }

  return Array.from(stationMap.values())
}

export async function getAccuracyAssessmentData(taskId: string): Promise<AccuracyResponse> {
  // Initialize service and validate task
  const taskValidation = await initializeAndValidateTask(taskId)
  const validationFailure = wrapValidationFailure(taskValidation)
  if (validationFailure) return validationFailure

  if (!taskValidation.ok) throw new Error('Unreachable')
  const { task, service } = taskValidation

  try {
    // Get time range and determine sampling plan
    const { start, end } = task.configuration.timeRange
    const maxTimes = 10 // Budget: maximum time samples to query
    const maxPoints = 50 // Budget: maximum spatial points per time

    const { times, plan } = determineSamplingPlan(start, end, maxTimes)

    // Query and align samples across actual time coverage
    const sampleResult = await queryAndAlignSamples(
      service,
      {
        taskId,
        region: task.configuration.region,
        times,
        maxPoints,
      },
      task.configuration.variable,
      '没有共同有效样本用于精度评估',
    )

    const sampleFailure = wrapSampleQueryFailure(sampleResult)
    if (sampleFailure) return sampleFailure

    if (!sampleResult.ok) throw new Error('Unreachable')
    const { samples: alignedSamples, timeCoverage } = sampleResult

    // Extract station metadata for terrain grouping
    const stations = extractStationMetadata(alignedSamples)
    const uniqueStations = new Set(alignedSamples.map((s) => s.stationId))

    // Calculate metrics for original vs observed
    const originalMetrics = calculateAccuracyMetrics(
      alignedSamples.map((s) => s.observed),
      alignedSamples.map((s) => s.original),
    )

    // Calculate metrics for downscaled vs observed
    const downscaledMetrics = calculateAccuracyMetrics(
      alignedSamples.map((s) => s.observed),
      alignedSamples.map((s) => s.downscaled),
    )

    if (!originalMetrics.available || !downscaledMetrics.available) {
      return {
        ok: true,
        data: {
          available: false,
          reason: '无法计算精度指标',
        },
      }
    }

    return {
      ok: true,
      data: {
        available: true,
        metrics: {
          original: originalMetrics.metrics,
          downscaled: downscaledMetrics.metrics,
        },
        samples: {
          n: alignedSamples.length,
          stationCount: uniqueStations.size,
          timeCoverage: {
            start: timeCoverage.start,
            end: timeCoverage.end,
            actualTimes: times.length,
          },
        },
        stations,
        sampling: {
          budget: { maxPoints, maxTimes },
          actual: { points: uniqueStations.size, times: times.length },
          plan,
        },
        method: {
          matching: '台站坐标 25km 内取样',
          unit: getVariableUnit(task.configuration.variable),
          dataSource: 'Synthetic Demo',
        },
      },
    }
  } catch (error) {
    return {
      ok: true,
      data: {
        available: false,
        reason: `评估失败: ${error instanceof Error ? error.message : '未知错误'}`,
      },
    }
  }
}

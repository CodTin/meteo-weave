import '@tanstack/react-start/server-only'
import { calculateAccuracyMetrics } from '@/features/result-analysis/service/accuracy-metrics'
import { getVariableUnit } from '@/features/result-analysis/service/variable-accuracy'
import {
  queryAndAlignSamples,
  initializeAndValidateTask,
} from '@/server/services/shared/assessment-service-helpers'

type AccuracyData =
  | {
      available: true
      metrics: {
        original: { rmse: number; mae: number; r2: number }
        downscaled: { rmse: number; mae: number; r2: number }
      }
      samples: {
        n: number
        timeCoverage: { start: string; end: string }
      }
      method: {
        matching: string
        unit: string
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

export async function getAccuracyAssessmentData(taskId: string): Promise<AccuracyResponse> {
  // Initialize service and validate task
  const taskValidation = await initializeAndValidateTask(taskId)
  if (!taskValidation.ok) {
    return {
      ok: true,
      data: {
        available: false,
        reason: taskValidation.reason,
      },
    }
  }

  const { task, service } = taskValidation

  try {
    // Get time range for queries
    const { start, end } = task.configuration.timeRange
    const times = [start] // For now, query first time only to stay within budget

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
      '没有共同有效样本用于精度评估',
    )

    if (!sampleResult.ok) {
      return {
        ok: true,
        data: {
          available: false,
          reason: sampleResult.reason,
        },
      }
    }

    const { samples: alignedSamples } = sampleResult

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
          timeCoverage: { start, end },
        },
        method: {
          matching: 'station-within-25km',
          unit: getVariableUnit(task.configuration.variable),
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

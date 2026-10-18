import '@tanstack/react-start/server-only'
import { calculateAccuracyMetrics } from '@/features/result-analysis/service/accuracy-metrics'
import { getVariableUnit } from '@/features/result-analysis/service/variable-accuracy'
import {
  initializeAndValidateTask,
  wrapValidationFailure,
  wrapSampleQueryFailure,
  extractStationMetadata,
  buildAssessmentSamplingInfo,
  wrapAssessmentError,
  prepareAssessmentSamples,
  type StationMetadata,
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

export async function getAccuracyAssessmentData(taskId: string): Promise<AccuracyResponse> {
  // Initialize service and validate task
  const taskValidation = await initializeAndValidateTask(taskId)
  const validationFailure = wrapValidationFailure(taskValidation)
  if (validationFailure) return validationFailure

  if (!taskValidation.ok) throw new Error('Unreachable')
  const { task, service } = taskValidation

  try {
    // Get time range and determine sampling plan
    const { sampleResult, times, plan, maxTimes, maxPoints } = await prepareAssessmentSamples(
      task,
      service,
      taskId,
      '没有共同有效样本用于精度评估',
    )

    const sampleFailure = wrapSampleQueryFailure(sampleResult)
    if (sampleFailure) return sampleFailure

    if (!sampleResult.ok) throw new Error('Unreachable')
    const { samples: alignedSamples, timeCoverage } = sampleResult

    // Extract station metadata for terrain grouping
    const stations = extractStationMetadata(alignedSamples)
    const samplingInfo = buildAssessmentSamplingInfo(
      alignedSamples,
      timeCoverage,
      times,
      maxPoints,
      maxTimes,
      plan,
    )

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
          ...samplingInfo,
        },
        stations,
        sampling: samplingInfo.sampling,
        method: {
          matching: '台站坐标 25km 内取样',
          unit: getVariableUnit(task.configuration.variable),
          dataSource: 'Synthetic Demo',
        },
      },
    }
  } catch (error) {
    return wrapAssessmentError(error, '精度')
  }
}

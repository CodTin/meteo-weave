import '@tanstack/react-start/server-only'
import { createTaskService } from '@/features/downscaling-tasks/service'
import { QueryClient } from '@tanstack/react-query'
import { alignAccuracySamples } from '@/features/result-analysis/service/accuracy-samples'
import {
  assessEvents,
  type EventAssessmentDefinition,
  type EventAssessmentResult,
} from '@/features/result-analysis/service/event-metrics'
import {
  extractWindSpeed,
  validateAccumulationCoverage,
} from '@/features/result-analysis/service/variable-accuracy'
import type {
  ResultValue,
  WindValue,
  Accumulation,
} from '@/features/downscaling-tasks/service/contracts'

type EventAssessmentData =
  | {
      available: true
      original: EventAssessmentResult & { available: true }
      downscaled: EventAssessmentResult & { available: true }
      samples: {
        n: number
        timeCoverage: { start: string; end: string }
      }
      definition: EventAssessmentDefinition
    }
  | {
      available: false
      reason: string
    }

type EventAssessmentResponse = {
  ok: true
  data: EventAssessmentData
}

/**
 * Extracts the comparable value from a result value based on the variable type.
 * Same logic as accuracy assessment to ensure consistency.
 */
function extractComparableValue(resultValue: ResultValue, variable: string): number {
  if (variable === 'wind') {
    const windValue = resultValue as WindValue
    return extractWindSpeed(windValue)
  }

  if (variable === 'precipitation') {
    const precipValue = resultValue as ResultValue & { accumulation?: Accumulation }
    if (precipValue.accumulation) {
      const validation = validateAccumulationCoverage(precipValue.accumulation)
      if (!validation.valid) {
        return NaN
      }
    }
    return resultValue.value
  }

  return resultValue.value
}

/**
 * Creates a demonstration event threshold definition for the given variable.
 * These are example thresholds for evaluation demonstration, not validated warning standards.
 */
function createDemoThreshold(variable: string): EventAssessmentDefinition | null {
  switch (variable) {
    case 'temperature':
      return {
        threshold: {
          value: 35,
          direction: 'greater',
          inclusive: true,
          unit: '°C',
          variable: 'temperature',
        },
      }
    case 'precipitation':
      return {
        threshold: {
          value: 50,
          direction: 'greater',
          inclusive: false,
          unit: 'mm',
          variable: 'precipitation',
        },
        accumulation: {
          interval: '24h',
          description: '24小时累计降水',
        },
      }
    case 'wind':
      return {
        threshold: {
          value: 10.8,
          direction: 'greater',
          inclusive: true,
          unit: 'm/s',
          variable: 'wind',
        },
      }
    case 'pressure':
      return {
        threshold: {
          value: 1000,
          direction: 'less',
          inclusive: true,
          unit: 'hPa',
          variable: 'pressure',
        },
      }
    default:
      return null
  }
}

export async function getEventAssessmentData(taskId: string): Promise<EventAssessmentResponse> {
  const queryClient = new QueryClient()
  const service = createTaskService({ queryClient })
  await service.initialize()

  // Get task
  const taskResult = await service.get(taskId)
  if (!taskResult.ok) {
    return {
      ok: true,
      data: {
        available: false,
        reason: '任务不存在或无法访问',
      },
    }
  }

  const task = taskResult.task

  // Check if task is completed
  if (task.status !== 'Completed') {
    return {
      ok: true,
      data: {
        available: false,
        reason: `任务尚未完成（当前状态：${task.status === 'Running' ? '运行中' : '失败'}）`,
      },
    }
  }

  // Get demo threshold for this variable
  const definition = createDemoThreshold(task.configuration.variable)
  if (!definition) {
    return {
      ok: true,
      data: {
        available: false,
        reason: '该变量暂无事件阈值定义',
      },
    }
  }

  try {
    // Get time range for queries
    const { start, end } = task.configuration.timeRange
    const times = [start] // For now, query first time only to stay within budget

    // Query original data at observation stations
    const originalResult = await service.result(taskId, {
      layer: 'original',
      kind: 'preview',
      window: task.configuration.region,
      times,
      maxPoints: 50,
    })

    if (!originalResult.ok) {
      return {
        ok: true,
        data: {
          available: false,
          reason: '无法获取原始数据',
        },
      }
    }

    // Query downscaled data at same points
    const downscaledResult = await service.result(taskId, {
      layer: 'downscaled',
      kind: 'preview',
      window: task.configuration.region,
      times,
      maxPoints: 50,
    })

    if (!downscaledResult.ok) {
      return {
        ok: true,
        data: {
          available: false,
          reason: '无法获取降尺度数据',
        },
      }
    }

    // Query observation data at stations
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
          reason: '无法获取观测数据',
        },
      }
    }

    // Extract station-based samples with variable-specific value extraction
    const getStationId = (obs: NonNullable<ResultValue['observation']>): string => {
      return obs.mode === 'stations' ? obs.station.id : 'interpolated'
    }

    const variable = task.configuration.variable

    const originalSamples = originalResult.values
      .filter((v): v is ResultValue & { observation: NonNullable<ResultValue['observation']> } =>
        Boolean(v.observation),
      )
      .map((v) => ({
        stationId: getStationId(v.observation!),
        time: v.time,
        value: extractComparableValue(v, variable),
      }))
      .filter((s) => Number.isFinite(s.value))

    const downscaledSamples = downscaledResult.values
      .filter((v): v is ResultValue & { observation: NonNullable<ResultValue['observation']> } =>
        Boolean(v.observation),
      )
      .map((v) => ({
        stationId: getStationId(v.observation!),
        time: v.time,
        value: extractComparableValue(v, variable),
      }))
      .filter((s) => Number.isFinite(s.value))

    const observationSamples = observationResult.values
      .map((v) => ({
        stationId:
          v.observation && v.observation.mode === 'stations' ? v.observation.station.id : 'unknown',
        time: v.time,
        value: extractComparableValue(v, variable),
      }))
      .filter((s) => Number.isFinite(s.value))

    // Align samples
    const aligned = alignAccuracySamples(originalSamples, downscaledSamples, observationSamples)

    if (aligned.samples.length === 0) {
      return {
        ok: true,
        data: {
          available: false,
          reason: '没有共同有效样本用于事件评估',
        },
      }
    }

    // Assess events for original vs observed
    const originalAssessment = assessEvents(
      aligned.samples.map((s) => s.observed),
      aligned.samples.map((s) => s.original),
      definition,
    )

    // Assess events for downscaled vs observed
    const downscaledAssessment = assessEvents(
      aligned.samples.map((s) => s.observed),
      aligned.samples.map((s) => s.downscaled),
      definition,
    )

    // Both assessments must be available for comparison
    if (!originalAssessment.available || !downscaledAssessment.available) {
      const reason = !originalAssessment.available
        ? originalAssessment.reason
        : !downscaledAssessment.available
          ? downscaledAssessment.reason
          : '评估失败'
      return {
        ok: true,
        data: {
          available: false,
          reason,
        },
      }
    }

    return {
      ok: true,
      data: {
        available: true,
        original: originalAssessment,
        downscaled: downscaledAssessment,
        samples: {
          n: aligned.samples.length,
          timeCoverage: { start, end },
        },
        definition,
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

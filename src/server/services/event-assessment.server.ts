import '@tanstack/react-start/server-only'
import {
  assessEvents,
  type EventAssessmentDefinition,
  type EventAssessmentResult,
} from '@/features/result-analysis/service/event-metrics'
import {
  queryAndAlignSamples,
  withTaskValidation,
} from '@/server/services/shared/assessment-service-helpers'

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
  return withTaskValidation(taskId, async (task, service) => {
    // Get demo threshold for this variable
    const definition = createDemoThreshold(task.configuration.variable)
    if (!definition) {
      return {
        available: false,
        reason: '该变量暂无事件阈值定义',
      }
    }

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
        '没有共同有效样本用于事件评估',
      )

      if (!sampleResult.ok) {
        return {
          available: false,
          reason: sampleResult.reason,
        }
      }

      const { samples: alignedSamples } = sampleResult

      // Assess events for original vs observed
      const originalAssessment = assessEvents(
        alignedSamples.map((s) => s.observed),
        alignedSamples.map((s) => s.original),
        definition,
      )

      // Assess events for downscaled vs observed
      const downscaledAssessment = assessEvents(
        alignedSamples.map((s) => s.observed),
        alignedSamples.map((s) => s.downscaled),
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
          available: false,
          reason,
        }
      }

      return {
        available: true,
        original: originalAssessment,
        downscaled: downscaledAssessment,
        samples: {
          n: alignedSamples.length,
          timeCoverage: { start, end },
        },
        definition,
      }
    } catch (error) {
      return {
        available: false,
        reason: `评估失败: ${error instanceof Error ? error.message : '未知错误'}`,
      }
    }
  })
}

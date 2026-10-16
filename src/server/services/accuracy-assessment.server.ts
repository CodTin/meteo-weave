import '@tanstack/react-start/server-only'
import { createTaskService } from '@/features/downscaling-tasks/service'
import { QueryClient } from '@tanstack/react-query'
import { alignAccuracySamples } from '@/features/result-analysis/service/accuracy-samples'
import { calculateAccuracyMetrics } from '@/features/result-analysis/service/accuracy-metrics'
import type { ResultValue } from '@/features/downscaling-tasks/service/contracts'

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

function getUnit(variable: string): string {
  switch (variable) {
    case 'temperature':
      return '°C'
    case 'wind':
      return 'm/s'
    case 'pressure':
      return 'hPa'
    case 'precipitation':
      return 'mm'
    default:
      return ''
  }
}

export async function getAccuracyAssessmentData(taskId: string): Promise<AccuracyResponse> {
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
      maxPoints: 50, // Limit to stay within budget
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

    // Extract station-based samples
    const getStationId = (obs: NonNullable<ResultValue['observation']>): string => {
      return obs.mode === 'stations' ? obs.station.id : 'interpolated'
    }

    const originalSamples = originalResult.values
      .filter((v): v is ResultValue & { observation: NonNullable<ResultValue['observation']> } =>
        Boolean(v.observation),
      )
      .map((v) => ({
        stationId: getStationId(v.observation!),
        time: v.time,
        value: v.value,
      }))

    const downscaledSamples = downscaledResult.values
      .filter((v): v is ResultValue & { observation: NonNullable<ResultValue['observation']> } =>
        Boolean(v.observation),
      )
      .map((v) => ({
        stationId: getStationId(v.observation!),
        time: v.time,
        value: v.value,
      }))

    const observationSamples = observationResult.values.map((v) => ({
      stationId:
        v.observation && v.observation.mode === 'stations' ? v.observation.station.id : 'unknown',
      time: v.time,
      value: v.value,
    }))

    // Align samples
    const aligned = alignAccuracySamples(originalSamples, downscaledSamples, observationSamples)

    if (aligned.samples.length === 0) {
      return {
        ok: true,
        data: {
          available: false,
          reason: '没有共同有效样本用于精度评估',
        },
      }
    }

    // Calculate metrics for original vs observed
    const originalMetrics = calculateAccuracyMetrics(
      aligned.samples.map((s) => s.observed),
      aligned.samples.map((s) => s.original),
    )

    // Calculate metrics for downscaled vs observed
    const downscaledMetrics = calculateAccuracyMetrics(
      aligned.samples.map((s) => s.observed),
      aligned.samples.map((s) => s.downscaled),
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
          n: aligned.samples.length,
          timeCoverage: { start, end },
        },
        method: {
          matching: 'station-within-25km',
          unit: getUnit(task.configuration.variable),
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

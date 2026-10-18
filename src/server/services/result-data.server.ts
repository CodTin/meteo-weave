/**
 * Server function to fetch result data for threshold analysis.
 */

import { readDownscalingTask } from './downscaling-tasks.server'
import { queryTaskResult } from '@/features/downscaling-tasks/service/result-queries'
import type { ResultQuery, ResultReply } from '@/features/downscaling-tasks/service/contracts'

export function getResultData(
  taskId: string,
  timeSlice: string,
  region: { west: number; east: number; south: number; north: number },
): ResultReply {
  // First, get the task
  const taskReply = readDownscalingTask({ id: taskId })
  if (!taskReply.ok) {
    return taskReply
  }

  const task = taskReply.task

  // Build query for ensemble members with preview grid
  const query: ResultQuery = {
    kind: 'preview',
    layer: 'downscaled',
    window: region,
    times: [timeSlice],
    maxPoints: 64,
    ensemble:
      task.configuration.resolvedMethod === 'probabilistic' ? { kind: 'members' } : undefined,
  }

  // Fetch result
  const result = queryTaskResult(task, query)
  return result
}

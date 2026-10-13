import { createServerFn } from '@tanstack/react-start'
import {
  submitDownscalingTask,
  readDownscalingTask,
  restoreDownscalingTask,
  queryDownscalingTaskResult,
} from '@/server/services/downscaling-tasks.server'
import type { DownscalingTask, ResultQuery } from '@/features/downscaling-tasks/service/contracts'

// Keep authentication ahead of runtime business validation, including untrusted saved records.
export const submitTask = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => input)
  .handler(({ data }) => submitDownscalingTask(data))
export const readTask = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => input)
  .handler(({ data }) => readDownscalingTask(data))
export const restoreTask = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => input)
  .handler(({ data }) => restoreDownscalingTask(data))
export const queryTaskResult = createServerFn({ method: 'POST' })
  .inputValidator((input: { task: DownscalingTask; query: ResultQuery }) => input)
  .handler(({ data }) => queryDownscalingTaskResult(data))

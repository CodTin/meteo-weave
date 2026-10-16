import { createServerFn } from '@tanstack/react-start'
import {
  submitDownscalingTask,
  getDemoTaskCatalog,
  readDownscalingTask,
  restoreDownscalingTask,
  queryDownscalingTaskResult,
} from '@/server/services/downscaling-tasks.server'
import type { DownscalingTask, ResultQuery } from '@/features/downscaling-tasks/service/contracts'

// Keep authentication ahead of runtime business validation, including untrusted saved records.
export const submitTask = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input)
  .handler(({ data }) => submitDownscalingTask(data))
export const readTask = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input)
  .handler(({ data }) => readDownscalingTask(data))
export const restoreTask = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input)
  .handler(({ data }) => restoreDownscalingTask(data))
export const queryTaskResult = createServerFn({ method: 'POST' })
  .validator((input: { task: DownscalingTask; query: ResultQuery }) => input)
  .handler(({ data }) => queryDownscalingTaskResult(data))

// No input/configuration channel: the server supplies only its fixed authenticated catalog.
export const getTaskCatalog = createServerFn({ method: 'GET' }).handler(() => getDemoTaskCatalog())

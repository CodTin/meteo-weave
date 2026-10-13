import { vi } from 'vitest'
import { requestHandler } from '@tanstack/react-start/server'
import { isRedirect } from '@tanstack/react-router'
import { requireDemoAccount } from '@/server/services/demo-session.server'
import {
  getDemoTaskCatalog,
  submitDownscalingTask,
  readDownscalingTask,
  restoreDownscalingTask,
  queryDownscalingTaskResult,
} from '@/server/services/downscaling-tasks.server'

const operations: Record<string, (data?: unknown) => unknown> = {
  account: () => requireDemoAccount(),
  catalog: () => getDemoTaskCatalog(),
  submit: submitDownscalingTask,
  read: readDownscalingTask,
  restore: restoreDownscalingTask,
  result: queryDownscalingTaskResult,
}

/** Real authenticated Start services; freeze only the synchronous business request, not Vite. */
export async function dispatchTaskRequest(
  operation: string,
  data: unknown,
  { cookie, now }: { cookie: string; now: number | (() => number) },
) {
  let value: unknown
  const response = await requestHandler(() => {
    const clock = vi
      .spyOn(Date, 'now')
      .mockImplementation(typeof now === 'number' ? () => now : now)
    try {
      if (!Object.hasOwn(operations, operation)) throw new Error('Unknown transport operation')
      value = operations[operation]!(data)
      return Response.json(value)
    } catch (error) {
      if (isRedirect(error)) return error
      throw error
    } finally {
      clock.mockRestore()
    }
  })(new Request('http://demo.test/tasks', { method: 'POST', headers: { cookie } }), {})
  if (response.status === 307) throw new Error('AUTHENTICATION_REQUIRED')
  return value
}

/** Browser bindings use the same operation inventory as the authenticated dispatcher. */
export function browserTaskTransport(binding: 'taskRpc' | 'queryRpc' | 'lifecycleRpc') {
  return `Object.fromEntries(${JSON.stringify(Object.keys(operations))}.map(
    operation => [operation, data => window.${binding}(operation, data)]
  ))`
}

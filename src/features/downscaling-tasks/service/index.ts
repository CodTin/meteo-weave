import type { QueryClient } from '@tanstack/react-query'
import { onWorkspaceDiscard } from '@/lib/query/client'
import { openTaskStorage } from './record-storage'
import { unavailable, type TaskTransport, type ResultQuery, type TaskReply } from './contracts'

export type {
  DownscalingTask,
  ResultQuery,
  ResultReply,
  TaskReply,
  TaskTransport,
  Unavailable,
} from './contracts'
export { RESULT_QUERY_LIMITS } from './contracts'

const serverTransport: TaskTransport = {
  account: async () =>
    (await import('@/server/functions/demo-session')).requireDemoSession({ data: '/tasks' }),
  submit: async (data) =>
    (await import('@/server/functions/downscaling-tasks')).submitTask({ data }),
  read: async (data) => (await import('@/server/functions/downscaling-tasks')).readTask({ data }),
  restore: async (data) =>
    (await import('@/server/functions/downscaling-tasks')).restoreTask({ data }),
  result: async (data) =>
    (await import('@/server/functions/downscaling-tasks')).queryTaskResult({ data }),
}

/** One instance per hydrated workspace; pass its existing QueryClient, not a singleton. */
export function createTaskService({
  queryClient,
  transport = serverTransport,
}: {
  queryClient: QueryClient
  /** Request transport is an environmental seam; production uses typed Server Functions. */
  transport?: TaskTransport
}) {
  let storage: Awaited<ReturnType<typeof openTaskStorage>> | undefined
  let state: 'waiting-for-client' | 'initializing' | 'ready' | 'unavailable' = 'waiting-for-client'
  let initializing: Promise<void> | undefined
  let lifecycle = 0
  const ready = () => {
    if (!storage) throw new Error('Task storage is not ready. Await initialize() after hydration.')
    return storage
  }
  let unsubscribe: (() => void) | undefined
  const currentWorkspace = () => {
    const started = lifecycle
    return () => {
      if (started !== lifecycle) throw new Error('Task workspace was discarded.')
    }
  }
  function close() {
    lifecycle += 1
    unsubscribe?.()
    unsubscribe = undefined
    storage?.close()
    storage = undefined
    initializing = undefined
    state = 'waiting-for-client'
    queryClient.removeQueries({ queryKey: reads })
  }
  const reads = ['downscaling-tasks']

  return {
    getState: () => state,
    initialize() {
      if (!initializing) {
        unsubscribe ??= onWorkspaceDiscard(queryClient, close)
        const openingLifecycle = lifecycle
        state = 'initializing'
        initializing = openTaskStorage()
          .then((value) => {
            if (openingLifecycle !== lifecycle) {
              value.close()
              return
            }
            storage = value
            state = 'ready'
          })
          .catch((error) => {
            if (openingLifecycle === lifecycle) {
              state = 'unavailable'
              initializing = undefined
            }
            throw error
          })
      }
      return initializing
    },
    async create(input: unknown): Promise<TaskReply> {
      const db = ready()
      const check = currentWorkspace()
      const response = await transport.submit(input)
      check()
      if (response.ok) {
        await db.add(response.task)
        check()
        await queryClient.invalidateQueries({ queryKey: reads })
      }
      check()
      return response
    },
    /** Add a metadata backup for the current account; never overwrite an existing task. */
    async restore(record: unknown): Promise<TaskReply> {
      const db = ready()
      const check = currentWorkspace()
      const response = await transport.restore(record)
      check()
      if (!response.ok) return response
      try {
        await db.add(response.task)
      } catch (error) {
        check()
        if (error instanceof DOMException && error.name === 'ConstraintError') {
          return unavailable(
            'ALREADY_EXISTS',
            'A task with this id already exists; it was not overwritten.',
          )
        }
        throw error
      }
      check()
      await queryClient.invalidateQueries({ queryKey: reads })
      check()
      return response
    },
    /** Delete only the authenticated account's metadata; a repeated delete is NOT_FOUND. */
    async delete(id: string) {
      const db = ready()
      const check = currentWorkspace()
      const account = await transport.account()
      check()
      const deleted = await db.delete(account.id, id)
      check()
      if (!deleted) return unavailable('NOT_FOUND', 'Task not found.')
      queryClient.removeQueries({ queryKey: [...reads, account.id, 'task', id] })
      queryClient.removeQueries({ queryKey: [...reads, account.id, 'result', id] })
      queryClient.removeQueries({ queryKey: [...reads, account.id, 'list'] })
      return { ok: true as const }
    },
    async get(id: string): Promise<TaskReply> {
      const db = ready()
      const check = currentWorkspace()
      const account = await transport.account()
      check()
      return queryClient.query({
        queryKey: [...reads, account.id, 'task', id],
        staleTime: 0,
        queryFn: async () => {
          const record = await db.get(account.id, id)
          check()
          if (record === undefined) return unavailable('NOT_FOUND', 'Task not found.')
          const response = await transport.read(record)
          check()
          if (!response.ok) return response
          const task = await db.saveState(response.task)
          check()
          return task ? { ok: true, task } : unavailable('NOT_FOUND', 'Task not found.')
        },
      })
    },
    async list() {
      const db = ready()
      const check = currentWorkspace()
      const account = await transport.account()
      check()
      return queryClient.query({
        queryKey: [...reads, account.id, 'list'],
        staleTime: 0,
        queryFn: async () => {
          const records = await db.list(account.id)
          check()
          const results = await Promise.all(
            records.map(async (record) => {
              const response = await transport.read(record)
              check()
              if (!response.ok) return response
              const task = await db.saveState(response.task)
              check()
              return task ? { ok: true as const, task } : undefined
            }),
          )
          check()
          // Other responses may have waited while a previously reconciled task was deleted.
          const tasks = await Promise.all(
            results.map(async (result) =>
              result?.ok && (await db.get(account.id, result.task.id)) !== undefined
                ? [result.task]
                : [],
            ),
          )
          check()
          return {
            tasks: tasks.flat(),
            issues: results.flatMap((result) => (result && !result.ok ? [result] : [])),
          }
        },
      })
    },
    async result(id: string, query: ResultQuery) {
      const db = ready()
      const check = currentWorkspace()
      const response = await this.get(id)
      check()
      if (!response.ok) return response
      return queryClient.query({
        queryKey: [...reads, response.task.ownerId, 'result', id, response.task, query],
        staleTime: 0,
        queryFn: async () => {
          const result = await transport.result({ task: response.task, query })
          check()
          const record = await db.get(response.task.ownerId, id)
          check()
          return record === undefined ? unavailable('NOT_FOUND', 'Task not found.') : result
        },
      })
    },
    close,
  }
}

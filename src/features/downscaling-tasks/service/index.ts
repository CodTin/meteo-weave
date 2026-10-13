import type { QueryClient } from '@tanstack/react-query'
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
  const reads = ['downscaling-tasks']

  return {
    getState: () => state,
    initialize() {
      if (!initializing) {
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
      const response = await transport.submit(input)
      if (response.ok) {
        await db.add(response.task)
        await queryClient.invalidateQueries({ queryKey: reads })
      }
      return response
    },
    /** Add a metadata backup for the current account; never overwrite an existing task. */
    async restore(record: unknown): Promise<TaskReply> {
      const db = ready()
      const response = await transport.restore(record)
      if (!response.ok) return response
      try {
        await db.add(response.task)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'ConstraintError') {
          return unavailable(
            'ALREADY_EXISTS',
            'A task with this id already exists; it was not overwritten.',
          )
        }
        throw error
      }
      await queryClient.invalidateQueries({ queryKey: reads })
      return response
    },
    async get(id: string): Promise<TaskReply> {
      const db = ready()
      const account = await transport.account()
      return queryClient.query({
        queryKey: [...reads, account.id, 'task', id],
        staleTime: 0,
        queryFn: async () => {
          const record = await db.get(account.id, id)
          if (record === undefined) return unavailable('NOT_FOUND', 'Task not found.')
          const response = await transport.read(record)
          return response.ok ? { ok: true, task: await db.saveState(response.task) } : response
        },
      })
    },
    async list() {
      const db = ready()
      const account = await transport.account()
      return queryClient.query({
        queryKey: [...reads, account.id, 'list'],
        staleTime: 0,
        queryFn: async () => {
          const results = await Promise.all(
            (await db.list(account.id)).map(async (record) => {
              const response = await transport.read(record)
              return response.ok
                ? { ok: true as const, task: await db.saveState(response.task) }
                : response
            }),
          )
          return {
            tasks: results.flatMap((result) => (result.ok ? [result.task] : [])),
            issues: results.flatMap((result) => (result.ok ? [] : [result])),
          }
        },
      })
    },
    async result(id: string, query: ResultQuery) {
      const response = await this.get(id)
      if (!response.ok) return response
      return queryClient.query({
        queryKey: [...reads, response.task.ownerId, 'result', response.task, query],
        staleTime: 0,
        queryFn: () => transport.result({ task: response.task, query }),
      })
    },
    close() {
      lifecycle += 1
      storage?.close()
      storage = undefined
      initializing = undefined
      state = 'waiting-for-client'
      queryClient.removeQueries({ queryKey: reads })
    },
  }
}

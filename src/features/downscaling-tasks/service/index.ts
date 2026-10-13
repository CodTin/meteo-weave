import type { QueryClient } from '@tanstack/react-query'
import { onWorkspaceDiscard } from '@/lib/query/client'
import { openTaskStorage } from './record-storage'
import {
  recordIssue,
  validateTaskRecord,
  sameTaskMetadata,
  changedRecordIssue,
} from './record-validation'
import { resultAvailability } from './result-queries'
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
export { TaskStorageError } from './storage-diagnostics'
export type { TaskRecordIssue } from './record-validation'

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
    if (storage?.getFailure()) throw storage.getFailure()
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
  async function readRecord(record: unknown): Promise<TaskReply> {
    const response = await transport.read(record)
    if (!response.ok || response.task.status === 'Failed') return response
    // Known unavailable versions cannot complete even when their saved deadline is still ahead.
    const failure = resultAvailability(response.task)
    return failure
      ? { ok: true, task: { ...response.task, status: 'Failed', failureReason: failure.error } }
      : response
  }

  return {
    getState: () => (storage?.getFailure() ? ('unavailable' as const) : state),
    initialize() {
      if (storage?.getFailure()) {
        storage.close()
        storage = undefined
        initializing = undefined
      }
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
          const response = await readRecord(record)
          check()
          if (!response.ok) return response
          const saved = await db.saveState(response.task)
          check()
          return saved ?? unavailable('NOT_FOUND', 'Task not found.')
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
              const response = await readRecord(record)
              check()
              if (!response.ok) return recordIssue(record, response)
              const saved = await db.saveState(response.task)
              check()
              return saved && !saved.ok ? recordIssue(record, saved) : saved
            }),
          )
          check()
          // Other responses may have waited while an earlier record was deleted or damaged.
          const currentResults = await Promise.all(
            results.map(async (result) => {
              if (!result?.ok) return result
              const record = await db.get(account.id, result.task.id)
              check()
              if (record === undefined) return undefined
              const current = validateTaskRecord(record)
              if (!current.ok) return recordIssue(record, current)
              if (!sameTaskMetadata(current.task, result.task))
                return changedRecordIssue(current.task)
              return current
            }),
          )
          check()
          return {
            tasks: currentResults.flatMap((result) => (result?.ok ? [result.task] : [])),
            issues: currentResults.flatMap((result) => (result && !result.ok ? [result] : [])),
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
          if (record === undefined) return unavailable('NOT_FOUND', 'Task not found.')
          const current = validateTaskRecord(record)
          if (!current.ok) return current
          const availability = resultAvailability(current.task)
          if (availability) return availability
          if (!sameTaskMetadata(current.task, response.task))
            return changedRecordIssue(current.task)
          if (current.task.status === 'Failed')
            return unavailable('FAILED', current.task.failureReason!)
          return result
        },
      })
    },
    close,
  }
}

import type { Page } from '@playwright/test'
import type { DownscalingTask } from '@/features/downscaling-tasks/service'
export { createLifecycleEnvironment as createRecoveryEnvironment } from '../task-lifecycle-native-environment'
export { lifecycleConfiguration, lifecyclePointQuery } from '../task-lifecycle-native-environment'

export const recoveryRecord = {
  schemaVersion: 1,
  id: 'recovery-healthy',
  name: 'Synthetic Demo · Recovery fixture',
  ownerId: 'researcher',
  configuration: {
    dataSource: 'fusion',
    variable: 'temperature',
    resolution: '3km',
    method: 'recommended',
    resolvedMethod: 'deterministic',
    region: { west: 110, east: 111, south: 30, north: 31 },
    timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-01-03' },
  },
  createdAt: '2026-10-13T08:00:00.000Z',
  submittedAt: '2026-10-13T08:00:00.000Z',
  completionAt: '2026-10-13T08:00:02.500Z',
  status: 'Running',
  failureReason: null,
  dataSeed: 42,
  generatorVersion: 'synthetic-temperature-v1',
} satisfies DownscalingTask

declare global {
  interface Window {
    recoveryRestoreEnvironment: () => void
  }
}

/** Faults affect only native browser APIs, never task services or the request transport. */
export async function storageFault(page: Page, operation: 'open' | 'read' | 'write') {
  await page.evaluate((operation) => {
    if (operation === 'open') {
      const original = IDBFactory.prototype.open
      IDBFactory.prototype.open = function () {
        throw new DOMException('Browser denied storage access', 'SecurityError')
      }
      window.recoveryRestoreEnvironment = () => {
        IDBFactory.prototype.open = original
      }
    } else {
      const original = IDBDatabase.prototype.transaction
      IDBDatabase.prototype.transaction = function (...args) {
        const tx = original.apply(this, args)
        if ((args[1] ?? 'readonly') === (operation === 'read' ? 'readonly' : 'readwrite')) {
          // Abort a real native transaction after request success, before durable completion.
          const objectStore = tx.objectStore.bind(tx)
          tx.objectStore = (name) => {
            const store = objectStore(name)
            for (const method of operation === 'read'
              ? (['get', 'getAll', 'getKey'] as const)
              : (['add', 'put', 'delete'] as const)) {
              const native = store[method].bind(store)
              Object.defineProperty(store, method, {
                value: (...values: unknown[]) => {
                  const request = Reflect.apply(native, store, values) as IDBRequest
                  request.addEventListener('success', () => tx.abort(), { once: true })
                  return request
                },
              })
            }
            return store
          }
        }
        return tx
      }
      window.recoveryRestoreEnvironment = () => {
        IDBDatabase.prototype.transaction = original
      }
    }
  }, operation)
}

/** Simulate damaged persisted media using portable task metadata, without naming stores/keys. */
export async function damageSavedRecord(page: Page, id: string, changes: Record<string, unknown>) {
  await page.evaluate(
    async ({ id, changes }) => {
      for (const info of await indexedDB.databases()) {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(info.name!)
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        try {
          for (const name of db.objectStoreNames) {
            await new Promise<void>((resolve, reject) => {
              const tx = db.transaction(name, 'readwrite')
              const request = tx.objectStore(name).openCursor()
              tx.oncomplete = () => resolve()
              tx.onabort = () => reject(tx.error)
              request.onsuccess = () => {
                const cursor = request.result
                if (!cursor) return
                if (cursor.value?.id === id) cursor.update({ ...cursor.value, ...changes })
                cursor.continue()
              }
            })
          }
        } finally {
          db.close()
        }
      }
    },
    { id, changes },
  )
}

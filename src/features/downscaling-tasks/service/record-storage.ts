import type { DownscalingTask, TaskReply } from './contracts'
import { validateTaskRecord, sameTaskMetadata, changedRecordIssue } from './record-validation'
import { TaskStorageError } from './storage-diagnostics'

// This module is only opened explicitly after hydration, never at import/SSR time.
export async function openTaskStorage() {
  if (!globalThis.indexedDB)
    throw new TaskStorageError('open', new Error('Browser task storage is unavailable.'))
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    let blocked = false
    const request = indexedDB.open('meteo-downscaling-tasks', 2)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('tasks'))
        request.result.createObjectStore('tasks', { keyPath: ['ownerId', 'id'] })
      request.result.createObjectStore('catalog-initialization')
    }
    request.onsuccess = () => {
      if (blocked) request.result.close()
      else resolve(request.result)
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => {
      blocked = true
      reject(new Error('Close other tabs to open task storage.'))
    }
  }).catch((error: unknown) => {
    throw new TaskStorageError('open', error)
  })
  database.onversionchange = () => database.close()
  let failure: TaskStorageError | undefined
  let catalogTransaction: IDBTransaction | undefined
  const failed = (operation: 'read' | 'write', error: unknown): never => {
    if (error instanceof DOMException && error.name === 'ConstraintError') throw error
    failure = new TaskStorageError(operation, error)
    throw failure
  }

  function transaction<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
    storeName = 'tasks',
  ) {
    return new Promise<T>((resolve, reject) => {
      const tx = database.transaction(storeName, mode)
      const request = run(tx.objectStore(storeName))
      // A request succeeding is not proof that a write committed.
      tx.oncomplete = () => resolve(request.result)
      tx.onabort = () => reject(tx.error ?? new Error('Task storage transaction aborted.'))
      tx.onerror = () => reject(tx.error ?? request.error)
    }).catch((error: unknown) => failed(mode === 'readonly' ? 'read' : 'write', error))
  }

  return {
    getFailure: () => failure,
    catalogInitialized: async (ownerId: string) => {
      const marker = await transaction(
        'readonly',
        (store) => store.get(ownerId),
        'catalog-initialization',
      )
      if (marker !== undefined && marker !== 1)
        failed(
          'read',
          new Error('Unrecognized catalog initialization record; history was not reset.'),
        )
      return marker === 1
    },
    initializeCatalog: (ownerId: string, tasks: DownscalingTask[]) =>
      new Promise<void>((resolve, reject) => {
        const tx = database.transaction(['tasks', 'catalog-initialization'], 'readwrite')
        catalogTransaction = tx
        const markerStore = tx.objectStore('catalog-initialization')
        const taskStore = tx.objectStore('tasks')
        const request = markerStore.get(ownerId)
        tx.oncomplete = () => {
          catalogTransaction = undefined
          resolve()
        }
        tx.onabort = () => {
          catalogTransaction = undefined
          reject(tx.error ?? new Error('Catalog initialization aborted; retry initialization.'))
        }
        request.onsuccess = () => {
          if (request.result === 1) return
          if (request.result !== undefined) {
            tx.abort()
            return
          }
          for (const task of tasks) {
            // A pre-existing id, even damaged/unknown metadata, is never repurposed as a case.
            const existing = taskStore.getKey([ownerId, task.id])
            existing.onsuccess = () => {
              if (existing.result === undefined) taskStore.add(task)
            }
          }
          // Tasks and completion are one transaction, including every subsequent add request.
          markerStore.add(1, ownerId)
        }
      }).catch((error: unknown) => failed('write', error)),
    delete: (ownerId: string, id: string) =>
      new Promise<boolean>((resolve, reject) => {
        const tx = database.transaction('tasks', 'readwrite')
        const store = tx.objectStore('tasks')
        const request = store.getKey([ownerId, id])
        let deleted = false
        tx.oncomplete = () => resolve(deleted)
        tx.onabort = () => reject(tx.error ?? new Error('Task deletion aborted.'))
        tx.onerror = () => reject(tx.error ?? request.error)
        request.onsuccess = () => {
          if (request.result !== undefined) {
            store.delete([ownerId, id])
            deleted = true
          }
        }
      }).catch((error: unknown) => failed('write', error)),
    add: (task: DownscalingTask) => transaction('readwrite', (store) => store.add(task)),
    saveState: (task: DownscalingTask) =>
      new Promise<TaskReply | undefined>((resolve, reject) => {
        const tx = database.transaction('tasks', 'readwrite')
        const store = tx.objectStore('tasks')
        const request = store.get([task.ownerId, task.id])
        let saved: TaskReply | undefined = { ok: true, task }
        tx.oncomplete = () => resolve(saved)
        tx.onabort = () =>
          reject(tx.error ?? new Error('Saved task changed or became unreadable; retry the read.'))
        tx.onerror = () => reject(tx.error ?? request.error)
        request.onsuccess = () => {
          // Deletion wins over a response generated from an older snapshot, including other tabs.
          if (request.result === undefined) {
            saved = undefined
            return
          }
          const current = validateTaskRecord(request.result)
          if (!current.ok) {
            saved = current
            return
          }
          if (!sameTaskMetadata(current.task, task)) {
            saved = changedRecordIssue(current.task)
            return
          }
          // Native transactions serialize competing tabs. A delayed poll cannot undo a terminal state.
          if (
            current.task.status === 'Failed' ||
            (task.status === 'Running' && current.task.status !== 'Running')
          ) {
            saved = current
          } else {
            store.put(task)
          }
        }
      }).catch((error: unknown) => failed('write', error)),
    get: (ownerId: string, id: string): Promise<unknown> =>
      transaction('readonly', (store) => store.get([ownerId, id])),
    list: (ownerId: string): Promise<unknown[]> =>
      transaction('readonly', (store) => store.getAll(IDBKeyRange.bound([ownerId], [ownerId, []]))),
    close: () => {
      catalogTransaction?.abort()
      database.close()
    },
  }
}

import type { DownscalingTask } from './contracts'
import { validateTaskRecord } from './record-validation'

// This module is only opened explicitly after hydration, never at import/SSR time.
export async function openTaskStorage() {
  if (!globalThis.indexedDB) throw new Error('Browser task storage is unavailable.')
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    let blocked = false
    const request = indexedDB.open('meteo-downscaling-tasks', 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('tasks', { keyPath: ['ownerId', 'id'] })
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
  })
  database.onversionchange = () => database.close()

  function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
    return new Promise<T>((resolve, reject) => {
      const tx = database.transaction('tasks', mode)
      const request = run(tx.objectStore('tasks'))
      // A request succeeding is not proof that a write committed.
      tx.oncomplete = () => resolve(request.result)
      tx.onabort = () => reject(tx.error ?? new Error('Task storage transaction aborted.'))
      tx.onerror = () => reject(tx.error ?? request.error)
    })
  }

  return {
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
      }),
    add: (task: DownscalingTask) => transaction('readwrite', (store) => store.add(task)),
    saveState: (task: DownscalingTask) =>
      new Promise<DownscalingTask | undefined>((resolve, reject) => {
        const tx = database.transaction('tasks', 'readwrite')
        const store = tx.objectStore('tasks')
        const request = store.get([task.ownerId, task.id])
        let saved: DownscalingTask | undefined = task
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
            tx.abort()
            return
          }
          // Native transactions serialize competing tabs. A delayed poll cannot undo a terminal state.
          if (
            current.task.status === 'Failed' ||
            (task.status === 'Running' && current.task.status !== 'Running')
          ) {
            saved = current.task
          } else {
            store.put(task)
          }
        }
      }),
    get: (ownerId: string, id: string): Promise<unknown> =>
      transaction('readonly', (store) => store.get([ownerId, id])),
    list: (ownerId: string): Promise<unknown[]> =>
      transaction('readonly', (store) => store.getAll(IDBKeyRange.bound([ownerId], [ownerId, []]))),
    close: () => database.close(),
  }
}

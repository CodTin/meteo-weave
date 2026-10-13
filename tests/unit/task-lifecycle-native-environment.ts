import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { vi } from 'vitest'
import { chromium, type BrowserContext, type Page } from '@playwright/test'
import { createServer } from 'vite'
import { requestHandler } from '@tanstack/react-start/server'
import { isRedirect } from '@tanstack/react-router'
import {
  loginDemoAccount,
  endDemoSession,
  requireDemoAccount,
} from '@/server/services/demo-session.server'
import {
  submitDownscalingTask,
  getDemoTaskCatalog,
  readDownscalingTask,
  restoreDownscalingTask,
  queryDownscalingTaskResult,
} from '@/server/services/downscaling-tasks.server'
import type { createTaskService, ResultQuery } from '@/features/downscaling-tasks/service'

declare global {
  interface Window {
    lifecycleTasks: ReturnType<typeof createTaskService>
    lifecycleRpc: (operation: string, data?: unknown) => Promise<unknown>
    lifecycleDiscard: () => Promise<void>
    lifecycleMount: (initialize?: boolean) => Promise<void>
    lifecycleMounted: boolean
  }
}

export const lifecycleConfiguration = {
  dataSource: 'fusion',
  variable: 'temperature',
  region: { west: 110, east: 111, south: 30, north: 31 },
  timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-01-03' },
  resolution: '3km',
}
export const lifecyclePointQuery = {
  kind: 'points',
  layer: 'downscaled',
  points: [{ longitude: 110.25, latitude: 30.25 }],
  times: ['2024-01-01T00:00:00Z'],
} satisfies ResultQuery

/** Native Chromium storage and real public server services; only transport/time are controlled. */
export async function createLifecycleEnvironment({ emptyWorkspace = false } = {}) {
  // Transform modules without binding a second port beside the existing foundation suite.
  const vite = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: ['@tanstack/react-query'] },
    resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
    server: { middlewareMode: true, hmr: false },
  })
  const origin = `http://127.0.0.1:${process.env.E2E_PORT ?? 4186}`
  let context: BrowserContext | undefined
  let profile = ''
  let cookie = ''
  let now = Date.parse('2026-10-13T08:00:00Z')
  const holds = new Set<{
    operation: string
    page?: Page
    taskId?: string
    started: () => void
    release: () => void
    wait: Promise<void>
  }>()

  async function rpc(page: Page, operation: string, data?: unknown) {
    let value: unknown
    const response = await requestHandler(() => {
      const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
      try {
        switch (operation) {
          case 'catalog':
            value = getDemoTaskCatalog()
            break
          case 'account':
            value = requireDemoAccount()
            break
          case 'submit':
            value = submitDownscalingTask(data)
            break
          case 'read':
            value = readDownscalingTask(data)
            break
          case 'restore':
            value = restoreDownscalingTask(data)
            break
          case 'result':
            value = queryDownscalingTaskResult(data)
            break
          default:
            throw new Error('Unknown transport operation')
        }
        return Response.json(value)
      } catch (error) {
        if (isRedirect(error)) return error
        throw error
      } finally {
        clock.mockRestore()
      }
    })(new Request(`${origin}/tasks`, { method: 'POST', headers: { cookie } }), {})
    if (response.status === 307) throw new Error('AUTHENTICATION_REQUIRED')
    const held = [...holds].find(
      (entry) =>
        entry.operation === operation &&
        (!entry.page || entry.page === page) &&
        (!entry.taskId ||
          (typeof data === 'object' && data !== null && 'id' in data && data.id === entry.taskId)),
    )
    if (held) {
      holds.delete(held)
      held.started()
      await held.wait
    }
    return value
  }

  async function mount(page: Page, initialize = true) {
    await page.goto(`${origin}/task-lifecycle-environment`)
    await page.addScriptTag({
      type: 'module',
      content: `
      import { createTaskService } from '/src/features/downscaling-tasks/service/index.ts'
      import { createQueryClient, discardWorkspaceQueries } from '/src/lib/query/client.ts'
      window.lifecycleMounted = false
      window.lifecycleMount = async (initialize = true) => {
        window.lifecycleMounted = false
        const queryClient = createQueryClient()
        window.lifecycleDiscard = () => discardWorkspaceQueries(queryClient)
        window.lifecycleTasks = createTaskService({ queryClient, transport: Object.fromEntries(
          ['account', 'catalog', 'submit', 'read', 'restore', 'result'].map(operation =>
            [operation, data => window.lifecycleRpc(operation, data)])
        ) })
        if (initialize) {
          await window.lifecycleTasks.initialize()
          // Explicit fixture preparation uses the real public delete/list paths, never a seed bypass.
          if (${emptyWorkspace}) {
            for (const task of (await window.lifecycleTasks.list()).tasks) {
              if (task.catalog) await window.lifecycleTasks.delete(task.id)
            }
          }
        }
        window.lifecycleMounted = true
      }
      await window.lifecycleMount(${initialize})
    `,
    })
    await page.waitForFunction(() => window.lifecycleMounted)
    return page
  }

  async function open({ initialize = true } = {}) {
    profile ||= await mkdtemp(join(tmpdir(), 'meteo-task-lifecycle-'))
    context = await chromium.launchPersistentContext(profile, { headless: true })
    await context.exposeBinding('lifecycleRpc', ({ page }, operation: string, data?: unknown) =>
      rpc(page, operation, data),
    )
    await context.route(`${origin}/**`, async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname === '/task-lifecycle-environment') {
        await route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><title>Native lifecycle environment</title>',
        })
      } else {
        const transformed = await vite.transformRequest(url.pathname + url.search)
        if (!transformed) throw new Error(`Missing browser module: ${url.pathname}`)
        await route.fulfill({ contentType: 'text/javascript', body: transformed.code })
      }
    })
    return mount(await context.newPage(), initialize)
  }

  return {
    open,
    async tab({ initialize = true } = {}) {
      if (!context) throw new Error('Open the browser first')
      return mount(await context.newPage(), initialize)
    },
    async reopen() {
      await context?.close()
      return open()
    },
    async signIn(account: string) {
      const response = await requestHandler(() =>
        Response.json(loginDemoAccount({ account, password: 'meteo-demo' })),
      )(new Request(`${origin}/login`, { method: 'POST' }), {})
      cookie = response.headers.get('set-cookie')!.split(';')[0]!
    },
    async signOut() {
      await requestHandler(() => Response.json(endDemoSession()))(
        new Request(`${origin}/login`, { method: 'POST', headers: { cookie } }),
        {},
      )
      cookie = ''
    },
    advance(milliseconds: number) {
      now += milliseconds
    },
    holdNext(operation: string, page?: Page, taskId?: string) {
      const started = Promise.withResolvers<void>()
      const released = Promise.withResolvers<void>()
      holds.add({
        operation,
        page,
        taskId,
        started: started.resolve,
        release: released.resolve,
        wait: released.promise,
      })
      return { started: started.promise, release: released.resolve }
    },
    async reset() {
      for (const held of holds) held.release()
      holds.clear()
      await context?.close()
      context = undefined
      if (profile) await rm(profile, { recursive: true, force: true })
      profile = ''
      cookie = ''
      now = Date.parse('2026-10-13T08:00:00Z')
    },
    async close() {
      await vite.close()
    },
  }
}

/** A native pre-catalog (database v1) backup fixture, not an initialization-marker test API. */
export async function seedPreCatalogHistory(
  page: Page,
  tasks: import('@/features/downscaling-tasks/service').DownscalingTask[],
) {
  await page.evaluate(async (tasks) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('meteo-downscaling-tasks', 1)
      request.onupgradeneeded = () =>
        request.result.createObjectStore('tasks', { keyPath: ['ownerId', 'id'] })
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('tasks', 'readwrite')
        for (const task of tasks) tx.objectStore('tasks').add(task)
        tx.oncomplete = () => resolve()
        tx.onabort = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  }, tasks)
}

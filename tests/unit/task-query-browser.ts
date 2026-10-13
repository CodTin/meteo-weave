import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { vi } from 'vitest'
import { chromium, type BrowserContext, type Page } from '@playwright/test'
import { createServer } from 'vite'
import { requestHandler } from '@tanstack/react-start/server'
import { isRedirect } from '@tanstack/react-router'
import { loginDemoAccount, requireDemoAccount } from '@/server/services/demo-session.server'
import {
  submitDownscalingTask,
  getDemoTaskCatalog,
  readDownscalingTask,
  restoreDownscalingTask,
  queryDownscalingTaskResult,
} from '@/server/services/downscaling-tasks.server'
import type {
  createTaskService,
  DownscalingTask,
  ResultQuery,
} from '@/features/downscaling-tasks/service'

declare global {
  interface Window {
    queryTasks: ReturnType<typeof createTaskService>
    queryRpc: (operation: string, data?: unknown) => Promise<unknown>
  }
}

export const queryConfiguration = {
  dataSource: 'fusion',
  variable: 'temperature',
  region: { west: 110, east: 111, south: 30, north: 31 },
  timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-01-03' },
  resolution: '3km',
} as const

/** Environmental transport only: real authenticated services and native browser IndexedDB. */
export async function startQueryBrowser() {
  const vite = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: ['@tanstack/react-query'] },
    resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
    // A test-only ephemeral asset server avoids racing the existing suite on E2E_PORT.
    server: { host: '127.0.0.1', port: 0, strictPort: true },
  })
  vite.middlewares.use('/query-test-environment', (_request, response) => {
    response.setHeader('Content-Type', 'text/html')
    response.end('<!doctype html><title>Native query test environment</title>')
  })
  await vite.listen()
  const address = vite.httpServer!.address()
  if (!address || typeof address === 'string') throw new Error('Expected listening test server')
  const origin = `http://127.0.0.1:${address.port}`
  let context: BrowserContext | undefined
  let page: Page
  let profile = ''
  let cookie = ''
  let serverTime = Date.parse('2026-10-13T08:00:00Z')

  async function rpc(operation: string, data?: unknown) {
    let value: unknown
    const response = await requestHandler(() => {
      const clock = vi.spyOn(Date, 'now').mockReturnValue(serverTime)
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
    })(new Request('http://demo.test/tasks', { method: 'POST', headers: { cookie } }), {})
    if (response.status === 307) throw new Error('AUTHENTICATION_REQUIRED')
    return value
  }

  async function signIn(account: string) {
    const response = await requestHandler(() =>
      Response.json(loginDemoAccount({ account, password: 'meteo-demo' })),
    )(new Request('http://demo.test/login', { method: 'POST' }), {})
    cookie = response.headers.get('set-cookie')!.split(';')[0]!
    if (page && !page.isClosed()) {
      await page.evaluate(() => window.queryTasks.close())
      await prepareEmptyFixture()
    }
  }

  async function prepareEmptyFixture() {
    await page.evaluate(async () => {
      await window.queryTasks.initialize()
      for (const task of (await window.queryTasks.list()).tasks) {
        if (task.catalog) await window.queryTasks.delete(task.id)
      }
    })
  }

  async function open() {
    profile ||= await mkdtemp(join(tmpdir(), 'meteo-query-'))
    context = await chromium.launchPersistentContext(profile, { headless: true })
    await context.exposeBinding('queryRpc', (_source, operation: string, data?: unknown) =>
      rpc(operation, data),
    )
    page = await context.newPage()
    await page.goto(`${origin}/query-test-environment`)
    await page.addScriptTag({
      type: 'module',
      content: `
        import { createTaskService } from '/src/features/downscaling-tasks/service/index.ts'
        import { createQueryClient } from '/src/lib/query/client.ts'
        window.queryTasks = createTaskService({
          queryClient: createQueryClient(),
          transport: Object.fromEntries(['account', 'catalog', 'submit', 'read', 'restore', 'result'].map(
            operation => [operation, data => window.queryRpc(operation, data)]
          )),
        })
      `,
    })
    await page.waitForFunction(() => !!window.queryTasks)
    await prepareEmptyFixture()
  }

  async function reset() {
    await context?.close()
    context = undefined
    if (profile) await rm(profile, { recursive: true, force: true })
    profile = ''
    cookie = ''
    serverTime = Date.parse('2026-10-13T08:00:00Z')
  }

  return {
    signIn,
    rpc,
    async open() {
      await signIn('researcher')
      await open()
    },
    reset,
    async close() {
      await reset()
      await vite.close()
    },
    async reopen() {
      await context?.close()
      await open()
    },
    async seed(configuration: unknown = queryConfiguration) {
      const created = await page.evaluate((input) => window.queryTasks.create(input), configuration)
      if (!created.ok) throw new Error(created.error)
      const record = { ...created.task, id: `${created.task.id}-fixed`, dataSeed: 42 }
      const restored = await page.evaluate((input) => window.queryTasks.restore(input), record)
      if (!restored.ok) throw new Error(restored.error)
      serverTime += 2_500
      return record
    },
    result(task: DownscalingTask, query: ResultQuery) {
      return page.evaluate(({ id, query }) => window.queryTasks.result(id, query), {
        id: task.id,
        query,
      })
    },
    get(task: DownscalingTask) {
      return page.evaluate((id) => window.queryTasks.get(id), task.id)
    },
  }
}

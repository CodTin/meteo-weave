import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  launchGuardedPersistentContext,
  type BrowserContext,
  type Page,
} from '../e2e/browser-guard'
import { createServer } from 'vite'
import { requestHandler } from '@tanstack/react-start/server'
import { loginDemoAccount } from '@/server/services/demo-session.server'
import { browserTaskTransport, dispatchTaskRequest } from './task-test-transport'
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
    plugins: [
      {
        name: 'query-test-environment',
        configureServer(server) {
          server.middlewares.use('/query-test-environment', (_request, response) => {
            response.statusCode = 200
            response.setHeader('Content-Type', 'text/html')
            response.end('<!doctype html><title>Native query test environment</title>')
          })
        },
      },
    ],
    optimizeDeps: { noDiscovery: true, include: ['@tanstack/react-query'] },
    resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
    // A test-only ephemeral asset server avoids racing the existing suite on E2E_PORT.
    server: { host: '127.0.0.1', port: 0, strictPort: true },
  })
  await vite.listen()
  const address = vite.httpServer!.address()
  if (!address || typeof address === 'string') throw new Error('Expected listening test server')
  const origin = `http://127.0.0.1:${address.port}`
  let guardedBrowser: Awaited<ReturnType<typeof launchGuardedPersistentContext>> | undefined
  let context: BrowserContext | undefined
  let page: Page
  let profile = ''
  let cookie = ''
  let serverTime = Date.parse('2026-10-13T08:00:00Z')

  async function rpc(operation: string, data?: unknown) {
    const value = await dispatchTaskRequest(operation, data, { cookie, now: serverTime })
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
    guardedBrowser = await launchGuardedPersistentContext(profile)
    context = guardedBrowser.context
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
          transport: ${browserTaskTransport('queryRpc')},
        })
      `,
    })
    await page.waitForFunction(() => !!window.queryTasks)
    await prepareEmptyFixture()
  }

  async function reset() {
    try {
      await guardedBrowser?.close()
    } finally {
      guardedBrowser = undefined
      context = undefined
      if (profile) await rm(profile, { recursive: true, force: true })
      profile = ''
      cookie = ''
      serverTime = Date.parse('2026-10-13T08:00:00Z')
    }
  }

  return {
    signIn,
    rpc,
    async open() {
      await signIn('researcher')
      await open()
      return page
    },
    reset,
    async close() {
      await reset()
      await vite.close()
    },
    async reopen() {
      await guardedBrowser?.close()
      await open()
      return page
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

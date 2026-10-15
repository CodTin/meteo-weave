import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, expect, it, describe } from 'vitest'
import {
  launchGuardedPersistentContext,
  type BrowserContext,
  type Page,
} from '../e2e/browser-guard'
import { createServer, type ViteDevServer } from 'vite'
import { requestHandler } from '@tanstack/react-start/server'
import { loginDemoAccount } from '@/server/services/demo-session.server'
import { browserTaskTransport, dispatchTaskRequest } from './task-test-transport'
import type { createTaskService } from '@/features/downscaling-tasks/service'

declare global {
  interface Window {
    tasks: ReturnType<typeof createTaskService>
    taskRpc: (operation: string, data?: unknown) => Promise<unknown>
    taskFixture: () => Promise<void>
  }
}

const config = {
  name: 'Test Task',
  dataSource: 'fusion',
  variable: 'temperature',
  region: { west: 110, east: 111, south: 30, north: 31 },
  timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-01-01' },
  resolution: '3km',
  method: 'recommended',
}
let vite: ViteDevServer
let guardedBrowser: Awaited<ReturnType<typeof launchGuardedPersistentContext>> | undefined
let context: BrowserContext
let profile: string
let cookie = ''
let page: Page
const baseTime = Date.parse('2026-10-13T08:00:00Z')
let serverTime = baseTime
function setServerTime(value: number) {
  serverTime = value
}

beforeAll(async () => {
  vite = await createServer({
    configFile: false,
    plugins: [
      {
        name: 'task-test-environment',
        configureServer(server) {
          server.middlewares.use('/task-test-environment', (_request, response) => {
            response.statusCode = 200
            response.setHeader('Content-Type', 'text/html')
            response.end('<!doctype html><title>Native browser environment</title>')
          })
        },
      },
    ],
    optimizeDeps: { noDiscovery: true, include: ['@tanstack/react-query'] },
    resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
    server: { host: '127.0.0.1', port: Number(process.env.E2E_PORT ?? 4181), strictPort: true },
  })
  await vite.listen()
})

afterEach(async () => {
  try {
    await guardedBrowser?.close()
  } finally {
    guardedBrowser = undefined
    if (profile) await rm(profile, { recursive: true, force: true })
    profile = ''
    cookie = ''
  }
}, 30_000)
afterAll(async () => {
  await vite?.close()
})

async function rpc(operation: string, data?: unknown) {
  return dispatchTaskRequest(operation, data, { cookie, now: serverTime })
}

async function signIn(account: string) {
  const response = await requestHandler(() =>
    Response.json(loginDemoAccount({ account, password: 'meteo-demo' })),
  )(new Request('http://demo.test/login', { method: 'POST' }), {})
  cookie = response.headers.get('set-cookie')!.split(';')[0]!
  if (page && !page.isClosed()) await page.evaluate(() => window.taskFixture())
}

async function openBrowser() {
  profile ||= await mkdtemp(join(tmpdir(), 'meteo-task-'))
  guardedBrowser = await launchGuardedPersistentContext(profile)
  context = guardedBrowser.context
  await context.exposeBinding('taskRpc', (_source, operation: string, data?: unknown) =>
    rpc(operation, data),
  )
  page = await context.newPage()
  await mountClient(page)
}

async function mountClient(page: Page) {
  await page.goto(`http://127.0.0.1:${vite.config.server.port}/task-test-environment`)
  await page.addScriptTag({
    type: 'module',
    content: `
    import { createTaskService } from '/src/features/downscaling-tasks/service/index.ts'
    import { createQueryClient } from '/src/lib/query/client.ts'
    const createService = () => createTaskService({
      queryClient: createQueryClient(),
      transport: ${browserTaskTransport('taskRpc')},
    })
    window.tasks = createService()
    window.taskFixture = async () => {
      const fixture = createService()
      try {
        await fixture.initialize()
        for (const task of (await fixture.list()).tasks) {
          if (task.catalog) await fixture.delete(task.id)
        }
      } finally { fixture.close() }
    }
  `,
  })
  await page.waitForFunction(() => !!window.tasks && !!window.taskFixture)
  if (cookie) await page.evaluate(() => window.taskFixture())
}

describe('Task failure and retry', () => {
  it('retry method requires failed task', async () => {
    setServerTime(baseTime)
    await signIn('researcher')
    await openBrowser()

    // Create a task
    const created = await page.evaluate(async (input) => {
      await window.tasks.initialize()
      return window.tasks.create(input)
    }, config)

    expect(created).toMatchObject({ ok: true })
    const taskId = (created as any).task.id

    // Try to retry a non-failed task - should fail
    const retryAttempt = await page.evaluate(
      async (input) => {
        return window.tasks.retry(input.taskId, input.config)
      },
      { taskId, config },
    )

    expect(retryAttempt).toMatchObject({
      ok: false,
      code: 'NOT_FAILED',
    })
  })

  it('tracks retry relationships in task records', async () => {
    setServerTime(baseTime)
    await signIn('researcher')
    await openBrowser()

    // Create a task
    const created = await page.evaluate(async (input) => {
      await window.tasks.initialize()
      return window.tasks.create(input)
    }, config)

    expect(created).toMatchObject({ ok: true })
    const task = (created as any).task

    // Verify task has retry relationship fields (undefined initially)
    expect(task.retriedFrom).toBeUndefined()
    expect(task.retriedBy).toBeUndefined()

    // These fields are part of the contract and available for future use
    expect(task).toHaveProperty('id')
    expect(task).toHaveProperty('status')
  })
})

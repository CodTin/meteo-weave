import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, expect, it } from 'vitest'
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
  dataSource: 'fusion',
  variable: 'temperature',
  region: { west: 110, east: 111, south: 30, north: 31 },
  timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-01-03' },
  resolution: '3km',
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

async function rpc(operation: string, data?: unknown) {
  return await dispatchTaskRequest(operation, data, { cookie, now: serverTime })
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

it('deletes a task and removes it from list', async () => {
  setServerTime(baseTime)
  await signIn('researcher')
  await openBrowser()

  // Create two tasks
  const task1 = await page.evaluate(async (input) => {
    await window.tasks.initialize()
    return window.tasks.create({ ...input, name: 'Task to delete' })
  }, config)
  expect(task1).toMatchObject({ ok: true })
  if (!task1.ok) throw new Error('Expected task')

  const task2 = await page.evaluate(async (input) => {
    return window.tasks.create({ ...input, name: 'Task to keep' })
  }, config)
  expect(task2).toMatchObject({ ok: true })
  if (!task2.ok) throw new Error('Expected task')

  // Verify both tasks exist
  const listBefore = await page.evaluate(() => window.tasks.list())
  expect(listBefore.tasks).toHaveLength(2)

  // Delete first task
  const deleteResult = await page.evaluate((id) => window.tasks.delete(id), task1.task.id)
  expect(deleteResult).toEqual({ ok: true })

  // Verify task is removed from list
  const listAfter = await page.evaluate(() => window.tasks.list())
  expect(listAfter.tasks).toHaveLength(1)
  expect(listAfter.tasks[0]?.id).toBe(task2.task.id)

  // Verify deleted task cannot be retrieved
  const getDeleted = await page.evaluate((id) => window.tasks.get(id), task1.task.id)
  expect(getDeleted).toMatchObject({ ok: false, code: 'NOT_FOUND' })
}, 30_000)

it('returns NOT_FOUND when deleting non-existent task', async () => {
  setServerTime(baseTime)
  await signIn('researcher')
  await openBrowser()
  await page.evaluate(() => window.tasks.initialize())

  const result = await page.evaluate(() => window.tasks.delete('non-existent-id'))
  expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' })
}, 30_000)

it('only deletes tasks belonging to authenticated account', async () => {
  setServerTime(baseTime)
  await signIn('researcher')
  await openBrowser()

  const task = await page.evaluate(async (input) => {
    await window.tasks.initialize()
    return window.tasks.create(input)
  }, config)
  if (!task.ok) throw new Error('Expected task')

  // Switch to different account
  await signIn('policy')

  // Try to delete researcher's task
  const result = await page.evaluate((id) => window.tasks.delete(id), task.task.id)
  expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' })

  // Switch back to researcher
  await signIn('researcher')

  // Verify task still exists
  const listAfter = await page.evaluate(() => window.tasks.list())
  expect(listAfter.tasks).toHaveLength(1)
  expect(listAfter.tasks[0]?.id).toBe(task.task.id)
}, 30_000)

it('invalidates result cache after deletion', async () => {
  setServerTime(baseTime)
  await signIn('researcher')
  await openBrowser()

  const task = await page.evaluate(async (input) => {
    await window.tasks.initialize()
    return window.tasks.create(input)
  }, config)
  if (!task.ok) throw new Error('Expected task')

  // Wait for task completion
  setServerTime(baseTime + 2_500)

  const pointQuery: import('@/features/downscaling-tasks/service').ResultQuery = {
    kind: 'points',
    layer: 'downscaled',
    points: [{ longitude: 110.5, latitude: 30.5 }],
    times: ['2024-01-01T00:00:00Z'],
  }

  // Get result to populate cache
  const resultBefore = await page.evaluate(({ id, query }) => window.tasks.result(id, query), {
    id: task.task.id,
    query: pointQuery,
  })
  expect(resultBefore).toMatchObject({ ok: true })

  // Delete task
  await page.evaluate((id) => window.tasks.delete(id), task.task.id)

  // Try to get result after deletion
  const resultAfter = await page.evaluate(({ id, query }) => window.tasks.result(id, query), {
    id: task.task.id,
    query: pointQuery,
  })
  expect(resultAfter).toMatchObject({ ok: false, code: 'NOT_FOUND' })
}, 30_000)

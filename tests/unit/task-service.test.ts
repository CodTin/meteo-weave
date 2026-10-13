import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { chromium, type BrowserContext, type Page } from '@playwright/test'
import { createServer, type ViteDevServer } from 'vite'
import { requestHandler } from '@tanstack/react-start/server'
import { isRedirect } from '@tanstack/react-router'
import { loginDemoAccount, requireDemoAccount } from '@/server/services/demo-session.server'
import {
  submitDownscalingTask,
  readDownscalingTask,
  restoreDownscalingTask,
  queryDownscalingTaskResult,
} from '@/server/services/downscaling-tasks.server'
import type { createTaskService } from '@/features/downscaling-tasks/service'

declare global {
  interface Window {
    tasks: ReturnType<typeof createTaskService>
    taskRpc: (operation: string, data?: unknown) => Promise<unknown>
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
let context: BrowserContext
let profile: string
let cookie = ''
let page: Page
const baseTime = Date.parse('2026-10-13T08:00:00Z')
let heldRead: { started: () => void; release: Promise<void> } | undefined
let serverTime = baseTime
function setServerTime(value: number) {
  serverTime = value
}

beforeAll(async () => {
  vite = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: ['@tanstack/react-query'] },
    resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
    server: { host: '127.0.0.1', port: Number(process.env.E2E_PORT ?? 4181), strictPort: true },
  })
  vite.middlewares.use('/task-test-environment', (_request, response) => {
    response.setHeader('Content-Type', 'text/html')
    response.end('<!doctype html><title>Native browser environment</title>')
  })
  await vite.listen()
})

afterEach(async () => {
  await context?.close()
  if (profile) await rm(profile, { recursive: true, force: true })
  profile = ''
  cookie = ''
}, 30_000)
afterAll(async () => {
  await vite?.close()
})

async function rpc(operation: string, data?: unknown) {
  let value: unknown
  const response = await requestHandler(() => {
    // Freeze the business request only, not Vite or the browser process lifecycle.
    const clock = vi.spyOn(Date, 'now').mockReturnValue(serverTime)
    try {
      switch (operation) {
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
  if (operation === 'read' && heldRead) {
    const held = heldRead
    heldRead = undefined
    held.started()
    await held.release
  }
  return value
}

async function signIn(account: string) {
  const response = await requestHandler(() =>
    Response.json(loginDemoAccount({ account, password: 'meteo-demo' })),
  )(new Request('http://demo.test/login', { method: 'POST' }), {})
  cookie = response.headers.get('set-cookie')!.split(';')[0]!
}

async function openBrowser() {
  profile ||= await mkdtemp(join(tmpdir(), 'meteo-task-'))
  context = await chromium.launchPersistentContext(profile, { headless: true })
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
    window.tasks = createTaskService({
      queryClient: createQueryClient(),
      transport: Object.fromEntries(['account', 'submit', 'read', 'restore', 'result'].map(
        operation => [operation, data => window.taskRpc(operation, data)]
      )),
    })
  `,
  })
  await page.waitForFunction(() => !!window.tasks)
}

it('submits, saves, reads and lists a named task for the authenticated account', async () => {
  setServerTime(baseTime)
  await signIn('researcher')
  await openBrowser()
  const created = await page.evaluate(async (input) => {
    await window.tasks.initialize()
    return window.tasks.create({ ...input, ownerId: 'policy', role: 'policy' })
  }, config)
  expect(created).toMatchObject({
    ok: true,
    task: {
      schemaVersion: 1,
      ownerId: 'researcher',
      status: 'Running',
      failureReason: null,
      createdAt: '2026-10-13T08:00:00.000Z',
      submittedAt: '2026-10-13T08:00:00.000Z',
      completionAt: '2026-10-13T08:00:02.500Z',
      configuration: { ...config, method: 'recommended', resolvedMethod: 'deterministic' },
    },
  })
  if (!created.ok) throw new Error('Expected task')
  expect(created.task.id).toBeTruthy()
  expect(created.task.name).toContain(created.task.id)
  expect(created.task.dataSeed).toEqual(expect.any(Number))
  expect(created.task.generatorVersion).toBeTruthy()
  expect(await page.evaluate((id) => window.tasks.get(id), created.task.id)).toEqual(created)
  expect(await page.evaluate(() => window.tasks.list())).toMatchObject({ tasks: [created.task] })
}, 30_000)

const pointQuery = {
  kind: 'points',
  layer: 'downscaled',
  points: [
    { longitude: 110.25, latitude: 30.25 },
    { longitude: 110.75, latitude: 30.75 },
  ],
  times: ['2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z'],
} satisfies import('@/features/downscaling-tasks/service').ResultQuery

it('reopens native persisted Running metadata, waits only the remainder, then rebuilds identical results', async () => {
  setServerTime(baseTime)
  await signIn('researcher')
  await openBrowser()
  const created = await page.evaluate(async (input) => {
    await window.tasks.initialize()
    return window.tasks.create(input)
  }, config)
  if (!created.ok) throw new Error('Expected task')
  expect(
    await page.evaluate(({ id, query }) => window.tasks.result(id, query), {
      id: created.task.id,
      query: pointQuery,
    }),
  ).toMatchObject({ ok: false, code: 'RUNNING' })
  await context.close()
  setServerTime(baseTime + 2_499)
  await openBrowser()
  await page.evaluate(() => window.tasks.initialize())
  expect(await page.evaluate((id) => window.tasks.get(id), created.task.id)).toEqual(created)
  setServerTime(baseTime + 2_500)
  expect(await page.evaluate((id) => window.tasks.get(id), created.task.id)).toMatchObject({
    ok: true,
    task: { status: 'Completed', completionAt: created.task.completionAt },
  })
  const result = await page.evaluate(({ id, query }) => window.tasks.result(id, query), {
    id: created.task.id,
    query: pointQuery,
  })
  expect(result).toMatchObject({
    ok: true,
    unit: '°C',
    displayTimezone: 'UTC',
    provenance: { label: 'Synthetic Demo' },
  })
  if (!result.ok) throw new Error('Expected results')
  expect(result.values).toHaveLength(4)
  expect(new Set(result.values.map((value) => value.value)).size).toBe(4)
  expect(result.values[0]?.time).toBe('2024-01-01T00:00:00.000Z')
  await context.close()
  setServerTime(baseTime + 60_000)
  await openBrowser()
  await page.evaluate(() => window.tasks.initialize())
  expect(
    await page.evaluate(({ id, query }) => window.tasks.result(id, query), {
      id: created.task.id,
      query: pointQuery,
    }),
  ).toEqual(result)
}, 30_000)

it('does not create tasks for unsupported variables or probabilistic methods', async () => {
  setServerTime(baseTime)
  await signIn('researcher')
  await openBrowser()
  await page.evaluate(() => window.tasks.initialize())
  for (const override of [
    { variable: 'wind' },
    { variable: 'pressure' },
    { variable: 'precipitation' },
    { method: 'probabilistic' },
    { advanced: { uncertaintyQuantification: true } },
  ]) {
    expect(
      await page.evaluate((input) => window.tasks.create(input), { ...config, ...override }),
    ).toMatchObject({ ok: false, code: 'UNAVAILABLE_COMBINATION' })
  }
  expect(await page.evaluate(() => window.tasks.list())).toEqual({ tasks: [], issues: [] })
}, 30_000)

it('restores metadata without replacing an unsupported generator, and persists an explicit Failed result', async () => {
  setServerTime(baseTime)
  await signIn('researcher')
  await openBrowser()
  const created = await page.evaluate(async (input) => {
    await window.tasks.initialize()
    return window.tasks.create(input)
  }, config)
  if (!created.ok) throw new Error('Expected task')
  const backup = {
    ...created.task,
    id: 'restored-unavailable',
    dataSeed: 42,
    generatorVersion: 'synthetic-temperature-v0',
  }
  expect(await page.evaluate((record) => window.tasks.restore(record), backup)).toEqual({
    ok: true,
    task: backup,
  })
  setServerTime(baseTime + 2_500)
  const failed = await page.evaluate((id) => window.tasks.get(id), backup.id)
  expect(failed).toMatchObject({
    ok: true,
    task: {
      status: 'Failed',
      generatorVersion: 'synthetic-temperature-v0',
      failureReason: expect.stringContaining('version is unavailable'),
    },
  })
  expect(
    await page.evaluate(({ id, query }) => window.tasks.result(id, query), {
      id: backup.id,
      query: pointQuery,
    }),
  ).toMatchObject({ ok: false, code: 'INCOMPATIBLE_GENERATOR' })
  await context.close()
  await openBrowser()
  await page.evaluate(() => window.tasks.initialize())
  expect(await page.evaluate((id) => window.tasks.get(id), backup.id)).toEqual(failed)
  expect(await page.evaluate((id) => window.tasks.get(id), created.task.id)).toMatchObject({
    ok: true,
    task: { status: 'Completed' },
  })
}, 30_000)

it('requires a real Demo session and rejects restricted configuration without saving a task', async () => {
  await openBrowser()
  await page.evaluate(() => window.tasks.initialize())
  await expect(page.evaluate((input) => window.tasks.create(input), config)).rejects.toThrow(
    'AUTHENTICATION_REQUIRED',
  )
  for (const account of ['policy', 'agriculture']) {
    await signIn(account)
    expect(
      await page.evaluate((input) => window.tasks.create(input), {
        ...config,
        method: 'deterministic',
        ownerId: 'researcher',
        role: 'researcher',
      }),
    ).toMatchObject({ ok: false, code: 'ROLE_RESTRICTED' })
    expect(await page.evaluate(() => window.tasks.list())).toEqual({ tasks: [], issues: [] })
  }
}, 30_000)

it('separates accounts even when the same service and QueryClient are reused', async () => {
  setServerTime(baseTime)
  await signIn('researcher')
  await openBrowser()
  const first = await page.evaluate(async (input) => {
    await window.tasks.initialize()
    return window.tasks.create(input)
  }, config)
  if (!first.ok) throw new Error('Expected task')
  await signIn('policy')
  expect(await page.evaluate(() => window.tasks.list())).toEqual({ tasks: [], issues: [] })
  expect(await page.evaluate((id) => window.tasks.get(id), first.task.id)).toMatchObject({
    ok: false,
    code: 'NOT_FOUND',
  })
  expect(
    await page.evaluate(({ id, query }) => window.tasks.result(id, query), {
      id: first.task.id,
      query: pointQuery,
    }),
  ).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  expect(await rpc('read', first.task)).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  expect(await rpc('result', { task: first.task, query: pointQuery })).toMatchObject({
    ok: false,
    code: 'NOT_FOUND',
  })
  const second = await page.evaluate((input) => window.tasks.create(input), config)
  if (!second.ok) throw new Error('Expected task')
  expect(second.task.id).not.toBe(first.task.id)
  expect(second.task.name).not.toBe(first.task.name)
  await signIn('researcher')
  expect(await page.evaluate(() => window.tasks.list())).toEqual({
    tasks: [first.task],
    issues: [],
  })
  expect(await page.evaluate((id) => window.tasks.get(id), second.task.id)).toMatchObject({
    ok: false,
    code: 'NOT_FOUND',
  })
}, 30_000)

it('reopens an expired forecast without treating its saved submission as a new forecast request', async () => {
  setServerTime(baseTime)
  await signIn('researcher')
  await openBrowser()
  const input = {
    ...config,
    timeRange: { mode: 'forecast', start: '2026-10-13T08:00:00Z', end: '2026-10-13T10:00:00Z' },
    method: 'deterministic',
    advanced: { uncertaintyQuantification: false },
  }
  const created = await page.evaluate(async (input) => {
    await window.tasks.initialize()
    return window.tasks.create(input)
  }, input)
  if (!created.ok) throw new Error('Expected task')
  expect(created.task.configuration).toMatchObject({
    method: 'deterministic',
    resolvedMethod: 'deterministic',
    advanced: { uncertaintyQuantification: false },
  })
  await context.close()
  setServerTime(baseTime + 30 * 86_400_000)
  await openBrowser()
  await page.evaluate(() => window.tasks.initialize())
  expect(await page.evaluate((input) => window.tasks.create(input), input)).toMatchObject({
    ok: false,
    code: 'INVALID_CONFIGURATION',
  })
  expect(await page.evaluate((id) => window.tasks.get(id), created.task.id)).toMatchObject({
    ok: true,
    task: { status: 'Completed', submittedAt: created.task.submittedAt },
  })
  expect(
    await page.evaluate(({ id, query }) => window.tasks.result(id, query), {
      id: created.task.id,
      query: { ...pointQuery, times: ['2026-10-13T09:00:00+00:00'] },
    }),
  ).toMatchObject({
    ok: true,
    values: [expect.objectContaining({ time: '2026-10-13T09:00:00.000Z' }), expect.any(Object)],
  })
}, 30_000)

it('rejects unsupported and oversized query shapes and never extrapolates outside task coverage', async () => {
  setServerTime(baseTime)
  await signIn('researcher')
  await openBrowser()
  const created = await page.evaluate(async (input) => {
    await window.tasks.initialize()
    return window.tasks.create(input)
  }, config)
  if (!created.ok) throw new Error('Expected task')
  setServerTime(baseTime + 2_500)
  for (const query of [
    { ...pointQuery, kind: 'grid' },
    { ...pointQuery, layer: 'observation' },
    { ...pointQuery, member: 0 },
    {
      ...pointQuery,
      points: Array.from({ length: 65 }, () => ({ longitude: 110.5, latitude: 30.5 })),
    },
    { ...pointQuery, times: Array.from({ length: 169 }, () => '2024-01-01T00:00:00Z') },
    {
      ...pointQuery,
      points: Array.from({ length: 64 }, () => ({ longitude: 110.5, latitude: 30.5 })),
      times: Array.from({ length: 5 }, () => '2024-01-01T00:00:00Z'),
    },
  ]) {
    // The server result entry also validates untyped network callers, not just TypeScript clients.
    expect(await rpc('result', { task: created.task, query })).toMatchObject({
      ok: false,
      code: 'UNAVAILABLE_QUERY',
    })
  }
  for (const query of [
    { ...pointQuery, points: [{ longitude: 0, latitude: 0 }] },
    { ...pointQuery, times: ['2024-01-01T01:00:00Z'] },
    { ...pointQuery, times: ['2025-01-01T00:00:00Z'] },
  ]) {
    expect(
      await page.evaluate(({ id, query }) => window.tasks.result(id, query), {
        id: created.task.id,
        query,
      }),
    ).toMatchObject({ ok: false, code: 'OUTSIDE_COVERAGE' })
  }
}, 30_000)

it('uses the same bounded field for separate and combined queries, including a large region', async () => {
  setServerTime(baseTime)
  await signIn('researcher')
  await openBrowser()
  const created = await page.evaluate(
    async (input) => {
      await window.tasks.initialize()
      return window.tasks.create(input)
    },
    {
      ...config,
      region: { west: -180, east: 180, south: -80, north: 80 },
      resolution: '1km',
    },
  )
  if (!created.ok) throw new Error('Expected task')
  const fixture = { ...created.task, id: 'fixed-seed-temperature', dataSeed: 42 }
  await page.evaluate((record) => window.tasks.restore(record), fixture)
  setServerTime(baseTime + 2_500)
  for (const layer of ['original', 'downscaled'] as const) {
    const combined = await page.evaluate(({ id, query }) => window.tasks.result(id, query), {
      id: fixture.id,
      query: { ...pointQuery, layer },
    })
    if (!combined.ok) throw new Error('Expected result')
    expect(combined.grid).toMatchObject({
      nominalSpacingKm: layer === 'original' ? 10 : 1,
      sampling: 'requested-points',
      interpolation: 'bilinear',
    })
    expect(combined.values).toHaveLength(4)
    for (const value of combined.values) {
      const single = await page.evaluate(({ id, query }) => window.tasks.result(id, query), {
        id: fixture.id,
        query: {
          ...pointQuery,
          layer,
          points: [{ longitude: value.longitude, latitude: value.latitude }],
          times: [value.time],
        },
      })
      expect(single).toMatchObject({ ok: true, values: [value] })
    }
  }
}, 30_000)

it('rejects damaged, foreign and privilege-escalating backups without replacing saved history', async () => {
  setServerTime(baseTime)
  await signIn('policy')
  await openBrowser()
  const created = await page.evaluate(async (input) => {
    await window.tasks.initialize()
    return window.tasks.create(input)
  }, config)
  if (!created.ok) throw new Error('Expected task')
  for (const record of [
    { ...created.task, dataSeed: null },
    { ...created.task, failureReason: 'not failed' },
    { ...created.task, completionAt: '2026-10-13T08:00:05.000Z' },
    { ...created.task, resultGrid: [1, 2, 3] },
  ]) {
    expect(await page.evaluate((record) => window.tasks.restore(record), record)).toMatchObject({
      ok: false,
      code: 'INVALID_RECORD',
    })
  }
  expect(
    await page.evaluate((record) => window.tasks.restore(record), {
      ...created.task,
      schemaVersion: 99,
    }),
  ).toMatchObject({ ok: false, code: 'INCOMPATIBLE_SCHEMA' })
  expect(
    await page.evaluate((record) => window.tasks.restore(record), {
      ...created.task,
      ownerId: 'researcher',
    }),
  ).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  expect(
    await page.evaluate((record) => window.tasks.restore(record), {
      ...created.task,
      name: 'Overwrite attempt',
    }),
  ).toMatchObject({ ok: false, code: 'ALREADY_EXISTS' })
  expect(
    await page.evaluate((record) => window.tasks.restore(record), {
      ...created.task,
      id: 'forged-advanced',
      configuration: {
        ...created.task.configuration,
        method: 'deterministic',
        advanced: { uncertaintyQuantification: false },
      },
    }),
  ).toMatchObject({ ok: false, code: 'ROLE_RESTRICTED' })
  expect(await page.evaluate(() => window.tasks.list())).toEqual({
    tasks: [created.task],
    issues: [],
  })
}, 30_000)

it('does not let a delayed Running response replace a completion saved by another tab', async () => {
  setServerTime(baseTime)
  await signIn('researcher')
  await openBrowser()
  const created = await page.evaluate(async (input) => {
    await window.tasks.initialize()
    return window.tasks.create(input)
  }, config)
  if (!created.ok) throw new Error('Expected task')
  const otherPage = await context.newPage()
  await mountClient(otherPage)
  await otherPage.evaluate(() => window.tasks.initialize())
  const started = Promise.withResolvers<void>()
  const released = Promise.withResolvers<void>()
  heldRead = { started: started.resolve, release: released.promise }
  const delayed = page.evaluate((id) => window.tasks.get(id), created.task.id)
  try {
    await started.promise
    setServerTime(baseTime + 2_500)
    expect(await otherPage.evaluate((id) => window.tasks.get(id), created.task.id)).toMatchObject({
      ok: true,
      task: { status: 'Completed' },
    })
  } finally {
    released.resolve()
  }
  expect(await delayed).toMatchObject({
    ok: true,
    task: { status: 'Completed', completionAt: created.task.completionAt },
  })
  setServerTime(baseTime)
  expect(await page.evaluate((id) => window.tasks.get(id), created.task.id)).toMatchObject({
    ok: true,
    task: { status: 'Completed' },
  })
}, 30_000)

it('has explicit hydration waiting and can close during initialization without reopening itself', async () => {
  await openBrowser()
  expect(await page.evaluate(() => window.tasks.getState())).toBe('waiting-for-client')
  await expect(page.evaluate(() => window.tasks.list())).rejects.toThrow('not ready')
  const states = await page.evaluate(async () => {
    const pending = window.tasks.initialize()
    const initializing = window.tasks.getState()
    window.tasks.close()
    await pending
    const closed = window.tasks.getState()
    await window.tasks.initialize()
    return [initializing, closed, window.tasks.getState()]
  })
  expect(states).toEqual(['initializing', 'waiting-for-client', 'ready'])
}, 30_000)

it('is importable during SSR and reports unavailable browser storage rather than inventing a memory store', async () => {
  const { createTaskService } = await import('@/features/downscaling-tasks/service')
  const { createQueryClient } = await import('@/lib/query/client')
  const client = createQueryClient()
  const tasks = createTaskService({ queryClient: client })
  expect(tasks.getState()).toBe('waiting-for-client')
  await expect(tasks.initialize()).rejects.toThrow('Browser task storage is unavailable')
  expect(tasks.getState()).toBe('unavailable')
  tasks.close()
  client.clear()
})

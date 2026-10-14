import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import {
  createLifecycleEnvironment,
  lifecycleConfiguration,
  lifecyclePointQuery,
} from './task-lifecycle-native-environment'

let environment: Awaited<ReturnType<typeof createLifecycleEnvironment>>
beforeAll(async () => {
  environment = await createLifecycleEnvironment({ emptyWorkspace: true })
})
afterEach(async () => {
  await environment.reset()
}, 30_000)
afterAll(async () => {
  await environment.close()
})

it('deletes a completed task and its cached result without restoring it after a browser reopen', async () => {
  await environment.signIn('researcher')
  let page = await environment.open()
  const created = await page.evaluate(
    (input) => window.lifecycleTasks.create(input),
    lifecycleConfiguration,
  )
  if (!created.ok) throw new Error('Expected task')
  environment.advance(2_500)
  expect(
    await page.evaluate(({ id, query }) => window.lifecycleTasks.result(id, query), {
      id: created.task.id,
      query: lifecyclePointQuery,
    }),
  ).toMatchObject({ ok: true })
  expect(await page.evaluate((id) => window.lifecycleTasks.delete(id), created.task.id)).toEqual({
    ok: true,
  })
  expect(
    await page.evaluate((id) => window.lifecycleTasks.delete(id), created.task.id),
  ).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  for (const reopen of [false, true]) {
    if (reopen) page = await environment.reopen()
    expect(await page.evaluate(() => window.lifecycleTasks.list())).toEqual({
      tasks: [],
      issues: [],
    })
    expect(
      await page.evaluate((id) => window.lifecycleTasks.get(id), created.task.id),
    ).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    expect(
      await page.evaluate(({ id, query }) => window.lifecycleTasks.result(id, query), {
        id: created.task.id,
        query: lifecyclePointQuery,
      }),
    ).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  }
}, 30_000)

it.each(['get', 'list'] as const)(
  'does not resurrect a Running task when another tab deletes it during %s',
  async (operation) => {
    await environment.signIn('researcher')
    const page = await environment.open()
    const other = await environment.tab()
    const created = await page.evaluate(
      (input) => window.lifecycleTasks.create(input),
      lifecycleConfiguration,
    )
    if (!created.ok) throw new Error('Expected task')
    const held = environment.holdNext('read', page)
    const delayed = page.evaluate(
      async ({ id, operation }) =>
        operation === 'get' ? window.lifecycleTasks.get(id) : window.lifecycleTasks.list(),
      { id: created.task.id, operation },
    )
    // Observe rejection immediately too: a native transaction abort is not NOT_FOUND.
    const outcome = delayed.catch((error: Error) => ({ error: error.message }))
    try {
      await held.started
      expect(
        await other.evaluate((id) => window.lifecycleTasks.delete(id), created.task.id),
      ).toEqual({ ok: true })
    } finally {
      held.release()
    }
    expect(await outcome).toMatchObject(
      operation === 'get' ? { ok: false, code: 'NOT_FOUND' } : { tasks: [], issues: [] },
    )
    environment.advance(2_500)
    expect(
      await page.evaluate((id) => window.lifecycleTasks.get(id), created.task.id),
    ).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    expect(await other.evaluate(() => window.lifecycleTasks.list())).toEqual({
      tasks: [],
      issues: [],
    })
  },
  30_000,
)

it('discards a late generated result after deletion in another instance, without affecting a different task', async () => {
  await environment.signIn('researcher')
  const page = await environment.open()
  const other = await environment.tab()
  const created = await page.evaluate(
    (input) => window.lifecycleTasks.create(input),
    lifecycleConfiguration,
  )
  const kept = await page.evaluate(
    (input) => window.lifecycleTasks.create(input),
    lifecycleConfiguration,
  )
  if (!created.ok || !kept.ok) throw new Error('Expected tasks')
  environment.advance(2_500)
  const held = environment.holdNext('result', page)
  const delayed = page.evaluate(({ id, query }) => window.lifecycleTasks.result(id, query), {
    id: created.task.id,
    query: lifecyclePointQuery,
  })
  const outcome = delayed.catch((error: Error) => ({ error: error.message }))
  try {
    await held.started
    expect(await other.evaluate((id) => window.lifecycleTasks.delete(id), created.task.id)).toEqual(
      { ok: true },
    )
    expect(
      await other.evaluate((id) => window.lifecycleTasks.delete(id), created.task.id),
    ).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  } finally {
    held.release()
  }
  expect(await outcome).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  expect(await page.evaluate(() => window.lifecycleTasks.list())).toMatchObject({
    tasks: [{ id: kept.task.id }],
    issues: [],
  })
  expect(
    await page.evaluate(({ id, query }) => window.lifecycleTasks.result(id, query), {
      id: kept.task.id,
      query: lifecyclePointQuery,
    }),
  ).toMatchObject({ ok: true, taskId: kept.task.id })
}, 30_000)

it('discards a late submission at account switching while logout retains previously saved history', async () => {
  await environment.signIn('researcher')
  const page = await environment.open()
  const kept = await page.evaluate(
    (input) => window.lifecycleTasks.create(input),
    lifecycleConfiguration,
  )
  if (!kept.ok) throw new Error('Expected task')
  environment.advance(2_500)
  const before = await page.evaluate(({ id, query }) => window.lifecycleTasks.result(id, query), {
    id: kept.task.id,
    query: lifecyclePointQuery,
  })
  expect(before).toMatchObject({ ok: true })
  const held = environment.holdNext('submit', page)
  const delayed = page
    .evaluate((input) => window.lifecycleTasks.create(input), lifecycleConfiguration)
    .catch((error: Error) => ({ error: error.message }))
  try {
    await held.started
    await page.evaluate(() => window.lifecycleDiscard())
    expect(await page.evaluate(() => window.lifecycleTasks.getState())).toBe('waiting-for-client')
    await environment.signOut()
    await environment.signIn('policy')
    await page.evaluate(() => window.lifecycleMount())
  } finally {
    held.release()
  }
  expect(await delayed).toMatchObject({ error: expect.stringContaining('workspace was discarded') })
  expect(await page.evaluate(() => window.lifecycleTasks.list())).toEqual({ tasks: [], issues: [] })
  expect(await page.evaluate((id) => window.lifecycleTasks.get(id), kept.task.id)).toMatchObject({
    ok: false,
    code: 'NOT_FOUND',
  })
  expect(await page.evaluate((id) => window.lifecycleTasks.delete(id), kept.task.id)).toMatchObject(
    { ok: false, code: 'NOT_FOUND' },
  )
  expect(
    await page.evaluate(({ id, query }) => window.lifecycleTasks.result(id, query), {
      id: kept.task.id,
      query: lifecyclePointQuery,
    }),
  ).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  await page.evaluate(() => window.lifecycleDiscard())
  await environment.signOut()
  await environment.signIn('researcher')
  await page.evaluate(() => window.lifecycleMount())
  expect(await page.evaluate(() => window.lifecycleTasks.list())).toMatchObject({
    tasks: [{ id: kept.task.id }],
    issues: [],
  })
  expect(
    await page.evaluate(({ id, query }) => window.lifecycleTasks.result(id, query), {
      id: kept.task.id,
      query: lifecyclePointQuery,
    }),
  ).toEqual(before)
}, 30_000)

it.each(['get', 'list', 'delete', 'result', 'restore'] as const)(
  'rejects old-account %s responses even when they were not yet registered as Query reads',
  async (operation) => {
    await environment.signIn('researcher')
    const page = await environment.open()
    const created = await page.evaluate(
      (input) => window.lifecycleTasks.create(input),
      lifecycleConfiguration,
    )
    if (!created.ok) throw new Error('Expected task')
    const held = environment.holdNext(operation === 'restore' ? 'restore' : 'account', page)
    const delayed = page
      .evaluate(
        async ({ operation, task, query }) => {
          switch (operation) {
            case 'get':
              return window.lifecycleTasks.get(task.id)
            case 'list':
              return window.lifecycleTasks.list()
            case 'delete':
              return window.lifecycleTasks.delete(task.id)
            case 'result':
              return window.lifecycleTasks.result(task.id, query)
            case 'restore':
              return window.lifecycleTasks.restore({ ...task, id: 'late-backup' })
          }
        },
        { operation, task: created.task, query: lifecyclePointQuery },
      )
      .catch((error: Error) => ({ error: error.message }))
    try {
      await held.started
      await page.evaluate(() => window.lifecycleDiscard())
      await environment.signIn('policy')
      await page.evaluate(() => window.lifecycleMount())
    } finally {
      held.release()
    }
    expect(await delayed).toMatchObject({
      error: expect.stringContaining('workspace was discarded'),
    })
    expect(await page.evaluate(() => window.lifecycleTasks.list())).toEqual({
      tasks: [],
      issues: [],
    })
    await page.evaluate(() => window.lifecycleDiscard())
    await environment.signIn('researcher')
    await page.evaluate(() => window.lifecycleMount())
    expect(await page.evaluate(() => window.lifecycleTasks.list())).toMatchObject({
      tasks: [{ id: created.task.id }],
      issues: [],
    })
  },
  30_000,
)

it('omits a task deleted after its list reconciliation while another task response is still in flight', async () => {
  await environment.signIn('researcher')
  const page = await environment.open()
  const other = await environment.tab()
  const removed = await page.evaluate(
    (input) => window.lifecycleTasks.create(input),
    lifecycleConfiguration,
  )
  const kept = await page.evaluate(
    (input) => window.lifecycleTasks.create(input),
    lifecycleConfiguration,
  )
  if (!removed.ok || !kept.ok) throw new Error('Expected tasks')
  const held = environment.holdNext('read', page, kept.task.id)
  const delayed = page.evaluate(() => window.lifecycleTasks.list())
  try {
    await held.started
    // An independent public read finishes the unheld task while the list still waits on the other.
    expect(
      await page.evaluate((id) => window.lifecycleTasks.get(id), removed.task.id),
    ).toMatchObject({ ok: true })
    expect(await other.evaluate((id) => window.lifecycleTasks.delete(id), removed.task.id)).toEqual(
      { ok: true },
    )
  } finally {
    held.release()
  }
  expect(await delayed).toMatchObject({ tasks: [{ id: kept.task.id }], issues: [] })
}, 30_000)

it.each(['get', 'list', 'result'] as const)(
  'cancels an in-flight %s in the deleting instance and leaves unrelated tasks readable',
  async (operation) => {
    await environment.signIn('researcher')
    const page = await environment.open()
    const removed = await page.evaluate(
      (input) => window.lifecycleTasks.create(input),
      lifecycleConfiguration,
    )
    const kept = await page.evaluate(
      (input) => window.lifecycleTasks.create(input),
      lifecycleConfiguration,
    )
    if (!removed.ok || !kept.ok) throw new Error('Expected tasks')
    environment.advance(2_500)
    const held = environment.holdNext(operation === 'result' ? 'result' : 'read', page)
    const delayed = page
      .evaluate(
        async ({ operation, id, query }) => {
          switch (operation) {
            case 'get':
              return window.lifecycleTasks.get(id)
            case 'list':
              return window.lifecycleTasks.list()
            case 'result':
              return window.lifecycleTasks.result(id, query)
          }
        },
        { operation, id: removed.task.id, query: lifecyclePointQuery },
      )
      .catch((error: Error) => ({ error: error.message }))
    try {
      await held.started
      expect(
        await page.evaluate((id) => window.lifecycleTasks.delete(id), removed.task.id),
      ).toEqual({ ok: true })
    } finally {
      held.release()
    }
    expect(await delayed).toMatchObject({ error: expect.stringContaining('CancelledError') })
    expect(
      await page.evaluate((id) => window.lifecycleTasks.get(id), removed.task.id),
    ).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    expect(await page.evaluate(() => window.lifecycleTasks.list())).toMatchObject({
      tasks: [{ id: kept.task.id }],
      issues: [],
    })
    expect(
      await page.evaluate(({ id, query }) => window.lifecycleTasks.result(id, query), {
        id: kept.task.id,
        query: lifecyclePointQuery,
      }),
    ).toMatchObject({ ok: true, taskId: kept.task.id })
  },
  30_000,
)

it.each(['get', 'list', 'result'] as const)(
  'cancels a registered %s when switching accounts without leaking late old-account data',
  async (operation) => {
    await environment.signIn('researcher')
    const page = await environment.open()
    const created = await page.evaluate(
      (input) => window.lifecycleTasks.create(input),
      lifecycleConfiguration,
    )
    if (!created.ok) throw new Error('Expected task')
    environment.advance(2_500)
    const held = environment.holdNext(operation === 'result' ? 'result' : 'read', page)
    const delayed = page
      .evaluate(
        async ({ operation, id, query }) => {
          switch (operation) {
            case 'get':
              return window.lifecycleTasks.get(id)
            case 'list':
              return window.lifecycleTasks.list()
            case 'result':
              return window.lifecycleTasks.result(id, query)
          }
        },
        { operation, id: created.task.id, query: lifecyclePointQuery },
      )
      .catch((error: Error) => ({ error: error.message }))
    try {
      await held.started
      await page.evaluate(() => window.lifecycleDiscard())
      await environment.signOut()
      await environment.signIn('agriculture')
      await page.evaluate(() => window.lifecycleMount())
    } finally {
      held.release()
    }
    expect(await delayed).toMatchObject({ error: expect.stringContaining('CancelledError') })
    expect(await page.evaluate(() => window.lifecycleTasks.list())).toEqual({
      tasks: [],
      issues: [],
    })
    expect(
      await page.evaluate(({ id, query }) => window.lifecycleTasks.result(id, query), {
        id: created.task.id,
        query: lifecyclePointQuery,
      }),
    ).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    await page.evaluate(() => window.lifecycleDiscard())
    await environment.signIn('researcher')
    await page.evaluate(() => window.lifecycleMount())
    expect(
      await page.evaluate(({ id, query }) => window.lifecycleTasks.result(id, query), {
        id: created.task.id,
        query: lifecyclePointQuery,
      }),
    ).toMatchObject({ ok: true, taskId: created.task.id })
  },
  30_000,
)

it('serializes simultaneous deletion across tabs and keeps the task absent after reinitialization and login', async () => {
  await environment.signIn('researcher')
  const page = await environment.open()
  const other = await environment.tab()
  const created = await page.evaluate(
    (input) => window.lifecycleTasks.create(input),
    lifecycleConfiguration,
  )
  if (!created.ok) throw new Error('Expected task')
  const replies = await Promise.all([
    page.evaluate((id) => window.lifecycleTasks.delete(id), created.task.id),
    other.evaluate((id) => window.lifecycleTasks.delete(id), created.task.id),
  ])
  expect(replies.filter((reply) => reply.ok)).toEqual([{ ok: true }])
  expect(replies.filter((reply) => !reply.ok)).toMatchObject([{ ok: false, code: 'NOT_FOUND' }])
  await page.evaluate(async () => {
    window.lifecycleTasks.close()
    await window.lifecycleTasks.initialize()
  })
  expect(await page.evaluate((id) => window.lifecycleTasks.get(id), created.task.id)).toMatchObject(
    { ok: false, code: 'NOT_FOUND' },
  )
  await page.evaluate(() => window.lifecycleDiscard())
  await environment.signOut()
  await environment.signIn('researcher')
  await page.evaluate(() => window.lifecycleMount())
  expect(await page.evaluate(() => window.lifecycleTasks.list())).toEqual({ tasks: [], issues: [] })
}, 30_000)

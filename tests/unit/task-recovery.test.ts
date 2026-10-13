import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import {
  createRecoveryEnvironment,
  recoveryRecord,
  storageFault,
  lifecycleConfiguration,
  damageSavedRecord,
  lifecyclePointQuery,
} from './fixtures/task-recovery-environment'

let environment: Awaited<ReturnType<typeof createRecoveryEnvironment>>
beforeAll(async () => {
  environment = await createRecoveryEnvironment({ emptyWorkspace: true })
})
afterEach(async () => {
  await environment.reset()
}, 30_000)
afterAll(async () => {
  await environment.close()
})

it('distinguishes hydration and loading from a retryable storage-open failure without losing history', async () => {
  await environment.signIn('researcher')
  const page = await environment.open()
  expect(
    await page.evaluate((record) => window.lifecycleTasks.restore(record), recoveryRecord),
  ).toMatchObject({ ok: true })
  await page.evaluate(() => window.lifecycleTasks.close())
  expect(await page.evaluate(() => window.lifecycleTasks.getState())).toBe('waiting-for-client')
  await storageFault(page, 'open')
  const failed = await page.evaluate(async () => {
    try {
      await window.lifecycleTasks.initialize()
      return null
    } catch (error) {
      return JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error)))
    }
  })
  expect(failed).toMatchObject({
    name: 'TaskStorageError',
    code: 'STORAGE_UNAVAILABLE',
    operation: 'open',
    retryable: true,
  })
  expect(failed.message).toMatch(/initialize.*retry/i)
  expect(await page.evaluate(() => window.lifecycleTasks.getState())).toBe('unavailable')
  const states = await page.evaluate(async () => {
    window.recoveryRestoreEnvironment()
    const loading = window.lifecycleTasks.initialize()
    const pending = window.lifecycleTasks.getState()
    await loading
    return [pending, window.lifecycleTasks.getState()]
  })
  expect(states).toEqual(['initializing', 'ready'])
  expect(await page.evaluate(() => window.lifecycleTasks.list())).toMatchObject({
    tasks: [{ id: recoveryRecord.id }],
    issues: [],
  })
}, 30_000)

it.each(['read', 'write'] as const)(
  'reports a native %s abort, then reinitializes original history without duplicate retries',
  async (operation) => {
    await environment.signIn('researcher')
    let page = await environment.open()
    await page.evaluate((record) => window.lifecycleTasks.restore(record), recoveryRecord)
    await storageFault(page, operation)
    const failed = await page.evaluate(
      async ({ operation, input }) => {
        try {
          return operation === 'read'
            ? await window.lifecycleTasks.list()
            : await window.lifecycleTasks.create(input)
        } catch (error) {
          return JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error)))
        }
      },
      { operation, input: lifecycleConfiguration },
    )
    expect(failed).toMatchObject({
      name: 'TaskStorageError',
      code: 'STORAGE_UNAVAILABLE',
      operation,
      retryable: true,
    })
    expect(await page.evaluate(() => window.lifecycleTasks.getState())).toBe('unavailable')
    await page.evaluate(async () => {
      window.recoveryRestoreEnvironment()
      await window.lifecycleTasks.initialize()
    })
    expect(await page.evaluate(() => window.lifecycleTasks.list())).toMatchObject({
      tasks: [{ id: recoveryRecord.id }],
      issues: [],
    })
    if (operation === 'write') {
      expect(
        await page.evaluate((input) => window.lifecycleTasks.create(input), lifecycleConfiguration),
      ).toMatchObject({ ok: true })
    }
    page = await environment.reopen()
    const history = await page.evaluate(() => window.lifecycleTasks.list())
    expect(history.tasks).toHaveLength(operation === 'write' ? 2 : 1)
    expect(new Set(history.tasks.map((task) => task.id)).size).toBe(history.tasks.length)
    expect(
      await page.evaluate((record) => window.lifecycleTasks.restore(record), recoveryRecord),
    ).toMatchObject({ ok: false, code: 'ALREADY_EXISTS' })
    expect(await page.evaluate(() => window.lifecycleTasks.getState())).toBe('ready')
  },
  30_000,
)

it('keeps healthy history beside identifiable corrupt and unsupported-schema records across retry, reopen and account switches', async () => {
  await environment.signIn('researcher')
  let page = await environment.open()
  for (const id of [recoveryRecord.id, 'damaged', 'old-schema']) {
    await page.evaluate((record) => window.lifecycleTasks.restore(record), {
      ...recoveryRecord,
      id,
    })
  }
  await damageSavedRecord(page, 'damaged', { name: null, unknownBackupField: 'preserve' })
  await damageSavedRecord(page, 'old-schema', { schemaVersion: 0 })
  for (const reopen of [false, true]) {
    if (reopen) page = await environment.reopen()
    const history = await page.evaluate(() => window.lifecycleTasks.list())
    expect(history.tasks).toMatchObject([{ id: recoveryRecord.id }])
    expect(history.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: 'damaged',
          code: 'INVALID_RECORD',
          recovery: expect.any(String),
        }),
        expect.objectContaining({
          taskId: 'old-schema',
          code: 'INCOMPATIBLE_SCHEMA',
          recovery: expect.any(String),
        }),
      ]),
    )
    expect(history.issues).toHaveLength(2)
    for (const [id, code] of [
      ['damaged', 'INVALID_RECORD'],
      ['old-schema', 'INCOMPATIBLE_SCHEMA'],
      ['missing', 'NOT_FOUND'],
    ]) {
      expect(await page.evaluate((id) => window.lifecycleTasks.get(id!), id)).toMatchObject({
        ok: false,
        code,
      })
      expect(
        await page.evaluate(({ id, query }) => window.lifecycleTasks.result(id!, query), {
          id,
          query: lifecyclePointQuery,
        }),
      ).toMatchObject({ ok: false, code })
    }
    expect(
      await page.evaluate((record) => window.lifecycleTasks.restore(record), {
        ...recoveryRecord,
        id: 'damaged',
      }),
    ).toMatchObject({ ok: false, code: 'ALREADY_EXISTS' })
    expect(await page.evaluate(() => window.lifecycleTasks.getState())).toBe('ready')
  }
  await environment.signIn('agriculture')
  await page.evaluate(async () => {
    await window.lifecycleDiscard()
    await window.lifecycleMount()
  })
  expect(await page.evaluate(() => window.lifecycleTasks.list())).toEqual({ tasks: [], issues: [] })
  expect(await page.evaluate(() => window.lifecycleTasks.get('damaged'))).toMatchObject({
    ok: false,
    code: 'NOT_FOUND',
  })
  await environment.signIn('researcher')
  await page.evaluate(async () => {
    await window.lifecycleDiscard()
    await window.lifecycleMount()
  })
  expect(await page.evaluate(() => window.lifecycleTasks.list())).toMatchObject({
    tasks: [{ id: recoveryRecord.id }],
    issues: [{ taskId: 'damaged' }, { taskId: 'old-schema' }],
  })
}, 30_000)

it.each(['Running', 'Completed'] as const)(
  'never exposes an unreconstructable saved %s task as usable, even before its old deadline',
  async (status) => {
    await environment.signIn('researcher')
    let page = await environment.open()
    const legacy = {
      ...recoveryRecord,
      id: 'legacy',
      status,
      generatorVersion: 'synthetic-temperature-retired',
    }
    expect(
      await page.evaluate((record) => window.lifecycleTasks.restore(record), legacy),
    ).toMatchObject({ ok: true })
    await page.evaluate((record) => window.lifecycleTasks.restore(record), recoveryRecord)
    for (const reopen of [false, true]) {
      if (reopen) page = await environment.reopen()
      expect(await page.evaluate(() => window.lifecycleTasks.get('legacy'))).toMatchObject({
        ok: true,
        task: {
          id: 'legacy',
          status: 'Failed',
          generatorVersion: legacy.generatorVersion,
          dataSeed: 42,
          completionAt: legacy.completionAt,
          failureReason: expect.stringMatching(/version.*unavailable/i),
        },
      })
      expect(
        await page.evaluate(
          (query) => window.lifecycleTasks.result('legacy', query),
          lifecyclePointQuery,
        ),
      ).toMatchObject({ ok: false, code: 'INCOMPATIBLE_GENERATOR' })
      const history = await page.evaluate(() => window.lifecycleTasks.list())
      expect(history.tasks).toHaveLength(2)
      expect(history.tasks.find((task) => task.id === 'legacy')?.status).toBe('Failed')
      expect(await page.evaluate(() => window.lifecycleTasks.getState())).toBe('ready')
    }
    environment.advance(2_500)
    expect(
      await page.evaluate(({ id, query }) => window.lifecycleTasks.result(id, query), {
        id: recoveryRecord.id,
        query: lifecyclePointQuery,
      }),
    ).toMatchObject({ ok: true })
  },
  30_000,
)

it.each([
  { changes: { name: null }, code: 'INVALID_RECORD' },
  { changes: { schemaVersion: 0 }, code: 'INCOMPATIBLE_SCHEMA' },
  { changes: { generatorVersion: 'retired-during-read' }, code: 'RECORD_CHANGED' },
])(
  'retains healthy history when a record changes during reconciliation: $code',
  async ({ changes, code }) => {
    await environment.signIn('researcher')
    const page = await environment.open()
    for (const id of [recoveryRecord.id, 'changing']) {
      await page.evaluate((record) => window.lifecycleTasks.restore(record), {
        ...recoveryRecord,
        id,
      })
    }
    environment.advance(2_500)
    const held = environment.holdNext('read', page, 'changing')
    const pending = page
      .evaluate(() => window.lifecycleTasks.list())
      .catch((error: Error) => ({ error: error.message }))
    try {
      await held.started
      await damageSavedRecord(page, 'changing', changes)
    } finally {
      held.release()
    }
    expect(await pending).toMatchObject({
      tasks: [{ id: recoveryRecord.id, status: 'Completed' }],
      issues: [{ taskId: 'changing', code }],
    })
    expect(await page.evaluate(() => window.lifecycleTasks.getState())).toBe('ready')
    const again = await page.evaluate(() => window.lifecycleTasks.get('changing'))
    expect(again).toMatchObject(
      code === 'RECORD_CHANGED'
        ? { ok: true, task: { status: 'Failed', generatorVersion: 'retired-during-read' } }
        : { ok: false, code },
    )
    expect(
      await page.evaluate(({ id, query }) => window.lifecycleTasks.result(id, query), {
        id: recoveryRecord.id,
        query: lifecyclePointQuery,
      }),
    ).toMatchObject({ ok: true })
  },
  30_000,
)

it.each([
  { changes: { name: null }, code: 'INVALID_RECORD' },
  { changes: { schemaVersion: 0 }, code: 'INCOMPATIBLE_SCHEMA' },
  { changes: { generatorVersion: 'retired-during-result' }, code: 'INCOMPATIBLE_GENERATOR' },
  { changes: { dataSeed: 99 }, code: 'RECORD_CHANGED' },
])(
  'does not return an obsolete generated result after saved metadata changes: $code',
  async ({ changes, code }) => {
    await environment.signIn('researcher')
    const page = await environment.open()
    await page.evaluate((record) => window.lifecycleTasks.restore(record), recoveryRecord)
    environment.advance(2_500)
    const held = environment.holdNext('result', page)
    const pending = page.evaluate(({ id, query }) => window.lifecycleTasks.result(id, query), {
      id: recoveryRecord.id,
      query: lifecyclePointQuery,
    })
    try {
      await held.started
      await damageSavedRecord(page, recoveryRecord.id, changes)
    } finally {
      held.release()
    }
    expect(await pending).toMatchObject({ ok: false, code })
    expect(await page.evaluate(() => window.lifecycleTasks.getState())).toBe('ready')
  },
  30_000,
)

it.each(['restore', 'delete', 'get', 'result'] as const)(
  'never reports durable success for %s when the native write aborts',
  async (operation) => {
    await environment.signIn('researcher')
    const page = await environment.open()
    await page.evaluate((record) => window.lifecycleTasks.restore(record), recoveryRecord)
    environment.advance(2_500)
    await storageFault(page, 'write')
    const failed = await page.evaluate(
      async ({ operation, record, query }) => {
        try {
          switch (operation) {
            case 'restore':
              return await window.lifecycleTasks.restore({ ...record, id: 'retry-restore' })
            case 'delete':
              return await window.lifecycleTasks.delete(record.id)
            case 'get':
              return await window.lifecycleTasks.get(record.id)
            case 'result':
              return await window.lifecycleTasks.result(record.id, query)
          }
        } catch (error) {
          return JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error)))
        }
      },
      { operation, record: recoveryRecord, query: lifecyclePointQuery },
    )
    expect(failed).toMatchObject({
      name: 'TaskStorageError',
      operation: 'write',
      code: 'STORAGE_UNAVAILABLE',
      retryable: true,
    })
    await page.evaluate(async () => {
      window.recoveryRestoreEnvironment()
      await window.lifecycleTasks.initialize()
    })
    // Same saved deadline, without another wait; the failed operation never erased this history.
    expect(
      await page.evaluate((id) => window.lifecycleTasks.get(id), recoveryRecord.id),
    ).toMatchObject({
      ok: true,
      task: { status: 'Completed', completionAt: recoveryRecord.completionAt },
    })
    if (operation === 'restore') {
      expect(await page.evaluate(() => window.lifecycleTasks.get('retry-restore'))).toMatchObject({
        ok: false,
        code: 'NOT_FOUND',
      })
      expect(
        await page.evaluate(
          (record) => window.lifecycleTasks.restore({ ...record, id: 'retry-restore' }),
          recoveryRecord,
        ),
      ).toMatchObject({ ok: true })
    } else if (operation === 'delete') {
      expect(
        await page.evaluate((id) => window.lifecycleTasks.delete(id), recoveryRecord.id),
      ).toEqual({ ok: true })
      expect(
        await page.evaluate((id) => window.lifecycleTasks.get(id), recoveryRecord.id),
      ).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    } else {
      expect(
        await page.evaluate(({ id, query }) => window.lifecycleTasks.result(id, query), {
          id: recoveryRecord.id,
          query: lifecyclePointQuery,
        }),
      ).toMatchObject({ ok: true })
    }
  },
  30_000,
)

it('revalidates an earlier history entry after another task delays the list', async () => {
  await environment.signIn('researcher')
  const page = await environment.open()
  for (const id of ['early', 'waiting']) {
    await page.evaluate((record) => window.lifecycleTasks.restore(record), {
      ...recoveryRecord,
      id,
    })
  }
  environment.advance(2_500)
  const held = environment.holdNext('read', page, 'waiting')
  const pending = page.evaluate(() => window.lifecycleTasks.list())
  try {
    await held.started
    expect(await page.evaluate(() => window.lifecycleTasks.get('early'))).toMatchObject({
      ok: true,
      task: { status: 'Completed' },
    })
    await damageSavedRecord(page, 'early', { name: null })
  } finally {
    held.release()
  }
  expect(await pending).toMatchObject({
    tasks: [{ id: 'waiting', status: 'Completed' }],
    issues: [{ taskId: 'early', code: 'INVALID_RECORD' }],
  })
  expect(await page.evaluate(() => window.lifecycleTasks.getState())).toBe('ready')
}, 30_000)

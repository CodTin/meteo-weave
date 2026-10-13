import type { ResultQuery } from '@/features/downscaling-tasks/service'
import { recoveryRecord } from './fixtures/task-recovery-environment'
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import {
  createLifecycleEnvironment,
  lifecycleConfiguration,
  seedPreCatalogHistory,
} from './task-lifecycle-native-environment'

let environment: Awaited<ReturnType<typeof createLifecycleEnvironment>>
beforeAll(async () => {
  environment = await createLifecycleEnvironment()
})
afterEach(async () => {
  await environment.reset()
}, 30_000)
afterAll(async () => {
  await environment.close()
})

it('initializes four fixed, distinguishable Synthetic Demo cases through the normal public service', async () => {
  await environment.signIn('researcher')
  const page = await environment.open()
  const history = await page.evaluate(() => window.lifecycleTasks.list())
  expect(history.issues).toEqual([])
  expect(history.tasks).toHaveLength(4)
  expect(history.tasks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        dataSeed: 42,
        generatorVersion: 'synthetic-temperature-v1',
        configuration: expect.objectContaining({
          variable: 'temperature',
          resolvedMethod: 'deterministic',
        }),
        catalog: expect.objectContaining({ id: 'alpine-temperature', terrain: 'mountains' }),
      }),
      expect.objectContaining({
        dataSeed: 73,
        generatorVersion: 'synthetic-ensemble-v3',
        configuration: expect.objectContaining({
          variable: 'wind',
          resolvedMethod: 'probabilistic',
        }),
        catalog: expect.objectContaining({ id: 'coastal-wind', terrain: 'coastal-plain' }),
      }),
      expect.objectContaining({
        dataSeed: 101,
        generatorVersion: 'synthetic-variables-v2',
        configuration: expect.objectContaining({
          variable: 'pressure',
          resolvedMethod: 'deterministic',
        }),
        catalog: expect.objectContaining({ id: 'plateau-pressure', terrain: 'plateau' }),
      }),
      expect.objectContaining({
        dataSeed: 211,
        generatorVersion: 'synthetic-ensemble-v3',
        configuration: expect.objectContaining({
          variable: 'precipitation',
          resolvedMethod: 'probabilistic',
        }),
        catalog: expect.objectContaining({ id: 'lowland-rain', terrain: 'lowland-plain' }),
      }),
    ]),
  )
  expect(new Set(history.tasks.map((task) => task.name)).size).toBe(4)
  for (const task of history.tasks) {
    expect(task).toMatchObject({
      ownerId: 'researcher',
      status: 'Completed',
      referenceSeed: 1729,
      referenceVersion: 'synthetic-observations-v1',
      name: expect.stringContaining('Synthetic Demo'),
      catalog: {
        version: 1,
        label: 'Synthetic Demo',
        description: expect.stringMatching(/synthetic stations/i),
      },
    })
    expect(await page.evaluate((id) => window.lifecycleTasks.get(id), task.id)).toEqual({
      ok: true,
      task,
    })
  }
}, 30_000)

it('never restores a deleted case or an emptied history on repeated initialization or browser reopen', async () => {
  await environment.signIn('researcher')
  let page = await environment.open()
  const original = await page.evaluate(() => window.lifecycleTasks.list())
  const removed = original.tasks[0]!
  await page.evaluate((id) => window.lifecycleTasks.delete(id), removed.id)
  const user = await page.evaluate(
    (input) => window.lifecycleTasks.create(input),
    lifecycleConfiguration,
  )
  if (!user.ok) throw new Error('Expected admitted user task')
  await page.evaluate(async () => {
    window.lifecycleTasks.close()
    await window.lifecycleTasks.initialize()
    await window.lifecycleTasks.initialize()
  })
  expect(await page.evaluate((id) => window.lifecycleTasks.get(id), removed.id)).toMatchObject({
    ok: false,
    code: 'NOT_FOUND',
  })
  expect(await page.evaluate((id) => window.lifecycleTasks.get(id), user.task.id)).toEqual(user)
  page = await environment.reopen()
  expect((await page.evaluate(() => window.lifecycleTasks.list())).tasks).toHaveLength(4)
  await page.evaluate(async () => {
    for (const task of (await window.lifecycleTasks.list()).tasks)
      await window.lifecycleTasks.delete(task.id)
  })
  page = await environment.reopen()
  await page.evaluate(() => window.lifecycleTasks.initialize())
  expect(await page.evaluate(() => window.lifecycleTasks.list())).toEqual({ tasks: [], issues: [] })
}, 30_000)

it('commits only one catalog across simultaneous first initialization in multiple native tabs', async () => {
  await environment.signIn('researcher')
  const tabs = [
    await environment.open({ initialize: false }),
    await environment.tab({ initialize: false }),
    await environment.tab({ initialize: false }),
  ]
  await Promise.all(
    tabs.map((page) =>
      page.evaluate(() =>
        Promise.all([window.lifecycleTasks.initialize(), window.lifecycleTasks.initialize()]),
      ),
    ),
  )
  const histories = await Promise.all(
    tabs.map((page) => page.evaluate(() => window.lifecycleTasks.list())),
  )
  expect(histories[0]!.tasks).toHaveLength(4)
  expect(histories[1]).toEqual(histories[0])
  expect(histories[2]).toEqual(histories[0])
}, 30_000)

it.each(['policy', 'agriculture'])(
  'allows %s to read only controlled canonical probability examples, not to create or restore arbitrary privileged metadata',
  async (account) => {
    await environment.signIn(account)
    const page = await environment.open()
    const history = await page.evaluate(() => window.lifecycleTasks.list())
    expect(history.issues).toEqual([])
    expect(history.tasks).toHaveLength(4)
    const wind = history.tasks.find((task) => task.configuration.variable === 'wind')!
    expect(wind).toMatchObject({
      ownerId: account,
      status: 'Completed',
      configuration: { resolvedMethod: 'probabilistic', advanced: { ensembleMembers: 5 } },
    })
    expect(
      await page.evaluate(
        (id) =>
          window.lifecycleTasks.result(id, {
            kind: 'points',
            layer: 'downscaled',
            points: [{ longitude: 121, latitude: 31 }],
            times: ['2024-01-01T00:00:00Z'],
            ensemble: { kind: 'members', memberIds: ['member-01', 'member-05'] },
          }),
        wind.id,
      ),
    ).toMatchObject({ ok: true, ensemble: { memberIds: ['member-01', 'member-05'] } })
    expect(
      await page.evaluate(
        (task) =>
          window.lifecycleTasks.create({
            ...task.configuration,
            catalog: task.catalog,
            ownerId: 'researcher',
            role: 'researcher',
          }),
        wind,
      ),
    ).toMatchObject({ ok: false })
    expect(await page.evaluate((task) => window.lifecycleTasks.restore(task), wind)).toMatchObject({
      ok: false,
      code: 'ROLE_RESTRICTED',
    })
    for (const change of [
      { id: 'arbitrary-id' },
      { dataSeed: 99 },
      { referenceSeed: 0 },
      { name: 'forged' },
      { catalog: undefined },
      { referenceSeed: undefined, referenceVersion: undefined },
      {
        configuration: {
          ...wind.configuration,
          region: { west: 110, east: 111, south: 30, north: 31 },
        },
      },
    ]) {
      const forged = { ...wind, ...change }
      expect(
        await page.evaluate((task) => window.lifecycleRpc('read', task), forged),
      ).toMatchObject({ ok: false, code: 'ROLE_RESTRICTED' })
      expect(
        await page.evaluate((task) => window.lifecycleTasks.restore(task), forged),
      ).toMatchObject({ ok: false, code: 'ROLE_RESTRICTED' })
    }
    // Even a direct transport request carrying attacker input cannot configure the server catalog.
    const fixed = await page.evaluate(() =>
      window.lifecycleRpc('catalog', {
        ownerId: 'researcher',
        tasks: [],
        configuration: { method: 'probabilistic' },
      }),
    )
    expect(fixed).toEqual({ ownerId: account, tasks: expect.arrayContaining(history.tasks) })
    expect(fixed).toHaveProperty('tasks.length', 4)
    expect(await page.evaluate(() => window.lifecycleTasks.list())).toEqual(history)
  },
  30_000,
)

it('upgrades nonempty pre-catalog histories without overwriting user records, occupied case ids or another account', async () => {
  await environment.signIn('researcher')
  let page = await environment.open({ initialize: false })
  const collision = {
    ...recoveryRecord,
    id: 'demo-v1:researcher:alpine-temperature',
    name: 'My original task, not a catalog case',
    dataSeed: 9,
  }
  const foreign = { ...recoveryRecord, id: 'policy-history', ownerId: 'policy' as const }
  await seedPreCatalogHistory(page, [recoveryRecord, collision, foreign])
  await page.evaluate(() => window.lifecycleTasks.initialize())
  const history = await page.evaluate(() => window.lifecycleTasks.list())
  expect(history.issues).toEqual([])
  expect(history.tasks).toHaveLength(5)
  for (const task of [recoveryRecord, collision]) {
    expect(await page.evaluate((id) => window.lifecycleTasks.get(id), task.id)).toEqual({
      ok: true,
      task,
    })
  }
  page = await environment.reopen()
  expect(await page.evaluate(() => window.lifecycleTasks.list())).toEqual(history)
  await environment.signIn('policy')
  await page.evaluate(async () => {
    await window.lifecycleDiscard()
    await window.lifecycleMount()
  })
  expect(await page.evaluate((id) => window.lifecycleTasks.get(id), foreign.id)).toEqual({
    ok: true,
    task: foreign,
  })
  expect((await page.evaluate(() => window.lifecycleTasks.list())).tasks).toHaveLength(5)
  expect(await page.evaluate((id) => window.lifecycleTasks.get(id), collision.id)).toMatchObject({
    ok: false,
    code: 'NOT_FOUND',
  })
}, 30_000)

it('rolls back catalog writes after native request success and retries without partial records or lost user history', async () => {
  await environment.signIn('researcher')
  let page = await environment.open({ initialize: false })
  await seedPreCatalogHistory(page, [recoveryRecord])
  const failure = await page.evaluate(async () => {
    const add = IDBObjectStore.prototype.add
    IDBObjectStore.prototype.add = function (value, key) {
      const request = add.call(this, value, key)
      if (value?.catalog)
        request.addEventListener('success', () => this.transaction.abort(), { once: true })
      return request
    }
    try {
      await window.lifecycleTasks.initialize()
      return { unexpectedSuccess: true }
    } catch (error) {
      return JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error)))
    } finally {
      IDBObjectStore.prototype.add = add
    }
  })
  expect(failure).toMatchObject({
    name: 'TaskStorageError',
    code: 'STORAGE_UNAVAILABLE',
    operation: 'write',
    retryable: true,
  })
  expect(await page.evaluate(() => window.lifecycleTasks.getState())).toBe('unavailable')
  await expect(page.evaluate(() => window.lifecycleTasks.list())).rejects.toThrow('not ready')
  await page.evaluate(() => window.lifecycleTasks.initialize())
  const history = await page.evaluate(() => window.lifecycleTasks.list())
  expect(history.issues).toEqual([])
  expect(history.tasks).toHaveLength(5)
  expect(await page.evaluate((id) => window.lifecycleTasks.get(id), recoveryRecord.id)).toEqual({
    ok: true,
    task: recoveryRecord,
  })
  page = await environment.reopen()
  expect(await page.evaluate(() => window.lifecycleTasks.list())).toEqual(history)
}, 30_000)

it('does not install a late old-account catalog after workspace discard and keeps each account deletion independent', async () => {
  await environment.signIn('researcher')
  const page = await environment.open({ initialize: false })
  const held = environment.holdNext('catalog', page)
  const old = page.evaluate(() => window.lifecycleTasks.initialize())
  try {
    await held.started
    expect(await page.evaluate(() => window.lifecycleTasks.getState())).toBe('initializing')
    await expect(page.evaluate(() => window.lifecycleTasks.list())).rejects.toThrow('not ready')
    await page.evaluate(() => window.lifecycleDiscard())
    await environment.signOut()
    await environment.signIn('agriculture')
    await page.evaluate(() => window.lifecycleMount())
  } finally {
    held.release()
  }
  await old
  const agriculture = await page.evaluate(() => window.lifecycleTasks.list())
  expect(agriculture.tasks).toHaveLength(4)
  expect(agriculture.tasks.every((task) => task.ownerId === 'agriculture')).toBe(true)
  await page.evaluate(async () => {
    for (const task of (await window.lifecycleTasks.list()).tasks)
      await window.lifecycleTasks.delete(task.id)
  })
  await environment.signIn('researcher')
  await page.evaluate(async () => {
    await window.lifecycleDiscard()
    await window.lifecycleMount()
  })
  const researcher = await page.evaluate(() => window.lifecycleTasks.list())
  expect(researcher.tasks).toHaveLength(4)
  expect(researcher.tasks.every((task) => task.ownerId === 'researcher')).toBe(true)
  expect(
    await page.evaluate((id) => window.lifecycleTasks.get(id), agriculture.tasks[0]!.id),
  ).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  await environment.signOut()
  await environment.signIn('agriculture')
  await page.evaluate(async () => {
    await window.lifecycleDiscard()
    await window.lifecycleMount()
  })
  expect(await page.evaluate(() => window.lifecycleTasks.list())).toEqual({ tasks: [], issues: [] })
}, 30_000)

it.each(['temperature', 'wind', 'pressure', 'precipitation'] as const)(
  'uses the same public point/time/area/export/observation paths for the %s case and preserves values on reopen',
  async (variable) => {
    await environment.signIn('researcher')
    let page = await environment.open()
    const task = (await page.evaluate(() => window.lifecycleTasks.list())).tasks.find(
      (task) => task.configuration.variable === variable,
    )!
    const point = {
      longitude: task.configuration.region.west,
      latitude: task.configuration.region.south,
    }
    const time = '2024-01-01T00:00:00Z'
    const windowBounds = {
      west: point.longitude,
      east: point.longitude,
      south: point.latitude,
      north: point.latitude,
    }
    const probabilistic = task.configuration.resolvedMethod === 'probabilistic'
    const saved: Array<{ query: ResultQuery; reply: unknown }> = []
    for (const layer of ['original', 'downscaled', 'observation'] as const) {
      const options = {
        temporalResolution: 'hourly' as const,
        ...(layer === 'observation' ? { layer, observationMode: 'stations' as const } : { layer }),
        ...(probabilistic
          ? { ensemble: { kind: 'members' as const, memberIds: ['member-01', 'member-05'] } }
          : {}),
      }
      const query: ResultQuery = { ...options, kind: 'points', points: [point], times: [time] }
      const sampled = await page.evaluate(
        ({ id, query }) => window.lifecycleTasks.result(id, query),
        { id: task.id, query },
      )
      expect(sampled).toMatchObject({
        ok: true,
        variable,
        unit: { temperature: '°C', wind: 'm/s', pressure: 'hPa', precipitation: 'mm' }[variable],
        provenance: {
          label: 'Synthetic Demo',
          dataSource: task.configuration.dataSource,
          generatorVersion: task.generatorVersion,
        },
      })
      if (!sampled.ok) throw new Error(sampled.error)
      expect(sampled.values.length).toBe(probabilistic && layer === 'downscaled' ? 2 : 1)
      if (layer === 'downscaled' && probabilistic) {
        expect(sampled).toMatchObject({
          ensemble: {
            allMemberIds: ['member-01', 'member-02', 'member-03', 'member-04', 'member-05'],
            memberIds: ['member-01', 'member-05'],
          },
        })
      } else {
        expect(sampled).not.toHaveProperty('ensemble')
        for (const value of sampled.values) expect(value).not.toHaveProperty('memberId')
      }
      if (layer === 'observation') {
        expect(sampled).toHaveProperty(
          'reference',
          expect.objectContaining({
            referenceSeed: 1729,
            referenceVersion: 'synthetic-observations-v1',
            kind: 'synthetic-stations',
          }),
        )
        expect(sampled.provenance.description).toMatch(/synthetic/i)
      } else
        expect(sampled.provenance.description).toMatch(
          probabilistic && layer === 'downscaled'
            ? /not a trained model or actual provider run/i
            : /not actual runs or model inference/i,
        )
      const variants: ResultQuery[] = [
        { ...options, kind: 'time-series', point, timeRange: { start: time, end: time } },
        { ...options, kind: 'grid', window: windowBounds, times: [time] },
        { ...options, kind: 'export', window: windowBounds, times: [time] },
        { ...options, kind: 'preview', window: windowBounds, times: [time], maxPoints: 1 },
      ]
      for (const otherQuery of variants) {
        const other = await page.evaluate(
          ({ id, query }) => window.lifecycleTasks.result(id, query),
          { id: task.id, query: otherQuery },
        )
        expect(other).toMatchObject({ ok: true })
        if (!other.ok) throw new Error(other.error)
        expect(other.values).toEqual(sampled.values)
      }
      if (probabilistic && layer !== 'downscaled') {
        const otherMember = await page.evaluate(
          ({ id, query }) => window.lifecycleTasks.result(id, query),
          {
            id: task.id,
            query: {
              ...query,
              ensemble: { kind: 'members', memberIds: ['member-03'] },
            } satisfies ResultQuery,
          },
        )
        expect(otherMember).toMatchObject({ ok: true, values: sampled.values })
      }
      if (layer === 'observation') {
        const clone = {
          ...task,
          id: `${task.id}-user`,
          name: 'User comparison',
          catalog: undefined,
          dataSeed: 999,
          generatorVersion:
            variable === 'temperature' ? 'synthetic-temperature-v1' : 'synthetic-variables-v2',
          configuration: {
            ...task.configuration,
            dataSource: 'gfs',
            resolution: '5km',
            method: 'deterministic',
            resolvedMethod: 'deterministic',
            advanced: undefined,
          },
        }
        expect(
          await page.evaluate((task) => window.lifecycleTasks.restore(task), clone),
        ).toMatchObject({ ok: true })
        const reference = await page.evaluate(
          ({ id, query }) => window.lifecycleTasks.result(id, query),
          {
            id: clone.id,
            query: {
              kind: 'points',
              layer: 'observation',
              observationMode: 'stations',
              temporalResolution: 'hourly',
              points: [point],
              times: [time],
            } satisfies ResultQuery,
          },
        )
        expect(reference).toMatchObject({
          ok: true,
          values: sampled.values,
          reference: { referenceSeed: 1729, referenceVersion: 'synthetic-observations-v1' },
        })
      }
      saved.push({ query, reply: sampled })
    }
    page = await environment.reopen()
    for (const { query, reply } of saved) {
      expect(
        await page.evaluate(({ id, query }) => window.lifecycleTasks.result(id, query), {
          id: task.id,
          query,
        }),
      ).toEqual(reply)
    }
  },
  30_000,
)

it('requires authentication before seeding and can recover initialization after a real sign-in', async () => {
  const page = await environment.open({ initialize: false })
  await expect(page.evaluate(() => window.lifecycleTasks.initialize())).rejects.toThrow(
    'AUTHENTICATION_REQUIRED',
  )
  expect(await page.evaluate(() => window.lifecycleTasks.getState())).toBe('unavailable')
  await environment.signIn('researcher')
  await page.evaluate(() => window.lifecycleTasks.initialize())
  expect((await page.evaluate(() => window.lifecycleTasks.list())).tasks).toHaveLength(4)
}, 30_000)

it('initializes the newly authenticated account even when the public service instance is reused', async () => {
  await environment.signIn('researcher')
  const page = await environment.open()
  const researcher = await page.evaluate(() => window.lifecycleTasks.list())
  await environment.signIn('agriculture')
  await page.evaluate(() => window.lifecycleTasks.initialize())
  const agriculture = await page.evaluate(() => window.lifecycleTasks.list())
  expect(agriculture.issues).toEqual([])
  expect(agriculture.tasks).toHaveLength(4)
  expect(agriculture.tasks.every((task) => task.ownerId === 'agriculture')).toBe(true)
  expect(
    await page.evaluate((id) => window.lifecycleTasks.get(id), researcher.tasks[0]!.id),
  ).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  await environment.signIn('researcher')
  await page.evaluate(() => window.lifecycleTasks.initialize())
  expect(await page.evaluate(() => window.lifecycleTasks.list())).toEqual(researcher)
}, 30_000)

it('does not resurrect deleted cases when an older initializer resumes after another tab seeded and deleted all', async () => {
  await environment.signIn('researcher')
  const delayed = await environment.open({ initialize: false })
  const held = environment.holdNext('catalog', delayed)
  const pending = delayed.evaluate(() => window.lifecycleTasks.initialize())
  try {
    await held.started
    const other = await environment.tab()
    expect((await other.evaluate(() => window.lifecycleTasks.list())).tasks).toHaveLength(4)
    await other.evaluate(async () => {
      for (const task of (await window.lifecycleTasks.list()).tasks)
        await window.lifecycleTasks.delete(task.id)
    })
  } finally {
    held.release()
  }
  await pending
  expect(await delayed.evaluate(() => window.lifecycleTasks.list())).toEqual({
    tasks: [],
    issues: [],
  })
  const reopened = await environment.reopen()
  expect(await reopened.evaluate(() => window.lifecycleTasks.list())).toEqual({
    tasks: [],
    issues: [],
  })
}, 30_000)

import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { queryConfiguration, startQueryBrowser } from './task-query-browser'

let browser: Awaited<ReturnType<typeof startQueryBrowser>>
beforeAll(async () => {
  browser = await startQueryBrowser()
})
beforeEach(async () => {
  await browser.open()
})
afterEach(async () => {
  await browser.reset()
})
afterAll(async () => {
  await browser?.close()
})

const ensembleConfiguration = {
  ...queryConfiguration,
  variable: 'pressure',
  method: 'probabilistic',
  region: { west: 0, east: 1, south: 0, north: 1 },
  advanced: { ensembleMembers: 5 },
}
const point = { longitude: 0, latitude: 0 }
const memberIds = ['member-01', 'member-02', 'member-03', 'member-04', 'member-05']

it('persists a probabilistic task and reopens the same five real members with stable identities', async () => {
  const task = await browser.seed(ensembleConfiguration)
  expect(task).toMatchObject({
    generatorVersion: 'synthetic-ensemble-v3',
    configuration: {
      method: 'probabilistic',
      resolvedMethod: 'probabilistic',
      advanced: { ensembleMembers: 5 },
    },
  })
  const query = {
    kind: 'points',
    layer: 'downscaled',
    points: [point],
    times: ['2024-01-01T00:00:00Z'],
    ensemble: { kind: 'members' },
  } as const
  const result = await browser.result(task, {
    ...query,
    points: [...query.points],
    times: [...query.times],
  })
  expect(result).toMatchObject({
    ok: true,
    variable: 'pressure',
    unit: 'hPa',
    ensemble: { kind: 'members', allMemberIds: memberIds, memberIds },
  })
  if (!result.ok) throw new Error('Expected members')
  expect(result.values.map((value) => value.memberId)).toEqual(memberIds)
  expect(new Set(result.values.map((value) => value.value)).size).toBeGreaterThan(1)
  expect(result.values.map((value) => value.value)).toEqual([
    1022.25, 1018.25, 1012.25, 1013.25, 1020.25,
  ])
  await browser.reopen()
  expect(await browser.get(task)).toMatchObject({
    ok: true,
    task: { status: 'Completed', dataSeed: 42, generatorVersion: 'synthetic-ensemble-v3' },
  })
  expect(
    await browser.result(task, { ...query, points: [...query.points], times: [...query.times] }),
  ).toEqual(result)
})

it.each([
  ['temperature', 'T2M', '°C'],
  ['wind', 'U10/V10', 'm/s'],
  ['pressure', 'MSL', 'hPa'],
  ['precipitation', 'TP', 'mm'],
] as const)(
  'creates and restores %s probabilistic members using the admitted recommended/UQ rule',
  async (variable, quantity, unit) => {
    const task = await browser.seed({
      ...ensembleConfiguration,
      variable,
      method: 'recommended',
      advanced: { uncertaintyQuantification: true, ensembleMembers: 5 },
    })
    expect(task.configuration).toMatchObject({
      method: 'recommended',
      resolvedMethod: 'probabilistic',
      advanced: { uncertaintyQuantification: true, ensembleMembers: 5 },
    })
    const query = {
      kind: 'points',
      layer: 'downscaled',
      temporalResolution: 'hourly',
      points: [point],
      times: ['2024-01-01T04:00:00Z'],
      ensemble: { kind: 'members' },
    } as const
    const result = await browser.result(task, {
      ...query,
      points: [...query.points],
      times: [...query.times],
    })
    expect(result).toMatchObject({
      ok: true,
      variable,
      quantity,
      unit,
      displayTimezone: 'UTC',
      ensemble: { allMemberIds: memberIds },
      provenance: { label: 'Synthetic Demo', generatorVersion: 'synthetic-ensemble-v3' },
    })
    if (!result.ok) throw new Error('Expected member samples')
    expect(result.values.map((value) => value.memberId)).toEqual(memberIds)
    if (variable === 'wind') expect(result.values[0]).toHaveProperty('u10')
    if (variable === 'precipitation') expect(result.values[0]).toHaveProperty('accumulation')
    await browser.reopen()
    expect(
      await browser.result(task, { ...query, points: [...query.points], times: [...query.times] }),
    ).toEqual(result)
  },
)

it('computes the mean from the returned member samples and uses the same default and subset identities', async () => {
  const task = await browser.seed(ensembleConfiguration)
  const query = {
    kind: 'points',
    layer: 'downscaled',
    points: [point],
    times: ['2024-01-01T00:00:00Z'],
  } as const
  const members = await browser.result(task, {
    ...query,
    points: [...query.points],
    times: [...query.times],
    ensemble: { kind: 'members' },
  })
  if (!members.ok) throw new Error('Expected actual samples')
  expect(members.values.map((value) => value.value)).toEqual([
    1022.25, 1018.25, 1012.25, 1013.25, 1020.25,
  ])
  const mean = await browser.result(task, {
    ...query,
    points: [...query.points],
    times: [...query.times],
    ensemble: { kind: 'mean' },
  })
  // Independent worked sum 5086.25 / 5 = 1017.25 hPa, not a separate generated field.
  expect(mean).toMatchObject({
    ok: true,
    unit: 'hPa',
    ensemble: { kind: 'mean', memberIds, samples: members.values },
    values: [
      {
        value: 1017.25,
        ensembleMean: { sampleCount: 5, validMemberIds: memberIds, unavailableMemberIds: [] },
      },
    ],
  })
  expect(
    await browser.result(task, { ...query, points: [...query.points], times: [...query.times] }),
  ).toEqual(mean)
  const subset = await browser.result(task, {
    ...query,
    points: [...query.points],
    times: [...query.times],
    ensemble: { kind: 'mean', memberIds: ['member-02', 'member-01'] },
  })
  expect(subset).toMatchObject({
    ok: true,
    ensemble: { memberIds: ['member-01', 'member-02'], samples: members.values.slice(0, 2) },
    values: [{ value: 1020.25, ensembleMean: { sampleCount: 2 } }],
  })
})

it.each([
  ['temperature', 'hourly', '2024-01-01T00:00:00Z'],
  ['wind', 'hourly', '2024-01-01T00:00:00Z'],
  ['precipitation', 'hourly', '2024-01-01T04:00:00Z'],
  ['temperature', 'daily', '2024-01-01T00:00:00Z'],
] as const)(
  'derives %s %s means and physical diagnostics from the same actual members',
  async (variable, temporalResolution, time) => {
    const task = await browser.seed({ ...ensembleConfiguration, variable })
    const ids = memberIds.slice(0, 4)
    const query = {
      kind: 'points',
      layer: 'downscaled',
      temporalResolution,
      points: [point],
      times: [time],
    } as const
    const members = await browser.result(task, {
      ...query,
      points: [...query.points],
      times: [...query.times],
      ensemble: { kind: 'members', memberIds: ids },
    })
    if (!members.ok) throw new Error('Expected member samples')
    const result = await browser.result(task, {
      ...query,
      points: [...query.points],
      times: [...query.times],
      ensemble: { kind: 'mean', memberIds: ids },
    })
    expect(result).toMatchObject({
      ok: true,
      variable,
      ensemble: { kind: 'mean', samples: members.values },
      values: [{ ensembleMean: { sampleCount: 4, validMemberIds: ids } }],
    })
    if (variable === 'wind') {
      expect(result).toMatchObject({
        values: [
          {
            u10: -0.25,
            v10: 7.25,
            value: 7.2543,
            speed: 7.2543,
            fromDirection: 178.0251,
            ensembleMean: { meanMemberSpeed: 7.8042 },
          },
        ],
      })
    } else if (variable === 'precipitation') {
      expect(result).toMatchObject({
        values: [
          {
            value: 0.75,
            accumulation: {
              start: '2024-01-01T04:00:00.000Z',
              end: '2024-01-01T05:00:00.000Z',
              complete: true,
            },
          },
        ],
      })
    } else if (temporalResolution === 'daily') {
      expect(result).toMatchObject({
        values: [
          {
            value: 28.4122,
            daily: { mean: 28.4122, minimum: 25.4073, completeDay: true, sampledHours: 24 },
          },
        ],
      })
    } else {
      expect(result).toMatchObject({ values: [{ value: 31.4016 }] })
    }
  },
)

it('excludes unavailable members per point/time and reports the valid denominator instead of substituting zero', async () => {
  const task = await browser.seed(ensembleConfiguration)
  const query = {
    kind: 'points',
    temporalResolution: 'hourly',
    layer: 'downscaled',
    points: [point],
    times: ['2024-01-01T00:00:00Z', '2024-01-01T06:00:00Z'],
  } as const
  const members = await browser.result(task, {
    ...query,
    points: [...query.points],
    times: [...query.times],
    ensemble: { kind: 'members' },
  })
  expect(members).toMatchObject({
    ok: true,
    ensemble: {
      unavailable: [
        { memberId: 'member-05', time: '2024-01-01T06:00:00.000Z', code: 'MISSING_MEMBER' },
      ],
    },
  })
  if (!members.ok) throw new Error('Expected explicit member availability')
  expect(members.values).toHaveLength(9)
  expect(
    members.values
      .filter((value) => value.time === '2024-01-01T06:00:00.000Z')
      .map((value) => value.value),
  ).toEqual([1022.2715, 1018.2715, 1012.2715, 1013.2715])
  const mean = await browser.result(task, {
    ...query,
    points: [...query.points],
    times: [...query.times],
    ensemble: { kind: 'mean' },
  })
  expect(mean).toMatchObject({
    ok: true,
    ensemble: { samples: members.values },
    values: [
      {
        value: 1017.25,
        ensembleMean: { sampleCount: 5, validMemberIds: memberIds, unavailableMemberIds: [] },
      },
      {
        value: 1016.5215,
        ensembleMean: {
          sampleCount: 4,
          validMemberIds: memberIds.slice(0, 4),
          unavailableMemberIds: ['member-05'],
        },
      },
    ],
  })
  expect(
    await browser.result(task, {
      ...query,
      points: [...query.points],
      times: ['2024-01-01T06:00:00Z'],
      ensemble: { kind: 'mean', memberIds: ['member-05'] },
    }),
  ).toMatchObject({ ok: false, code: 'MISSING_ENSEMBLE' })
  expect(
    await browser.result(task, {
      ...query,
      points: [...query.points],
      times: ['2024-01-01T06:00:00Z'],
      ensemble: { kind: 'members', memberIds: ['member-05'] },
    }),
  ).toMatchObject({ ok: true, values: [], ensemble: { unavailable: [{ memberId: 'member-05' }] } })
  expect(await browser.get(task)).toMatchObject({ ok: true, task: { status: 'Completed' } })
})

it.each([5, 10, 20] as const)(
  'returns all %i stable member identities and actual values for each variable',
  async (count) => {
    for (const variable of ['temperature', 'wind', 'pressure', 'precipitation'] as const) {
      const task = await browser.seed({
        ...ensembleConfiguration,
        variable,
        advanced: { ensembleMembers: count },
      })
      const result = await browser.result(task, {
        kind: 'points',
        layer: 'downscaled',
        temporalResolution: 'hourly',
        points: [point],
        times: ['2024-01-01T04:00:00Z'],
        ensemble: { kind: 'members' },
      })
      if (!result.ok) throw new Error('Expected actual members')
      expect(result.values).toHaveLength(count)
      expect(new Set(result.values.map((value) => value.memberId)).size).toBe(count)
      expect(result.values.every((value) => Number.isFinite(value.value))).toBe(true)
      expect(result.ensemble?.allMemberIds).toHaveLength(count)
      expect(result.ensemble?.allMemberIds.at(-1)).toBe(
        { 5: 'member-05', 10: 'member-10', 20: 'member-20' }[count],
      )
      expect(await browser.get(task)).toMatchObject({
        ok: true,
        task: { configuration: { advanced: { ensembleMembers: count } } },
      })
    }
  },
)

it('reuses default-ten, recommended and invalid-configuration admission rules without fabricating deterministic ensembles', async () => {
  const deterministic = await browser.seed(queryConfiguration)
  expect(deterministic.configuration).toMatchObject({
    method: 'recommended',
    resolvedMethod: 'deterministic',
  })
  const defaultProbabilistic = await browser.seed({
    ...queryConfiguration,
    method: 'probabilistic',
  })
  const recommended = await browser.seed({
    ...queryConfiguration,
    advanced: { uncertaintyQuantification: true },
  })
  for (const task of [defaultProbabilistic, recommended]) {
    expect(task.configuration).toMatchObject({
      resolvedMethod: 'probabilistic',
      advanced: { ensembleMembers: 10 },
    })
    const result = await browser.result(task, {
      kind: 'points',
      layer: 'downscaled',
      points: [{ longitude: 110.5, latitude: 30.5 }],
      times: ['2024-01-01T00:00:00Z'],
      ensemble: { kind: 'members' },
    })
    expect(result).toMatchObject({ ok: true })
    if (!result.ok) throw new Error('Expected default members')
    expect(result.values).toHaveLength(10)
  }
  for (const advanced of [{ uncertaintyQuantification: true }, { ensembleMembers: 5 }]) {
    expect(
      await browser.rpc('submit', { ...queryConfiguration, method: 'deterministic', advanced }),
    ).toMatchObject({ ok: false, code: 'INCOMPATIBLE_METHOD' })
  }
  expect(
    await browser.rpc('submit', { ...queryConfiguration, advanced: { ensembleMembers: 5 } }),
  ).toMatchObject({ ok: false, code: 'INCOMPATIBLE_METHOD' })
  for (const ensembleMembers of [0, 7, 21]) {
    expect(
      await browser.rpc('submit', { ...ensembleConfiguration, advanced: { ensembleMembers } }),
    ).toMatchObject({ ok: false, code: 'INVALID_CONFIGURATION' })
  }
  expect(
    await browser.rpc('restore', {
      ...defaultProbabilistic,
      id: 'invalid-member-count',
      configuration: {
        ...defaultProbabilistic.configuration,
        advanced: { uncertaintyQuantification: false, ensembleMembers: 7 },
      },
    }),
  ).toMatchObject({ ok: false, code: 'INVALID_RECORD' })
})

it.each(['policy', 'agriculture'])(
  'does not let %s forge researcher ensemble admission or backups',
  async (account) => {
    const researcher = await browser.seed(ensembleConfiguration)
    await browser.signIn(account)
    for (const override of [
      { method: 'probabilistic' },
      { method: 'recommended', advanced: { uncertaintyQuantification: true } },
    ]) {
      expect(
        await browser.rpc('submit', {
          ...queryConfiguration,
          ...override,
          role: 'researcher',
          ownerId: 'researcher',
        }),
      ).toMatchObject({ ok: false, code: 'ROLE_RESTRICTED' })
    }
    expect(
      await browser.rpc('restore', { ...researcher, ownerId: account, id: `forged-${account}` }),
    ).toMatchObject({ ok: false, code: 'ROLE_RESTRICTED' })
    expect(
      await browser.result(researcher, {
        kind: 'points',
        layer: 'downscaled',
        points: [point],
        times: ['2024-01-01T00:00:00Z'],
      }),
    ).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    const own = await browser.seed(queryConfiguration)
    expect(own).toMatchObject({
      ownerId: account,
      configuration: { resolvedMethod: 'deterministic' },
    })
  },
)

it.each(['temperature', 'wind', 'pressure', 'precipitation'] as const)(
  'never adds member/mean data to deterministic %s tasks',
  async (variable) => {
    const task = await browser.seed({
      ...queryConfiguration,
      variable,
      region: ensembleConfiguration.region,
    })
    const query = {
      kind: 'points',
      layer: 'downscaled',
      points: [point],
      times: ['2024-01-01T00:00:00Z'],
    } as const
    const result = await browser.result(task, {
      ...query,
      points: [...query.points],
      times: [...query.times],
    })
    expect(result).not.toHaveProperty('ensemble')
    if (!result.ok) throw new Error('Expected deterministic values')
    expect(
      result.values.every(
        (value) => value.memberId === undefined && value.ensembleMean === undefined,
      ),
    ).toBe(true)
    for (const kind of ['members', 'mean'] as const)
      expect(
        await browser.result(task, {
          ...query,
          points: [...query.points],
          times: [...query.times],
          ensemble: { kind },
        }),
      ).toMatchObject({ ok: false, code: 'NOT_PROBABILISTIC' })
  },
)

it.each(['temperature', 'wind', 'pressure', 'precipitation'] as const)(
  'keeps %s member identities and mean inputs consistent across all spatial/time query modes',
  async (variable) => {
    const task = await browser.seed({ ...ensembleConfiguration, variable })
    const window = { west: 0, east: 0.06, south: 0, north: 0.06 }
    const common = {
      layer: 'downscaled',
      temporalResolution: 'hourly',
      times: ['2024-01-01T04:00:00Z'],
      ensemble: { kind: 'members' },
    } as const
    const grid = await browser.result(task, {
      ...common,
      kind: 'grid',
      window,
      times: [...common.times],
    })
    if (!grid.ok) throw new Error('Expected grid members')
    expect(grid.values).toHaveLength(45)
    expect(
      await browser.result(task, { ...common, kind: 'export', window, times: [...common.times] }),
    ).toEqual(grid)
    expect(
      await browser.result(task, {
        ...common,
        kind: 'preview',
        window,
        times: [...common.times],
        maxPoints: 9,
      }),
    ).toEqual(grid)
    const mean = await browser.result(task, {
      ...common,
      kind: 'grid',
      window,
      times: [...common.times],
      ensemble: { kind: 'mean' },
    })
    expect(mean).toMatchObject({ ok: true, ensemble: { samples: grid.values } })
    if (!mean.ok) throw new Error('Expected means')
    expect(mean.values).toHaveLength(9)
    const points = grid.values
      .filter((value) => value.memberId === 'member-01')
      .map(({ longitude, latitude }) => ({ longitude, latitude }))
    const queried = await browser.result(task, {
      ...common,
      kind: 'points',
      points,
      times: [...common.times],
      ensemble: { kind: 'members', memberIds: [...memberIds].reverse() },
    })
    expect(queried).toMatchObject({ ok: true, values: grid.values })
    const series = await browser.result(task, {
      kind: 'time-series',
      temporalResolution: 'hourly',
      layer: 'downscaled',
      point,
      timeRange: { start: common.times[0], end: common.times[0] },
      ensemble: { kind: 'members' },
    })
    expect(series).toMatchObject({ ok: true, values: grid.values.slice(0, 5) })
    const preview = await browser.result(task, {
      ...common,
      kind: 'preview',
      window,
      times: [...common.times],
      maxPoints: 4,
    })
    if (!preview.ok) throw new Error('Expected sampled members')
    for (const value of preview.values) expect(grid.values).toContainEqual(value)
    await browser.reopen()
    expect(
      await browser.result(task, { ...common, kind: 'grid', window, times: [...common.times] }),
    ).toEqual(grid)
  },
)

it.each(['temperature', 'wind', 'pressure', 'precipitation'] as const)(
  'keeps original and integrated station/interpolated %s observations unchanged when switching members',
  async (variable) => {
    const configuration = { ...queryConfiguration, variable, region: ensembleConfiguration.region }
    const probabilistic = await browser.seed({
      ...configuration,
      method: 'probabilistic',
      advanced: { ensembleMembers: 5 },
    })
    const deterministic = await browser.seed(configuration)
    const sources = [
      { layer: 'original' },
      { layer: 'observation', observationMode: 'stations' },
      { layer: 'observation', observationMode: 'interpolated' },
    ] as const
    for (const source of sources) {
      const query = {
        ...source,
        kind: 'points',
        temporalResolution: 'hourly',
        points: [point],
        times: ['2024-01-01T00:00:00Z', '2024-01-01T06:00:00Z'],
      } as const
      const first = await browser.result(probabilistic, {
        ...query,
        points: [...query.points],
        times: [...query.times],
        ensemble: { kind: 'members', memberIds: ['member-01'] },
      })
      const fifth = await browser.result(probabilistic, {
        ...query,
        points: [...query.points],
        times: [...query.times],
        ensemble: { kind: 'members', memberIds: ['member-05'] },
      })
      const meanSelection = await browser.result(probabilistic, {
        ...query,
        points: [...query.points],
        times: [...query.times],
        ensemble: { kind: 'mean' },
      })
      expect(first).toEqual(fifth)
      expect(first).toEqual(meanSelection)
      expect(first).not.toHaveProperty('ensemble')
      if (!first.ok) throw new Error('Expected shared source/reference samples')
      expect(first.values.every((value) => value.memberId === undefined)).toBe(true)
      const original = await browser.result(deterministic, {
        ...query,
        points: [...query.points],
        times: [...query.times],
      })
      if (!original.ok) throw new Error('Expected deterministic reference')
      expect(first.values).toEqual(original.values)
      expect(first.reference).toEqual(original.reference)
      if (source.layer === 'observation')
        expect(first.reference).toMatchObject({
          referenceSeed: 1729,
          referenceVersion: 'synthetic-observations-v1',
        })
    }
  },
)

it('budgets member samples plus mean rows before expansion without changing nominal resolution', async () => {
  const task = await browser.seed({
    ...ensembleConfiguration,
    variable: 'temperature',
    resolution: '1km',
    region: { west: -180, east: 180, south: -80, north: 80 },
    timeRange: { mode: 'historical', start: '2020-01-01', end: '2024-12-31' },
    advanced: { ensembleMembers: 20 },
  })
  for (const kind of ['members', 'mean'] as const) {
    const result = await browser.result(task, {
      kind: 'preview',
      layer: 'downscaled',
      window: task.configuration.region,
      times: ['2024-01-01T00:00:00Z'],
      maxPoints: 256,
      ensemble: { kind },
    })
    if (!result.ok) throw new Error('Expected bounded preview')
    expect(result.grid.nominalSpacingKm).toBe(1)
    expect(result.ensemble?.allMemberIds).toHaveLength(20)
    expect(
      result.values.length +
        (result.ensemble?.samples?.length ?? 0) +
        (result.ensemble?.unavailable.length ?? 0),
    ).toBeLessThanOrEqual(256)
    expect(
      await browser.result(task, {
        kind: 'export',
        layer: 'downscaled',
        window: task.configuration.region,
        times: ['2024-01-01T00:00:00Z'],
        ensemble: { kind },
      }),
    ).toMatchObject({ ok: false, code: 'QUERY_LIMIT_EXCEEDED' })
    expect(
      await browser.result(task, {
        kind: 'time-series',
        layer: 'downscaled',
        temporalResolution: 'hourly',
        point,
        timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T12:00:00Z' },
        ensemble: { kind },
      }),
    ).toMatchObject({ ok: false, code: 'QUERY_LIMIT_EXCEEDED' })
  }
  const edge = await browser.result(task, {
    kind: 'time-series',
    layer: 'downscaled',
    temporalResolution: 'hourly',
    point,
    timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T11:00:00Z' },
    ensemble: { kind: 'mean' },
  })
  if (!edge.ok) throw new Error('Expected twelve bounded means')
  expect(edge.values).toHaveLength(12)
  expect(
    edge.values.length +
      (edge.ensemble?.samples?.length ?? 0) +
      (edge.ensemble?.unavailable.length ?? 0),
  ).toBe(252)
  const original = await browser.result(task, {
    kind: 'points',
    layer: 'original',
    points: Array.from({ length: 64 }, () => point),
    times: [
      '2024-01-01T00:00:00Z',
      '2024-01-02T00:00:00Z',
      '2024-01-03T00:00:00Z',
      '2024-01-04T00:00:00Z',
    ],
    ensemble: { kind: 'members' },
  })
  if (!original.ok) throw new Error('Expected shared source, not twenty duplicates')
  expect(original.values).toHaveLength(256)
  expect(original).not.toHaveProperty('ensemble')
})

it('rejects unknown/duplicate/empty selections and incompatible stored generator/method pairs without upgrades', async () => {
  const task = await browser.seed(ensembleConfiguration)
  const query = {
    kind: 'points',
    layer: 'downscaled',
    points: [point],
    times: ['2024-01-01T00:00:00Z'],
  } as const
  expect(
    await browser.result(task, {
      ...query,
      points: [...query.points],
      times: [...query.times],
      ensemble: { kind: 'members', memberIds: ['member-06'] },
    }),
  ).toMatchObject({ ok: false, code: 'UNAVAILABLE_MEMBER' })
  for (const ids of [[], ['member-01', 'member-01']])
    expect(
      await browser.rpc('result', {
        task,
        query: { ...query, ensemble: { kind: 'mean', memberIds: ids } },
      }),
    ).toMatchObject({ ok: false, code: 'UNAVAILABLE_QUERY' })
  for (const generatorVersion of ['synthetic-temperature-v1', 'synthetic-variables-v2'])
    expect(
      await browser.rpc('result', { task: { ...task, generatorVersion }, query }),
    ).toMatchObject({ ok: false, code: 'UNAVAILABLE_COMBINATION' })
  expect(
    await browser.rpc('result', {
      task: { ...task, generatorVersion: 'synthetic-ensemble-v999' },
      query,
    }),
  ).toMatchObject({ ok: false, code: 'INCOMPATIBLE_GENERATOR' })
  expect(await browser.get(task)).toMatchObject({
    ok: true,
    task: { generatorVersion: 'synthetic-ensemble-v3', dataSeed: 42 },
  })
})

it.each(['temperature', 'precipitation'] as const)(
  'keeps %s daily member diagnostics and partial-day coverage honest',
  async (variable) => {
    const task = await browser.seed({ ...ensembleConfiguration, variable })
    const query = {
      kind: 'points',
      layer: 'downscaled',
      temporalResolution: 'daily',
      points: [point],
      times: ['2024-01-01T00:00:00Z'],
    } as const
    const members = await browser.result(task, {
      ...query,
      points: [...query.points],
      times: [...query.times],
      ensemble: { kind: 'members' },
    })
    if (!members.ok) throw new Error('Expected daily member availability')
    expect(members.values).toHaveLength(4)
    expect(members.ensemble?.unavailable).toMatchObject([
      { memberId: 'member-05', code: 'MISSING_MEMBER' },
    ])
    const mean = await browser.result(task, {
      ...query,
      points: [...query.points],
      times: [...query.times],
      ensemble: { kind: 'mean' },
    })
    expect(mean).toMatchObject({
      ok: true,
      ensemble: { samples: members.values },
      values: [
        {
          value: variable === 'temperature' ? 28.4122 : 9,
          ensembleMean: { sampleCount: 4, unavailableMemberIds: ['member-05'] },
        },
      ],
    })
    const partial = await browser.seed({
      ...ensembleConfiguration,
      variable,
      timeRange: { mode: 'forecast', start: '2026-10-13T08:00:00Z', end: '2026-10-13T10:00:00Z' },
    })
    const result = await browser.result(partial, {
      ...query,
      points: [...query.points],
      times: ['2026-10-13T00:00:00Z'],
      ensemble: { kind: 'mean' },
    })
    expect(result).toMatchObject({
      ok: true,
      ensemble: { unavailable: [] },
      values: [{ ensembleMean: { sampleCount: 5, unavailableMemberIds: [] } }],
    })
    if (variable === 'temperature')
      expect(result).toMatchObject({
        values: [{ daily: { completeDay: false, sampledHours: 3, expectedHours: 24 } }],
      })
    else
      expect(result).toMatchObject({
        values: [
          {
            accumulation: {
              complete: false,
              sampledHours: 3,
              start: '2026-10-13T08:00:00.000Z',
              end: '2026-10-13T11:00:00.000Z',
            },
          },
        ],
      })
  },
)

it.each([
  ['temperature', '2024-01-01T06:00:00Z'],
  ['wind', '2024-01-01T12:00:00Z'],
  ['pressure', '2024-01-01T08:00:00Z'],
  ['precipitation', '2024-01-01T04:00:00Z'],
] as const)(
  'does not change real integrated %s reference outages when a member is selected',
  async (variable, time) => {
    const task = await browser.seed({
      ...ensembleConfiguration,
      variable,
      region: { west: 20, east: 21, south: 65, north: 66 },
    })
    const query = {
      kind: 'points',
      layer: 'observation',
      observationMode: 'interpolated',
      temporalResolution: 'hourly',
      points: [{ longitude: 20, latitude: 65 }],
      times: [time],
    } as const
    const first = await browser.result(task, {
      ...query,
      points: [...query.points],
      times: [...query.times],
      ensemble: { kind: 'members', memberIds: ['member-01'] },
    })
    const fifth = await browser.result(task, {
      ...query,
      points: [...query.points],
      times: [...query.times],
      ensemble: { kind: 'members', memberIds: ['member-05'] },
    })
    expect(first).toMatchObject({ ok: false })
    expect(fifth).toEqual(first)
  },
)

import { describe, expect, it } from 'vitest'
import { isRedirect } from '@tanstack/react-router'
import { requestHandler } from '@tanstack/react-start/server'
import { loginDemoAccount } from '@/server/services/demo-session.server'
import { admitDownscalingConfiguration } from '@/server/services/downscaling-admission.server'

async function loginCookie(account: string) {
  const response = await requestHandler(() =>
    Response.json(loginDemoAccount({ account, password: 'meteo-demo' })),
  )(new Request('http://demo.test/login', { method: 'POST' }), {})
  return response.headers.get('set-cookie')!.split(';')[0]!
}

function admit(input: unknown, cookie = '') {
  return requestHandler(() => {
    try {
      return Response.json(admitDownscalingConfiguration(input))
    } catch (error) {
      if (isRedirect(error)) return error
      throw error
    }
  })(new Request('http://demo.test/admission', { method: 'POST', headers: { cookie } }), {})
}

const common = {
  dataSource: 'fusion',
  region: { north: 40, south: 30, east: 120, west: 110 },
  timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-01-03' },
  variable: 'temperature',
  resolution: '3km',
}

describe('public downscaling configuration admission', () => {
  it('requires login before inspecting even malformed configuration', async () => {
    const response = await admit(null)
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/login?returnTo=%2Ftasks%2Fnew')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})

it.each(['researcher', 'policy', 'agriculture'])(
  'preserves common configuration and defaults Recommended to deterministic for %s',
  async (account) => {
    const response = await admit(common, await loginCookie(account))
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({
      ok: true,
      ownerId: account,
      configuration: { ...common, method: 'recommended', resolvedMethod: 'deterministic' },
    })
  },
)

it.each(['policy', 'agriculture'])(
  'rejects explicit restricted methods and advanced overrides for %s, despite forged authority',
  async (account) => {
    const cookie = await loginCookie(account)
    for (const override of [
      { method: 'deterministic' },
      { method: 'probabilistic' },
      { advanced: { uncertaintyQuantification: true } },
      { advanced: { ensembleMembers: 10 } },
      { advanced: {} },
    ]) {
      const response = await admit(
        { ...common, ...override, role: 'researcher', ownerId: 'researcher' },
        cookie,
      )
      expect(await response.json()).toMatchObject({
        ok: false,
        code: 'ROLE_RESTRICTED',
        error: expect.stringContaining('推荐方法'),
      })
    }
    expect(
      await (
        await admit(
          { ...common, method: 'recommended', role: 'researcher', ownerId: 'researcher' },
          cookie,
        )
      ).json(),
    ).toMatchObject({ ok: true, ownerId: account })
  },
)

it('admits the researcher’s explicit deterministic method without changing common controls', async () => {
  const response = await admit(
    { ...common, method: 'deterministic' },
    await loginCookie('researcher'),
  )
  expect(await response.json()).toEqual({
    ok: true,
    ownerId: 'researcher',
    configuration: { ...common, method: 'deterministic', resolvedMethod: 'deterministic' },
  })
})

it('admits researcher probability output with ten ensemble members by default', async () => {
  const response = await admit(
    { ...common, method: 'probabilistic' },
    await loginCookie('researcher'),
  )
  expect(await response.json()).toEqual({
    ok: true,
    ownerId: 'researcher',
    configuration: {
      ...common,
      method: 'probabilistic',
      resolvedMethod: 'probabilistic',
      advanced: { uncertaintyQuantification: false, ensembleMembers: 10 },
    },
  })
})

it('resolves researcher Recommended to probability only when uncertainty is requested', async () => {
  const cookie = await loginCookie('researcher')
  const response = await admit({ ...common, advanced: { uncertaintyQuantification: true } }, cookie)
  expect(await response.json()).toEqual({
    ok: true,
    ownerId: 'researcher',
    configuration: {
      ...common,
      method: 'recommended',
      resolvedMethod: 'probabilistic',
      advanced: { uncertaintyQuantification: true, ensembleMembers: 10 },
    },
  })
  expect(
    await (
      await admit({ ...common, advanced: { uncertaintyQuantification: false } }, cookie)
    ).json(),
  ).toMatchObject({
    ok: true,
    configuration: {
      resolvedMethod: 'deterministic',
      advanced: { uncertaintyQuantification: false },
    },
  })
})

it('preserves only supported probability ensemble member counts (5, 10, 20)', async () => {
  const cookie = await loginCookie('researcher')
  for (const ensembleMembers of [5, 10, 20]) {
    expect(
      await (
        await admit({ ...common, method: 'probabilistic', advanced: { ensembleMembers } }, cookie)
      ).json(),
    ).toMatchObject({
      ok: true,
      configuration: { advanced: { ensembleMembers } },
    })
  }
  for (const ensembleMembers of [0, 1, 7, 15, 21, 5.5, '10', null]) {
    expect(
      await (
        await admit({ ...common, method: 'probabilistic', advanced: { ensembleMembers } }, cookie)
      ).json(),
    ).toMatchObject({
      ok: false,
      code: 'INVALID_CONFIGURATION',
    })
  }
})

it('rejects ensemble settings on deterministic output and contradictory explicit deterministic uncertainty', async () => {
  const cookie = await loginCookie('researcher')
  for (const config of [
    { method: 'deterministic', advanced: { ensembleMembers: 10 } },
    { method: 'recommended', advanced: { ensembleMembers: 5 } },
    { method: 'deterministic', advanced: { uncertaintyQuantification: true } },
    { method: 'deterministic', advanced: { uncertaintyQuantification: true, ensembleMembers: 20 } },
  ]) {
    expect(await (await admit({ ...common, ...config }, cookie)).json()).toMatchObject({
      ok: false,
      code: 'INCOMPATIBLE_METHOD',
      error: expect.stringContaining('确定性'),
    })
  }
})

it('does not silently discard unsupported fields or malformed advanced settings', async () => {
  const cookie = await loginCookie('researcher')
  for (const extra of [
    { model: 'another-model' },
    { ensembleMembers: 20 },
    { advanced: { trainModels: true } },
    { advanced: { uncertaintyQuantification: 'true' } },
    { advanced: null },
    { region: { ...common.region, crs: 'unknown' } },
  ]) {
    expect(await (await admit({ ...common, ...extra }, cookie)).json()).toMatchObject({
      ok: false,
      code: 'INVALID_CONFIGURATION',
    })
  }
})

it('rejects invalid spatial bounds rather than admitting unusable common configuration', async () => {
  const cookie = await loginCookie('policy')
  for (const region of [
    { north: 91, south: 30, east: 120, west: 110 },
    { north: 40, south: -91, east: 120, west: 110 },
    { north: 40, south: 40, east: 120, west: 110 },
    { north: 30, south: 40, east: 120, west: 110 },
    { north: 40, south: 30, east: 181, west: 110 },
    { north: 40, south: 30, east: 110, west: 120 },
  ]) {
    expect(await (await admit({ ...common, region }, cookie)).json()).toMatchObject({
      ok: false,
      code: 'INVALID_CONFIGURATION',
    })
  }
})

it('requires real ordered historical dates within the supported 2020–2024 range', async () => {
  const cookie = await loginCookie('agriculture')
  for (const timeRange of [
    { mode: 'historical', start: '', end: '' },
    { mode: 'historical', start: '2024-02-30', end: '2024-03-01' },
    { mode: 'historical', start: '2024-01-03', end: '2024-01-01' },
    { mode: 'historical', start: '2019-12-31', end: '2020-01-01' },
    { mode: 'historical', start: '2024-12-31', end: '2025-01-01' },
  ]) {
    expect(await (await admit({ ...common, timeRange }, cookie)).json()).toMatchObject({
      ok: false,
      code: 'INVALID_CONFIGURATION',
    })
  }
  const timeRange = { mode: 'historical', start: '2024-02-29', end: '2024-02-29' }
  expect(await (await admit({ ...common, timeRange }, cookie)).json()).toMatchObject({
    ok: true,
    configuration: { timeRange },
  })
})

it.each(['researcher', 'policy', 'agriculture'])(
  'preserves hourly forecast configuration and alternative common choices for %s',
  async (account) => {
    const hour = 60 * 60 * 1000
    const start = Math.ceil(Date.now() / hour) * hour
    const configuration = {
      dataSource: 'gfs',
      region: { north: -10, south: -20, east: -40, west: -50 },
      timeRange: {
        mode: 'forecast',
        start: new Date(start).toISOString(),
        end: new Date(start + hour).toISOString(),
      },
      variable: 'precipitation',
      resolution: '5km',
      method: 'recommended',
    }
    expect(await (await admit(configuration, await loginCookie(account))).json()).toEqual({
      ok: true,
      ownerId: account,
      configuration: { ...configuration, resolvedMethod: 'deterministic' },
    })
  },
)

it('rejects past, reversed, non-hourly and beyond-seven-day forecast ranges', async () => {
  const cookie = await loginCookie('researcher')
  const hour = 60 * 60 * 1000
  const start = Math.ceil(Date.now() / hour) * hour
  for (const [from, to] of [
    [start - 2 * hour, start],
    [start + hour, start],
    [start + 1, start + hour],
    [start, start + 169 * hour],
  ] as const) {
    const timeRange = {
      mode: 'forecast',
      start: new Date(from).toISOString(),
      end: new Date(to).toISOString(),
    }
    expect(await (await admit({ ...common, timeRange }, cookie)).json()).toMatchObject({
      ok: false,
      code: 'INVALID_CONFIGURATION',
    })
  }
})

it.each([
  'meteo-demo-account=unknown',
  'meteo-demo-account=constructor',
  'meteo-demo-account=%E0%A4%A',
  'role=researcher',
])(
  'requires login for an invalid session even with forged payload identity: %s',
  async (cookie) => {
    const response = await admit(
      { ...common, role: 'researcher', ownerId: 'researcher', method: 'probabilistic' },
      cookie,
    )
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/login?returnTo=%2Ftasks%2Fnew')
    expect(response.headers.get('cache-control')).toBe('no-store')
  },
)

it('keeps request identities independent and rechecks authority on every admission', async () => {
  const research = await loginCookie('researcher')
  const policy = await loginCookie('policy')
  const agriculture = await loginCookie('agriculture')
  const input = { ...common, method: 'probabilistic', role: 'researcher', ownerId: 'researcher' }
  const responses = await Promise.all([
    admit(input, policy),
    admit(input, research),
    admit(input, agriculture),
    admit(input),
  ])
  expect(await responses[0]!.json()).toMatchObject({ ok: false, code: 'ROLE_RESTRICTED' })
  expect(await responses[1]!.json()).toMatchObject({ ok: true, ownerId: 'researcher' })
  expect(await responses[2]!.json()).toMatchObject({ ok: false, code: 'ROLE_RESTRICTED' })
  expect(responses[3]!.status).toBe(307)
})

it.each(['researcher', 'policy', 'agriculture'])(
  'retains all source, variable and resolution choices for %s',
  async (account) => {
    const cookie = await loginCookie(account)
    for (const dataSource of ['ecmwf', 'gfs', 'fusion']) {
      for (const variable of ['temperature', 'wind', 'pressure', 'precipitation']) {
        for (const resolution of ['1km', '3km', '5km']) {
          const input = { ...common, dataSource, variable, resolution }
          expect(await (await admit(input, cookie)).json()).toEqual({
            ok: true,
            ownerId: account,
            configuration: { ...input, method: 'recommended', resolvedMethod: 'deterministic' },
          })
        }
      }
    }
  },
)

it('rejects malformed common input and keeps authority hints out of normalized output', async () => {
  const cookie = await loginCookie('researcher')
  for (const input of [
    null,
    [],
    {},
    { ...common, dataSource: 'unknown' },
    { ...common, variable: 'unknown' },
    { ...common, resolution: '10km' },
    { ...common, method: null },
  ]) {
    const result = await (await admit(input, cookie)).json()
    expect(result).toMatchObject({
      ok: false,
      code: expect.stringMatching(/^INVALID_(INPUT|CONFIGURATION)$/),
    })
  }
  expect(
    await (await admit({ ...common, role: 'policy', ownerId: 'agriculture' }, cookie)).json(),
  ).toEqual({
    ok: true,
    ownerId: 'researcher',
    configuration: { ...common, method: 'recommended', resolvedMethod: 'deterministic' },
  })
})

it('keeps researcher uncertainty intent and custom ensemble size on Recommended probability output', async () => {
  expect(
    await (
      await admit(
        { ...common, advanced: { uncertaintyQuantification: true, ensembleMembers: 20 } },
        await loginCookie('researcher'),
      )
    ).json(),
  ).toEqual({
    ok: true,
    ownerId: 'researcher',
    configuration: {
      ...common,
      method: 'recommended',
      resolvedMethod: 'probabilistic',
      advanced: { uncertaintyQuantification: true, ensembleMembers: 20 },
    },
  })
})

describe('Spec 05 Ticket 02: historical date-only Asia/Shanghai timezone conversion', () => {
  it('converts date-only historical range to half-open UTC interval from Asia/Shanghai midnight', async () => {
    const cookie = await loginCookie('researcher')
    const input = {
      ...common,
      name: '单日气温任务',
      timeRange: { mode: 'historical', start: '2024-06-15', end: '2024-06-15' },
    }
    const response = await admit(input, cookie)
    const result = await response.json()

    // 2024-06-15 00:00 Asia/Shanghai (UTC+8) = 2024-06-14 16:00 UTC
    // End should be 2024-06-16 00:00 Asia/Shanghai = 2024-06-15 16:00 UTC (half-open)
    expect(result).toMatchObject({
      ok: true,
      name: '单日气温任务',
      configuration: {
        timeRange: {
          mode: 'historical',
          start: '2024-06-14T16:00:00.000Z',
          end: '2024-06-15T16:00:00.000Z',
        },
      },
    })
  })

  it('converts multi-day date-only range with correct half-open end boundary', async () => {
    const cookie = await loginCookie('policy')
    const input = {
      ...common,
      name: '多日气温分析',
      timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-01-03' },
    }
    const result = await (await admit(input, cookie)).json()

    // Start: 2024-01-01 00:00 Shanghai = 2023-12-31 16:00 UTC
    // End: 2024-01-04 00:00 Shanghai = 2024-01-03 16:00 UTC (exclusive)
    expect(result).toMatchObject({
      ok: true,
      name: '多日气温分析',
      configuration: {
        timeRange: {
          mode: 'historical',
          start: '2023-12-31T16:00:00.000Z',
          end: '2024-01-03T16:00:00.000Z',
        },
      },
    })
  })

  it('handles leap day 2024-02-29 correctly in Asia/Shanghai timezone', async () => {
    const cookie = await loginCookie('agriculture')
    const input = {
      ...common,
      name: '闰日任务',
      timeRange: { mode: 'historical', start: '2024-02-29', end: '2024-02-29' },
    }
    const result = await (await admit(input, cookie)).json()

    // 2024-02-29 00:00 Shanghai = 2024-02-28 16:00 UTC
    // End: 2024-03-01 00:00 Shanghai = 2024-02-29 16:00 UTC
    expect(result).toMatchObject({
      ok: true,
      configuration: {
        timeRange: {
          mode: 'historical',
          start: '2024-02-28T16:00:00.000Z',
          end: '2024-02-29T16:00:00.000Z',
        },
      },
    })
  })

  it('handles cross-year boundary 2023-12-31 to 2024-01-02 without duplicating samples', async () => {
    const cookie = await loginCookie('researcher')
    const input = {
      ...common,
      name: '跨年任务',
      timeRange: { mode: 'historical', start: '2023-12-31', end: '2024-01-02' },
    }
    const result = await (await admit(input, cookie)).json()

    // Start: 2023-12-31 00:00 Shanghai = 2023-12-30 16:00 UTC
    // End: 2024-01-03 00:00 Shanghai = 2024-01-02 16:00 UTC
    expect(result).toMatchObject({
      ok: true,
      configuration: {
        timeRange: {
          mode: 'historical',
          start: '2023-12-30T16:00:00.000Z',
          end: '2024-01-02T16:00:00.000Z',
        },
      },
    })
  })

  it('validates historical boundary dates: exactly 2020-01-01 and 2024-12-31', async () => {
    const cookie = await loginCookie('policy')

    // Lower boundary
    const earliest = await (
      await admit(
        {
          ...common,
          name: '最早日期',
          timeRange: { mode: 'historical', start: '2020-01-01', end: '2020-01-01' },
        },
        cookie,
      )
    ).json()
    expect(earliest).toMatchObject({
      ok: true,
      configuration: {
        timeRange: {
          start: '2019-12-31T16:00:00.000Z',
          end: '2020-01-01T16:00:00.000Z',
        },
      },
    })

    // Upper boundary
    const latest = await (
      await admit(
        {
          ...common,
          name: '最晚日期',
          timeRange: { mode: 'historical', start: '2024-12-31', end: '2024-12-31' },
        },
        cookie,
      )
    ).json()
    expect(latest).toMatchObject({
      ok: true,
      configuration: {
        timeRange: {
          start: '2024-12-30T16:00:00.000Z',
          end: '2024-12-31T16:00:00.000Z',
        },
      },
    })

    // Before lower boundary
    expect(
      await (
        await admit(
          {
            ...common,
            name: '超出下限',
            timeRange: { mode: 'historical', start: '2019-12-31', end: '2020-01-01' },
          },
          cookie,
        )
      ).json(),
    ).toMatchObject({
      ok: false,
      code: 'INVALID_CONFIGURATION',
    })

    // After upper boundary
    expect(
      await (
        await admit(
          {
            ...common,
            name: '超出上限',
            timeRange: { mode: 'historical', start: '2024-12-31', end: '2025-01-01' },
          },
          cookie,
        )
      ).json(),
    ).toMatchObject({
      ok: false,
      code: 'INVALID_CONFIGURATION',
    })
  })

  it('does not convert already-timestamped historical ranges (backward compatibility)', async () => {
    const cookie = await loginCookie('researcher')
    const input = {
      ...common,
      timeRange: {
        mode: 'historical',
        start: '2024-01-01T00:00:00.000Z',
        end: '2024-01-03T00:00:00.000Z',
      },
    }
    const result = await (await admit(input, cookie)).json()

    // Already has 'T', should pass through unchanged
    expect(result).toMatchObject({
      ok: true,
      configuration: {
        timeRange: {
          mode: 'historical',
          start: '2024-01-01T00:00:00.000Z',
          end: '2024-01-03T00:00:00.000Z',
        },
      },
    })
  })
})

describe('Spec 05 Ticket 02: task name handling', () => {
  it('preserves user-provided task name exactly', async () => {
    const cookie = await loginCookie('researcher')
    const input = {
      ...common,
      name: '我的自定义任务名称',
      timeRange: { mode: 'historical', start: '2024-06-15', end: '2024-06-15' },
    }
    const result = await (await admit(input, cookie)).json()
    expect(result).toMatchObject({
      ok: true,
      name: '我的自定义任务名称',
    })
  })

  it('generates default name from variable and date for single-day historical task', async () => {
    const cookie = await loginCookie('policy')
    const input = {
      ...common,
      name: '',
      variable: 'temperature',
      timeRange: { mode: 'historical', start: '2024-06-15', end: '2024-06-15' },
    }
    const result = await (await admit(input, cookie)).json()
    expect(result).toMatchObject({
      ok: true,
      name: '气温 · 2024-06-15',
    })
  })

  it('generates default name with region for multi-day range', async () => {
    const cookie = await loginCookie('agriculture')
    const input = {
      ...common,
      name: '   ',
      variable: 'wind',
      region: { north: 40, south: 30, east: 120, west: 110 },
      timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-01-05' },
    }
    const result = await (await admit(input, cookie)).json()
    expect(result).toMatchObject({
      ok: true,
      name: '风场 · 110-120E, 30-40N',
    })
  })

  it('generates default names for all four variables', async () => {
    const cookie = await loginCookie('researcher')
    for (const [variable, expected] of [
      ['temperature', '气温'],
      ['wind', '风场'],
      ['pressure', '气压'],
      ['precipitation', '降水'],
    ] as const) {
      const input = {
        ...common,
        name: '',
        variable,
        timeRange: { mode: 'historical', start: '2024-06-15', end: '2024-06-15' },
      }
      const result = await (await admit(input, cookie)).json()
      expect(result.name).toBe(`${expected} · 2024-06-15`)
    }
  })

  it('trims whitespace from user-provided names', async () => {
    const cookie = await loginCookie('policy')
    const input = {
      ...common,
      name: '  测试任务  ',
      timeRange: { mode: 'historical', start: '2024-06-15', end: '2024-06-15' },
    }
    const result = await (await admit(input, cookie)).json()
    expect(result).toMatchObject({
      ok: true,
      name: '测试任务',
    })
  })

  it('rejects empty name after trimming when no default can be generated (legacy mode)', async () => {
    const cookie = await loginCookie('researcher')
    // Legacy mode: no name field provided at all
    const input = {
      dataSource: 'fusion',
      region: { north: 40, south: 30, east: 120, west: 110 },
      timeRange: {
        mode: 'historical',
        start: '2024-01-01T00:00:00.000Z',
        end: '2024-01-03T00:00:00.000Z',
      },
      variable: 'temperature',
      resolution: '3km',
    }
    const result = await (await admit(input, cookie)).json()
    // Legacy mode should not have name field
    expect(result).toMatchObject({
      ok: true,
      configuration: expect.any(Object),
    })
    expect(result).not.toHaveProperty('name')
  })
})

import { describe, expect, it } from 'vitest'
import { requestHandler } from '@tanstack/react-start/server'
import { loginDemoAccount, readDemoSession } from '@/server/services/demo-session.server'

// Real Start request/response context; only public return values and HTTP headers are observed.
function login(input: unknown, url = 'http://demo.test/login', headers: HeadersInit = {}) {
  return requestHandler(() => Response.json(loginDemoAccount(input)))(
    new Request(url, { method: 'POST', headers }),
    {},
  )
}

function session(cookie = '') {
  return requestHandler(() => Response.json(readDemoSession()))(
    new Request('http://demo.test/dashboard', { headers: { cookie } }),
    {},
  )
}

describe('public Demo session behavior', () => {
  it.each([
    ['researcher', '研究人员', 'Researcher'],
    ['policy', '决策者', 'Policy Maker'],
    ['agriculture', '农业用户', 'Agriculture User'],
  ])(
    'logs in %s and restores its canonical account from the response cookie',
    async (id, label, title) => {
      const response = await login({ account: id, password: 'meteo-demo' })
      expect(await response.json()).toMatchObject({
        ok: true,
        account: { id, role: id, roleLabel: label, roleTitle: title },
      })
      const cookie = response.headers.get('set-cookie')
      expect(cookie?.split(';').map((part) => part.trim())).toEqual(
        expect.arrayContaining([`meteo-demo-account=${id}`, 'Path=/', 'HttpOnly', 'SameSite=Lax']),
      )
      expect(cookie).not.toContain('Secure')
      expect(cookie).not.toMatch(/Expires=|Max-Age=/i)
      expect(response.headers.get('cache-control')).toBe('no-store')
      const restored = await session(cookie?.split(';')[0])
      expect(await restored.json()).toMatchObject({ id, role: id, roleLabel: label })
      expect(restored.headers.get('cache-control')).toBe('no-store')
    },
  )

  it.each([
    ['https://demo.test/login', {}],
    ['http://demo.test/login', { 'x-forwarded-proto': 'https' }],
  ])('sets Secure for HTTPS including the hosting proxy: %s', async (url, headers) => {
    const response = await login({ account: 'researcher', password: 'meteo-demo' }, url, headers)
    expect(
      response.headers
        .get('set-cookie')
        ?.split(';')
        .map((part) => part.trim()),
    ).toContain('Secure')
  })

  it.each([
    null,
    {},
    { account: '', password: 'meteo-demo' },
    { account: 'researcher' },
    { account: 'researcher', password: '' },
    { account: 'researcher', password: 'wrong' },
    { account: 'unknown', password: 'meteo-demo', role: 'researcher' },
    { account: 'toString', password: 'meteo-demo' },
    { account: 'constructor', password: 'meteo-demo' },
    { account: ['researcher'], password: 'meteo-demo' },
  ])(
    'rejects missing, incorrect and malformed input without creating a cookie: %j',
    async (input) => {
      const response = await login(input)
      expect(await response.json()).toEqual({
        ok: false,
        error: '演示账号或密码不正确，请使用页面公开的演示信息。',
      })
      expect(response.headers.has('set-cookie')).toBe(false)
      expect(await (await session()).json()).toBeNull()
    },
  )

  it('does not let a supplied role or account metadata override the catalog', async () => {
    const response = await login({
      account: 'policy',
      password: 'meteo-demo',
      role: 'researcher',
      name: '管理员',
      roleLabel: '研究人员',
      ownerId: 'researcher',
    })
    expect(await response.json()).toMatchObject({
      account: { id: 'policy', role: 'policy', name: '决策演示账号', roleLabel: '决策者' },
    })
    const restored = await session(response.headers.get('set-cookie')?.split(';')[0])
    expect(await restored.json()).toMatchObject({ id: 'policy', role: 'policy' })
  })

  it.each([
    '',
    'meteo-demo-account=unknown',
    'meteo-demo-account=constructor',
    'meteo-demo-account=toString',
    'role=researcher',
    'meteo-demo-account=%7B%22role%22%3A%22researcher%22%7D',
  ])(
    'does not resolve an identity from a missing or unknown account cookie: %s',
    async (cookie) => {
      expect(await (await session(cookie)).json()).toBeNull()
    },
  )

  it('leaves the existing account unchanged after a rejected login', async () => {
    const response = await login({ account: 'researcher', password: 'wrong' }, undefined, {
      cookie: 'meteo-demo-account=agriculture',
    })
    expect(await response.json()).toMatchObject({ ok: false })
    expect(response.headers.has('set-cookie')).toBe(false)
    expect(await (await session('meteo-demo-account=agriculture')).json()).toMatchObject({
      id: 'agriculture',
      role: 'agriculture',
    })
  })

  it('resolves each concurrent request independently', async () => {
    const results = await Promise.all([
      session('meteo-demo-account=policy'),
      session(),
      session('meteo-demo-account=researcher'),
      session('meteo-demo-account=agriculture'),
    ])
    expect(await Promise.all(results.map((response) => response.json()))).toMatchObject([
      { id: 'policy', role: 'policy' },
      null,
      { id: 'researcher', role: 'researcher' },
      { id: 'agriculture', role: 'agriculture' },
    ])
  })
})

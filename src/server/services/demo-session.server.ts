import '@tanstack/react-start/server-only'
import {
  getCookie,
  getRequestProtocol,
  setCookie,
  setResponseHeader,
} from '@tanstack/react-start/server'
import { z } from 'zod'
import { DEMO_PASSWORD, resolveDemoAccount } from '@/features/auth/demo-accounts'

export const DEMO_SESSION_COOKIE = 'meteo-demo-account'

const loginInput = z.object({ account: z.string().trim().min(1), password: z.string().min(1) })

// Deliberately unsigned: this identity is only an experience selector for synthetic Demo data.
export function loginDemoAccount(input: unknown) {
  setResponseHeader('Cache-Control', 'no-store')
  const parsed = loginInput.safeParse(input)
  const account = parsed.success ? resolveDemoAccount(parsed.data.account) : null
  if (!parsed.success || !account || parsed.data.password !== DEMO_PASSWORD) {
    return { ok: false as const, error: '演示账号或密码不正确，请使用页面公开的演示信息。' }
  }
  setCookie(DEMO_SESSION_COOKIE, account.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: getRequestProtocol() === 'https',
  })
  return { ok: true as const, account }
}

export function readDemoSession() {
  setResponseHeader('Cache-Control', 'no-store')
  return resolveDemoAccount(getCookie(DEMO_SESSION_COOKIE))
}

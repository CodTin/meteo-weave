import '@tanstack/react-start/server-only'
import {
  getCookie,
  getRequestProtocol,
  setCookie,
  setResponseHeader,
} from '@tanstack/react-start/server'
import { z } from 'zod'
import { redirect } from '@tanstack/react-router'
import { safeReturnTo } from '@/features/auth/return-to'
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

// This is also the service boundary for the workspace's current-account display.
// Future identity-dependent services must require this account before doing work.
export function requireDemoAccount(returnTo?: unknown) {
  const account = readDemoSession()
  if (!account) {
    throw redirect({
      href: `/login?${new URLSearchParams({ returnTo: safeReturnTo(returnTo) })}`,
      replace: true,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
  return account
}

// End only the Demo selector; saved tasks and unrelated browser data are not session state.
export function endDemoSession() {
  setResponseHeader('Cache-Control', 'no-store')
  setCookie(DEMO_SESSION_COOKIE, '', {
    maxAge: 0,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: getRequestProtocol() === 'https',
  })
  return { ok: true as const }
}

import { createServerFn } from '@tanstack/react-start'
import {
  endDemoSession,
  loginDemoAccount,
  readDemoSession,
  requireDemoAccount,
} from '@/server/services/demo-session.server'

export const loginDemo = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input)
  .handler(({ data }) => loginDemoAccount(data))

export const getDemoSession = createServerFn({ method: 'GET' }).handler(() => readDemoSession())

export const requireDemoSession = createServerFn({ method: 'GET' })
  .validator((returnTo: unknown) => returnTo)
  .handler(({ data }) => requireDemoAccount(data))

export const logoutDemo = createServerFn({ method: 'POST' }).handler(() => endDemoSession())

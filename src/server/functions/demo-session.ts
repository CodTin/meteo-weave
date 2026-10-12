import { createServerFn } from '@tanstack/react-start'
import { loginDemoAccount, readDemoSession } from '@/server/services/demo-session.server'

export const loginDemo = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => input)
  .handler(({ data }) => loginDemoAccount(data))

export const getDemoSession = createServerFn({ method: 'GET' }).handler(() => readDemoSession())

import { expect, it } from 'vitest'
import { requestHandler } from '@tanstack/react-start/server'
import { createQueryClient, discardWorkspaceQueries } from '@/lib/query/client'
import { loginDemoAccount, requireDemoAccount } from '@/server/services/demo-session.server'

// Real session services and public QueryClient operations, not cache layout assertions.
async function signIn(account: string) {
  const response = await requestHandler(() =>
    Response.json(loginDemoAccount({ account, password: 'meteo-demo' })),
  )(new Request('http://demo.test/login', { method: 'POST' }), {})
  return response.headers.get('set-cookie')?.split(';')[0] ?? ''
}

async function currentAccount(cookie: string): Promise<unknown> {
  const response = await requestHandler(() => Response.json(requireDemoAccount()))(
    new Request('http://demo.test/', { headers: { cookie } }),
    {},
  )
  return response.json()
}

it('reads the new account rather than reusing the outgoing workspace query result', async () => {
  const client = createQueryClient()
  let cookie = await signIn('researcher')
  const account = () =>
    client.query({
      queryKey: ['current-workspace-account'],
      queryFn: () => currentAccount(cookie),
    })
  try {
    expect(await account()).toMatchObject({ id: 'researcher', role: 'researcher' })
    await discardWorkspaceQueries(client)
    cookie = await signIn('policy')
    expect(await account()).toMatchObject({ id: 'policy', role: 'policy' })
  } finally {
    client.clear()
  }
})

it('cancels an in-flight account query even when its underlying response ignores cancellation', async () => {
  const client = createQueryClient()
  const researcher = await signIn('researcher')
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })
  let delivered!: () => void
  const finished = new Promise<void>((resolve) => {
    delivered = resolve
  })
  const outgoing = client.query({
    queryKey: ['current-workspace-account'],
    queryFn: async () => {
      const result = await currentAccount(researcher)
      started()
      await held
      delivered()
      return result
    },
  })
  // Observe the public promise, attaching its rejection handler before cancellation.
  const outcome = outgoing.then(
    () => 'delivered',
    () => 'cancelled',
  )
  try {
    await ready
    await discardWorkspaceQueries(client)
    const policy = await signIn('policy')
    const account = () =>
      client.query({
        queryKey: ['current-workspace-account'],
        queryFn: () => currentAccount(policy),
      })
    expect(await account()).toMatchObject({ id: 'policy', role: 'policy' })
    release()
    await finished
    expect(await outcome).toBe('cancelled')
    expect(await account()).toMatchObject({ id: 'policy', role: 'policy' })
  } finally {
    release()
    client.clear()
  }
})

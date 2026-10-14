import { QueryClient } from '@tanstack/react-query'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000 },
    },
  })
}

const workspaceDisposals = new WeakMap<QueryClient, Set<() => void>>()

/** Join the existing session transition before any asynchronous query cancellation. */
export function onWorkspaceDiscard(client: QueryClient, dispose: () => void) {
  let disposals = workspaceDisposals.get(client)
  if (!disposals) {
    disposals = new Set()
    workspaceDisposals.set(client, disposals)
  }
  disposals.add(dispose)
  return () => disposals.delete(dispose)
}

// Only disposable in-memory query/mutation state; never browser/task persistence.
export async function discardWorkspaceQueries(client: QueryClient) {
  for (const dispose of workspaceDisposals.get(client) ?? []) dispose()
  await client.cancelQueries()
  client.clear()
}

import { QueryClient } from '@tanstack/react-query'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000 },
    },
  })
}

// Only disposable in-memory query/mutation state; never browser/task persistence.
export async function discardWorkspaceQueries(client: QueryClient) {
  await client.cancelQueries()
  client.clear()
}

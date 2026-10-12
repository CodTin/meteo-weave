import { clientEnv } from '@/lib/env/client'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { createQueryClient } from '@/lib/query/client'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  // A fresh cache per SSR request prevents data from crossing user sessions.
  const queryClient = createQueryClient()
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })

  setupRouterSsrQueryIntegration({ router, queryClient })
  if (
    !router.isServer &&
    import.meta.env.PROD &&
    clientEnv.VITE_ENABLE_TELEMETRY &&
    clientEnv.VITE_SENTRY_DSN
  ) {
    void import('@sentry/tanstackstart-react').then((Sentry) => {
      Sentry.addIntegration(Sentry.tanstackRouterBrowserTracingIntegration(router))
    })
  }
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}

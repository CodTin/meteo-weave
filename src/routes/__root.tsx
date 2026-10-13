import type { ReactNode } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { clientEnv } from '@/lib/env/client'
import stylesheet from '@/styles/globals.css?url'
import { NotFoundPage } from '@/components/entry/not-found-page'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'MeteoWeave' },
    ],
    links: [{ rel: 'stylesheet', href: stylesheet }],
  }),
  component: Outlet,
  // Router preserves the HTTP 404 status for unmatched document requests.
  notFoundComponent: NotFoundPage,
  shellComponent: RootDocument,
})

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        {import.meta.env.PROD && clientEnv.VITE_ENABLE_TELEMETRY && (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        )}
        <Scripts />
      </body>
    </html>
  )
}

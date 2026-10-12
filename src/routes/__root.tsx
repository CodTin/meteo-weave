import type { ReactNode } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { clientEnv } from '@/lib/env/client'
import stylesheet from '@/styles/globals.css?url'

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
  // No product pages or custom 404 UI are part of the bootstrap.
  notFoundComponent: () => null,
  shellComponent: RootDocument,
})

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
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

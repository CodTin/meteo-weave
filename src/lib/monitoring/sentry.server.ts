import '@tanstack/react-start/server-only'
import * as Sentry from '@sentry/tanstackstart-react'
import { serverEnv } from '@/lib/env/server.server'

// Inline initialization supports Vercel; only native HTTP/fetch instrumentation
// is guaranteed without a Node preload hook. There is no database layer yet.
if (serverEnv.SENTRY_ENABLED && serverEnv.SENTRY_DSN) {
  Sentry.init({
    dsn: serverEnv.SENTRY_DSN,
    environment: serverEnv.NODE_ENV,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    tracesSampleRate: 0.1,
  })
}

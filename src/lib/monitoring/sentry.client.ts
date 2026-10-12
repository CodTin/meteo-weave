import '@tanstack/react-start/client-only'
import { clientEnv } from '@/lib/env/client'

export async function initializeClientMonitoring() {
  if (!import.meta.env.PROD || !clientEnv.VITE_ENABLE_TELEMETRY || !clientEnv.VITE_SENTRY_DSN)
    return
  const Sentry = await import('@sentry/tanstackstart-react')
  Sentry.init({
    dsn: clientEnv.VITE_SENTRY_DSN,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    tracesSampleRate: 0.1,
    integrations: [Sentry.replayIntegration()],
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1,
  })
}

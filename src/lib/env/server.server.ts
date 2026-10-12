import '@tanstack/react-start/server-only'
import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

export const serverEnv = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    SENTRY_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    SENTRY_DSN: z.url().optional(),
  },
  runtimeEnvStrict: {
    NODE_ENV: process.env.NODE_ENV,
    SENTRY_ENABLED: process.env.SENTRY_ENABLED,
    SENTRY_DSN: process.env.SENTRY_DSN,
  },
  emptyStringAsUndefined: true,
})

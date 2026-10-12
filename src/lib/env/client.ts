import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

export const clientEnv = createEnv({
  clientPrefix: 'VITE_',
  client: {
    VITE_MAPBOX_ACCESS_TOKEN: z.string().startsWith('pk.').optional(),
    VITE_ENABLE_TELEMETRY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    VITE_SENTRY_DSN: z.url().optional(),
  },
  runtimeEnvStrict: {
    VITE_MAPBOX_ACCESS_TOKEN: import.meta.env.VITE_MAPBOX_ACCESS_TOKEN,
    VITE_ENABLE_TELEMETRY: import.meta.env.VITE_ENABLE_TELEMETRY,
    VITE_SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN,
  },
  emptyStringAsUndefined: true,
})

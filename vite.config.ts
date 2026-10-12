import { fileURLToPath } from 'node:url'
import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { visualizer } from 'rollup-plugin-visualizer'
import { defineConfig, loadEnv, perEnvironmentPlugin } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const uploadSourceMaps = Boolean(env.SENTRY_AUTH_TOKEN && env.SENTRY_ORG && env.SENTRY_PROJECT)

  return {
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    plugins: [
      tailwindcss(),
      tanstackStart({
        importProtection: { enabled: true, behavior: 'error' },
      }),
      nitro({ preset: process.env.NITRO_PRESET ?? (process.env.VERCEL ? 'vercel' : 'bun') }),
      react(),
      env.ANALYZE === 'true' &&
        perEnvironmentPlugin(
          'client-bundle-analyzer',
          (environment) =>
            environment.name === 'client' &&
            visualizer({
              filename: 'reports/bundle.html',
              open: false,
              gzipSize: true,
              brotliSize: true,
            }),
        ),
      // Never upload source maps until all build-only credentials are configured.
      uploadSourceMaps &&
        sentryTanstackStart({
          org: env.SENTRY_ORG,
          project: env.SENTRY_PROJECT,
          authToken: env.SENTRY_AUTH_TOKEN,
          telemetry: false,
        }),
    ],
  }
})

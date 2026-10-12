import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 4173)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('E2E_PORT must be an integer between 1 and 65535')
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'bun run build && bun run start',
    port,
    env: { PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'production' },
    reuseExistingServer: false,
    timeout: 180_000,
  },
})

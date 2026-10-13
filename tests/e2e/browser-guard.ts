import { expect, test as base } from '@playwright/test'

export { expect }
export type { Page, Locator, BrowserContext, APIResponse } from '@playwright/test'

type BrowserFailure = {
  kind: 'page' | 'console' | 'request' | 'response'
  text: string
  url?: string
  resourceType?: string
}

type BrowserGuard = {
  browserGuard: void
  expectedModuleFailures: Set<string>
  expectedFontFailures: Set<string>
  expectedDocument404s: Set<string>
  expectedSessionTransportFailures: Set<string>
}

export const test = base.extend<BrowserGuard>({
  // oxlint-disable-next-line no-empty-pattern -- Playwright requires fixture dependency destructuring.
  expectedModuleFailures: async ({}, use) => {
    await use(new Set<string>())
  },
  // oxlint-disable-next-line no-empty-pattern -- Playwright requires fixture dependency destructuring.
  expectedFontFailures: async ({}, use) => {
    await use(new Set<string>())
  },
  // oxlint-disable-next-line no-empty-pattern -- Playwright requires fixture dependency destructuring.
  expectedDocument404s: async ({}, use) => {
    await use(new Set<string>())
  },
  // oxlint-disable-next-line no-empty-pattern -- Playwright requires fixture dependency destructuring.
  expectedSessionTransportFailures: async ({}, use) => {
    await use(new Set<string>())
  },
  browserGuard: [
    async (
      {
        page,
        javaScriptEnabled,
        baseURL,
        expectedModuleFailures,
        expectedFontFailures,
        expectedDocument404s,
        expectedSessionTransportFailures,
      },
      use,
    ) => {
      const errors: BrowserFailure[] = []
      page.on('pageerror', (error) => errors.push({ kind: 'page', text: error.message }))
      page.on('console', (message) => {
        if (message.type() === 'error')
          errors.push({ kind: 'console', text: message.text(), url: message.location().url })
      })
      page.on('requestfailed', (request) => {
        errors.push({
          kind: 'request',
          text: request.failure()?.errorText ?? '',
          url: request.url(),
          resourceType: request.resourceType(),
        })
      })
      page.on('response', (response) => {
        if (
          response.status() >= 400 ||
          (new URL(response.url()).pathname.startsWith('/assets/') && !response.ok())
        ) {
          errors.push({
            kind: 'response',
            text: String(response.status()),
            url: response.url(),
            resourceType: response.request().resourceType(),
          })
        }
      })
      await use()
      const unexpected = errors.filter((error) => {
        // No page error (including hydration errors) is ever an expected resource failure.
        if (error.kind === 'page' || !error.url) return true
        // Only explicitly intercepted session requests may fail or be cancelled in these tests.
        // Never exempt page/hydration errors, other endpoints, or arbitrary console output.
        if (expectedSessionTransportFailures.has(error.url)) {
          if (
            error.kind === 'request' &&
            error.resourceType === 'fetch' &&
            error.text === 'net::ERR_ABORTED'
          )
            return false
          if (error.kind === 'response' && error.resourceType === 'fetch' && error.text === '503')
            return false
          if (
            error.kind === 'console' &&
            error.text ===
              'Failed to load resource: the server responded with a status of 503 (Service Unavailable)'
          )
            return false
        }
        // Chromium implements disabled JavaScript using CSP. No other failure is allowed.
        if (
          javaScriptEnabled === false &&
          error.kind === 'request' &&
          error.resourceType === 'script' &&
          error.text === 'csp' &&
          new URL(error.url).origin === new URL(baseURL ?? page.url()).origin &&
          new URL(error.url).pathname.startsWith('/assets/')
        )
          return false
        if (expectedFontFailures.has(error.url)) {
          if (
            error.kind === 'request' &&
            error.resourceType === 'font' &&
            error.text === 'net::ERR_FAILED'
          )
            return false
          if (error.kind === 'console' && error.text === 'Failed to load resource: net::ERR_FAILED')
            return false
        }
        if (expectedDocument404s.has(error.url)) {
          if (
            error.kind === 'response' &&
            error.resourceType === 'document' &&
            error.text === '404'
          )
            return false
          if (
            error.kind === 'console' &&
            error.text ===
              'Failed to load resource: the server responded with a status of 404 (Not Found)'
          )
            return false
        }
        if (expectedModuleFailures.has(error.url)) {
          if (error.kind === 'response' && error.resourceType === 'script' && error.text === '503')
            return false
          if (
            error.kind === 'request' &&
            error.resourceType === 'script' &&
            error.text === 'net::ERR_ABORTED'
          )
            return false
          if (
            error.kind === 'console' &&
            error.text ===
              'Failed to load resource: the server responded with a status of 503 (Service Unavailable)'
          )
            return false
        }
        // Router logs the exact failed import from its own bundle, not the failed URL.
        if (
          error.kind === 'console' &&
          [...expectedModuleFailures].some(
            (url) =>
              error.text === `TypeError: Failed to fetch dynamically imported module: ${url}`,
          )
        )
          return false
        return true
      })
      expect(unexpected).toEqual([])
    },
    { auto: true },
  ],
})

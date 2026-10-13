import { afterEach, expect, it } from 'vitest'
import { createLifecycleEnvironment } from './task-lifecycle-native-environment'
import { startQueryBrowser } from './task-query-browser'
import type { Page } from '../e2e/browser-guard'

let cleanup: (() => Promise<void>) | undefined
afterEach(async () => {
  await cleanup?.()
  cleanup = undefined
}, 30_000)

async function openEnvironment(kind: 'lifecycle' | 'query') {
  const environment =
    kind === 'lifecycle' ? await createLifecycleEnvironment() : await startQueryBrowser()
  cleanup = async () => {
    try {
      await environment.reset()
    } finally {
      await environment.close()
    }
  }
  await environment.signIn('researcher')
  const page = await environment.open()
  return { environment, page }
}

it.each(['lifecycle', 'query'] as const)(
  'allows a clean %s native browser',
  async (kind) => {
    const { environment } = await openEnvironment(kind)
    await expect(environment.reset()).resolves.toBeUndefined()
  },
  30_000,
)

for (const kind of ['lifecycle', 'query'] as const) {
  it.each([
    ['first', 'console'],
    ['first', 'page'],
    ['reopened', 'console'],
    ['reopened', 'page'],
    ['extra-tab', 'console'],
    ['extra-tab', 'page'],
  ] as const)(
    'rejects unexpected diagnostics in the ' + kind + ' browser (%s, %s)',
    async (phase, diagnostic) => {
      const { environment, page: firstPage } = await openEnvironment(kind)
      let page: Page = firstPage
      if (phase === 'reopened') page = await environment.reopen()
      if (phase === 'extra-tab') {
        page = await firstPage.context().newPage()
        await page.goto('about:blank')
      }
      const marker = `NATIVE_GUARD_${kind}_${phase}_${diagnostic}`
      if (diagnostic === 'page') {
        const observed = page.waitForEvent('pageerror')
        await page.evaluate((marker) => {
          setTimeout(() => {
            throw new Error(marker)
          }, 0)
        }, marker)
        await observed
      } else {
        await page.evaluate((marker) => console.error(marker), marker)
      }
      // Teardown, not the particular evaluate promise, must catch unsolicited diagnostics.
      await expect(environment.reset()).rejects.toThrow(marker)
    },
    30_000,
  )
}

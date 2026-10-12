import type { APIResponse, Page } from '@playwright/test'

// Hold the next real session GET response across a document/session transition.
// The caller owns the identity assertions and the user actions that end the session.
export async function holdNextSessionResponse(
  page: Page,
  expectedSessionTransportFailures: Set<string>,
) {
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let received!: (result: { url: string; response: APIResponse }) => void
  const ready = new Promise<{ url: string; response: APIResponse }>((resolve) => {
    received = resolve
  })
  let delivered!: () => void
  const finished = new Promise<void>((resolve) => {
    delivered = resolve
  })
  let heldOnce = false
  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() !== 'GET' || heldOnce) {
      await route.continue()
      return
    }
    heldOnce = true
    // Fetch first: delaying a fabricated response would not exercise the old session.
    const response = await route.fetch()
    const url = route.request().url()
    // Keep the browser guard's existing exact-URL/type/error restrictions intact.
    expectedSessionTransportFailures.add(url)
    received({ url, response })
    await held
    try {
      await route.fulfill({ response })
    } finally {
      delivered()
    }
  })
  return { ready, release, finished }
}

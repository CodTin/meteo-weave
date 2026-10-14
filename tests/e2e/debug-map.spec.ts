import { test } from './browser-guard'
import { submitDemoLogin } from './demo-login'

test('debug map page loading', async ({ page }) => {
  const consoleMessages: string[] = []
  const pageErrors: Error[] = []

  page.on('console', (msg) => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`)
  })

  page.on('pageerror', (error) => {
    pageErrors.push(error)
  })

  await page.goto('/login')
  await submitDemoLogin(page, 'researcher')

  console.log('Navigating to /tasks/new...')
  try {
    await page.goto('/tasks/new', { waitUntil: 'domcontentloaded', timeout: 10000 })
    console.log('Page loaded successfully')
  } catch (error) {
    console.log('Page failed to load:', error)
  }

  console.log('\n=== Console Messages ===')
  consoleMessages.forEach((msg) => console.log(msg))

  console.log('\n=== Page Errors ===')
  pageErrors.forEach((error) => console.log(error.message, error.stack))

  console.log('\n=== Page Title ===')
  console.log(await page.title())

  console.log('\n=== Current URL ===')
  console.log(page.url())
})

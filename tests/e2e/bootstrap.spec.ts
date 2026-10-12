import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('serves the document shell and hydrates without browser errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydrat|Minified React error/i.test(message.text())) {
      errors.push(message.text())
    }
  })
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.startsWith('/assets/') && !response.ok()) {
      errors.push(`Asset failed: ${response.status()} ${response.url()}`)
    }
  })
  const response = await page.goto('/')
  // No index page is implemented; still require a real SSR document, not a 500.
  expect(response?.status()).toBe(404)
  await expect(page).toHaveTitle('MeteoWeave')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await page.waitForLoadState('networkidle')
  expect(errors).toEqual([])
  const accessibility = await new AxeBuilder({ page })
    // An intentionally empty shell has no page heading or main landmark yet.
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(accessibility.violations).toEqual([])
})

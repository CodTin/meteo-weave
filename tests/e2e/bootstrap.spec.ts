import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('serves the Chinese product entry and reaches the login entry without browser errors', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('requestfailed', (request) => {
    errors.push(`Request failed: ${request.url()} ${request.failure()?.errorText}`)
  })
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.startsWith('/assets/') && !response.ok()) {
      errors.push(`Asset failed: ${response.status()} ${response.url()}`)
    }
  })

  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  // Content must be in the server document, not only added after hydration.
  expect(await response?.text()).toContain('气象降尺度工作台')
  await expect(page).toHaveTitle(/MeteoWeave/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: '气象降尺度工作台' })).toBeVisible()
  await expect(page.getByText(/Hello/)).toHaveCount(0)
  await page.waitForLoadState('networkidle')
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])

  await page.getByRole('link', { name: '前往登录' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { level: 1, name: '登录 MeteoWeave' })).toBeVisible()
  await expect(page.getByRole('main')).toContainText('Demo 账号登录')
  const login = await page.reload()
  expect(login?.status()).toBe(200)
  expect(await login?.text()).toContain('登录 MeteoWeave')
  await page.waitForLoadState('networkidle')
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  expect(errors).toEqual([])
})

test('returns a real HTTP 404 with an accessible route back to the product entry', async ({
  page,
}) => {
  const missingPath = '/this-page-does-not-exist'
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    // Only the deliberately missing document may report a 404 resource error.
    const expected404 =
      message.location().url === new URL(missingPath, page.url()).href &&
      /Failed to load resource.*404/.test(message.text())
    if (message.type() === 'error' && !expected404) errors.push(message.text())
  })
  page.on('requestfailed', (request) => {
    errors.push(`Request failed: ${request.url()} ${request.failure()?.errorText}`)
  })
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.startsWith('/assets/') && !response.ok()) {
      errors.push(`Asset failed: ${response.status()} ${response.url()}`)
    }
  })

  const response = await page.goto(missingPath)
  expect(response?.status()).toBe(404)
  expect(await response?.text()).toContain('找不到这个页面')
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: '找不到这个页面' })).toBeVisible()
  await expect(page.getByRole('main')).toContainText('404')
  await page.waitForLoadState('networkidle')
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  await page.getByRole('link', { name: '返回平台入口', exact: true }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { level: 1, name: '气象降尺度工作台' })).toBeVisible()
  await page.getByRole('link', { name: '前往登录' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { level: 1, name: '登录 MeteoWeave' })).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(errors).toEqual([])
})

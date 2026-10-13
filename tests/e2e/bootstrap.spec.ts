import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './browser-guard'

test('serves the Chinese product entry and reaches the login entry without browser errors', async ({
  page,
}) => {
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
  await expect(page.getByRole('main')).toContainText('认证尚未接入')
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
})

test('returns a real HTTP 404 with an accessible route back to the product entry', async ({
  page,
  baseURL,
  expectedDocument404s,
}) => {
  const missingPath = '/this-page-does-not-exist'
  expectedDocument404s.add(new URL(missingPath, baseURL).href)
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
})

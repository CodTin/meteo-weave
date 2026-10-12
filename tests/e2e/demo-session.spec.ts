import AxeBuilder from '@axe-core/playwright'
import { expect } from '@playwright/test'
import { test } from './browser-guard'

for (const [id, role, name] of [
  ['researcher', '研究人员', '研究演示账号'],
  ['policy', '决策者', '决策演示账号'],
  ['agriculture', '农业用户', '农业演示账号'],
] as const) {
  test(`${id} signs in with published demo details and restores the same SSR identity`, async ({
    page,
  }, testInfo) => {
    await page.goto('/login')
    await expect(page.getByRole('region', { name: '公开演示账号' })).toContainText(id)
    await expect(page.getByRole('region', { name: '公开演示账号' })).toContainText('meteo-demo')
    await page.getByLabel('账号', { exact: true }).fill(id)
    await page.getByLabel('密码', { exact: true }).fill('meteo-demo')
    await page.getByRole('button', { name: '登录演示账号', exact: true }).click()
    await expect(page).toHaveURL('/dashboard')
    await expect(page.getByRole('main')).not.toContainText('身份认证与任务服务尚未接入')
    await expect(page.getByRole('main')).not.toContainText('不代表已登录')
    const identity = page.getByRole('region', { name: '当前演示账号' })
    await expect(identity).toContainText(id)
    await expect(identity).toContainText(role)
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '任务管理', exact: true })
      .click()
    await expect(page).toHaveURL('/tasks')
    await expect(identity).toContainText(id)
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '设置', exact: true })
      .click()
    await expect(page.getByRole('main')).toContainText(name)
    await expect(page.getByRole('main')).not.toContainText('当前界面预览没有登录身份')
    const response = await page.reload()
    expect(response?.status()).toBe(200)
    expect(response?.headers()['cache-control']).toContain('no-store')
    const html = await response?.text()
    const serverIdentity = html?.match(
      /<section aria-label="当前演示账号"[^>]*>([\s\S]*?)<\/section>/,
    )?.[1]
    expect(serverIdentity).toContain(role)
    expect(serverIdentity).toContain(id)
    expect(serverIdentity).toContain(name)
    await page.goto('/settings')
    await expect(page.getByRole('main')).toContainText(name)
    await expect(identity).toContainText(id)
    await expect(identity).toContainText(role)
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([])
    await page.screenshot({ path: testInfo.outputPath('logged-in-settings.png'), fullPage: true })
  })
}

test('completes login using only the keyboard and announces the pending submission', async ({
  page,
}) => {
  let release = () => {}
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  // Delay the real request, not its business result.
  await page.route('**/*', async (route) => {
    if (route.request().method() === 'POST') await pending
    await route.continue()
  })
  await page.goto('/login')
  const account = page.getByLabel('账号', { exact: true })
  for (let tab = 0; tab < 12; tab++) {
    await page.keyboard.press('Tab')
    if (await account.evaluate((input) => input === document.activeElement)) break
  }
  await expect(account).toBeFocused()
  await page.keyboard.type('researcher')
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('密码', { exact: true })).toBeFocused()
  await page.keyboard.type('meteo-demo')
  await page.keyboard.press('Enter')
  try {
    await expect(page.getByRole('status')).toContainText('正在登录演示账号')
    await expect(page.getByRole('button', { name: '正在登录…', exact: true })).toBeDisabled()
    await expect(account).toBeDisabled()
  } finally {
    release()
  }
  await expect(page).toHaveURL('/dashboard')
  await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('researcher')
})

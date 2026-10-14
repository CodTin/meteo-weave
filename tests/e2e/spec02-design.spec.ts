import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './browser-guard'

test('Demo access separates the account guide from the form on desktop without losing the mobile reading order', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/login')
  const guide = page.getByRole('region', { name: '公开演示账号' })
  const form = page.getByRole('form', { name: 'Demo 登录表单' })
  const guideBox = await guide.boundingBox()
  const formBox = await form.boundingBox()
  expect(guideBox!.x + guideBox!.width + 24).toBeLessThanOrEqual(formBox!.x)
  expect(
    await page
      .getByRole('heading', { level: 1, name: '登录 MeteoWeave' })
      .evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
  ).toBeGreaterThanOrEqual(48)
  await page.screenshot({ path: testInfo.outputPath('login-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileGuide = await guide.boundingBox()
  const mobileForm = await form.boundingBox()
  expect(mobileForm!.y).toBeGreaterThan(mobileGuide!.y + mobileGuide!.height)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('login-mobile.png'), fullPage: true })
})

for (const width of [390, 768, 1440]) {
  test(`role selection at ${width}px distinguishes current identity from an unconfirmed next account`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/login')
    await page.getByLabel('账号', { exact: true }).fill('researcher')
    await page.getByLabel('密码', { exact: true }).fill('meteo-demo')
    await page.getByRole('button', { name: '登录演示账号', exact: true }).click()
    await expect(page).toHaveURL('/dashboard')
    await page.goto('/settings')
    await page.screenshot({ path: testInfo.outputPath(`settings-${width}.png`), fullPage: true })
    await page.getByRole('button', { name: '切换演示角色', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '切换演示角色', exact: true })
    const choice = dialog.getByRole('radio', { name: /农业用户/ })
    // Measure the settled dialog, not the opening scale animation.
    await dialog.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished))
    })
    const dialogBefore = await dialog.boundingBox()
    await choice.check()
    expect(await dialog.boundingBox()).toEqual(dialogBefore)
    await expect(dialog.getByText('已选择', { exact: true })).toBeVisible()
    await expect(dialog.getByText('当前账号：', { exact: false })).toContainText('研究人员')
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(`switch-${width}.png`), fullPage: true })
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('researcher')
    await expect(page.getByRole('button', { name: '切换演示角色', exact: true })).toBeFocused()
  })
}

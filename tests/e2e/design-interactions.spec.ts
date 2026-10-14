import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from './browser-guard'

async function settled(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  )
}
async function accessible(page: Page) {
  await settled(page)
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
}
async function inViewport(control: Locator, width: number) {
  await expect(control).toBeVisible()
  const box = await control.boundingBox()
  expect(box).not.toBeNull()
  if (!box) throw new Error('Visible control has no geometry')
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(width)
}

for (const width of [390, 768, 1440]) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test.describe(`design interactions ${width}px / ${reducedMotion}`, () => {
      test.use({ viewport: { width, height: 960 }, reducedMotion })
      test('keeps primary, input, error and modal states readable and keyboard-operable', async ({
        page,
      }, testInfo) => {
        await page.goto('/')
        const login = page.getByRole('link', { name: '前往登录', exact: true })
        await login.hover()
        await accessible(page)
        await login.focus()
        await expect(login).toBeFocused()
        await page.keyboard.press('Enter')
        await expect(
          page.getByRole('heading', { name: '登录 MeteoWeave', exact: true }),
        ).toBeVisible()
        const account = page.getByRole('textbox', { name: '账号', exact: true })
        await account.focus()
        await inViewport(account, width)
        await accessible(page)
        const submit = page.getByRole('button', { name: '登录演示账号' })
        await submit.hover()
        await accessible(page)
        await submit.click()
        await expect(account).toBeFocused()
        await expect(account).toHaveAttribute('aria-invalid', 'true')
        await accessible(page)
        await page.screenshot({ path: testInfo.outputPath('form-error.png'), fullPage: true })
        const explanation = page.getByRole('button', { name: '查看角色与演示说明' })
        await explanation.click()
        await accessible(page)
        await inViewport(page.getByRole('dialog'), width)
        await page.screenshot({ path: testInfo.outputPath('role-dialog.png'), fullPage: true })
        await page.keyboard.press('Escape')
        await expect(explanation).toBeFocused()
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        )
      })
    })
  }
}

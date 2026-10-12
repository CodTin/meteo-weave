import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const browserErrors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page, javaScriptEnabled }) => {
  const errors: string[] = []
  browserErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('requestfailed', (request) => {
    // Chromium implements JavaScript-disabled contexts by blocking scripts with CSP.
    // Only that intentional failure is allowed; assets/errors otherwise still fail.
    if (
      javaScriptEnabled === false &&
      request.resourceType() === 'script' &&
      request.failure()?.errorText === 'csp' &&
      new URL(request.url()).pathname.startsWith('/assets/')
    )
      return
    errors.push(`Request failed: ${request.url()} ${request.failure()?.errorText}`)
  })
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.startsWith('/assets/') && !response.ok()) {
      errors.push(`Asset failed: ${response.status()} ${response.url()}`)
    }
  })
})

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page)).toEqual([])
})

async function expectAccessible(page: Page) {
  // Audit the settled visible UI, not a partially transparent modal entrance frame.
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  )
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
}

test('locates required fields and explains that completed input is not authentication', async ({
  page,
}) => {
  await page.goto('/login')
  const account = page.getByLabel('账号', { exact: true })
  const password = page.getByLabel('密码', { exact: true })
  await expect(account).toBeVisible()
  await expect(account).toHaveAccessibleDescription(/必填.*虚构/)
  await expect(password).toHaveAccessibleDescription(/必填.*真实密码/)
  await expectAccessible(page)

  await page.getByRole('button', { name: '检查登录表单' }).click()
  await expect(account).toBeFocused()
  await expect(account).toHaveAttribute('aria-invalid', 'true')
  await expect(password).toHaveAttribute('aria-invalid', 'true')
  await expect(account).toHaveAccessibleDescription(/请输入账号/)
  await expect(password).toHaveAccessibleDescription(/请输入密码/)
  await expectAccessible(page)

  await account.fill('随意虚构的账号')
  await page.getByRole('button', { name: '检查登录表单' }).click()
  await expect(password).toBeFocused()
  await password.fill('x')
  await password.press('Enter')
  const status = page.getByRole('status')
  await expect(status).toContainText('演示认证尚未接入')
  await expect(status).toContainText('未验证账号或密码，也未建立会话')
  await expect(account).toHaveAttribute('aria-invalid', 'false')
  await expect(password).toHaveAttribute('aria-invalid', 'false')
  await expect(page).toHaveURL(/\/login$/)
  const explanation = page.getByRole('button', { name: '查看角色与演示说明' })
  await explanation.click()
  await expect(page.getByRole('dialog', { name: '角色与演示说明' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(explanation).toBeFocused()
  await expect(status).toContainText('演示认证尚未接入')
  await expectAccessible(page)
})

test('reveals and hides the password without losing its value or keyboard focus', async ({
  page,
}) => {
  await page.goto('/login')
  const password = page.getByLabel('密码', { exact: true })
  await password.fill('fictional-only')
  await expect(password).toHaveAttribute('type', 'password')
  await password.press('Tab')
  const reveal = page.getByRole('button', { name: '显示密码', exact: true })
  await expect(reveal).toBeFocused()
  await expect(reveal).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('Space')
  const hide = page.getByRole('button', { name: '隐藏密码', exact: true })
  await expect(hide).toBeFocused()
  await expect(hide).toHaveAttribute('aria-pressed', 'true')
  await expect(password).toHaveAttribute('type', 'text')
  await expect(password).toHaveValue('fictional-only')
  await expect(page.getByRole('status')).toBeEmpty()
  await page.keyboard.press('Space')
  await expect(reveal).toBeFocused()
  await expect(password).toHaveAttribute('type', 'password')
  await expect(password).toHaveValue('fictional-only')
  await page.keyboard.press('Shift+Tab')
  await expect(password).toBeFocused()
  await expectAccessible(page)
})

test('switches named tabs with arrows and preserves the in-memory form without submitting', async ({
  page,
}) => {
  await page.goto('/login')
  const login = page.getByRole('tab', { name: '登录', exact: true })
  const explanation = page.getByRole('tab', { name: '演示说明', exact: true })
  await expect(login).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel', { name: '登录', exact: true })).toBeVisible()
  await page.getByLabel('账号', { exact: true }).fill('fictional-tab-account')
  await login.click()
  await page.keyboard.press('ArrowRight')
  await expect(explanation).toBeFocused()
  await expect(explanation).toHaveAttribute('aria-selected', 'true')
  await expect(login).toHaveAttribute('aria-selected', 'false')
  const panel = page.getByRole('tabpanel', { name: '演示说明', exact: true })
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('Spec 02')
  await expect(panel).toContainText('研究人员')
  await expect(panel).toContainText('决策者')
  await expect(panel).toContainText('农业用户')
  await expect(page.getByLabel('账号', { exact: true })).toBeHidden()
  await expectAccessible(page)
  await page.keyboard.press('Home')
  await expect(login).toBeFocused()
  await expect(page.getByLabel('账号', { exact: true })).toHaveValue('fictional-tab-account')
  await expect(page.getByRole('status')).toBeEmpty()
  await page.keyboard.press('End')
  await expect(explanation).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(login).toBeFocused()
  await expect(login).toHaveAttribute('aria-selected', 'true')
  await expectAccessible(page)
})

test('explains the three roles in a modal and returns focus after Escape and Close', async ({
  page,
}) => {
  await page.goto('/login')
  const trigger = page.getByRole('button', { name: '查看角色与演示说明' })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '角色与演示说明' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAccessibleDescription(/Spec 02.*不能.*切换角色/)
  await expect(dialog).toContainText('研究人员')
  await expect(dialog).toContainText('模型细节')
  await expect(dialog).toContainText('决策者')
  await expect(dialog).toContainText('决策支持')
  await expect(dialog).toContainText('农业用户')
  await expect(dialog).toContainText('农业相关气象指标')
  for (const key of ['Tab', 'Tab', 'Shift+Tab', 'Shift+Tab']) {
    await page.keyboard.press(key)
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  }
  await expectAccessible(page)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(page.getByRole('status')).toBeEmpty()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '关闭说明' }).click()
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(page).toHaveURL(/\/login$/)
})

test('clears an outdated completion notice on edits while keeping required errors until corrected', async ({
  page,
}) => {
  await page.goto('/login')
  const account = page.getByLabel('账号', { exact: true })
  await account.fill('fictional')
  await page.getByLabel('密码', { exact: true }).fill('x')
  await page.getByRole('button', { name: '检查登录表单' }).click()
  await expect(page.getByRole('status')).toContainText('演示认证尚未接入')
  await account.fill('   ')
  await expect(page.getByRole('status')).toBeEmpty()
  await page.getByRole('button', { name: '检查登录表单' }).click()
  await expect(account).toBeFocused()
  await expect(account).toHaveAccessibleDescription(/请输入账号/)
  await page.getByRole('button', { name: '查看角色与演示说明' }).click()
  await page.keyboard.press('Escape')
  await expect(account).toHaveAccessibleDescription(/请输入账号/)
  await account.fill('another-fictional-account')
  await expect(account).toHaveAttribute('aria-invalid', 'false')
  await expect(page.getByRole('status')).toBeEmpty()
})

test('keeps fictional inputs out of requests, logs and persistence, including a revealed password', async ({
  page,
  context,
}) => {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  const beforeStorage = await context.storageState()
  const beforeSession = await page.evaluate(() => ({ ...sessionStorage }))
  const observed: string[] = []
  const submissions: string[] = []
  page.on('console', (message) => observed.push(message.text()))
  page.on('request', (request) => {
    observed.push(request.url(), request.postData() ?? '')
    if (request.method() !== 'GET') submissions.push(request.url())
  })
  const account = page.getByLabel('账号', { exact: true })
  const password = page.getByLabel('密码', { exact: true })
  // These are documented Replay boundary selectors, not private component state.
  await expect(page.getByRole('form', { name: '登录表单预览' })).toHaveAttribute(
    'data-sentry-block',
  )
  for (const input of [account, password]) {
    await expect(input).toHaveAttribute('data-sentry-mask')
    await expect(input).toHaveAttribute('data-sentry-ignore')
    await expect(input).toHaveAttribute('autocomplete', 'off')
  }
  const markers = ['fictional-account-20-never-send', 'fictional-password-20-never-send'] as const
  await account.fill(markers[0])
  await password.fill(markers[1])
  await page.getByRole('button', { name: '显示密码', exact: true }).click()
  await expect(password).toHaveAttribute('type', 'text')
  await expect(password).toHaveAttribute('data-sentry-mask')
  await expect(password).toHaveAttribute('data-sentry-ignore')
  await page.getByRole('button', { name: '检查登录表单' }).click()
  await expect(page.getByRole('status')).toContainText('演示认证尚未接入')
  await expect(page).toHaveURL(/\/login$/)
  expect(await context.storageState()).toEqual(beforeStorage)
  expect(await page.evaluate(() => ({ ...sessionStorage }))).toEqual(beforeSession)
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([])
  expect(submissions).toEqual([])
  for (const marker of markers) {
    expect(observed.join('\n')).not.toContain(marker)
    await expect(page.getByRole('status')).not.toContainText(marker)
  }
  await page.reload()
  await expect(account).toHaveValue('')
  await expect(password).toHaveValue('')
  await expect(password).toHaveAttribute('type', 'password')
  await expect(page.getByRole('status')).toBeEmpty()
})

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('disables input and native submission rather than putting values in a URL', async ({
    page,
  }) => {
    const response = await page.goto('/login')
    expect(response?.status()).toBe(200)
    await expect(page.getByLabel('账号', { exact: true })).toBeDisabled()
    await expect(page.getByLabel('密码', { exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: '检查登录表单' })).toBeDisabled()
    await expect(page.getByRole('main')).toContainText('当前输入与提交已禁用，不会发送数据')
    await expect(page).toHaveURL(/\/login$/)
  })
})

for (const width of [390, 768, 1440]) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test.describe(`login ${width}px / ${reducedMotion}`, () => {
      test.use({ viewport: { width, height: 900 }, reducedMotion })

      test('keeps errors, tabs, feedback and the modal accessible without viewport overflow', async ({
        page,
      }, testInfo) => {
        await page.goto('/login')
        await page.getByRole('button', { name: '检查登录表单' }).click()
        await expect(page.getByLabel('账号', { exact: true })).toBeFocused()
        await expectAccessible(page)
        await page.screenshot({ path: testInfo.outputPath('required-errors.png'), fullPage: true })
        await page.getByLabel('账号', { exact: true }).fill('虚构预览内容')
        await page.getByLabel('密码', { exact: true }).fill('x')
        await page.getByRole('button', { name: '检查登录表单' }).click()
        await expect(page.getByRole('status')).toContainText('演示认证尚未接入')
        await expectAccessible(page)
        await page.screenshot({ path: testInfo.outputPath('inline-status.png'), fullPage: true })
        await page.getByRole('tab', { name: '演示说明', exact: true }).click()
        await expectAccessible(page)
        await page.screenshot({ path: testInfo.outputPath('explanation-tab.png'), fullPage: true })
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        )

        const trigger = page.getByRole('button', { name: '查看角色与演示说明' })
        await trigger.click()
        const dialog = page.getByRole('dialog', { name: '角色与演示说明' })
        await expect(dialog).toBeVisible()
        await expectAccessible(page)
        const bounds = await dialog.boundingBox()
        expect(bounds).not.toBeNull()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.y).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900)
        if (reducedMotion === 'reduce') {
          expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
        }
        await page.screenshot({ path: testInfo.outputPath('role-dialog.png'), fullPage: true })
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
        await expect(trigger).toBeFocused()
        const focus = await trigger.evaluate((element) => {
          const style = getComputedStyle(element)
          return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) }
        })
        expect(focus.style).not.toBe('none')
        expect(focus.width).toBeGreaterThanOrEqual(2)
        if (reducedMotion === 'reduce') {
          await trigger.hover()
          expect(
            await trigger.evaluate((element) => getComputedStyle(element).transitionDuration),
          ).toBe('0s')
        }
        await page.getByRole('tab', { name: '登录', exact: true }).click()
        await expect(page.getByRole('status')).toContainText('演示认证尚未接入')
      })
    })
  }
}

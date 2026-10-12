import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'
import { test } from './browser-guard'
import { submitDemoLogin } from './demo-login'
import { holdNextSessionResponse } from './held-session-response'

async function openSettings(page: Page, account = 'researcher') {
  await page.goto('/login')
  await submitDemoLogin(page, account)
  await expect(page).toHaveURL('/dashboard')
  await page.goto('/settings')
  await expect(page.getByRole('main')).toContainText(account)
}

test('canceling a selected role keeps the current session and settings workspace intact', async ({
  page,
}) => {
  await openSettings(page)
  const documents: string[] = []
  page.on('request', (request) => {
    if (request.isNavigationRequest()) documents.push(request.url())
  })
  const trigger = page.getByRole('button', { name: '切换演示角色', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '切换演示角色', exact: true })
  await expect(dialog).toContainText('退出当前会话')
  await expect(dialog).toContainText('重新登录')
  await expect(dialog.getByRole('radio')).toHaveCount(2)
  await dialog.getByRole('radio', { name: /决策者/ }).check()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
  await expect(page).toHaveURL('/settings')
  await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('researcher')
  expect(documents).toEqual([])
  const response = await page.request.get('/settings', { maxRedirects: 0 })
  expect(response.status()).toBe(200)
  expect(await response.text()).toContain('研究演示账号')
})

test('confirming a role ends the old session before returning to login without authenticating the target', async ({
  page,
}) => {
  await openSettings(page)
  await page.getByRole('button', { name: '切换演示角色', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '切换演示角色', exact: true })
  const confirm = dialog.getByRole('button', { name: '退出并重新登录', exact: true })
  await expect(confirm).toBeDisabled()
  await dialog.getByRole('radio', { name: /决策者/ }).check()
  await confirm.click()
  await expect(page).toHaveURL(/\/login(?:\?|$)/)
  await expect(page.getByRole('region', { name: '当前演示账号' })).toHaveCount(0)
  expect((await page.request.get('/settings', { maxRedirects: 0 })).status()).toBe(307)
  await page.getByLabel('账号', { exact: true }).fill('policy')
  await page.getByLabel('密码', { exact: true }).fill('wrong-demo-password')
  await page.getByRole('button', { name: '登录演示账号', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('演示账号或密码不正确')
  expect((await page.request.get('/dashboard', { maxRedirects: 0 })).status()).toBe(307)
  await submitDemoLogin(page, 'policy')
  await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('policy')
  await page.reload()
  await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('决策者')
})

test('the confirmed target is only an editable account preselection with an empty password', async ({
  page,
}) => {
  await openSettings(page)
  await page.getByRole('button', { name: '切换演示角色', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '切换演示角色', exact: true })
  await dialog.getByRole('radio', { name: /农业用户/ }).check()
  await dialog.getByRole('button', { name: '退出并重新登录', exact: true }).click()
  await expect(page).toHaveURL('/login?account=agriculture')
  await expect(page.getByLabel('账号', { exact: true })).toHaveValue('agriculture')
  await expect(page.getByLabel('密码', { exact: true })).toBeEmpty()
  await expect(page.getByRole('main')).toContainText('仅预选账号，尚未登录')
  await page.reload()
  await expect(page.getByLabel('账号', { exact: true })).toHaveValue('agriculture')
  expect((await page.request.get('/dashboard', { maxRedirects: 0 })).status()).toBe(307)
  // Editing a preselected account still requires the real login request and permits
  // another canonical account; the hint is never the authority for identity.
  await submitDemoLogin(page, 'policy')
  await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('policy')
})

test('a failed role-switch logout retains its confirmed target through the focused root retry', async ({
  page,
  expectedSessionTransportFailures,
}) => {
  await openSettings(page)
  await page.getByRole('button', { name: '切换演示角色', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '切换演示角色', exact: true })
  await dialog.getByRole('radio', { name: /决策者/ }).check()
  let fail = true
  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() === 'POST' && fail) {
      fail = false
      expectedSessionTransportFailures.add(route.request().url())
      await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Service Unavailable' })
    } else {
      await route.continue()
    }
  })
  await dialog.getByRole('button', { name: '退出并重新登录', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('暂时无法确认退出')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('region', { name: '当前演示账号' })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: '工作区导航', exact: true })).toHaveCount(0)
  expect((await page.request.get('/settings', { maxRedirects: 0 })).status()).toBe(200)
  await expect(page.getByRole('button', { name: '重试退出', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/login?account=policy')
  await expect(page.getByLabel('账号', { exact: true })).toHaveValue('policy')
  await expect(page.getByLabel('密码', { exact: true })).toBeEmpty()
  expect((await page.request.get('/settings', { maxRedirects: 0 })).status()).toBe(307)
})

for (const dismissal of ['关闭', 'Escape'] as const) {
  test(`${dismissal} abandons role selection without a request or workspace navigation`, async ({
    page,
  }) => {
    await openSettings(page, 'policy')
    const posts: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST') posts.push(request.url())
    })
    const trigger = page.getByRole('button', { name: '切换演示角色', exact: true })
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: '切换演示角色', exact: true })
    await dialog.getByRole('radio', { name: /研究人员/ }).check()
    if (dismissal === 'Escape') await page.keyboard.press('Escape')
    else await dialog.getByRole('button', { name: '关闭', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await expect(trigger).toBeFocused()
    await expect(page).toHaveURL('/settings')
    await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('policy')
    expect(posts).toEqual([])
    // Reopening starts a new, unconfirmed selection rather than reusing a canceled one.
    await trigger.click()
    await expect(dialog.getByRole('button', { name: '退出并重新登录', exact: true })).toBeDisabled()
    await page.keyboard.press('Escape')
    const response = await page.reload()
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('main')).toContainText('决策演示账号')
  })
}

const identities = [
  ['researcher', '研究人员'],
  ['policy', '决策者'],
  ['agriculture', '农业用户'],
] as const
for (const [from] of identities) {
  for (const [to, role] of identities) {
    if (from === to) continue
    test(`${from} switches to ${to} only after reauthentication and gets its current capabilities`, async ({
      page,
    }) => {
      await openSettings(page, from)
      await page.getByRole('button', { name: '切换演示角色', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: '切换演示角色', exact: true })
      await expect(dialog.getByRole('radio')).toHaveCount(2)
      await dialog.getByRole('radio', { name: new RegExp(role) }).check()
      await dialog.getByRole('button', { name: '退出并重新登录', exact: true }).click()
      await expect(page.getByLabel('账号', { exact: true })).toHaveValue(to)
      await expect(page.getByLabel('密码', { exact: true })).toBeEmpty()
      expect((await page.request.get('/tasks/new', { maxRedirects: 0 })).status()).toBe(307)
      // Do not fill the account here: prove the actual preselected form is submitted.
      await page.getByLabel('密码', { exact: true }).fill('meteo-demo')
      await page.getByRole('button', { name: '登录演示账号', exact: true }).click()
      await expect(page).toHaveURL('/dashboard')
      const identity = page.getByRole('region', { name: '当前演示账号' })
      await expect(identity).toContainText(to)
      await expect(identity).not.toContainText(from)
      await page
        .getByRole('navigation', { name: '工作区导航', exact: true })
        .getByRole('link', { name: '创建任务', exact: true })
        .click()
      const capabilities = page.getByRole('region', { name: '当前角色的配置能力' })
      await expect(capabilities).toContainText(role)
      await expect(
        capabilities.getByRole('list', { name: '可用降尺度方法' }).getByRole('listitem'),
      ).toHaveText(to === 'researcher' ? ['推荐方法', '确定性方法', '概率式方法'] : ['推荐方法'])
      await page.reload()
      await expect(identity).toContainText(to)
      await page.goto('/settings')
      await expect(page.getByRole('main')).toContainText(role)
      await expect(page.getByRole('main')).toContainText(to)
    })
  }
}

for (const hint of [
  'admin',
  ' researcher ',
  '{"id":"researcher","role":"researcher"}',
  '["policy"]',
  'https://example.com',
  '__proto__',
]) {
  test(`invalid account preselection ${hint} is ignored rather than establishing an identity`, async ({
    page,
  }) => {
    const query = new URLSearchParams({
      account: hint,
      role: 'researcher',
      returnTo: 'https://example.com',
    })
    const response = await page.goto(`/login?${query}`)
    expect(response?.status()).toBe(200)
    await expect(page.getByLabel('账号', { exact: true })).toBeEmpty()
    await expect(page.getByLabel('密码', { exact: true })).toBeEmpty()
    await expect(page.getByText('仅预选账号，尚未登录', { exact: false })).toHaveCount(0)
    expect((await page.request.get('/settings', { maxRedirects: 0 })).status()).toBe(307)
    await submitDemoLogin(page, 'agriculture')
    await expect(page).toHaveURL('/dashboard')
    await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('agriculture')
  })
}

test('a valid account URL is only a hint and preserves a safe return destination after real login', async ({
  page,
}) => {
  await page.goto('/login?account=policy&role=researcher&returnTo=%2Ftasks%2Fnew')
  await expect(page.getByLabel('账号', { exact: true })).toHaveValue('policy')
  await expect(page.getByLabel('密码', { exact: true })).toBeEmpty()
  expect((await page.request.get('/tasks/new', { maxRedirects: 0 })).status()).toBe(307)
  await page.getByLabel('密码', { exact: true }).fill('meteo-demo')
  await page.getByRole('button', { name: '登录演示账号', exact: true }).click()
  await expect(page).toHaveURL('/tasks/new')
  await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('policy')
  await expect(
    page.getByRole('region', { name: '当前角色的配置能力' }).getByRole('listitem'),
  ).toHaveText(['推荐方法'])
})

for (const width of [390, 768, 1440]) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`keyboard role switch at ${width}px with ${reducedMotion} motion traps focus and reauthenticates`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 844 })
      await page.emulateMedia({ reducedMotion })
      await openSettings(page)
      const trigger = page.getByRole('button', { name: '切换演示角色', exact: true })
      await trigger.focus()
      await page.keyboard.press('Enter')
      const dialog = page.getByRole('dialog', { name: '切换演示角色', exact: true })
      await expect(dialog).toHaveAccessibleDescription(/退出当前会话.*重新登录/)
      await expect(dialog.getByRole('radio', { name: /决策者/ })).toBeFocused()
      await page.keyboard.press('Space')
      await page.keyboard.press('ArrowDown')
      await expect(dialog.getByRole('radio', { name: /农业用户/ })).toBeChecked()
      for (const key of [
        'Tab',
        'Tab',
        'Tab',
        'Tab',
        'Shift+Tab',
        'Shift+Tab',
        'Shift+Tab',
        'Shift+Tab',
      ]) {
        await page.keyboard.press(key)
        expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
          true,
        )
      }
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([])
      const bounds = await dialog.boundingBox()
      expect(bounds).not.toBeNull()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
      expect(bounds!.y).toBeGreaterThanOrEqual(0)
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
      await page.screenshot({ path: testInfo.outputPath('role-switch.png'), fullPage: true })
      await page.keyboard.press('Escape')
      await expect(trigger).toBeFocused()
      await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('researcher')
      await page.keyboard.press('Enter')
      await expect(dialog.getByRole('radio', { name: /决策者/ })).toBeFocused()
      await page.keyboard.press('Space')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Tab')
      await expect(
        dialog.getByRole('button', { name: '退出并重新登录', exact: true }),
      ).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page.getByLabel('账号', { exact: true })).toHaveValue('agriculture')
      await page.getByLabel('密码', { exact: true }).fill('meteo-demo')
      await page.getByLabel('密码', { exact: true }).press('Enter')
      await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('agriculture')
    })
  }
}

test('a pending switch gates the outgoing workspace before the logout request completes', async ({
  page,
}) => {
  await openSettings(page)
  await page.getByRole('button', { name: '切换演示角色', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '切换演示角色', exact: true })
  await dialog.getByRole('radio', { name: /农业用户/ }).check()
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() === 'POST') await held
    await route.continue()
  })
  try {
    await dialog.getByRole('button', { name: '退出并重新登录', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('正在退出登录')
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('region', { name: '当前演示账号' })).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: '工作区导航', exact: true })).toHaveCount(0)
    expect((await page.request.get('/settings', { maxRedirects: 0 })).status()).toBe(200)
  } finally {
    release()
  }
  await expect(page).toHaveURL('/login?account=agriculture')
  expect((await page.request.get('/settings', { maxRedirects: 0 })).status()).toBe(307)
})

test('Back, refresh and direct protected entry cannot restore a session after confirming a switch', async ({
  page,
}) => {
  await openSettings(page)
  await page.getByRole('button', { name: '切换演示角色', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '切换演示角色', exact: true })
  await dialog.getByRole('radio', { name: /决策者/ }).check()
  await dialog.getByRole('button', { name: '退出并重新登录', exact: true }).click()
  await expect(page).toHaveURL('/login?account=policy')
  for (const visit of [
    () => page.goBack(),
    () => page.goForward(),
    () => page.reload(),
    () => page.goto('/settings'),
  ]) {
    await visit()
    await expect(page).toHaveURL(/\/login(?:\?|$)/)
    await expect(page.getByRole('region', { name: '当前演示账号' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '切换演示角色', exact: true })).toHaveCount(0)
  }
  await submitDemoLogin(page, 'policy')
  await expect(page).toHaveURL('/settings')
  await expect(page.getByRole('main')).toContainText('决策演示账号')
})

test('visiting or editing a login preselection never changes an existing authenticated identity', async ({
  page,
}) => {
  await openSettings(page)
  await page.goto('/login?account=policy&role=policy')
  await expect(page.getByLabel('账号', { exact: true })).toHaveValue('policy')
  await page.getByLabel('账号', { exact: true }).fill('agriculture')
  const response = await page.request.get('/settings', { maxRedirects: 0 })
  expect(response.status()).toBe(200)
  expect(await response.text()).toContain('研究演示账号')
  await page.goto('/settings')
  await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('researcher')
})

test('a delayed outgoing identity response cannot reappear after a confirmed role switch', async ({
  page,
  expectedSessionTransportFailures,
}) => {
  await openSettings(page)
  const delayed = await holdNextSessionResponse(page, expectedSessionTransportFailures)
  await page
    .getByRole('navigation', { name: '工作区导航', exact: true })
    .getByRole('link', { name: '创建任务', exact: true })
    .hover()
  const { url: serviceUrl, response } = await delayed.ready
  try {
    expect(response.status()).toBe(200)
    expect(await response.text()).toContain('researcher')
    await page.getByRole('button', { name: '切换演示角色', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '切换演示角色', exact: true })
    await dialog.getByRole('radio', { name: /决策者/ }).check()
    await dialog.getByRole('button', { name: '退出并重新登录', exact: true }).click()
    await expect(page).toHaveURL('/login?account=policy')
    const anonymous = await page.request.get(serviceUrl, { maxRedirects: 0 })
    expect(anonymous.status()).toBe(307)
    expect(anonymous.headers()['cache-control']).toContain('no-store')
    await page.getByLabel('密码', { exact: true }).fill('meteo-demo')
    await page.getByRole('button', { name: '登录演示账号', exact: true }).click()
    await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('policy')
    delayed.release()
    await delayed.finished
    const current = await page.request.get(serviceUrl)
    expect(current.status()).toBe(200)
    expect(await current.text()).toContain('policy')
    expect(await current.text()).not.toContain('researcher')
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '创建任务', exact: true })
      .click()
    await expect(
      page.getByRole('region', { name: '当前角色的配置能力' }).getByRole('listitem'),
    ).toHaveText(['推荐方法'])
    await page.reload()
    await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('policy')
  } finally {
    delayed.release()
  }
})

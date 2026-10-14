import { expect } from './browser-guard'
import { test } from './browser-guard'
import { submitDemoLogin } from './demo-login'
import { holdNextSessionResponse } from './held-session-response'

test('keyboard logout ends the session and protects Back, refresh and reopened workspace pages', async ({
  page,
}) => {
  await page.goto('/login')
  await submitDemoLogin(page)
  await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('researcher')
  await page
    .getByRole('navigation', { name: '工作区导航', exact: true })
    .getByRole('link', { name: '设置', exact: true })
    .click()
  await expect(page).toHaveURL('/settings')
  const logout = page.getByRole('button', { name: '退出登录', exact: true })
  await logout.focus()
  await expect(logout).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/login')
  await expect(page.getByRole('heading', { level: 1, name: '登录 MeteoWeave' })).toBeVisible()
  await expect(page.getByRole('region', { name: '当前演示账号' })).toHaveCount(0)
  for (const visit of [
    () => page.goBack(),
    () => page.goForward(),
    () => page.reload(),
    () => page.goto('/settings'),
  ]) {
    await visit()
    await expect(page).toHaveURL(/\/login(?:\?|$)/)
    await expect(page.getByRole('region', { name: '当前演示账号' })).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: '工作区导航', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '登录演示账号', exact: true })).toBeEnabled()
  }
  const protectedResponse = await page.request.get('/dashboard', { maxRedirects: 0 })
  expect(protectedResponse.status()).toBe(307)
  expect(protectedResponse.headers()['cache-control']).toContain('no-store')
})

test('a signed-in user submitting another account receives a fresh workspace document for that account', async ({
  page,
}) => {
  await page.goto('/login')
  await submitDemoLogin(page)
  await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('researcher')
  await page.getByRole('link', { name: '平台入口', exact: true }).click()
  await page.getByRole('link', { name: '前往登录', exact: true }).click()
  await expect(page).toHaveURL('/login')
  const documents: string[] = []
  page.on('response', (response) => {
    if (
      response.request().isNavigationRequest() &&
      new URL(response.url()).pathname === '/dashboard'
    )
      documents.push(response.url())
  })
  await submitDemoLogin(page, 'policy')
  await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('policy')
  await expect(page.getByRole('region', { name: '当前演示账号' })).not.toContainText('researcher')
  expect(documents).toHaveLength(1)
  const response = await page.reload()
  expect(await response?.text()).toContain('决策演示账号')
  await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('policy')
})

test('logging out from the open mobile menu discards the outgoing dialog state before another account logs in', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')
  await submitDemoLogin(page)
  await page.getByRole('button', { name: '打开工作区导航' }).click()
  const menu = page.getByRole('dialog', { name: '工作区菜单' })
  await expect(menu).toBeVisible()
  const logout = menu.getByRole('button', { name: '退出登录', exact: true })
  await logout.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/login')
  await expect(menu).toHaveCount(0)
  await submitDemoLogin(page, 'agriculture')
  await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('agriculture')
  await expect(menu).not.toBeVisible()
  await page.getByRole('button', { name: '打开工作区导航' }).click()
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).not.toBeVisible()
  await expect(page.getByRole('button', { name: '打开工作区导航' })).toBeFocused()
  await page.getByRole('main').scrollIntoViewIfNeeded()
})

test('a failed logout keeps the workspace hidden and focuses a retry that really ends the session', async ({
  page,
  expectedSessionTransportFailures,
}) => {
  await page.goto('/login')
  await submitDemoLogin(page)
  await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('researcher')
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
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('暂时无法确认退出')
  await expect(page.getByRole('region', { name: '当前演示账号' })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: '工作区导航', exact: true })).toHaveCount(0)
  // A failed transport must not be reported as a successful cookie change.
  expect((await page.request.get('/dashboard', { maxRedirects: 0 })).status()).toBe(200)
  const retry = page.getByRole('button', { name: '重试退出', exact: true })
  await expect(retry).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/login')
  expect((await page.request.get('/dashboard', { maxRedirects: 0 })).status()).toBe(307)
})

test('pending logout removes account content before the real server request is allowed to finish', async ({
  page,
}) => {
  await page.goto('/login')
  await submitDemoLogin(page)
  await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('researcher')
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() === 'POST') await held
    await route.continue()
  })
  try {
    await page.getByRole('button', { name: '退出登录', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('正在退出登录')
    await expect(page.getByRole('region', { name: '当前演示账号' })).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: '工作区导航', exact: true })).toHaveCount(0)
    expect((await page.request.get('/dashboard', { maxRedirects: 0 })).status()).toBe(200)
  } finally {
    release()
  }
  await expect(page).toHaveURL('/login')
  expect((await page.request.get('/dashboard', { maxRedirects: 0 })).status()).toBe(307)
})

for (const transition of ['logout', 'public login'] as const) {
  test(`a late researcher session response cannot enter policy's workspace after ${transition}`, async ({
    page,
    expectedSessionTransportFailures,
  }) => {
    await page.goto('/login')
    await submitDemoLogin(page)
    await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('researcher')
    const delayed = await holdNextSessionResponse(page, expectedSessionTransportFailures)
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '设置', exact: true })
      .hover()
    const { url: serviceUrl, response } = await delayed.ready
    try {
      expect(response.status()).toBe(200)
      expect(await response.text()).toContain('researcher')
      if (transition === 'logout') {
        await page.getByRole('button', { name: '退出登录', exact: true }).click()
        await expect(page).toHaveURL('/login')
        const anonymous = await page.request.get(serviceUrl, { maxRedirects: 0 })
        expect(anonymous.status()).toBe(307)
        expect(anonymous.headers()['location']).toContain('/login')
        expect(anonymous.headers()['cache-control']).toContain('no-store')
      } else {
        await page.getByRole('link', { name: '平台入口', exact: true }).click()
        await page.getByRole('link', { name: '前往登录', exact: true }).click()
      }
      await submitDemoLogin(page, 'policy')
      await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('policy')
      delayed.release()
      await delayed.finished
      const current = await page.request.get(serviceUrl)
      expect(current.status()).toBe(200)
      expect(await current.text()).toContain('policy')
      expect(await current.text()).not.toContain('researcher')
      await page
        .getByRole('navigation', { name: '工作区导航', exact: true })
        .getByRole('link', { name: '设置', exact: true })
        .click()
      await expect(page.getByRole('main')).toContainText('决策演示账号')
      await expect(page.getByRole('region', { name: '当前演示账号' })).not.toContainText(
        'researcher',
      )
      await page.reload()
      await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('policy')
    } finally {
      delayed.release()
    }
  })
}

test('successful login announces opening the new workspace while its document is still loading', async ({
  page,
}) => {
  await page.goto('/login')
  const visibleTransitions: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'debug' && message.text().startsWith('visible-session:')) {
      visibleTransitions.push(message.text())
    }
  })
  // Observe actual rendered status while the old document is alive. Playwright's
  // locator/evaluate requests otherwise wait for a pending main-frame navigation.
  await page.evaluate(() => {
    new MutationObserver(() => {
      const status = document.querySelector('output')?.textContent?.trim()
      const hasWorkspace = Boolean(document.querySelector('[aria-label="当前演示账号"]'))
      console.debug(`visible-session:${status}|workspace:${hasWorkspace}`)
    }).observe(document.body, { childList: true, subtree: true, characterData: true })
  })
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/dashboard', async (route) => {
    if (route.request().isNavigationRequest()) await held
    await route.continue()
  })
  try {
    // A click can await its document navigation. Observe and release that held
    // document concurrently, instead of waiting for the click to finish first.
    await Promise.all([
      submitDemoLogin(page, 'policy'),
      expect
        .poll(() => visibleTransitions)
        .toContain('visible-session:正在打开工作区…|workspace:false')
        .finally(release),
    ])
  } finally {
    release()
  }
  await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('policy')
})

for (const transition of ['logout', 'public login'] as const) {
  test(`the outgoing research capability UI is discarded on ${transition} and policy gets only its own methods`, async ({
    page,
  }) => {
    await page.goto('/login')
    await submitDemoLogin(page)
    const createTask = () =>
      page
        .getByRole('navigation', { name: '工作区导航', exact: true })
        .getByRole('link', { name: '创建任务', exact: true })
    await createTask().click()
    const capabilities = page.getByRole('region', { name: '当前角色的配置能力' })
    await expect(capabilities).toContainText('可使用研究高级参数')
    await expect(capabilities.getByRole('listitem')).toHaveText([
      '推荐方法',
      '确定性方法',
      '概率式方法',
    ])
    if (transition === 'logout') {
      await page.getByRole('button', { name: '退出登录', exact: true }).click()
    } else {
      await page.getByRole('link', { name: '平台入口', exact: true }).click()
      await page.getByRole('link', { name: '前往登录', exact: true }).click()
    }
    await expect(page).toHaveURL('/login')
    await expect(capabilities).toHaveCount(0)
    await submitDemoLogin(page, 'policy')
    await createTask().click()
    await expect(capabilities).toContainText('决策者')
    await expect(capabilities.getByRole('listitem')).toHaveText(['推荐方法'])
    await expect(capabilities).not.toContainText('可使用研究高级参数')
    await page.reload()
    await expect(capabilities.getByRole('listitem')).toHaveText(['推荐方法'])
    await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('policy')
  })
}

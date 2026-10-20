import AxeBuilder from '@axe-core/playwright'
import { holdNextSessionResponse } from './held-session-response'
import { expect, test, type Page } from './browser-guard'
import { signInDemo, submitDemoLogin } from './demo-login'
import { compareCase } from './workspace-cases'

const temperature = 'Synthetic Demo · Alpine mountain temperature'
const wind = 'Synthetic Demo · Coastal plain wind ensemble'

function catalogPair(account = 'researcher') {
  const search = new URLSearchParams({
    a: `demo-v1:${account}:alpine-temperature`,
    b: `demo-v1:${account}:coastal-wind`,
  })
  return `${compareCase.path}?${search}`
}

async function expectNoComparison(page: Page) {
  await expect(page.getByRole('region', { name: '对比任务身份', exact: true })).toHaveCount(0)
  await expect(page.getByRole('table')).toHaveCount(0)
  await expect(page.getByRole('img', { name: /实际样本空间场/ })).toHaveCount(0)
  await expect(page.getByRole('region', { name: '共同样本精度指标' })).toHaveCount(0)
  await expect(page.getByRole('main')).not.toContainText(temperature)
  await expect(page.getByRole('main')).not.toContainText(wind)
}

async function expectLoadedPair(page: Page, account = 'researcher') {
  await expect(page).toHaveURL((target) => target.pathname === compareCase.path)
  const target = new URL(page.url())
  expect(target.pathname).toBe(compareCase.path)
  expect(target.searchParams.get('a')).toBe(`demo-v1:${account}:alpine-temperature`)
  expect(target.searchParams.get('b')).toBe(`demo-v1:${account}:coastal-wind`)
  await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText(account)
  const identities = page.getByRole('region', { name: '对比任务身份', exact: true })
  await expect(identities.getByRole('heading')).toHaveText([`A · ${temperature}`, `B · ${wind}`])
  await expect(
    identities.getByText(`demo-v1:${account}:alpine-temperature`, { exact: true }),
  ).toBeVisible()
  await expect(
    identities.getByText(`demo-v1:${account}:coastal-wind`, { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('table', { name: '完整配置参数差异，A／B 对应选择顺序' }),
  ).toBeVisible()
  await expect(page.getByRole('img', { name: /实际样本空间场/ })).toHaveCount(2)
  await expect(page.getByRole('main')).toContainText('气象变量不同，不能直接比较精度数值')
  await expect(page.getByRole('region', { name: '共同样本精度指标' })).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page).toHaveTitle('任务对比 · MeteoWeave')
}

async function selectCatalogPair(page: Page) {
  for (const name of [temperature, wind]) {
    await page.getByRole('checkbox', { name: `选择任务 ${name} 进行对比`, exact: true }).check()
  }
  const action = page.getByRole('link', { name: '对比所选任务', exact: true })
  await expect(action).toBeVisible()
  const target = new URL((await action.getAttribute('href')) ?? '', page.url())
  expect(target.pathname).toBe(compareCase.path)
  expect(target.searchParams.get('a')).toBe('demo-v1:researcher:alpine-temperature')
  expect(target.searchParams.get('b')).toBe('demo-v1:researcher:coastal-wind')
  return action
}

test.describe('comparison without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('direct SSR is honest loading with the current authenticated identity, never private task data', async ({
    browser,
    context,
    page,
  }, testInfo) => {
    // Copy only the real published login's cookies into the no-JS browser; no manufactured session.
    const authenticated = await browser.newContext({ javaScriptEnabled: true })
    try {
      await signInDemo(authenticated)
      await context.addCookies(await authenticated.cookies())
    } finally {
      await authenticated.close()
    }
    const response = await page.goto(catalogPair())
    expect(response?.status()).toBe(200)
    const source = await response!.text()
    const server = await page.evaluate((html) => {
      const document = new DOMParser().parseFromString(html, 'text/html')
      return {
        identity: document.querySelector('[aria-label="当前演示账号"]')?.textContent,
        heading: document.querySelector('main h1')?.textContent,
        loading: document.querySelector('main output')?.textContent,
        identities: document.querySelectorAll('[aria-label="对比任务身份"]').length,
        tables: document.querySelectorAll('main table').length,
      }
    }, source)
    expect(server.identity).toContain('researcher')
    expect(server.heading).toBe(compareCase.contentHeading)
    expect(server.loading).toContain(compareCase.content)
    expect(server.identities).toBe(0)
    expect(server.tables).toBe(0)
    expect(source).not.toContain(temperature)
    expect(source).not.toContain(wind)
    await expect(page.getByRole('main')).toHaveAccessibleName(compareCase.title)
    await expect(page.getByRole('main').getByRole('status')).toContainText(compareCase.content)
    await expectNoComparison(page)
    await expect(page.getByRole('link', { name: '返回任务管理', exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('no-js-ssr.png'), fullPage: true })
    await page.getByRole('link', { name: '返回任务管理', exact: true }).click()
    await expect(page).toHaveURL('/tasks')
    await expect(page.getByRole('heading', { name: '任务管理', exact: true })).toBeVisible()
  })
})

test('a healthy delayed direct comparison retains the real SSR shell through hydration and navigation', async ({
  context,
  page,
}) => {
  await signInDemo(context)
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let received = () => {}
  const requested = new Promise<void>((resolve) => {
    received = resolve
  })
  await page.route(compareCase.module, async (route) => {
    received()
    await held
    await route.continue()
  })
  try {
    const response = await page.goto(catalogPair(), { waitUntil: 'domcontentloaded' })
    await requested
    expect(response?.status()).toBe(200)
    const source = await response!.text()
    const server = await page.evaluate((html) => {
      const document = new DOMParser().parseFromString(html, 'text/html')
      return {
        heading: document.querySelector('main h1')?.textContent,
        identity: document.querySelector('[aria-label="当前演示账号"]')?.textContent,
        loading: document.querySelector('main output')?.textContent,
      }
    }, source)
    expect(server.heading).toBe(compareCase.title)
    expect(server.identity).toContain('researcher')
    expect(server.loading).toContain(compareCase.content)
    expect(source).not.toContain(temperature)
    expect(source).not.toContain(wind)
    await expectNoComparison(page)
    const heading = await page
      .getByRole('heading', { name: compareCase.title, exact: true })
      .elementHandle()
    const main = await page.getByRole('main').elementHandle()
    const identity = await page.getByRole('region', { name: '当前演示账号' }).elementHandle()
    expect(heading).not.toBeNull()
    expect(main).not.toBeNull()
    expect(identity).not.toBeNull()
    release()
    await expectLoadedPair(page)
    for (const element of [heading, main, identity]) {
      expect(await element!.evaluate((node) => node.isConnected)).toBe(true)
    }
    const navigation = page.getByRole('navigation', { name: '工作区导航', exact: true })
    await expect(navigation.getByRole('link', { name: '任务管理', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await navigation.getByRole('link', { name: '设置', exact: true }).click()
    await expect(page).toHaveURL('/settings')
    await expect(page.getByRole('heading', { name: '设置', exact: true })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await page.goBack()
    await expectLoadedPair(page)
  } finally {
    release()
  }
})

for (const entry of ['direct', 'navigation'] as const) {
  test(`${entry} comparison resource failure really retries the authenticated ordered pair`, async ({
    context,
    page,
    expectedModuleFailures,
  }, testInfo) => {
    await signInDemo(context)
    await page.route(compareCase.module, async (route) => {
      expectedModuleFailures.add(route.request().url())
      await route.fulfill({
        status: 503,
        contentType: 'text/plain',
        body: 'PRIVATE /srv/comparison token=secret-fixture',
      })
    })
    if (entry === 'direct') {
      await page.goto(catalogPair(), { waitUntil: 'domcontentloaded' })
    } else {
      await page.goto('/tasks')
      const action = await selectCatalogPair(page)
      await action.focus()
      await page.keyboard.press('Enter')
    }
    const error = page.getByRole('alert')
    await expect(error).toContainText('任务对比暂时无法打开')
    await expect(error).toContainText('页面资源未能加载')
    await expect(page.getByRole('main')).toHaveAccessibleName(compareCase.title)
    await expect(page.getByRole('main')).not.toContainText(
      /PRIVATE|\/srv\/|secret-fixture|TypeError|\/assets\//,
    )
    await expectNoComparison(page)
    await expect(page.getByRole('navigation', { name: '工作区导航', exact: true })).toBeVisible()
    expect(expectedModuleFailures.size).toBe(1)
    await page.screenshot({
      path: testInfo.outputPath(`${entry}-resource-error.png`),
      fullPage: true,
    })
    await page.unroute(compareCase.module)
    const reload = page.getByRole('button', { name: '重新加载当前页', exact: true })
    await reload.focus()
    await page.keyboard.press('Enter')
    await expectLoadedPair(page)
    await expect(page.getByRole('status', { name: '页面加载状态' })).toHaveCount(0)
    await page.waitForLoadState('networkidle')
    await page.screenshot({
      path: testInfo.outputPath(`${entry}-resource-recovered.png`),
      fullPage: true,
    })
  })
}

test('deleting an open pair in a second tab clears identities, maps and metrics on focus and refresh', async ({
  context,
  page,
}, testInfo) => {
  await signInDemo(context)
  await page.goto(catalogPair())
  await expectLoadedPair(page)
  const focusEvents: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'debug' && message.text().startsWith('comparison-focus:'))
      focusEvents.push(message.text())
  })
  await page.evaluate(() => {
    for (const event of ['focus', 'blur', 'visibilitychange']) {
      const target = event === 'visibilitychange' ? document : window
      target.addEventListener(event, () =>
        console.debug(
          `comparison-focus:${event}:${document.visibilityState}:${document.hasFocus()}`,
        ),
      )
    }
  })
  const deleting = await context.newPage()
  const errors: string[] = []
  deleting.on('pageerror', (error) => errors.push(error.message))
  try {
    await deleting.bringToFront()
    await deleting.goto('/tasks')
    await deleting.getByRole('button', { name: `删除任务 ${temperature}`, exact: true }).click()
    const dialog = deleting.getByRole('dialog', { name: '确认删除任务', exact: true })
    await dialog.getByRole('button', { name: '删除', exact: true }).click()
    await expect(
      deleting.getByRole('checkbox', { name: `选择任务 ${temperature} 进行对比`, exact: true }),
    ).toHaveCount(0)
    await deleting.waitForLoadState('networkidle')
    await page.bringToFront()
    // Headless Chromium keeps both tabs visible/focused and emits no tab focus event.
    // Deliver the public window focus event, never private task/cache state.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await testInfo.attach('focus-events.json', {
      body: JSON.stringify({
        events: focusEvents,
        state: await page.evaluate(() => ({
          visible: document.visibilityState,
          focused: document.hasFocus(),
        })),
      }),
      contentType: 'application/json',
    })
    await expect(page.getByRole('alert')).toContainText('任务已删除或不属于当前账号')
    await expectNoComparison(page)
    await page.reload()
    await expect(page.getByRole('alert')).toContainText('任务已删除或不属于当前账号')
    await expectNoComparison(page)
    await page.getByRole('button', { name: '重新读取对比', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('任务已删除或不属于当前账号')
    await expectNoComparison(page)
    await page.getByRole('link', { name: '返回任务管理', exact: true }).click()
    await expect(page).toHaveURL('/tasks')
    await expect(
      page.getByRole('checkbox', { name: `选择任务 ${temperature} 进行对比`, exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('checkbox', { name: `选择任务 ${wind} 进行对比`, exact: true }),
    ).toBeVisible()
    await page.waitForLoadState('networkidle')
    expect(errors).toEqual([])
  } finally {
    await deleting.close()
  }
})

test('ordinary selected-pair navigation is SPA and keeps pending and loaded navigation usable', async ({
  context,
  page,
}) => {
  await signInDemo(context)
  let documentRequests = 0
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests++
  })
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let received = () => {}
  const requested = new Promise<void>((resolve) => {
    received = resolve
  })
  await page.route(compareCase.module, async (route) => {
    received()
    await held
    await route.continue()
  })
  try {
    await page.goto('/tasks')
    const action = await selectCatalogPair(page)
    await action.focus()
    await page.keyboard.press('Enter')
    await requested
    // Known pre-F1 red at the protected W base; merger revalidates after F1.
    expect(documentRequests).toBe(1)
    await expect(page.getByRole('status', { name: '页面加载状态' })).toContainText(
      '正在加载任务对比',
    )
    await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'true')
    // Router may retain the valid same-account task list during SPA pending.
    // Its selection names are not comparison results or stale cross-account data.
    await expect(page.getByRole('region', { name: '对比任务身份', exact: true })).toHaveCount(0)
    await expect(page.getByRole('img', { name: /实际样本空间场/ })).toHaveCount(0)
    await expect(page.getByRole('region', { name: '共同样本精度指标' })).toHaveCount(0)
    const navigation = page.getByRole('navigation', { name: '工作区导航', exact: true })
    await expect(navigation.getByRole('link', { name: '设置', exact: true })).toBeVisible()
    release()
    await expectLoadedPair(page)
    await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false')
    await expect(page.getByRole('status', { name: '页面加载状态' })).toHaveCount(0)
    expect(documentRequests).toBe(1)
  } finally {
    release()
    await page.waitForLoadState('networkidle')
  }
})

test('all three real roles load their own catalog pair and role changes deny researcher identifiers', async ({
  context,
  page,
}) => {
  await signInDemo(context)
  for (const account of ['researcher', 'policy', 'agriculture']) {
    if (account !== 'researcher') {
      await page.goto('/settings')
      await page.getByRole('button', { name: '切换演示角色', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: '切换演示角色', exact: true })
      await dialog.getByRole('radio', { name: new RegExp(`· ${account}$`) }).check()
      await dialog.getByRole('button', { name: '退出并重新登录', exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`/login\\?account=${account}$`))
      await submitDemoLogin(page, account)
      await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText(account)
      await page.goto(catalogPair('researcher'))
      await expect(page.getByRole('alert')).toContainText('任务已删除或不属于当前账号')
      await expectNoComparison(page)
      await page.reload()
      await expect(page.getByRole('alert')).toContainText('任务已删除或不属于当前账号')
      await expectNoComparison(page)
      await expect(page.getByRole('region', { name: '当前演示账号' })).not.toContainText(
        'researcher',
      )
    }
    await page.goto(catalogPair(account))
    await expectLoadedPair(page, account)
    await page.reload()
    await expectLoadedPair(page, account)
  }
  await page.waitForLoadState('networkidle')
})

test('real transport retry recovers, then an expired held session offers login preserving both identifiers', async ({
  context,
  page,
  expectedSessionTransportFailures,
}, testInfo) => {
  await signInDemo(context)
  await page.goto(catalogPair())
  await expectLoadedPair(page)
  let failed = false
  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() !== 'GET' || failed) {
      await route.continue()
      return
    }
    failed = true
    const response = await route.fetch()
    expect(response.status()).toBe(200)
    expectedSessionTransportFailures.add(route.request().url())
    await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Service Unavailable' })
  })
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('alert')).toContainText('无法读取当前账号的任务或结果')
  await expectNoComparison(page)
  await page.unroute('**/_serverFn/**')
  await page.getByRole('button', { name: '重新读取对比', exact: true }).click()
  await expectLoadedPair(page)
  await page.waitForLoadState('networkidle')
  await testInfo.attach('transport-retry.txt', {
    body: 'Real session GET returned 200; environmental 503 hid all comparison data; unroute + actual retry recovered the authenticated ordered pair and both maps.',
    contentType: 'text/plain',
  })
  const delayed = await holdNextSessionResponse(page, expectedSessionTransportFailures)
  const ending = await context.newPage()
  try {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    const { response } = await delayed.ready
    expect(response.status()).toBe(200)
    expect(await response.text()).toContain('researcher')
    await expectNoComparison(page)
    await ending.goto('/settings')
    await ending.getByRole('button', { name: '退出登录', exact: true }).click()
    await expect(ending).toHaveURL('/login')
    expect((await page.request.get(catalogPair(), { maxRedirects: 0 })).status()).toBe(307)
    delayed.release()
    await delayed.finished
    // F2 owns the lost-session fix. Neither a generic repeated read nor a stale badge is recovery.
    const login = page.getByRole('link', { name: /登录/ })
    await expect(
      login.or(page.getByRole('heading', { name: '登录 MeteoWeave', exact: true })),
    ).toBeVisible()
    await expectNoComparison(page)
    if (new URL(page.url()).pathname !== '/login') await login.click()
    const target = new URL(page.url())
    await testInfo.attach('expired-login-target.json', {
      body: JSON.stringify({
        pathname: target.pathname,
        returnTo: target.searchParams.get('returnTo'),
      }),
      contentType: 'application/json',
    })
    expect(target.pathname).toBe('/login')
    const returnTo = new URL(target.searchParams.get('returnTo') ?? '', target.origin)
    expect(returnTo.pathname).toBe(compareCase.path)
    expect(returnTo.searchParams.get('a')).toBe('demo-v1:researcher:alpine-temperature')
    expect(returnTo.searchParams.get('b')).toBe('demo-v1:researcher:coastal-wind')
    await submitDemoLogin(page)
    await expectLoadedPair(page)
  } finally {
    delayed.release()
    await ending.close()
    await page.waitForLoadState('networkidle')
  }
})

test('anonymous comparison deep link logs in and refreshes the literal ordered query and fragment', async ({
  page,
}) => {
  await page.goto(`${catalogPair()}#comparison`)
  const login = new URL(page.url())
  expect(login.pathname).toBe('/login')
  const returnTo = new URL(login.searchParams.get('returnTo') ?? '', login.origin)
  expect(returnTo.pathname).toBe(compareCase.path)
  expect(returnTo.searchParams.get('a')).toBe('demo-v1:researcher:alpine-temperature')
  expect(returnTo.searchParams.get('b')).toBe('demo-v1:researcher:coastal-wind')
  // HTTP never carries the fragment; the browser inherits it on the login URL.
  expect(login.hash).toBe('#comparison')
  await expectNoComparison(page)
  await submitDemoLogin(page)
  await expectLoadedPair(page)
  expect(new URL(page.url()).hash).toBe('#comparison')
  await page.reload()
  await expectLoadedPair(page)
  expect(new URL(page.url()).hash).toBe('#comparison')
  await page.waitForLoadState('networkidle')
})

for (const width of [390, 768, 1440]) {
  test(`${width}px ordinary and reduced-motion comparison has readable headers, local table scroll, keyboard and axe`, async ({
    context,
    page,
  }, testInfo) => {
    await signInDemo(context)
    await page.setViewportSize({ width, height: 900 })
    const accessibility: Array<{ state: string; violations: unknown[] }> = []
    const recordAccessibility = async (state: string) => {
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      accessibility.push({ state, violations })
    }
    for (const reducedMotion of ['no-preference', 'reduce'] as const) {
      await page.emulateMedia({ reducedMotion })
      let release = () => {}
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      let received = () => {}
      const requested = new Promise<void>((resolve) => {
        received = resolve
      })
      await page.route(compareCase.module, async (route) => {
        received()
        await held
        await route.continue()
      })
      try {
        await page.goto(catalogPair(), { waitUntil: 'domcontentloaded' })
        await requested
        await expect(page.getByRole('main').getByRole('status')).toContainText(compareCase.content)
        await expectNoComparison(page)
        await recordAccessibility(`${reducedMotion}-pending`)
        await page.screenshot({
          path: testInfo.outputPath(`${width}-${reducedMotion}-pending.png`),
          fullPage: true,
        })
        release()
        await expectLoadedPair(page)
      } finally {
        release()
        await page.unroute(compareCase.module)
      }
      await page.waitForLoadState('networkidle')
      const breadcrumb = page.getByRole('navigation', { name: '面包屑' })
      const labels = await breadcrumb.evaluate((nav) => {
        const bounds = nav.getBoundingClientRect()
        return Array.from(nav.querySelectorAll('li:not([aria-hidden])'), (item) => {
          const range = document.createRange()
          range.selectNodeContents(item)
          const text = range.getBoundingClientRect()
          return {
            text: item.textContent,
            height: text.height,
            lineHeight: Number.parseFloat(getComputedStyle(item).lineHeight),
            inside: text.left >= bounds.left && text.right <= bounds.right + 1,
          }
        })
      })
      for (const label of labels) {
        expect(label.height).toBeLessThanOrEqual(label.lineHeight + 1)
        expect(label.inside).toBe(true)
      }
      const identity = page.getByRole('region', { name: '当前演示账号' })
      await expect(identity).toContainText('研究演示账号 · researcher')
      for (const control of [
        identity,
        page.getByRole('button', { name: '退出登录', exact: true }),
      ]) {
        const box = await control.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.x).toBeGreaterThanOrEqual(0)
        expect(box!.x + box!.width).toBeLessThanOrEqual(width)
      }
      const table = page.getByRole('table', { name: '完整配置参数差异，A／B 对应选择顺序' })
      const scrolling = await table.evaluate((element) => {
        const viewport = element.parentElement!
        const initial = viewport.scrollLeft
        viewport.scrollLeft = viewport.scrollWidth - viewport.clientWidth
        const moved = viewport.scrollLeft
        viewport.scrollLeft = initial
        return {
          client: viewport.clientWidth,
          scroll: viewport.scrollWidth,
          overflow: getComputedStyle(viewport).overflowX,
          moved,
        }
      })
      expect(scrolling.overflow).toBe('auto')
      if (width === 390) {
        expect(scrolling.scroll).toBeGreaterThan(scrolling.client)
        expect(scrolling.moved).toBeGreaterThan(0)
      }
      await expect(page.getByRole('rowheader')).toHaveCount(12)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      await testInfo.attach(`${width}-${reducedMotion}-geometry.json`, {
        body: JSON.stringify({ labels, scrolling }),
        contentType: 'application/json',
      })
      const menu = page.getByRole('button', { name: '打开工作区导航', exact: true })
      if (width < 1024) {
        await menu.focus()
        await page.keyboard.press('Enter')
        await expect(page.getByRole('dialog', { name: '工作区菜单', exact: true })).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog', { name: '工作区菜单', exact: true })).toHaveCount(0)
        await expect(menu).toHaveAttribute('aria-expanded', 'false')
        await expect(menu).toBeFocused()
        // Continue as a keyboard user from restored focus; do not race Radix cleanup
        // with a programmatic focus command on another element.
        await page.keyboard.press('Tab')
      } else {
        await breadcrumb.getByRole('link', { name: '平台入口', exact: true }).focus()
      }
      await expect(breadcrumb.getByRole('link', { name: '平台入口', exact: true })).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(page.getByRole('button', { name: '退出登录', exact: true })).toBeFocused()
      await page.screenshot({
        path: testInfo.outputPath(`${width}-${reducedMotion}-loaded.png`),
        fullPage: true,
      })
      await recordAccessibility(`${reducedMotion}-loaded`)
      await page.goto(`${compareCase.path}?a=same&b=same`)
      await expect(page.getByRole('alert')).toContainText('请选择两个不同且已完成的任务')
      await expectNoComparison(page)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      await recordAccessibility(`${reducedMotion}-invalid`)
      await page.screenshot({
        path: testInfo.outputPath(`${width}-${reducedMotion}-invalid.png`),
        fullPage: true,
      })
      const back = page.getByRole('link', { name: '返回任务管理', exact: true })
      await back.focus()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL('/tasks')
      await expect(page.getByRole('heading', { name: '任务管理', exact: true })).toBeVisible()
      await page.waitForLoadState('networkidle')
    }
    await testInfo.attach(`${width}-axe.json`, {
      body: JSON.stringify(accessibility),
      contentType: 'application/json',
    })
    expect(accessibility.flatMap(({ violations }) => violations)).toEqual([])
  })
}

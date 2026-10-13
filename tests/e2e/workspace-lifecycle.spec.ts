import { taskCase, workspaceCases, workspaceCase } from './workspace-cases'
import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, type Locator } from './browser-guard'

import { test } from './browser-guard'

// Intercept the real production route module, before focus/intent can preload it.
const taskModule = taskCase.module

async function expectAccessible(page: Page) {
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
}

test('delayed task page explains loading without stealing focus, then shows the real table', async ({
  page,
}, testInfo) => {
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(taskModule, async (route) => {
    await held
    await route.continue()
  })
  try {
    await page.goto('/dashboard')
    const destination = page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '任务管理', exact: true })
    await destination.focus()
    await page.keyboard.press('Enter')
    const status = page.getByRole('status', { name: '页面加载状态' })
    await expect(status).toContainText('正在加载任务管理')
    await expect(status).toContainText('等待较久时，可通过导航访问其他页面')
    await expect(page.getByRole('main')).toHaveAccessibleName('任务管理')
    await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'true')
    await expect(destination).toBeFocused()
    await expect(page.getByText('已进入任务管理页面', { exact: true })).toHaveCount(0)
    const mainBefore = await page.getByRole('main').boundingBox()
    await expectAccessible(page)
    // The network is still held while accessibility inspection runs: no timeout illusion.
    await expect(status).toBeVisible()
    expect(await page.getByRole('main').boundingBox()).toEqual(mainBefore)
    await expect(destination).toBeFocused()
    await page.screenshot({ path: testInfo.outputPath('pending.png'), fullPage: true })
    release()
    await expect(page.getByRole('table', { name: '降尺度任务字段预览' })).toBeVisible()
    await expect(page.getByRole('main')).toContainText('尚未查询任务，不代表任务数量为零')
    await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false')
    await expect(status).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('status')).toHaveText('已进入任务管理页面')
    await expectAccessible(page)
  } finally {
    release()
  }
})

test('failed task resource keeps navigation and safely explains a real full-page reload', async ({
  page,
  expectedModuleFailures,
}, testInfo) => {
  let documentRequests = 0
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests++
  })
  await page.route(taskModule, async (route) => {
    expectedModuleFailures.add(route.request().url())
    await route.fulfill({
      status: 503,
      contentType: 'text/plain',
      body: 'PRIVATE /srv/workspace token=secret-fixture',
    })
  })
  await page.goto('/dashboard')
  await page
    .getByRole('navigation', { name: '工作区导航', exact: true })
    .getByRole('link', { name: '任务管理', exact: true })
    .click()
  const error = page.getByRole('alert')
  await expect(error).toContainText('任务管理暂时无法打开')
  await expect(error).toContainText('页面资源未能加载')
  await expect(error).toContainText('重新加载会刷新整个页面')
  await expect(page.getByRole('main')).toHaveAccessibleName('任务管理')
  await expect(page.getByRole('main')).not.toContainText(
    /PRIVATE|\/srv\/|secret-fixture|TypeError|\/assets\//,
  )
  await expect(page.getByRole('navigation', { name: '工作区导航', exact: true })).toBeVisible()
  await expect(page.getByRole('status', { name: '页面加载状态' })).toHaveCount(0)
  await expect(page.getByText('已进入任务管理页面', { exact: true })).toHaveCount(0)
  expect(expectedModuleFailures.size).toBe(1)
  expect(documentRequests).toBe(1) // No Router auto-reload or sessionStorage prerequisite.
  await expectAccessible(page)
  await page.screenshot({ path: testInfo.outputPath('resource-error.png'), fullPage: true })
  await page.unroute(taskModule)
  const reload = page.getByRole('button', { name: '重新加载当前页', exact: true })
  await reload.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/tasks')
  await expect(page.getByRole('table', { name: '降尺度任务字段预览' })).toBeVisible()
  await expect(page.getByRole('main')).toContainText('尚未查询任务，不代表任务数量为零')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('status', { name: '页面加载状态' })).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveText('已进入任务管理页面')
  expect(documentRequests).toBe(2)
  await expectAccessible(page)
})

test('direct task entry survives a failed module without hydration errors and reloads real SSR content', async ({
  page,
  expectedModuleFailures,
}) => {
  let documentRequests = 0
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests++
  })
  await page.route(taskModule, async (route) => {
    expectedModuleFailures.add(route.request().url())
    await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Unavailable' })
  })
  const response = await page.goto('/tasks')
  expect(response?.status()).toBe(200)
  expect(await response?.text()).toContain('降尺度任务字段预览')
  await expect(page.getByRole('alert')).toContainText('任务管理暂时无法打开')
  await expect(page.getByRole('alert')).toContainText('页面资源未能加载')
  await expect(page.getByRole('navigation', { name: '工作区导航', exact: true })).toBeVisible()
  expect(expectedModuleFailures.size).toBe(1)
  expect(documentRequests).toBe(1)
  await expectAccessible(page)
  await page.unroute(taskModule)
  await page.getByRole('button', { name: '重新加载当前页', exact: true }).focus()
  const reloaded = page.waitForResponse((next) => next.request().isNavigationRequest())
  await page.keyboard.press('Enter')
  expect(await (await reloaded).text()).toContain('降尺度任务字段预览')
  await expect(page.getByRole('table', { name: '降尺度任务字段预览' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('status', { name: '页面加载状态' })).toHaveCount(0)
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false')
  await page.waitForLoadState('networkidle')
  expect(documentRequests).toBe(2)
  await expectAccessible(page)
})

test('delayed direct task entry preserves the real server table through hydration', async ({
  page,
}) => {
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(taskModule, async (route) => {
    await held
    await route.continue()
  })
  try {
    const response = await page.goto('/tasks', { waitUntil: 'domcontentloaded' })
    expect(await response?.text()).toContain('降尺度任务字段预览')
    const table = await page.getByRole('table', { name: '降尺度任务字段预览' }).elementHandle()
    expect(table).not.toBeNull()
    release()
    await page.waitForLoadState('networkidle')
    // This is the same public DOM node, not a client-rendered replacement.
    expect(await table?.evaluate((element) => element.isConnected)).toBe(true)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await page.getByRole('link', { name: '前往创建任务', exact: true }).click()
    await expect(page).toHaveURL('/tasks/new')
    await expect(page.getByRole('main')).toHaveAccessibleName('创建任务')
  } finally {
    release()
  }
})

test('entry and remaining workspace destinations load inside the same usable shell', async ({
  page,
}) => {
  await page.goto('/')
  const destinations = workspaceCases
    .filter((entry) => entry !== taskCase)
    .map((entry) => ({ ...entry, link: entry.path === '/dashboard' ? '预览工作区' : entry.title }))
  for (const destination of destinations) {
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(destination.module, async (route) => {
      await held
      await route.continue()
    })
    try {
      await page.getByRole('link', { name: destination.link, exact: true }).click()
      const status = page.getByRole('status', { name: '页面加载状态' })
      await expect(status).toContainText(`正在加载${destination.title}`)
      await expect(page.getByRole('main')).toHaveAccessibleName(destination.title)
      await expect(page.getByRole('navigation', { name: '工作区导航', exact: true })).toBeVisible()
      await expect(page.getByRole('navigation', { name: '面包屑' })).toContainText(
        destination.title,
      )
      await expectAccessible(page)
      release()
      await expect(page).toHaveURL(destination.path)
      await expect(page.getByRole('main')).toContainText(destination.content)
      await expect(status).toHaveCount(0)
      await expect(page.getByRole('status')).toHaveText(`已进入${destination.title}页面`)
    } finally {
      release()
    }
  }
})

async function navigateByKeyboard(page: Page, title: string) {
  const opener = page.getByRole('button', { name: '打开工作区导航', exact: true })
  if (await opener.isVisible()) {
    await opener.focus()
    await page.keyboard.press('Enter')
  }
  const link = page
    .getByRole('navigation', { name: '工作区导航', exact: true })
    .getByRole('link', { name: title, exact: true })
  await link.focus()
  await page.keyboard.press('Enter')
}

async function expectVisibleFocus(focused: Locator) {
  await expect(focused).toBeFocused()
  await expect(focused).toBeInViewport()
  const outline = await focused.evaluate((element) => {
    const style = getComputedStyle(element)
    return { width: parseFloat(style.outlineWidth), style: style.outlineStyle }
  })
  expect(outline.style).not.toBe('none')
  expect(outline.width).toBeGreaterThanOrEqual(2)
}

for (const width of [390, 768, 1440]) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test.describe(`lifecycle ${width}px ${reducedMotion}`, () => {
      test.use({ viewport: { width, height: 900 }, reducedMotion })
      test('announces pending, supports keyboard reload and a safe return without losing navigation', async ({
        page,
        expectedModuleFailures,
      }, testInfo) => {
        let release = () => {}
        const held = new Promise<void>((resolve) => {
          release = resolve
        })
        await page.route(taskModule, async (route) => {
          await held
          expectedModuleFailures.add(route.request().url())
          await route.fulfill({
            status: 503,
            contentType: 'text/plain',
            body: 'Temporarily unavailable',
          })
        })
        try {
          await page.goto('/dashboard')
          await navigateByKeyboard(page, '任务管理')
          await expect(page.getByRole('status', { name: '页面加载状态' })).toBeVisible()
          // A separate live announcement remains outside the busy content landmark.
          await expect(page.getByRole('status', { name: '页面访问状态' })).toHaveText(
            '正在加载任务管理页面',
          )
          const titleBefore = await page.getByRole('heading', { level: 1 }).boundingBox()
          const mainBefore = await page.getByRole('main').boundingBox()
          const focused =
            width < 1024
              ? page.getByRole('button', { name: '打开工作区导航', exact: true })
              : page
                  .getByRole('navigation', { name: '工作区导航', exact: true })
                  .getByRole('link', { name: '任务管理', exact: true })
          await expect(focused).toBeFocused()
          await expectAccessible(page)
          await expect(page.getByRole('status', { name: '页面加载状态' })).toBeVisible()
          expect(await page.getByRole('main').boundingBox()).toEqual(mainBefore)
          await expect(focused).toBeFocused()
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(width)
          if (reducedMotion === 'reduce') {
            expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
          }
          await page.screenshot({ path: testInfo.outputPath('pending.png'), fullPage: true })
          release()
          await expect(page.getByRole('alert')).toContainText('任务管理暂时无法打开')
          expect(await page.getByRole('heading', { level: 1 }).boundingBox()).toEqual(titleBefore)
          await expectAccessible(page)
          await page.getByRole('link', { name: '跳转到主要内容', exact: true }).focus()
          await page.keyboard.press('Enter')
          await expect(page.getByRole('main')).toBeFocused()
          await page.keyboard.press('Tab')
          const reload = page.getByRole('button', { name: '重新加载当前页', exact: true })
          await expect(reload).toBeFocused()
          await expectVisibleFocus(reload)
          await page.keyboard.press('Tab')
          await expect(page.getByRole('link', { name: '返回平台入口', exact: true })).toBeFocused()
          await expectVisibleFocus(page.getByRole('link', { name: '返回平台入口', exact: true }))
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(width)
          await page.screenshot({ path: testInfo.outputPath('error-keyboard.png'), fullPage: true })
          await page.keyboard.press('Shift+Tab')
          await expect(reload).toBeFocused()
          await page.unroute(taskModule)
          await page.keyboard.press('Enter')
          await expect(page.getByRole('table', { name: '降尺度任务字段预览' })).toBeVisible()
          await expect(page.getByRole('alert')).toHaveCount(0)
          await expect(page.getByRole('status', { name: '页面加载状态' })).toHaveCount(0)
          await expect(page.getByRole('status')).toHaveText('已进入任务管理页面')
          await expectAccessible(page)
          await page.screenshot({ path: testInfo.outputPath('recovered.png'), fullPage: true })

          // A different failed page must not trap the user, even while its resource stays down.
          const settingsModule = workspaceCase('/settings').module
          await page.route(settingsModule, async (route) => {
            expectedModuleFailures.add(route.request().url())
            await route.fulfill({
              status: 503,
              contentType: 'text/plain',
              body: 'Temporarily unavailable',
            })
          })
          await navigateByKeyboard(page, '设置')
          await expect(page.getByRole('alert')).toContainText('设置暂时无法打开')
          await navigateByKeyboard(page, '创建任务')
          await expect(page.getByRole('main')).toContainText('任务配置与计算尚未接入')
          await expect(page.getByRole('alert')).toHaveCount(0)
          await navigateByKeyboard(page, '设置')
          await expect(page.getByRole('alert')).toContainText('设置暂时无法打开')
          await page.getByRole('link', { name: '跳转到主要内容', exact: true }).focus()
          await page.keyboard.press('Enter')
          await page.keyboard.press('Tab')
          await page.keyboard.press('Tab')
          await expect(page.getByRole('link', { name: '返回平台入口', exact: true })).toBeFocused()
          await page.keyboard.press('Enter')
          await expect(page).toHaveURL('/')
          await expect(page.getByRole('link', { name: '预览工作区', exact: true })).toBeVisible()
          await expect(page.getByRole('alert')).toHaveCount(0)
          await page.getByRole('link', { name: '预览工作区', exact: true }).click()
          await expect(page.getByRole('main')).toContainText('身份认证与任务服务尚未接入')
          await expect(page.getByRole('alert')).toHaveCount(0)
          await expect(page.getByRole('status', { name: '页面加载状态' })).toHaveCount(0)
        } finally {
          release()
        }
      })
    })
  }
}

test('skip navigation on a failed page preserves focus on its recovery action', async ({
  page,
  expectedModuleFailures,
}) => {
  await page.route(taskModule, async (route) => {
    expectedModuleFailures.add(route.request().url())
    await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Temporarily unavailable' })
  })
  await page.goto('/dashboard')
  await navigateByKeyboard(page, '任务管理')
  await expect(page.getByRole('alert')).toContainText('任务管理暂时无法打开')
  await page.getByRole('link', { name: '跳转到主要内容', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
  await page.keyboard.press('Tab')
  const reload = page.getByRole('button', { name: '重新加载当前页', exact: true })
  await expect(reload).toBeFocused()
  await page.waitForLoadState('networkidle')
  await expect(reload).toBeFocused()
  await expectVisibleFocus(reload)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: '返回平台入口', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/')
})

test('leaving a delayed page keeps navigation usable and ignores its late arrival', async ({
  page,
}) => {
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let delivered = () => {}
  const arrived = new Promise<void>((resolve) => {
    delivered = resolve
  })
  await page.route(taskModule, async (route) => {
    await held
    await route.continue()
    delivered()
  })
  try {
    await page.goto('/dashboard')
    await navigateByKeyboard(page, '任务管理')
    await expect(page.getByRole('status', { name: '页面加载状态' })).toContainText(
      '正在加载任务管理',
    )
    await navigateByKeyboard(page, '设置')
    await expect(page.getByRole('main')).toContainText('账号与偏好设置尚未接入')
    await expect(page.getByRole('status', { name: '页面加载状态' })).toHaveCount(0)
    release()
    await arrived
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL('/settings')
    await expect(page.getByRole('main')).toHaveAccessibleName('设置')
    await expect(page.getByRole('status')).toHaveText('已进入设置页面')
    await expect(page.getByRole('table', { name: '降尺度任务字段预览' })).toHaveCount(0)
    await navigateByKeyboard(page, '任务管理')
    await expect(page.getByRole('table', { name: '降尺度任务字段预览' })).toBeVisible()
    await expect(page.getByRole('status', { name: '页面加载状态' })).toHaveCount(0)
  } finally {
    release()
  }
})

test('a failed first workspace visit has local recovery and a safe product entry', async ({
  page,
  expectedModuleFailures,
}) => {
  await page.route(workspaceCase('/dashboard').module, async (route) => {
    expectedModuleFailures.add(route.request().url())
    await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Temporarily unavailable' })
  })
  await page.goto('/')
  await page.getByRole('link', { name: '预览工作区', exact: true }).click()
  await expect(page.getByRole('main')).toHaveAccessibleName('Dashboard')
  await expect(page.getByRole('alert')).toContainText('Dashboard暂时无法打开')
  await expect(page.getByRole('navigation', { name: '工作区导航', exact: true })).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('link', { name: '返回平台入口', exact: true }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('link', { name: '预览工作区', exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

for (const width of [390, 768, 1440]) {
  test(`task content reserves its footprint through download completion at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(taskModule, async (route) => {
      await held
      await route.continue()
    })
    try {
      await page.goto('/dashboard')
      await navigateByKeyboard(page, '任务管理')
      await expect(page.getByRole('status', { name: '页面加载状态' })).toBeVisible()
      const pendingMain = await page.getByRole('main').boundingBox()
      const pendingFooter = await page.getByRole('contentinfo').boundingBox()
      release()
      await expect(page.getByRole('table', { name: '降尺度任务字段预览' })).toBeVisible()
      expect(await page.getByRole('main').boundingBox()).toEqual(pendingMain)
      expect(await page.getByRole('contentinfo').boundingBox()).toEqual(pendingFooter)
    } finally {
      release()
    }
  })
}

for (const destination of workspaceCases.filter((entry) => entry !== taskCase)) {
  for (const width of [390, 768, 1440]) {
    test(`${destination.title} content reserves its footprint through download completion at ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 })
      let release = () => {}
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      await page.route(destination.module, async (route) => {
        await held
        await route.continue()
      })
      try {
        await page.goto(destination.path === '/dashboard' ? '/tasks' : '/dashboard')
        await navigateByKeyboard(page, destination.title)
        await expect(page.getByRole('status', { name: '页面加载状态' })).toContainText(
          `正在加载${destination.title}`,
        )
        const pendingMain = await page.getByRole('main').boundingBox()
        const pendingFooter = await page.getByRole('contentinfo').boundingBox()
        await page.screenshot({ path: testInfo.outputPath('pending.png'), fullPage: true })
        release()
        await expect(
          page.getByRole('heading', { name: destination.contentHeading, exact: true }),
        ).toBeVisible()
        await expect(page.getByRole('status', { name: '页面加载状态' })).toHaveCount(0)
        const loadedMain = await page.getByRole('main').boundingBox()
        const loadedFooter = await page.getByRole('contentinfo').boundingBox()
        await testInfo.attach('footprint', {
          body: JSON.stringify({ pendingMain, pendingFooter, loadedMain, loadedFooter }),
          contentType: 'application/json',
        })
        await page.screenshot({ path: testInfo.outputPath('loaded.png'), fullPage: true })
        expect(loadedMain).toEqual(pendingMain)
        expect(loadedFooter).toEqual(pendingFooter)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        )
      } finally {
        release()
      }
    })
  }
}

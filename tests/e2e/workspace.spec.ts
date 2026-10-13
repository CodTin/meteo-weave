import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from './browser-guard'

async function expectPageIdentity(
  page: Page,
  path: string,
  title: string,
  navigationVisible = true,
) {
  await expect(page).toHaveURL(path)
  await expect(page).toHaveTitle(`${title} · MeteoWeave`)
  await expect(page.getByRole('main')).toHaveAccessibleName(title)
  await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
  if (navigationVisible) {
    const navigation = page.getByRole('navigation', { name: '工作区导航', exact: true })
    await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1)
    await expect(navigation.getByRole('link', { name: title, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
  }
  const breadcrumbs = page.getByRole('navigation', { name: '面包屑' })
  await expect(breadcrumbs.locator('[aria-current="page"]')).toHaveText(title)
  await page.waitForLoadState('networkidle')
}

async function expectAccessible(page: Page) {
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
}

test('opens an honest dashboard preview from the product entry with persistent page identity', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('link', { name: '预览工作区', exact: true }).click()
  await expectPageIdentity(page, '/dashboard', 'Dashboard')
  await expect(page.getByRole('main')).toContainText('身份认证与任务服务尚未接入')
  await expect(page.getByRole('main')).toContainText('不代表已登录')
  const response = await page.reload()
  expect(response?.status()).toBe(200)
  expect(await response?.text()).toContain('Dashboard')
  expect(await response?.text()).toContain('身份认证与任务服务尚未接入')
  await expectPageIdentity(page, '/dashboard', 'Dashboard')
  await expectAccessible(page)
})

test('navigates from the task table to creation and restores context through browser history', async ({
  page,
}) => {
  await page.goto('/dashboard')
  await page
    .getByRole('navigation', { name: '工作区导航', exact: true })
    .getByRole('link', { name: '任务管理', exact: true })
    .click()
  await expectPageIdentity(page, '/tasks', '任务管理')
  await expect(page.getByRole('status')).toHaveText('已进入任务管理页面')
  const table = page.getByRole('table', { name: '降尺度任务字段预览' })
  await expect(table).toBeVisible()
  await expect(table.getByRole('columnheader')).toHaveText([
    '任务名称',
    '数据源',
    '气象变量',
    '目标分辨率',
    '任务状态',
    '创建时间',
  ])
  await expect(table.getByRole('row')).toHaveCount(1)
  await expect(page.getByRole('main')).toContainText('任务服务尚未接入')
  await expect(page.getByRole('main')).toContainText('尚未查询任务，不代表任务数量为零')
  await expectAccessible(page)
  await page.getByRole('main').getByRole('link', { name: '前往创建任务' }).click()
  await expectPageIdentity(page, '/tasks/new', '创建任务')
  await expect(page.getByRole('main')).toContainText('任务配置与计算尚未接入')
  await expect(page.getByRole('button', { name: '提交降尺度任务' })).toBeDisabled()
  await expectAccessible(page)
  await page.goBack()
  await expectPageIdentity(page, '/tasks', '任务管理')
  await expect(page.getByRole('status')).toHaveText('已进入任务管理页面')
  await page.goForward()
  await expectPageIdentity(page, '/tasks/new', '创建任务')
  await page.getByRole('main').getByRole('link', { name: '查看任务管理' }).click()
  await expectPageIdentity(page, '/tasks', '任务管理')
})

test('reaches settings without claiming a session or saving preferences', async ({ page }) => {
  await page.goto('/dashboard')
  await page
    .getByRole('navigation', { name: '工作区导航', exact: true })
    .getByRole('link', { name: '设置', exact: true })
    .click()
  await expectPageIdentity(page, '/settings', '设置')
  await expect(page.getByRole('main')).toContainText('账号与偏好设置尚未接入')
  await expect(page.getByRole('main')).toContainText('不读取或保存个人信息')
  await expect(page.getByRole('button', { name: '保存设置' })).toBeDisabled()
  await expectAccessible(page)
  await page.getByRole('main').getByRole('link', { name: '返回 Dashboard' }).click()
  await expectPageIdentity(page, '/dashboard', 'Dashboard')
})

for (const width of [390, 768]) {
  test.describe(`narrow navigation at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test('contains focus, closes with Escape/backdrop and returns focus after navigating or resizing', async ({
      page,
    }) => {
      await page.goto('/dashboard')
      await expectPageIdentity(page, '/dashboard', 'Dashboard', false)
      const trigger = page.getByRole('button', { name: '打开工作区导航', includeHidden: true })
      const dialog = page.getByRole('dialog', { name: '工作区菜单' })
      const close = dialog.getByRole('button', { name: '关闭工作区导航' })
      await expect(trigger).toBeVisible()
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')
      await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
      await page.keyboard.press('Tab')
      await expect(page.getByRole('link', { name: '跳转到主要内容' })).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(trigger).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(dialog).toBeVisible()
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')
      await expect(close).toBeFocused()
      const navigation = dialog.getByRole('navigation', { name: '工作区导航', exact: true })
      await expect(
        navigation.getByRole('link', { name: 'Dashboard', exact: true }),
      ).toHaveAttribute('aria-current', 'page')
      // Native modal focus containment: neither direction reaches the background page.
      await page.keyboard.press('Shift+Tab')
      await expect(navigation.getByRole('link', { name: '设置', exact: true })).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(close).toBeFocused()
      await expectAccessible(page)
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(trigger).toBeFocused()
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')

      await page.keyboard.press('Enter')
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await expect(navigation.getByRole('link', { name: '任务管理', exact: true })).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(dialog).toBeHidden()
      await expect(trigger).toBeFocused()
      await expectPageIdentity(page, '/tasks', '任务管理', false)
      await expect(page.getByRole('status')).toHaveText('已进入任务管理页面')
      await page.getByRole('main').getByRole('link', { name: '前往创建任务' }).click()
      await expectPageIdentity(page, '/tasks/new', '创建任务', false)
      await page.goBack()
      await expectPageIdentity(page, '/tasks', '任务管理', false)

      await trigger.click()
      await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1)
      await expect(navigation.getByRole('link', { name: '任务管理', exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      )
      // Clicking empty padding inside the panel is not a backdrop dismissal.
      const panel = await dialog.boundingBox()
      if (!panel) throw new Error('Expected an open navigation panel')
      await page.mouse.click(panel.x + 8, panel.y + panel.height - 8)
      await expect(dialog).toBeVisible()
      await page.mouse.click(width - 8, 100)
      await expect(dialog).toBeHidden()
      await expect(trigger).toBeFocused()

      await trigger.click()
      await close.click()
      await expect(trigger).toBeFocused()
      await trigger.click()
      await navigation.getByRole('link', { name: '任务管理', exact: true }).click()
      await expect(dialog).toBeHidden()
      await expect(trigger).toBeFocused()

      await trigger.click()
      await page.setViewportSize({ width: 1440, height: 900 })
      await expect(dialog).toBeHidden()
      await expect(page.getByRole('main')).toBeFocused()
      await expectPageIdentity(page, '/tasks', '任务管理')
      await page.setViewportSize({ width, height: 900 })
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')
      await trigger.click()
      await expect(close).toBeFocused()
      await page.keyboard.press('Escape')
      await expectAccessible(page)
    })
  })
}

for (const width of [390, 768, 1440]) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test.describe(`workspace ${width}px / ${reducedMotion}`, () => {
      test.use({ viewport: { width, height: 900 }, reducedMotion })

      test('serves every route directly with readable SSR, local table scrolling and keyboard actions', async ({
        page,
      }, testInfo) => {
        const routes = [
          {
            path: '/dashboard',
            title: 'Dashboard',
            state: '身份认证与任务服务尚未接入',
            action: '了解任务创建',
            destination: '/tasks/new',
            destinationTitle: '创建任务',
          },
          {
            path: '/tasks/new',
            title: '创建任务',
            state: '任务配置与计算尚未接入',
            action: '查看任务管理',
            destination: '/tasks',
            destinationTitle: '任务管理',
          },
          {
            path: '/tasks',
            title: '任务管理',
            state: '任务服务尚未接入',
            action: '前往创建任务',
            destination: '/tasks/new',
            destinationTitle: '创建任务',
          },
          {
            path: '/settings',
            title: '设置',
            state: '账号与偏好设置尚未接入',
            action: '返回 Dashboard',
            destination: '/dashboard',
            destinationTitle: 'Dashboard',
          },
        ]
        for (const [index, entry] of routes.entries()) {
          const response = await page.goto(entry.path)
          expect(response?.status()).toBe(200)
          expect(await response?.text()).toContain(entry.state)
          await expectPageIdentity(page, entry.path, entry.title, width >= 1024)
          const reload = await page.reload()
          expect(reload?.status()).toBe(200)
          await expectPageIdentity(page, entry.path, entry.title, width >= 1024)
          await expectAccessible(page)
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(width)
          await page.screenshot({
            path: testInfo.outputPath(`workspace-${index}.png`),
            fullPage: true,
          })

          await page.keyboard.press('Tab')
          await expect(page.getByRole('link', { name: '跳转到主要内容' })).toBeFocused()
          await page.keyboard.press('Enter')
          await expect(page.getByRole('main')).toBeFocused()
          await page.keyboard.press('Tab')
          const action = page
            .getByRole('main')
            .getByRole('link', { name: entry.action, exact: true })
          await expect(action).toBeFocused()
          await expect(action).toBeInViewport()
          const focus = await action.evaluate((element) => {
            const style = getComputedStyle(element)
            return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) }
          })
          expect(focus.style).not.toBe('none')
          expect(focus.width).toBeGreaterThanOrEqual(2)
          if (reducedMotion === 'reduce') {
            await action.hover()
            expect(
              await action.evaluate((element) => getComputedStyle(element).transitionDuration),
            ).toBe('0s')
            expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
          }
          if (entry.path === '/tasks' && width < 1024) {
            await page.keyboard.press('Tab')
            const tableRegion = page.getByRole('region', { name: '降尺度任务表格', exact: true })
            await expect(tableRegion).toBeFocused()
            await page.keyboard.press('ArrowRight')
            await expect
              .poll(() => tableRegion.evaluate((element) => element.scrollLeft))
              .toBeGreaterThan(0)
            expect(
              await page.evaluate(() => document.documentElement.scrollWidth),
            ).toBeLessThanOrEqual(width)
            await page.keyboard.press('Shift+Tab')
            await expect(action).toBeFocused()
          }
          await page.keyboard.press('Enter')
          await expectPageIdentity(page, entry.destination, entry.destinationTitle, width >= 1024)
        }
      })
    })
  }
}

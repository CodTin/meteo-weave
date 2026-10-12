import AxeBuilder from '@axe-core/playwright'
import { expect } from '@playwright/test'
import { test } from './browser-guard'
import { signInDemo } from './demo-login'

for (const width of [390, 768, 1440]) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test.describe(`workspace header ${width}px / ${reducedMotion}`, () => {
      test.use({ viewport: { width, height: 900 }, reducedMotion })

      test('keeps breadcrumbs readable alongside identity and keyboard controls', async ({
        page,
        context,
      }, testInfo) => {
        await signInDemo(context)
        for (const path of ['/dashboard', '/tasks/new', '/tasks', '/settings']) {
          await page.goto(path)
          const breadcrumb = page.getByRole('navigation', { name: '面包屑' })
          await expect(breadcrumb).toBeVisible()
          // Measure rendered text, not classes or a no-overflow proxy: each breadcrumb
          // label must fit on one line even when the trail wraps between labels.
          const geometry = await breadcrumb.evaluate((nav) => {
            const bounds = nav.getBoundingClientRect()
            return {
              width: bounds.width,
              height: bounds.height,
              headerHeight: nav.closest('header')!.getBoundingClientRect().height,
              labels: Array.from(nav.querySelectorAll('li:not([aria-hidden])'), (item) => {
                const range = document.createRange()
                range.selectNodeContents(item)
                const text = range.getBoundingClientRect()
                return {
                  height: text.height,
                  lineHeight: Number.parseFloat(getComputedStyle(item).lineHeight),
                  inside: text.left >= bounds.left && text.right <= bounds.right + 1,
                }
              }),
            }
          })
          await testInfo.attach(`breadcrumb-${path.replaceAll('/', '-')}.json`, {
            body: JSON.stringify(geometry),
            contentType: 'application/json',
          })
          expect(geometry.width).toBeGreaterThanOrEqual(220)
          expect(geometry.height).toBeLessThanOrEqual(48)
          for (const label of geometry.labels) {
            expect(label.height).toBeLessThanOrEqual(label.lineHeight + 1)
            expect(label.inside).toBe(true)
          }
          const identity = page.getByRole('region', { name: '当前演示账号' })
          await expect(identity).toContainText('研究演示账号 · researcher')
          await expect(identity).toContainText('研究人员')
          const logout = page.getByRole('button', { name: '退出登录', exact: true })
          await expect(logout).toBeVisible()
          for (const control of [identity, logout]) {
            const box = await control.boundingBox()
            expect(box).not.toBeNull()
            expect(box!.x).toBeGreaterThanOrEqual(0)
            expect(box!.x + box!.width).toBeLessThanOrEqual(width)
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
        }
        const menu = page.getByRole('button', { name: '打开工作区导航', exact: true })
        if (width < 1024) {
          await expect(menu).toBeVisible()
          await menu.focus()
          await page.keyboard.press('Enter')
          await expect(page.getByRole('dialog', { name: '工作区菜单', exact: true })).toBeVisible()
          await page.keyboard.press('Escape')
          await expect(menu).toHaveAttribute('aria-expanded', 'false')
          await expect(menu).toBeFocused()
        }
        const entry = page
          .getByRole('navigation', { name: '面包屑' })
          .getByRole('link', { name: '平台入口' })
        await entry.focus()
        await page.keyboard.press('Tab')
        await expect(page.getByRole('button', { name: '退出登录', exact: true })).toBeFocused()
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
              .analyze()
          ).violations,
        ).toEqual([])
        await page.screenshot({ path: testInfo.outputPath('workspace-header.png'), fullPage: true })
        await page.getByRole('button', { name: '退出登录', exact: true }).focus()
        await page.keyboard.press('Enter')
        await expect(page).toHaveURL('/login')
      })
    })
  }
}

import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

for (const width of [390, 768, 1440]) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test.describe(`${width}px / ${reducedMotion}`, () => {
      test.use({ viewport: { width, height: 900 }, reducedMotion })

      test('keeps entry, login and 404 readable and keyboard-operable without remote fonts', async ({
        page,
      }, testInfo) => {
        // Font delivery is a browser boundary: the real pages must still work if it fails.
        await page.route('**/*', (route) =>
          route.request().resourceType() === 'font' ? route.abort() : route.continue(),
        )
        const pages = [
          { path: '/', heading: '气象降尺度工作台', action: '前往登录', destination: /\/login$/ },
          {
            path: '/login',
            heading: '登录 MeteoWeave',
            action: '返回平台入口',
            destination: /\/$/,
          },
          {
            path: '/missing-entry',
            heading: '找不到这个页面',
            action: '返回平台入口',
            destination: /\/$/,
          },
        ]
        for (const [index, entry] of pages.entries()) {
          const response = await page.goto(entry.path)
          expect(response?.status()).toBe(index === 2 ? 404 : 200)
          await expect(page.getByRole('heading', { level: 1, name: entry.heading })).toBeVisible()
          await page.waitForLoadState('networkidle')
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(width)
          expect(
            (
              await new AxeBuilder({ page })
                .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
                .analyze()
            ).violations,
          ).toEqual([])
          await page.screenshot({ path: testInfo.outputPath(`page-${index}.png`), fullPage: true })

          await page.keyboard.press('Tab')
          await expect(page.getByRole('link', { name: '跳转到主要内容' })).toBeFocused()
          await page.keyboard.press('Enter')
          await expect(page.getByRole('main')).toBeFocused()
          await page.keyboard.press('Tab')
          const action = page.getByRole('link', { name: entry.action, exact: true })
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
          await page.keyboard.press('Enter')
          await expect(page).toHaveURL(entry.destination)
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        }
      })
    })
  }
}

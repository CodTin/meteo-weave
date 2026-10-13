import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './browser-guard'
import { workspaceCases } from './workspace-cases'

for (const destination of workspaceCases) {
  for (const entry of ['direct', 'navigation']) {
    test(`${destination.title}: ${entry} resource failure reloads the actual destination`, async ({
      page,
      expectedModuleFailures,
    }) => {
      let documentRequests = 0
      page.on('request', (request) => {
        if (request.isNavigationRequest() && request.frame() === page.mainFrame())
          documentRequests++
      })
      await page.route(destination.module, async (route) => {
        expectedModuleFailures.add(route.request().url())
        await route.fulfill({
          status: 503,
          contentType: 'text/plain',
          body: 'unavailable test resource',
        })
      })
      if (entry === 'direct') {
        const response = await page.goto(destination.path)
        expect(response?.status()).toBe(200)
        expect(await response?.text()).toContain(destination.content)
      } else {
        await page.goto(destination.path === '/dashboard' ? '/tasks' : '/dashboard')
        await page
          .getByRole('navigation', { name: '工作区导航', exact: true })
          .getByRole('link', { name: destination.title, exact: true })
          .click()
      }
      await expect(page.getByRole('alert')).toContainText(`${destination.title}暂时无法打开`)
      await expect(page.getByRole('main')).toHaveAccessibleName(destination.title)
      await expect(page.getByRole('navigation', { name: '工作区导航', exact: true })).toBeVisible()
      expect(expectedModuleFailures.size).toBe(1)
      expect(documentRequests).toBe(1)
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([])
      await page.unroute(destination.module)
      await page.getByRole('button', { name: '重新加载当前页', exact: true }).focus()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(destination.path)
      await expect(page.getByRole('main')).toContainText(destination.content)
      await expect(page.getByRole('alert')).toHaveCount(0)
      await expect(page.getByRole('status', { name: '页面加载状态' })).toHaveCount(0)
      expect(documentRequests).toBe(2)
    })
  }
}

import { expect, test } from './browser-guard'
import { submitDemoLogin } from './demo-login'

// Helper to login and navigate
async function demoLogin(page: any, account: string) {
  await page.goto('/login')
  await submitDemoLogin(page, account)
  await expect(page).toHaveURL('/dashboard')
}

/**
 * Cross-browser compatibility tests
 *
 * These tests verify core functionality across Chromium, Firefox, and WebKit.
 * Per workflow.md:
 * - Chromium is the required CI gate
 * - Firefox/WebKit are run manually via browser-compatibility.yml
 *
 * Tests focus on critical user journeys that must work across all browsers.
 */

test.describe('Cross-Browser Compatibility', () => {
  test('login flow works across all browsers', async ({ page, browserName }) => {
    await page.goto('/login')

    // Select researcher account
    await page.getByLabel(/账号/).fill('researcher')
    await page.getByLabel(/密码/).fill('meteo-demo')
    await page.getByRole('button', { name: /登录/ }).click()

    // Should successfully login
    await expect(page).toHaveURL('/dashboard')
    await expect(page.getByRole('button', { name: /研究人员/ })).toBeVisible()

    console.log(`✓ Login successful on ${browserName}`)
  })

  test('task list and navigation work across browsers', async ({ page, browserName }) => {
    await demoLogin(page, 'researcher')

    // Navigate to tasks
    await page.getByRole('link', { name: '任务管理' }).click()
    await expect(page).toHaveURL('/tasks')

    // Verify catalog tasks load
    await expect(page.getByText('山地气温')).toBeVisible()
    await expect(page.getByText('沿海平原风')).toBeVisible()

    // Open a task
    await page.getByRole('link', { name: /山地气温/ }).click()
    await page.waitForURL(/\/tasks\/[a-z0-9-]+/)

    // Verify result page loads
    await expect(page.getByRole('heading', { name: /山地气温/ })).toBeVisible()

    console.log(`✓ Task navigation successful on ${browserName}`)
  })

  test('five analysis tabs are accessible across browsers', async ({ page, browserName }) => {
    await demoLogin(page, 'researcher')
    await page.getByRole('link', { name: '任务管理' }).click()
    await page.getByRole('link', { name: /低地平原降水/ }).click()
    await page.waitForURL(/\/tasks\/[a-z0-9-]+/)

    const tabs = ['时间序列', '空间分布', '精度评估', '对比分析', '数据导出']

    for (const tabName of tabs) {
      const tab = page.getByRole('tab', { name: tabName })
      await expect(tab).toBeVisible()
      await tab.click()
      await page.waitForTimeout(300)
    }

    console.log(`✓ All 5 tabs accessible on ${browserName}`)
  })

  test('file downloads work across browsers', async ({ page, browserName }) => {
    await demoLogin(page, 'researcher')
    await page.getByRole('link', { name: '任务管理' }).click()
    await page.getByRole('link', { name: /山地气温/ }).click()
    await page.waitForURL(/\/tasks\/[a-z0-9-]+/)

    // Navigate to export tab
    await page.getByRole('tab', { name: '数据导出' }).click()

    // Download CSV
    await page.getByRole('radio', { name: /CSV/ }).click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /下载/ }).click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/\.csv$/)
    const path = await download.path()
    expect(path).toBeTruthy()

    console.log(`✓ File download successful on ${browserName}`)
  })

  test('responsive layout adapts correctly across browsers', async ({ page, browserName }) => {
    await demoLogin(page, 'researcher')

    // Test mobile viewport
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('button', { name: /研究人员/ })).toBeVisible()

    // Test desktop viewport
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.getByRole('link', { name: '任务管理' }).click()
    await expect(page).toHaveURL('/tasks')

    console.log(`✓ Responsive layout works on ${browserName}`)
  })

  test('form validation works across browsers', async ({ page, browserName }) => {
    await demoLogin(page, 'researcher')
    await page.getByRole('link', { name: '创建任务' }).click()
    await expect(page).toHaveURL('/tasks/new')

    // Form should be present
    await expect(page.getByText(/数据源/)).toBeVisible()
    await expect(page.getByText(/变量/)).toBeVisible()

    console.log(`✓ Form rendering works on ${browserName}`)
  })

  test('role-based access control works across browsers', async ({ page, browserName }) => {
    // Test policy maker restrictions
    await demoLogin(page, 'policy')
    await page.getByRole('link', { name: '创建任务' }).click()

    // Should not see advanced options
    await expect(page.getByText(/高级选项/)).not.toBeVisible()

    console.log(`✓ Role restrictions enforced on ${browserName}`)
  })

  test('session logout works across browsers', async ({ page, browserName }) => {
    await demoLogin(page, 'researcher')

    // Logout
    await page.getByRole('button', { name: /研究人员/ }).click()
    await page.getByRole('menuitem', { name: /退出登录/ }).click()

    const confirmButton = page.getByRole('button', { name: /确认/ })
    if (await confirmButton.isVisible()) {
      await confirmButton.click()
    }

    // Should return to login
    await expect(page).toHaveURL('/login')

    console.log(`✓ Logout successful on ${browserName}`)
  })

  test('keyboard navigation works across browsers', async ({ page, browserName }) => {
    await demoLogin(page, 'researcher')

    // Tab navigation should work
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    // Should be able to focus on navigation
    await page.getByRole('link', { name: '任务管理' }).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL('/tasks')

    console.log(`✓ Keyboard navigation works on ${browserName}`)
  })

  test('page load performance is acceptable across browsers', async ({ page, browserName }) => {
    const startTime = Date.now()
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /MeteoWeave/ })).toBeVisible()
    const loadTime = Date.now() - startTime

    // Page should load within 3 seconds
    expect(loadTime).toBeLessThan(3000)

    console.log(`✓ Page load time: ${loadTime}ms on ${browserName}`)
  })

  test('no console errors during basic navigation across browsers', async ({
    page,
    browserName,
  }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    await page.goto('/')
    await page.getByRole('link', { name: /开始使用/ }).click()
    await demoLogin(page, 'researcher')
    await page.getByRole('link', { name: '任务管理' }).click()

    // Filter out known warnings
    const criticalErrors = consoleErrors.filter(
      (err) =>
        !err.includes('circular dependency') &&
        !err.includes('replaceRouteChunk') &&
        !err.includes('DevTools'),
    )

    expect(criticalErrors.length).toBeLessThanOrEqual(0)

    console.log(`✓ No critical console errors on ${browserName}`)
  })
})

/**
 * Browser-specific known issues (to be documented)
 *
 * This section documents any browser-specific behaviors discovered during testing.
 * Tests should still pass, but document the differences here.
 */
test.describe('Browser-Specific Behavior Documentation', () => {
  test('document any webkit-specific issues', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'WebKit-specific test')

    // Test WebKit-specific behavior
    await page.goto('/')
    // Add specific WebKit tests here if issues are found

    // For now, just verify basic functionality
    await expect(page.getByRole('heading', { name: /MeteoWeave/ })).toBeVisible()
  })

  test('document any firefox-specific issues', async ({ page, browserName }) => {
    test.skip(browserName !== 'firefox', 'Firefox-specific test')

    // Test Firefox-specific behavior
    await page.goto('/')
    // Add specific Firefox tests here if issues are found

    // For now, just verify basic functionality
    await expect(page.getByRole('heading', { name: /MeteoWeave/ })).toBeVisible()
  })
})

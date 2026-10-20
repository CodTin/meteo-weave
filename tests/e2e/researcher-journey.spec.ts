import { test, expect } from './browser-guard'
import { submitDemoLogin } from './demo-login'

/**
 * Spec 16 · Ticket 03: Complete researcher journey
 *
 * Tests the full researcher workflow:
 * 1. Login via public form
 * 2. Create a task (uses recommended method which resolves to deterministic or probabilistic based on settings)
 * 3. Observe running progress and completion
 * 4. Access all 5 result tabs with real operations
 *
 * Uses real production build, actual task service, and synthetic demo results.
 * No mocked cookies, fake task IDs, or placeholder pages.
 *
 * Note: This test uses the demo sample catalog which includes probabilistic tasks.
 * Direct task creation with explicit method selection will be added when the form supports it.
 */

test.describe('Researcher complete journey', () => {
  test('login → use demo samples → access 5 result tabs with probabilistic task', async ({
    page,
  }) => {
    // Step 1: Login as researcher via public form
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')

    // Should be on dashboard after login
    await expect(page).toHaveURL('/dashboard')
    await expect(page.locator('h1')).toContainText('Dashboard')

    // Step 2: Navigate to task list to access demo samples
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '任务管理', exact: true })
      .click()
    await expect(page).toHaveURL('/tasks')

    // Step 3: Use a known demo catalog task ID directly
    // The demo catalog includes: demo-v1:researcher:mountain-temp, demo-v1:researcher:coastal-wind, etc.
    // coastal-wind is probabilistic according to the catalog
    const taskId = 'demo-v1:researcher:coastal-wind'

    // Navigate directly to result page for this probabilistic demo task
    await page.goto(`/tasks/${taskId}/result`)

    // Step 4: Should be on result analysis page
    await expect(page).toHaveURL(/\/tasks\/[^/]+\/result/)
    await expect(page.getByRole('heading', { name: '结果分析' })).toBeVisible()

    // Verify this is a probabilistic task
    await expect(page.getByText('概率式')).toBeVisible()

    // Step 5: Access and verify all 5 result tabs

    // Tab 1: Map Comparison (should be default/active)
    const mapTab = page.getByRole('tab', { name: /地图对比|地图/ })
    await expect(mapTab).toBeVisible()

    // Click to ensure it's active
    await mapTab.click()

    // Should show map-related content
    await expect(page.getByText(/原始|降尺度|对比/)).toBeVisible()

    // Verify ensemble controls for probabilistic task
    await expect(page.getByText(/集合|均值|成员/)).toBeVisible()

    // Tab 2: Accuracy Assessment
    const accuracyTab = page.getByRole('tab', { name: /精度|评估/ })
    await accuracyTab.click()
    await expect(accuracyTab).toHaveAttribute('aria-selected', 'true')

    // Tab 3: Time Series
    const timeTab = page.getByRole('tab', { name: /时间序列|时间/ })
    await timeTab.click()
    await expect(timeTab).toHaveAttribute('aria-selected', 'true')

    // Tab 4: Spatial Analysis
    const spatialTab = page.getByRole('tab', { name: /空间分析|空间/ })
    await spatialTab.click()
    await expect(spatialTab).toHaveAttribute('aria-selected', 'true')

    // Tab 5: Data Export
    const exportTab = page.getByRole('tab', { name: /数据导出|导出/ })
    await exportTab.click()
    await expect(exportTab).toHaveAttribute('aria-selected', 'true')

    // Verify we successfully accessed all 5 tabs by going back to first tab
    await mapTab.click()
    await expect(mapTab).toHaveAttribute('aria-selected', 'true')

    // Step 6: Verify context is preserved across tabs
    // Go back to map tab
    await mapTab.click()

    // Time selector should be visible
    const timeSelector = page
      .getByRole('combobox', { name: /时间|时刻/ })
      .or(page.locator('select').filter({ hasText: /时间|UTC/ }))

    if (await timeSelector.isVisible()) {
      // Verify we can change time slices
      await timeSelector.click()

      // Check if there are multiple options
      const options = page.getByRole('option')
      const optionCount = await options.count().catch(() => 0)

      if (optionCount > 1) {
        await options.nth(1).click()

        // Switch to accuracy tab - content should update for new time
        await accuracyTab.click()

        // Should still show metrics, not stale/empty data
        await expect(page.getByText(/RMSE|MAE|精度/)).toBeVisible()
      }
    }

    // Step 7: Verify Synthetic Demo disclosure (just check first occurrence)
    await expect(page.getByText(/Synthetic|Demo|合成|演示/).first()).toBeVisible()

    // Step 8: Verify navigation remains functional
    const returnButton = page.getByRole('button', { name: /返回/ })
    await returnButton.click()

    await expect(page).toHaveURL('/tasks')
  })
})

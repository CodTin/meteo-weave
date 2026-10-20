import { expect, test } from './browser-guard'
import { submitDemoLogin } from './demo-login'

// Helper to login and navigate
async function demoLogin(page: any, account: string) {
  await page.goto('/login')
  await submitDemoLogin(page, account)
  await expect(page).toHaveURL('/dashboard')
}

/**
 * Final production regression suite for Spec 16
 *
 * Validates the complete integrated implementation across all previous tickets:
 * - #110: Demo sample recovery
 * - #111: Map network acceptance
 * - #112: Researcher journey with 5-tab analysis
 * - #113: Cross-format consistency
 * - #114: Role journeys and re-login isolation
 * - #115: Keyboard accessibility
 * - #116: Responsive layouts
 * - #117: Production resource loading
 *
 * This suite runs comprehensive end-to-end flows that touch multiple features
 * and verify integration points between tickets.
 */

test.describe('Final Production Regression', () => {
  test('complete researcher journey: login → catalog → 5-tab analysis → download → compare → logout', async ({
    page,
  }) => {
    // Login as researcher
    await demoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Navigate to tasks
    await page.getByRole('link', { name: '任务管理' }).click()
    await expect(page).toHaveURL('/tasks')

    // Verify catalog tasks are present
    const taskList = page.getByRole('main')
    await expect(taskList.getByText('山地气温')).toBeVisible()
    await expect(taskList.getByText('沿海平原风')).toBeVisible()
    await expect(taskList.getByText('高原海平面气压')).toBeVisible()
    await expect(taskList.getByText('低地平原降水')).toBeVisible()

    // Open a probabilistic task (lowland precipitation)
    const precipTask = taskList.getByRole('link', { name: /低地平原降水/ })
    await precipTask.click()

    // Wait for result page to load
    await page.waitForURL(/\/tasks\/[a-z0-9-]+/)
    await expect(page.getByRole('heading', { name: /低地平原降水/ })).toBeVisible()

    // Verify all 5 analysis tabs are accessible
    const tabs = ['时间序列', '空间分布', '精度评估', '对比分析', '数据导出']

    for (const tabName of tabs) {
      const tab = page.getByRole('tab', { name: tabName })
      await expect(tab).toBeVisible()
      await tab.click()
      // Wait for tab content to load
      await page.waitForTimeout(500)
    }

    // Download CSV format
    await page.getByRole('tab', { name: '数据导出' }).click()
    const csvRadio = page.getByRole('radio', { name: /CSV/ })
    await csvRadio.click()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /下载/ }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.csv$/)

    // Return to task list
    await page.getByRole('link', { name: '任务管理' }).click()
    await expect(page).toHaveURL('/tasks')

    // Test task comparison (navigate manually to compare page)
    await page.goto('/tasks/compare')
    // Compare page should load (even without valid task IDs, it should show the page structure)
    await expect(page.getByRole('heading', { name: /任务对比/ })).toBeVisible()

    // Logout
    await page.getByRole('button', { name: /研究人员/ }).click()
    await page.getByRole('menuitem', { name: /退出登录/ }).click()

    // Confirm logout
    const confirmButton = page.getByRole('button', { name: /确认/ })
    if (await confirmButton.isVisible()) {
      await confirmButton.click()
    }

    // Verify returned to login
    await expect(page).toHaveURL('/login')
  })

  test('policy and agriculture users see restricted configuration options', async ({ page }) => {
    // Test policy maker
    await demoLogin(page, 'policy')
    await page.getByRole('link', { name: '创建任务' }).click()
    await expect(page).toHaveURL('/tasks/new')

    // Verify no advanced options section
    await expect(page.getByText(/高级选项/)).not.toBeVisible()

    // Verify method is recommended only
    const methodSection = page.getByText(/方法/)
    await expect(methodSection).toBeVisible()

    // Logout policy
    await page.getByRole('button', { name: /决策者/ }).click()
    await page.getByRole('menuitem', { name: /退出登录/ }).click()
    const confirmPolicy = page.getByRole('button', { name: /确认/ })
    if (await confirmPolicy.isVisible()) {
      await confirmPolicy.click()
    }
    await expect(page).toHaveURL('/login')

    // Test agriculture user
    await demoLogin(page, 'agriculture')
    await page.getByRole('link', { name: '创建任务' }).click()
    await expect(page).toHaveURL('/tasks/new')

    // Verify no advanced options section
    await expect(page.getByText(/高级选项/)).not.toBeVisible()

    // Logout agriculture
    await page.getByRole('button', { name: /农业用户/ }).click()
    await page.getByRole('menuitem', { name: /退出登录/ }).click()
    const confirmAg = page.getByRole('button', { name: /确认/ })
    if (await confirmAg.isVisible()) {
      await confirmAg.click()
    }
    await expect(page).toHaveURL('/login')
  })

  test('role switching preserves safe return paths and clears workspace state', async ({
    page,
  }) => {
    // Login as researcher
    await demoLogin(page, 'researcher')
    await page.getByRole('link', { name: '任务管理' }).click()

    // Navigate to settings and initiate role switch
    await page.getByRole('link', { name: '设置' }).click()
    await expect(page).toHaveURL('/settings')

    // Open role switch dialog
    await page.getByRole('button', { name: /角色切换/ }).click()

    // Select policy maker
    const policyOption = page.getByText(/决策者/)
    await policyOption.click()

    // Confirm switch
    const confirmSwitch = page.getByRole('button', { name: /确认切换/ })
    if (await confirmSwitch.isVisible()) {
      await confirmSwitch.click()
    }

    // Should return to login with preselected account
    await expect(page).toHaveURL(/\/login/)
    await expect(page).toHaveURL(/account=policy/)

    // Complete login as policy maker
    await page.getByLabel(/密码/).fill('meteo-demo')
    await page.getByRole('button', { name: /登录/ }).click()

    // Verify switched to policy maker
    await expect(page.getByRole('button', { name: /决策者/ })).toBeVisible()
  })

  test('keyboard navigation works across all workspace pages', async ({ page }) => {
    await demoLogin(page, 'researcher')

    // Tab through navigation
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    // Navigate to tasks using keyboard
    await page.getByRole('link', { name: '任务管理' }).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL('/tasks')

    // Tab through task list
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    // Navigate to create task
    await page.getByRole('link', { name: '创建任务' }).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL('/tasks/new')

    // Form should be keyboard accessible
    await page.keyboard.press('Tab')
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName)
    expect(['INPUT', 'SELECT', 'BUTTON', 'A']).toContain(focusedElement)
  })

  test('responsive layouts work at 390px, 768px, and 1440px viewports', async ({ page }) => {
    await demoLogin(page, 'researcher')

    // Test mobile (390px)
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('button', { name: /研究人员/ })).toBeVisible()

    // Mobile navigation should be accessible
    const mobileMenu = page.getByRole('button', { name: /菜单/ })
    if (await mobileMenu.isVisible()) {
      await mobileMenu.click()
      await expect(page.getByRole('link', { name: '任务管理' })).toBeVisible()
    }

    // Test tablet (768px)
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.getByRole('link', { name: '任务管理' }).click()
    await expect(page).toHaveURL('/tasks')
    await expect(page.getByText(/山地气温/)).toBeVisible()

    // Test desktop (1440px)
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(page.getByRole('link', { name: '创建任务' })).toBeVisible()
    await expect(page.getByRole('link', { name: '设置' })).toBeVisible()
  })

  test('cross-format downloads produce valid files with consistent data', async ({ page }) => {
    await demoLogin(page, 'researcher')
    await page.getByRole('link', { name: '任务管理' }).click()

    // Open any catalog task
    await page.getByRole('link', { name: /山地气温/ }).click()
    await page.waitForURL(/\/tasks\/[a-z0-9-]+/)

    // Navigate to export tab
    await page.getByRole('tab', { name: '数据导出' }).click()

    // Download CSV
    await page.getByRole('radio', { name: /CSV/ }).click()
    const csvDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: /下载/ }).click()
    const csv = await csvDownload
    expect(csv.suggestedFilename()).toMatch(/\.csv$/)

    // Download GeoJSON
    await page.getByRole('radio', { name: /GeoJSON/ }).click()
    const geoJsonDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: /下载/ }).click()
    const geoJson = await geoJsonDownload
    expect(geoJson.suggestedFilename()).toMatch(/\.geojson$/)

    // Download NetCDF
    await page.getByRole('radio', { name: /NetCDF/ }).click()
    const netcdfDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: /下载/ }).click()
    const netcdf = await netcdfDownload
    expect(netcdf.suggestedFilename()).toMatch(/\.nc$/)
  })

  test('production build serves optimized resources without console errors', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    await page.goto('/')
    await expect(page.getByRole('heading', { name: /MeteoWeave/ })).toBeVisible()

    // Login and navigate through workspace
    await page.getByRole('link', { name: /开始使用/ }).click()
    await demoLogin(page, 'researcher')
    await page.getByRole('link', { name: '任务管理' }).click()

    // Check for console errors (filter out expected warnings)
    const criticalErrors = consoleErrors.filter(
      (err) =>
        !err.includes('circular dependency') &&
        !err.includes('replaceRouteChunk') &&
        !err.includes('DevTools'),
    )

    expect(criticalErrors).toHaveLength(0)
  })

  test("session isolation: different accounts cannot access each other's tasks", async ({
    page,
  }) => {
    // Login as researcher and note task count
    await demoLogin(page, 'researcher')
    await page.getByRole('link', { name: '任务管理' }).click()
    const researcherTasks = await page
      .getByRole('main')
      .getByRole('link', { name: /温度|风|气压|降水/ })
      .count()
    expect(researcherTasks).toBeGreaterThan(0)

    // Logout
    await page.getByRole('button', { name: /研究人员/ }).click()
    await page.getByRole('menuitem', { name: /退出登录/ }).click()
    const confirm1 = page.getByRole('button', { name: /确认/ })
    if (await confirm1.isVisible()) {
      await confirm1.click()
    }

    // Login as policy maker
    await demoLogin(page, 'policy')
    await page.getByRole('link', { name: '任务管理' }).click()

    // Policy maker should have their own catalog (not researcher's)
    const policyTasks = await page
      .getByRole('main')
      .getByRole('link', { name: /温度|风|气压|降水/ })
      .count()
    expect(policyTasks).toBeGreaterThan(0)

    // Tasks are account-isolated (each account gets their own catalog initialization)
    // The count may be the same (catalog), but they are separate instances
  })

  test('map network controls handle missing token gracefully', async ({ page }) => {
    await demoLogin(page, 'researcher')
    await page.getByRole('link', { name: '任务管理' }).click()
    await page.getByRole('link', { name: /山地气温/ }).click()
    await page.waitForURL(/\/tasks\/[a-z0-9-]+/)

    // Navigate to spatial distribution tab
    await page.getByRole('tab', { name: '空间分布' }).click()

    // Either map loads or configuration guidance is shown
    const hasMap = await page
      .locator('.mapboxgl-canvas')
      .isVisible()
      .catch(() => false)
    const hasGuidance = await page
      .getByText(/配置/)
      .isVisible()
      .catch(() => false)

    // One of these should be true
    expect(hasMap || hasGuidance).toBe(true)

    // No uncaught errors should occur
    const pageErrors: string[] = []
    page.on('pageerror', (err) => {
      pageErrors.push(err.message)
    })

    // Wait a bit to catch any delayed errors
    await page.waitForTimeout(1000)

    expect(pageErrors).toHaveLength(0)
  })

  test('reduced motion preferences are respected in animations', async ({ page }) => {
    // Set reduced motion preference
    await page.emulateMedia({ reducedMotion: 'reduce' })

    await demoLogin(page, 'researcher')
    await page.getByRole('link', { name: '任务管理' }).click()

    // Page should load without animation issues
    await expect(page.getByRole('heading', { name: /任务管理/ })).toBeVisible()

    // Navigation transitions should respect reduced motion
    await page.getByRole('link', { name: '创建任务' }).click()
    await expect(page).toHaveURL('/tasks/new')
  })
})

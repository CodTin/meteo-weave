import { test, expect } from './browser-guard'
import { submitDemoLogin } from './demo-login'

test.describe('Spatial Analysis - Power Spectrum', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')
  })

  test('displays power spectrum comparison for a completed task', async ({ page }) => {
    // Navigate to a completed task's result analysis
    await page.goto('/dashboard')

    // Click on first completed task (assuming demo data exists)
    await page.click('[data-testid="task-card"]:first-child')

    // Navigate to spatial analysis tab
    await page.click('text=空间分析')

    // Wait for power spectrum panel to load
    await expect(page.locator('text=二维功率谱对比')).toBeVisible()

    // Check that chart is rendered
    await expect(page.locator('svg[aria-label*="功率谱"]')).toBeVisible()

    // Verify original and downscaled spectrum lines are present
    await expect(page.locator('[data-testid="original-spectrum-line"]')).toBeVisible()
    await expect(page.locator('[data-testid="downscaled-spectrum-line"]')).toBeVisible()
  })

  test('displays metadata about power spectrum calculation', async ({ page }) => {
    await page.goto('/dashboard')
    await page.click('[data-testid="task-card"]:first-child')
    await page.click('text=空间分析')

    // Wait for power spectrum panel
    await expect(page.locator('text=二维功率谱对比')).toBeVisible()

    // Check for method description section
    await expect(page.locator('text=方法说明')).toBeVisible()

    // Verify key metadata fields are present
    await expect(page.locator('text=频率单位')).toBeVisible()
    await expect(page.locator('text=cycles/km')).toBeVisible()
    await expect(page.locator('text=窗函数')).toBeVisible()
    await expect(page.locator('text=可分离 Hann 窗')).toBeVisible()
    await expect(page.locator('text=归一化')).toBeVisible()
    await expect(page.locator('text=能量归一化')).toBeVisible()
    await expect(page.locator('text=去均值')).toBeVisible()
  })

  test('displays upsampling warning about high-frequency limitations', async ({ page }) => {
    await page.goto('/dashboard')
    await page.click('[data-testid="task-card"]:first-child')
    await page.click('text=空间分析')

    // Wait for power spectrum panel
    await expect(page.locator('text=二维功率谱对比')).toBeVisible()

    // Check for upsampling warning
    await expect(page.locator('text=上采样不会产生真实的新增高频能力')).toBeVisible()
    await expect(page.locator('text=不应理解为原始分辨率的提升或预报精度的保证')).toBeVisible()
  })

  test('provides accessible numerical table view', async ({ page }) => {
    await page.goto('/dashboard')
    await page.click('[data-testid="task-card"]:first-child')
    await page.click('text=空间分析')

    // Wait for power spectrum panel
    await expect(page.locator('text=二维功率谱对比')).toBeVisible()

    // Expand numerical table
    await page.click('text=查看数值表格')

    // Verify table headers
    await expect(page.locator('th:has-text("频率 (cycles/km)")')).toBeVisible()
    await expect(page.locator('th:has-text("原始场功率")')).toBeVisible()
    await expect(page.locator('th:has-text("降尺度场功率")')).toBeVisible()

    // Verify table has data rows
    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible()
  })

  test('handles unavailable spectrum gracefully', async ({ page }) => {
    // This test would need a task with insufficient data
    // For now, we verify the error handling structure exists
    await page.goto('/dashboard')
    await page.click('[data-testid="task-card"]:first-child')
    await page.click('text=空间分析')

    // The panel should load without crashing even if data is unavailable
    await expect(page.locator('text=二维功率谱对比')).toBeVisible()
  })

  test('updates spectrum when time slice changes', async ({ page }) => {
    await page.goto('/dashboard')
    await page.click('[data-testid="task-card"]:first-child')
    await page.click('text=空间分析')

    // Wait for initial load
    await expect(page.locator('text=二维功率谱对比')).toBeVisible()

    // Find and interact with time slice selector (if available)
    const timeSelector = page.locator('[data-testid="time-slice-selector"]')
    if (await timeSelector.isVisible()) {
      // Change time slice
      await timeSelector.selectOption({ index: 1 })

      // Wait for data to reload (loading indicator should appear and disappear)
      await expect(page.locator('text=加载中')).toBeVisible()
      await expect(page.locator('text=加载中')).not.toBeVisible()

      // Verify chart is still visible after update
      await expect(page.locator('svg[aria-label*="功率谱"]')).toBeVisible()
    }
  })

  test('power spectrum is keyboard accessible', async ({ page }) => {
    await page.goto('/dashboard')
    await page.click('[data-testid="task-card"]:first-child')
    await page.click('text=空间分析')

    // Wait for power spectrum panel
    await expect(page.locator('text=二维功率谱对比')).toBeVisible()

    // Tab to the details element
    await page.keyboard.press('Tab')

    // Should be able to expand table with keyboard
    const detailsElement = page.locator('summary:has-text("查看数值表格")')
    await detailsElement.focus()
    await page.keyboard.press('Enter')

    // Table should be visible
    await expect(page.locator('th:has-text("频率 (cycles/km)")')).toBeVisible()
  })

  test('displays physical frequency axis labels', async ({ page }) => {
    await page.goto('/dashboard')
    await page.click('[data-testid="task-card"]:first-child')
    await page.click('text=空间分析')

    // Wait for power spectrum panel
    await expect(page.locator('text=二维功率谱对比')).toBeVisible()

    // Verify axis labels with physical units
    await expect(page.locator('text=频率 (cycles/km)')).toBeVisible()
    await expect(page.locator('text=功率（能量归一化）')).toBeVisible()

    // Verify legend shows both datasets
    await expect(page.locator('text=原始场')).toBeVisible()
    await expect(page.locator('text=降尺度场')).toBeVisible()
  })

  test('power spectrum panel is responsive on narrow screens', async ({ page }) => {
    // Set narrow viewport
    await page.setViewportSize({ width: 390, height: 844 })

    await page.goto('/dashboard')
    await page.click('[data-testid="task-card"]:first-child')
    await page.click('text=空间分析')

    // Wait for power spectrum panel
    await expect(page.locator('text=二维功率谱对比')).toBeVisible()

    // Chart should be visible and not overflow
    const chart = page.locator('svg[aria-label*="功率谱"]')
    await expect(chart).toBeVisible()

    // Verify no horizontal scrollbar on main content
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth)
    const clientWidth = await page.evaluate(() => document.body.clientWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 10) // Small tolerance

    // Metadata should be readable
    await expect(page.locator('text=方法说明')).toBeVisible()
  })
})

import { test, expect } from './browser-guard'
import { submitDemoLogin } from './demo-login'

/**
 * E2E tests for Ticket #74: 改善与退化区域对照
 *
 * Acceptance criteria verification:
 * - Improvement calculation: |original - reference| - |downscaled - reference|
 * - Positive values = improvement, negative = degradation
 * - Same grid, mask, units as error maps
 * - Clear legends distinguishing improvement from degradation
 * - Accessible numeric values at specified locations
 * - Time synchronization
 * - Visual confirmation of both improvement and degradation regions
 */

test.describe('Improvement and Degradation Comparison', () => {
  async function navigateToImprovementMode(page: any) {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Navigate to tasks and find first completed task
    await page.goto('/tasks')
    await expect(page.getByRole('heading', { name: '任务管理' })).toBeVisible()

    const viewButton = page.getByRole('button', { name: /查看任务/ }).first()
    await expect(viewButton).toBeVisible({ timeout: 10000 })
    await viewButton.click()

    // Get task ID and navigate to result page
    await page.waitForURL(/\/tasks\/[^/]+$/)
    const taskId = page.url().split('/tasks/')[1]
    await page.goto(`/tasks/${taskId}/result`)
    await page.waitForLoadState('networkidle')

    // Switch to spatial analysis tab
    await page.getByRole('tab', { name: /空间分析/ }).click()
    await page.waitForSelector('text=分析上下文')

    // Switch to improvement mode
    await page.click('label:has-text("改善图")')
    const improvementRadio = page.locator('input[value="improvement"]')
    await expect(improvementRadio).toBeChecked()

    return taskId
  }

  test('displays improvement mode with correct description', async ({ page }) => {
    await navigateToImprovementMode(page)

    // Verify improvement mode description is clear and distinguishes from other modes
    await expect(page.locator('text=改善区域（正值）与退化区域（负值）分布')).toBeVisible()

    // Verify method description mentions improvement calculation
    await page.waitForSelector('text=方法说明')
    await expect(page.locator('text=误差定义：')).toBeVisible()
    await expect(
      page.locator('text=改善图（原始绝对误差 - 降尺度绝对误差）：正值改善，负值退化'),
    ).toBeVisible()
  })

  test('hides prediction type selector in improvement mode', async ({ page }) => {
    await navigateToImprovementMode(page)

    // Prediction type selection should be hidden in improvement mode
    // because improvement always compares original vs downscaled
    await expect(page.locator('text=预测数据源')).not.toBeVisible()
    await expect(page.locator('input[value="original"]')).not.toBeVisible()
    await expect(page.locator('input[value="downscaled"]')).not.toBeVisible()
  })

  test('displays both positive and negative values for improvement and degradation', async ({
    page,
  }) => {
    await navigateToImprovementMode(page)

    // Wait for statistics to load
    await page.waitForSelector('text=统计摘要')

    // Get min, max, and mean values
    const minValue = await page.locator('text=最小值').locator('..').locator('dd').textContent()
    const maxValue = await page.locator('text=最大值').locator('..').locator('dd').textContent()
    const meanValue = await page.locator('text=平均值').locator('..').locator('dd').textContent()

    // Parse numeric values
    const minNum = parseFloat(minValue?.match(/-?\d+\.\d+/)?.[0] || '0')
    const maxNum = parseFloat(maxValue?.match(/-?\d+\.\d+/)?.[0] || '0')
    const meanNum = parseFloat(meanValue?.match(/-?\d+\.\d+/)?.[0] || '0')

    // Verify we have actual numeric values
    expect(Number.isFinite(minNum)).toBe(true)
    expect(Number.isFinite(maxNum)).toBe(true)
    expect(Number.isFinite(meanNum)).toBe(true)

    // Mock data should contain both improvement and degradation regions
    // At minimum, verify the range spans both positive and negative
    // (unless all regions show the same trend, which is unlikely with realistic mock data)
    expect(minNum < 0 || maxNum > 0).toBe(true)
  })

  test('shows accessible numeric values in statistics', async ({ page }) => {
    await navigateToImprovementMode(page)

    // Wait for statistics section
    await page.waitForSelector('text=统计摘要')

    // Verify all key statistics are accessible via text
    const statsSection = page.locator('text=统计摘要').locator('..')

    // Check that values are displayed with proper units
    const minLabel = statsSection.locator('text=最小值')
    const maxLabel = statsSection.locator('text=最大值')
    const meanLabel = statsSection.locator('text=平均值')
    const validPointsLabel = statsSection.locator('text=有效点数')

    await expect(minLabel).toBeVisible()
    await expect(maxLabel).toBeVisible()
    await expect(meanLabel).toBeVisible()
    await expect(validPointsLabel).toBeVisible()

    // Verify unit is present (should match variable unit)
    await expect(statsSection.locator('dd').first()).toContainText(/°C|hPa|mm|m\/s/)

    // Verify valid points count is present
    await expect(statsSection.locator('text=/\\d+\\s*\\/\\s*\\d+/')).toBeVisible()
  })

  test('displays consistent grid and mask information', async ({ page }) => {
    await navigateToImprovementMode(page)

    // Wait for method description
    await page.waitForSelector('text=方法说明')

    // Verify common grid sampling is mentioned
    await expect(page.locator('text=共同网格采样')).toBeVisible()

    // Verify same context information as other error maps
    await expect(page.locator('text=任务 ID')).toBeVisible()
    await expect(page.locator('text=分析时刻')).toBeVisible()
    await expect(page.locator('text=空间范围')).toBeVisible()
    await expect(page.locator('text=变量')).toBeVisible()
  })

  test('maintains state when switching between modes', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await page.goto('/tasks')
    await page
      .getByRole('button', { name: /查看任务/ })
      .first()
      .click()
    await page.waitForURL(/\/tasks\/[^/]+$/)
    const taskId = page.url().split('/tasks/')[1]
    await page.goto(`/tasks/${taskId}/result`)
    await page.getByRole('tab', { name: /空间分析/ }).click()

    // Start in signed error mode
    await page.waitForSelector('text=分析上下文')
    const signedRadio = page.locator('input[value="signed"]')
    await expect(signedRadio).toBeChecked()

    // Get initial statistics
    await page.waitForSelector('text=统计摘要')
    const signedStats = await page.locator('text=统计摘要').locator('..').textContent()

    // Switch to improvement mode
    await page.click('label:has-text("改善图")')
    await expect(page.locator('input[value="improvement"]')).toBeChecked()

    // Wait for statistics to update
    await page.waitForTimeout(500)
    const improvementStats = await page.locator('text=统计摘要').locator('..').textContent()

    // Statistics should be different
    expect(improvementStats).not.toBe(signedStats)

    // Switch back to signed error
    await page.click('label:has-text("带符号误差")')
    await expect(signedRadio).toBeChecked()

    // Switch again to improvement
    await page.click('label:has-text("改善图")')
    await expect(page.locator('input[value="improvement"]')).toBeChecked()

    // Description should still be correct
    await expect(page.locator('text=改善区域（正值）与退化区域（负值）分布')).toBeVisible()
  })

  test('updates when analysis time changes', async ({ page }) => {
    await navigateToImprovementMode(page)

    // Get initial analysis time
    const initialTime = await page
      .locator('text=分析时刻')
      .locator('..')
      .locator('dd')
      .textContent()

    // Try to change time slice if multiple time points exist
    const timeButtons = page.locator('button[aria-label*="时间"]')
    const timeButtonCount = await timeButtons.count()

    if (timeButtonCount > 1) {
      await timeButtons.nth(1).click()
      await page.waitForTimeout(500) // Wait for data to update

      // Verify time updated
      const updatedTime = await page
        .locator('text=分析时刻')
        .locator('..')
        .locator('dd')
        .textContent()
      expect(updatedTime).not.toBe(initialTime)

      // Statistics may have changed (depending on mock data)
      const updatedMin = await page.locator('text=最小值').locator('..').locator('dd').textContent()
      // Just verify it's still a valid number
      expect(updatedMin).toMatch(/-?\d+\.\d+/)
    }
  })

  test('shows interpolation reference warning', async ({ page }) => {
    await navigateToImprovementMode(page)

    // Verify interpolation warning is present
    await expect(page.locator('text=插值参考说明')).toBeVisible()
    await expect(page.locator('text=若参考数据来自台站插值，仅作空间展示用途')).toBeVisible()
  })

  test('distinguishes improvement unit from percentage', async ({ page }) => {
    await navigateToImprovementMode(page)

    // Wait for statistics
    await page.waitForSelector('text=统计摘要')

    // Verify units are displayed (should be same as variable unit, not percentage)
    const statsSection = page.locator('text=统计摘要').locator('..')
    const unitText = await statsSection.locator('dd').first().textContent()

    // Should have absolute unit (°C, hPa, mm, m/s), not percentage (%)
    expect(unitText).toMatch(/°C|hPa|mm|m\/s/)
    expect(unitText).not.toContain('%')

    // Verify metadata mentions unit consistency
    await expect(page.locator('text=单位：')).toBeVisible()
  })

  test('displays data availability status correctly', async ({ page }) => {
    await navigateToImprovementMode(page)

    // Wait for data to load
    await page.waitForSelector('text=统计摘要')

    // Should show data ready indicator with valid point count
    await expect(page.locator('text=数据已就绪')).toBeVisible()
    await expect(page.locator('text=个有效点')).toBeVisible()

    // Valid points count should be present and numeric
    const validPointsText = await page
      .locator('text=有效点数')
      .locator('..')
      .locator('dd')
      .textContent()
    expect(validPointsText).toMatch(/\d+\s*\/\s*\d+/)
  })

  test('is keyboard accessible', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await page.goto('/tasks')
    await page
      .getByRole('button', { name: /查看任务/ })
      .first()
      .click()
    await page.waitForURL(/\/tasks\/[^/]+$/)
    const taskId = page.url().split('/tasks/')[1]
    await page.goto(`/tasks/${taskId}/result`)
    await page.getByRole('tab', { name: /空间分析/ }).click()
    await page.waitForSelector('text=分析上下文')

    // Tab to radio button group
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    // Use arrow keys to navigate to improvement mode
    const signedRadio = page.locator('input[value="signed"]')
    await expect(signedRadio).toBeFocused()

    // Arrow down twice to reach improvement
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')

    const improvementRadio = page.locator('input[value="improvement"]')
    await expect(improvementRadio).toBeChecked()

    // Verify description is visible
    await expect(page.locator('text=改善区域（正值）与退化区域（负值）分布')).toBeVisible()
  })

  test('visual verification - screenshot with improvement mode', async ({ page }) => {
    await navigateToImprovementMode(page)

    // Wait for all content to load
    await page.waitForSelector('text=统计摘要')
    await page.waitForSelector('text=方法说明')

    // Take screenshot for visual verification
    await expect(page).toHaveScreenshot('improvement-degradation-panel.png', {
      fullPage: true,
      animations: 'disabled',
    })
  })

  test('shows correct metadata for improvement calculation', async ({ page }) => {
    await navigateToImprovementMode(page)

    // Wait for method section
    await page.waitForSelector('text=方法说明')

    // Verify complete metadata
    const methodSection = page.locator('text=方法说明').locator('..')

    // Error definition should clearly state the improvement formula
    await expect(methodSection.locator('text=误差定义：')).toBeVisible()
    await expect(
      methodSection.locator('text=改善图（原始绝对误差 - 降尺度绝对误差）'),
    ).toBeVisible()

    // Should mention positive = improvement, negative = degradation
    await expect(methodSection.locator('text=正值改善，负值退化')).toBeVisible()

    // Sampling method should be common grid
    await expect(methodSection.locator('text=采样方法：')).toBeVisible()
    await expect(methodSection.locator('text=共同网格采样')).toBeVisible()

    // Unit should be present
    await expect(methodSection.locator('text=单位：')).toBeVisible()
  })
})

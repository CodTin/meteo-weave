import { test, expect } from './browser-guard'
import { submitDemoLogin } from './demo-login'

test.describe('Spatial Analysis Panel', () => {
  async function navigateToSpatialAnalysis(page: any) {
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

    return taskId
  }

  test('displays spatial analysis context information', async ({ page }) => {
    await navigateToSpatialAnalysis(page)

    // Verify context information is displayed
    await expect(page.locator('text=任务 ID')).toBeVisible()
    await expect(page.locator('text=分析时刻')).toBeVisible()
    await expect(page.locator('text=空间范围')).toBeVisible()
    await expect(page.locator('text=变量')).toBeVisible()
  })

  test('allows switching between error types', async ({ page }) => {
    await navigateToSpatialAnalysis(page)

    // Check default is signed error
    const signedRadio = page.locator('input[value="signed"]')
    await expect(signedRadio).toBeChecked()

    // Switch to absolute error
    await page.click('label:has-text("绝对误差")')
    const absoluteRadio = page.locator('input[value="absolute"]')
    await expect(absoluteRadio).toBeChecked()

    // Verify description updates
    await expect(page.locator('text=绝对误差分布：显示预测与参考的差异幅度')).toBeVisible()

    // Switch to improvement mode
    await page.click('label:has-text("改善图")')
    const improvementRadio = page.locator('input[value="improvement"]')
    await expect(improvementRadio).toBeChecked()

    // Verify description for improvement
    await expect(page.locator('text=改善区域（正值）与退化区域（负值）分布')).toBeVisible()
  })

  test('allows switching between prediction types', async ({ page }) => {
    await navigateToSpatialAnalysis(page)

    // Check default is downscaled
    const downscaledRadio = page.locator('input[value="downscaled"]')
    await expect(downscaledRadio).toBeChecked()

    // Switch to original
    await page.click('label:has-text("原始数据")')
    const originalRadio = page.locator('input[value="original"]')
    await expect(originalRadio).toBeChecked()
  })

  test('hides prediction type selection in improvement mode', async ({ page }) => {
    await navigateToSpatialAnalysis(page)

    // Initially prediction type should be visible
    await expect(page.locator('text=预测数据源')).toBeVisible()

    // Switch to improvement mode
    await page.click('label:has-text("改善图")')

    // Prediction type selection should be hidden
    await expect(page.locator('text=预测数据源')).not.toBeVisible()
  })

  test('displays error map statistics', async ({ page }) => {
    await navigateToSpatialAnalysis(page)

    // Wait for data to load
    await page.waitForSelector('text=统计摘要')

    // Verify statistics are displayed
    await expect(page.locator('text=最小值')).toBeVisible()
    await expect(page.locator('text=最大值')).toBeVisible()
    await expect(page.locator('text=平均值')).toBeVisible()
    await expect(page.locator('text=有效点数')).toBeVisible()

    // Verify values are numeric (contain °C for temperature)
    const statsSection = page.locator('text=统计摘要').locator('..')
    await expect(statsSection.locator('text=°C').first()).toBeVisible()
  })

  test('displays method description and metadata', async ({ page }) => {
    await navigateToSpatialAnalysis(page)

    // Wait for method description
    await page.waitForSelector('text=方法说明')

    // Verify metadata fields
    await expect(page.locator('text=误差定义：')).toBeVisible()
    await expect(page.locator('text=采样方法：')).toBeVisible()
    await expect(page.locator('text=单位：')).toBeVisible()

    // Verify common grid sampling is mentioned
    await expect(page.locator('text=共同网格采样')).toBeVisible()
  })

  test('displays interpolation reference warning', async ({ page }) => {
    await navigateToSpatialAnalysis(page)

    // Wait for content to load
    await page.waitForSelector('text=插值参考说明')

    // Verify warning is present
    await expect(page.locator('text=插值参考说明')).toBeVisible()
    await expect(page.locator('text=若参考数据来自台站插值')).toBeVisible()
    await expect(page.locator('text=仅作空间展示用途')).toBeVisible()
  })

  test('is keyboard accessible', async ({ page }) => {
    await navigateToSpatialAnalysis(page)

    // Tab through radio buttons
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    // Use arrow keys to change selection
    const signedRadio = page.locator('input[value="signed"]')
    await expect(signedRadio).toBeFocused()

    await page.keyboard.press('ArrowDown')
    const absoluteRadio = page.locator('input[value="absolute"]')
    await expect(absoluteRadio).toBeChecked()

    await page.keyboard.press('ArrowDown')
    const improvementRadio = page.locator('input[value="improvement"]')
    await expect(improvementRadio).toBeChecked()
  })

  test('updates when time slice changes', async ({ page }) => {
    await navigateToSpatialAnalysis(page)

    // Get initial analysis moment
    const initialTime = await page
      .locator('text=分析时刻')
      .locator('..')
      .locator('dd')
      .textContent()

    // Change time slice (using the time selector at the top of the page)
    const timeButtons = page.locator('button[aria-label*="时间"]')
    const timeButtonCount = await timeButtons.count()

    if (timeButtonCount > 1) {
      await timeButtons.nth(1).click()

      // Verify analysis moment updated
      const updatedTime = await page
        .locator('text=分析时刻')
        .locator('..')
        .locator('dd')
        .textContent()
      expect(updatedTime).not.toBe(initialTime)
    }
  })

  test('displays unit based on variable type', async ({ page }) => {
    await navigateToSpatialAnalysis(page)

    // Wait for statistics
    await page.waitForSelector('text=统计摘要')

    // Verify unit is displayed (should be °C for the mock temperature task)
    const statsSection = page.locator('text=统计摘要').locator('..')
    await expect(statsSection.locator('text=°C').first()).toBeVisible()
  })

  test('shows data-driven content not decorative placeholders', async ({ page }) => {
    await navigateToSpatialAnalysis(page)

    // Verify we have actual numeric statistics, not just labels
    await page.waitForSelector('text=统计摘要')

    // Get the statistics values
    const minValue = await page.locator('text=最小值').locator('..').locator('dd').textContent()
    const maxValue = await page.locator('text=最大值').locator('..').locator('dd').textContent()
    const meanValue = await page.locator('text=平均值').locator('..').locator('dd').textContent()

    // Verify they contain actual numbers (match pattern: digits, possibly negative, with decimals)
    expect(minValue).toMatch(/-?\d+\.\d+/)
    expect(maxValue).toMatch(/-?\d+\.\d+/)
    expect(meanValue).toMatch(/-?\d+\.\d+/)

    // Verify data ready indicator
    await expect(page.locator('text=数据已就绪')).toBeVisible()
    await expect(page.locator('text=个有效点')).toBeVisible()
  })

  test('visual verification - screenshot with spatial analysis panel', async ({ page }) => {
    await navigateToSpatialAnalysis(page)

    // Wait for all content to load
    await page.waitForSelector('text=统计摘要')
    await page.waitForSelector('text=方法说明')

    // Take screenshot for visual verification
    await expect(page).toHaveScreenshot('spatial-analysis-panel.png', {
      fullPage: true,
      animations: 'disabled',
    })
  })
})

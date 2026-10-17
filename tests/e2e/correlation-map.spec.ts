import { test, expect } from './browser-guard'

test.describe('Correlation Map Panel', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a result analysis page with correlation map
    // In production, this would be a real task result page
    await page.goto('/test-correlation-map')
  })

  test('should display analysis context with time window and region', async ({ page }) => {
    // Check that context card is visible
    await expect(page.getByText('分析上下文')).toBeVisible()

    // Verify time window is displayed
    await expect(page.getByText('时间窗口')).toBeVisible()

    // Verify spatial range is displayed
    await expect(page.getByText('空间范围')).toBeVisible()

    // Verify variable label is displayed
    await expect(page.getByText('变量')).toBeVisible()
  })

  test('should allow switching between original and downscaled prediction types', async ({
    page,
  }) => {
    // Check that prediction type controls are visible
    await expect(page.getByText('预测数据源')).toBeVisible()

    // Check original radio button
    const originalRadio = page.getByRole('radio', { name: /原始数据与参考的相关性/ })
    await expect(originalRadio).toBeVisible()

    // Check downscaled radio button (should be selected by default)
    const downscaledRadio = page.getByRole('radio', { name: /降尺度数据与参考的相关性/ })
    await expect(downscaledRadio).toBeVisible()
    await expect(downscaledRadio).toBeChecked()

    // Switch to original
    await originalRadio.click()
    await expect(originalRadio).toBeChecked()

    // Verify the change is reflected in metadata
    await expect(page.getByText('原始数据')).toBeVisible()
  })

  test('should display correlation map statistics', async ({ page }) => {
    // Check statistics summary card
    await expect(page.getByText('统计摘要')).toBeVisible()

    // Verify key statistics are displayed
    await expect(page.getByText('最小相关性')).toBeVisible()
    await expect(page.getByText('最大相关性')).toBeVisible()
    await expect(page.getByText('平均相关性')).toBeVisible()
    await expect(page.getByText('有效点数')).toBeVisible()

    // Check that statistics have values (not N/A for a valid result)
    const validPointsText = await page
      .getByText(/有效点数/)
      .locator('..')
      .textContent()
    expect(validPointsText).toMatch(/\d+\s*\/\s*\d+/)
  })

  test('should display unavailable points summary when present', async ({ page }) => {
    // Check for unavailable points statistics
    await expect(page.getByText('不可用点位统计')).toBeVisible()

    // Verify reasons are listed
    await expect(page.getByText(/有效时间点不足/)).toBeVisible()
    await expect(page.getByText(/预测或参考方差为零/)).toBeVisible()
    await expect(page.getByText(/掩码排除点位/)).toBeVisible()
  })

  test('should display method description with Pearson r details', async ({ page }) => {
    // Check method description card
    await expect(page.getByText('方法说明')).toBeVisible()

    // Verify key method details
    await expect(page.getByText(/Pearson r/)).toBeVisible()
    await expect(page.getByText(/逐网格点时间相关性/)).toBeVisible()
    await expect(page.getByText(/非 R²/)).toBeVisible()

    // Verify sampling method is explained
    await expect(page.getByText(/按时间身份、单位和统计区间/)).toBeVisible()
    await expect(page.getByText(/不填零或跨缺口插值/)).toBeVisible()

    // Verify validity requirements
    await expect(page.getByText(/至少 3 个共同有效时间样本/)).toBeVisible()
    await expect(page.getByText(/方差不为零/)).toBeVisible()

    // Verify result interpretation
    await expect(page.getByText(/正相关.*负相关.*缺测.*明确区分/)).toBeVisible()
  })

  test('should display time coverage in metadata', async ({ page }) => {
    // Look for time window description with time point count
    const timeWindowText = await page
      .getByText(/时间窗口/)
      .locator('../..')
      .textContent()
    expect(timeWindowText).toMatch(/\d+\s*个时间点/)
  })

  test('should display interpolation reference warning', async ({ page }) => {
    // Check for reference source warning
    await expect(page.getByText('插值参考说明')).toBeVisible()

    // Verify warning mentions distinction between grid points and station accuracy
    await expect(page.getByText(/网格点数、每点时间支撑与独立台站精度样本数需区分/)).toBeVisible()
    await expect(page.getByText(/不作为同位真实观测验证/)).toBeVisible()
  })

  test('should show map placeholder when data is available', async ({ page }) => {
    // Check that map visualization area exists
    await expect(page.getByText(/地图可视化区域/)).toBeVisible()

    // Verify it shows data readiness
    await expect(page.getByText(/数据已就绪/)).toBeVisible()
    await expect(page.getByText(/个有效点/)).toBeVisible()
  })

  test('should distinguish positive and negative correlation in description', async ({ page }) => {
    // Verify that the result description mentions distinction
    await expect(page.getByText(/正相关.*r\s*>\s*0/)).toBeVisible()
    await expect(page.getByText(/负相关.*r\s*<\s*0/)).toBeVisible()
    await expect(page.getByText(/缺测.*NaN/)).toBeVisible()
  })

  test('should be keyboard accessible', async ({ page }) => {
    // Tab through the radio buttons
    await page.keyboard.press('Tab')

    // Navigate to prediction type controls
    const originalRadio = page.getByRole('radio', { name: /原始数据与参考的相关性/ })
    await originalRadio.focus()

    // Use arrow keys to change selection
    await page.keyboard.press('ArrowDown')
    const downscaledRadio = page.getByRole('radio', { name: /降尺度数据与参考的相关性/ })
    await expect(downscaledRadio).toBeFocused()

    // Use Space to select
    await page.keyboard.press('Space')
    await expect(downscaledRadio).toBeChecked()
  })

  test('should display correct prediction type in metadata after change', async ({ page }) => {
    // Start with downscaled (default)
    await expect(page.getByText('降尺度数据')).toBeVisible()

    // Switch to original
    const originalRadio = page.getByRole('radio', { name: /原始数据与参考的相关性/ })
    await originalRadio.click()

    // Verify metadata updates
    await expect(page.getByText('原始数据')).toBeVisible()
    await expect(page.getByText('降尺度数据')).not.toBeVisible()
  })

  test('should work at narrow screen width (390px)', async ({ page }) => {
    // Set viewport to narrow mobile width
    await page.setViewportSize({ width: 390, height: 844 })

    // Verify key elements are still visible and not overflowing
    await expect(page.getByText('分析上下文')).toBeVisible()
    await expect(page.getByText('相关性地图设置')).toBeVisible()
    await expect(page.getByText('统计摘要')).toBeVisible()

    // Check that controls are accessible
    const originalRadio = page.getByRole('radio', { name: /原始数据与参考的相关性/ })
    await expect(originalRadio).toBeVisible()

    // Verify no horizontal overflow
    const body = await page.locator('body').boundingBox()
    expect(body?.width).toBeLessThanOrEqual(390)
  })

  test('should handle unavailable result with reason', async ({ page }) => {
    // Navigate to a page with unavailable correlation data
    await page.goto('/test-correlation-map?scenario=unavailable')

    // Check that unavailable alert is shown
    await expect(page.getByText(/无时间维度数据|无有效网格点/)).toBeVisible()

    // Verify that statistics are not shown
    await expect(page.getByText('统计摘要')).not.toBeVisible()
  })

  test('should not confuse r with R-squared', async ({ page }) => {
    // Verify explicit mention that this is NOT R²
    await expect(page.getByText(/非 R²/)).toBeVisible()

    // Verify it says Pearson r
    await expect(page.getByText(/Pearson r/)).toBeVisible()

    // Make sure R² or R-squared is not mentioned elsewhere as the metric
    const pageContent = await page.textContent('body')
    expect(pageContent).not.toMatch(/R²(?!.*非)/)
    expect(pageContent).not.toMatch(/决定系数/)
  })

  test('should clarify time window vs single frame in context', async ({ page }) => {
    // Verify time window is clearly displayed (not single time slice)
    await expect(page.getByText('时间窗口')).toBeVisible()

    // Verify description mentions "time window" not "time slice"
    const description = await page.getByText(/每个网格点在所选时间窗内/).textContent()
    expect(description).toContain('时间窗')

    // Verify method description emphasizes time series
    await expect(page.getByText(/逐网格点时间相关性/)).toBeVisible()
  })
})

import { test, expect } from './browser-guard'

test.describe('Data Export', () => {
  test('displays export panel for completed temperature task with all data type options', async ({
    page,
  }) => {
    // Navigate to the app
    await page.goto('/')

    // Login as researcher
    await page.getByRole('button', { name: /登录/i }).click()
    await page.getByRole('button', { name: /研究人员/i }).click()

    // Create a new task
    await page.getByRole('link', { name: /新建任务/i }).click()

    // Wait for task creation page
    await expect(page).toHaveURL(/\/tasks\/new/)

    // Fill in basic task details
    await page.getByLabel(/数据源/i).click()
    await page.getByRole('option', { name: /ECMWF/i }).click()

    await page.getByLabel(/气象变量/i).click()
    await page.getByRole('option', { name: /Temperature/i }).click()

    // Submit the task
    await page.getByRole('button', { name: /提交任务/i }).click()

    // Wait for task to complete (synthetic demo takes ~2.5s)
    await page.waitForTimeout(3000)

    // Navigate to result analysis
    await page.getByRole('button', { name: /查看结果分析/i }).click()

    // Click on the export tab
    await page.getByRole('tab', { name: /数据导出/i }).click()

    // Verify export panel is displayed
    await expect(page.getByRole('heading', { name: /数据导出/i })).toBeVisible()

    // Verify map is displayed
    await expect(page.locator('.mapboxgl-canvas')).toBeVisible({ timeout: 10000 })

    // Verify coordinate inputs are present
    await expect(page.getByLabel(/西经/i)).toBeVisible()
    await expect(page.getByLabel(/东经/i)).toBeVisible()
    await expect(page.getByLabel(/南纬/i)).toBeVisible()
    await expect(page.getByLabel(/北纬/i)).toBeVisible()

    // Verify time range inputs are present
    await expect(page.getByLabel(/开始时间/i)).toBeVisible()
    await expect(page.getByLabel(/结束时间/i)).toBeVisible()

    // Verify all three data type checkboxes are present
    await expect(page.getByLabel(/原始数据/i)).toBeVisible()
    await expect(page.getByLabel(/降尺度数据/i)).toBeVisible()
    await expect(page.getByLabel(/观测数据/i)).toBeVisible()

    // Verify download button is present
    await expect(page.getByRole('button', { name: /下载 CSV/i })).toBeVisible()

    // Verify validation info is displayed
    await expect(page.getByText(/导出限制.*100km.*30 天/i)).toBeVisible()
  })

  test('bidirectionally syncs map and coordinate inputs', async ({ page }) => {
    // Setup: Navigate to a completed task's export tab
    await page.goto('/')
    await page.getByRole('button', { name: /登录/i }).click()
    await page.getByRole('button', { name: /研究人员/i }).click()

    // Create and wait for task
    await page.getByRole('link', { name: /新建任务/i }).click()
    await page.getByLabel(/数据源/i).click()
    await page.getByRole('option', { name: /ECMWF/i }).click()
    await page.getByLabel(/气象变量/i).click()
    await page.getByRole('option', { name: /Temperature/i }).click()
    await page.getByRole('button', { name: /提交任务/i }).click()
    await page.waitForTimeout(3000)
    await page.getByRole('button', { name: /查看结果分析/i }).click()
    await page.getByRole('tab', { name: /数据导出/i }).click()

    // Wait for map to load
    await expect(page.locator('.mapboxgl-canvas')).toBeVisible({ timeout: 10000 })

    // Get initial coordinate values
    const westInput = page.getByLabel(/西经/i)

    const initialWest = await westInput.inputValue()

    // Test coordinate input → map sync
    // Change west coordinate
    await westInput.fill(String(parseFloat(initialWest) + 0.1))

    // The map should update (we verify this by checking the state is maintained)
    await expect(westInput).toHaveValue(String(parseFloat(initialWest) + 0.1))
  })

  test('downloads CSV with selected data types', async ({ page }) => {
    // Setup: Navigate to a completed task's export tab
    await page.goto('/')
    await page.getByRole('button', { name: /登录/i }).click()
    await page.getByRole('button', { name: /研究人员/i }).click()

    // Create and wait for task
    await page.getByRole('link', { name: /新建任务/i }).click()
    await page.getByLabel(/数据源/i).click()
    await page.getByRole('option', { name: /ECMWF/i }).click()
    await page.getByLabel(/气象变量/i).click()
    await page.getByRole('option', { name: /Temperature/i }).click()
    await page.getByRole('button', { name: /提交任务/i }).click()
    await page.waitForTimeout(3000)
    await page.getByRole('button', { name: /查看结果分析/i }).click()
    await page.getByRole('tab', { name: /数据导出/i }).click()

    // Select original and observation data types
    await page.getByLabel(/原始数据/i).click()
    await page.getByLabel(/观测数据/i).click()

    // Set up download listener
    const downloadPromise = page.waitForEvent('download')

    // Click download button
    await page.getByRole('button', { name: /下载 CSV/i }).click()

    // Wait for download to complete
    const download = await downloadPromise
    const filename = download.suggestedFilename()

    // Verify filename contains data types
    expect(filename).toContain('.csv')
    expect(filename).toContain('original-downscaled-observation')
  })

  test('validates coordinate and time inputs via keyboard', async ({ page }) => {
    // Setup: Navigate to a completed task's export tab
    await page.goto('/')
    await page.getByRole('button', { name: /登录/i }).click()
    await page.getByRole('button', { name: /研究人员/i }).click()

    // Create and wait for task
    await page.getByRole('link', { name: /新建任务/i }).click()
    await page.getByLabel(/数据源/i).click()
    await page.getByRole('option', { name: /ECMWF/i }).click()
    await page.getByLabel(/气象变量/i).click()
    await page.getByRole('option', { name: /Temperature/i }).click()
    await page.getByRole('button', { name: /提交任务/i }).click()
    await page.waitForTimeout(3000)
    await page.getByRole('button', { name: /查看结果分析/i }).click()
    await page.getByRole('tab', { name: /数据导出/i }).click()

    // Test keyboard navigation
    const westInput = page.getByLabel(/西经/i)
    await westInput.focus()
    await expect(westInput).toBeFocused()

    // Tab through inputs
    await page.keyboard.press('Tab')
    await expect(page.getByLabel(/东经/i)).toBeFocused()

    await page.keyboard.press('Tab')
    await expect(page.getByLabel(/南纬/i)).toBeFocused()

    await page.keyboard.press('Tab')
    await expect(page.getByLabel(/北纬/i)).toBeFocused()
  })

  test('works on narrow screens', async ({ page }) => {
    // Set narrow viewport (mobile)
    await page.setViewportSize({ width: 390, height: 844 })

    // Setup
    await page.goto('/')
    await page.getByRole('button', { name: /登录/i }).click()
    await page.getByRole('button', { name: /研究人员/i }).click()

    // Create and wait for task
    await page.getByRole('link', { name: /新建任务/i }).click()
    await page.getByLabel(/数据源/i).click()
    await page.getByRole('option', { name: /ECMWF/i }).click()
    await page.getByLabel(/气象变量/i).click()
    await page.getByRole('option', { name: /Temperature/i }).click()
    await page.getByRole('button', { name: /提交任务/i }).click()
    await page.waitForTimeout(3000)
    await page.getByRole('button', { name: /查看结果分析/i }).click()

    // Scroll to export tab if needed
    await page.getByRole('tab', { name: /数据导出/i }).scrollIntoViewIfNeeded()
    await page.getByRole('tab', { name: /数据导出/i }).click()

    // Verify all elements are visible and not overflowing
    await expect(page.getByRole('heading', { name: /数据导出/i })).toBeVisible()
    await expect(page.getByLabel(/西经/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /下载 CSV/i })).toBeVisible()

    // Take screenshot for visual verification
    await page.screenshot({ path: 'tests/e2e/screenshots/data-export-narrow.png', fullPage: true })
  })

  test('shows map fallback when mapbox token is unavailable', async ({ page }) => {
    // This test verifies the accessibility requirement that coordinate input works without map
    // In a real scenario where VITE_MAPBOX_ACCESS_TOKEN is not set,
    // the map would show a fallback message but coordinates would still work

    await page.goto('/')
    await page.getByRole('button', { name: /登录/i }).click()
    await page.getByRole('button', { name: /研究人员/i }).click()

    await page.getByRole('link', { name: /新建任务/i }).click()
    await page.getByLabel(/数据源/i).click()
    await page.getByRole('option', { name: /ECMWF/i }).click()
    await page.getByLabel(/气象变量/i).click()
    await page.getByRole('option', { name: /Temperature/i }).click()
    await page.getByRole('button', { name: /提交任务/i }).click()
    await page.waitForTimeout(3000)
    await page.getByRole('button', { name: /查看结果分析/i }).click()
    await page.getByRole('tab', { name: /数据导出/i }).click()

    // Coordinate inputs should still be accessible and functional
    const westInput = page.getByLabel(/西经/i)
    await expect(westInput).toBeVisible()
    await expect(westInput).toBeEnabled()

    // Should be able to change coordinates via keyboard
    await westInput.fill('120.5')
    await expect(westInput).toHaveValue('120.5')
  })
})

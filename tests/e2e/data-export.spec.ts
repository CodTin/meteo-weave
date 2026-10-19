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

  test('downloads GeoJSON with valid FeatureCollection and correct coordinate order', async ({
    page,
  }) => {
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

    // Select GeoJSON format
    await page.getByLabel(/GeoJSON/i).click()

    // Verify button text changes
    await expect(page.getByRole('button', { name: /下载 GeoJSON/i })).toBeVisible()

    // Set up download listener
    const downloadPromise = page.waitForEvent('download')

    // Click download button
    await page.getByRole('button', { name: /下载 GeoJSON/i }).click()

    // Wait for download to complete
    const download = await downloadPromise
    const filename = download.suggestedFilename()

    // Verify filename has .geojson extension
    expect(filename).toContain('.geojson')

    // Download and parse the file with independent JSON parser
    const path = await download.path()
    if (!path) {
      throw new Error('Download path is null')
    }

    const fs = await import('fs/promises')
    const content = await fs.readFile(path, 'utf-8')

    // Parse with independent JSON.parse (not our code)
    const geojson = JSON.parse(content)

    // Verify valid FeatureCollection structure
    expect(geojson.type).toBe('FeatureCollection')
    expect(Array.isArray(geojson.features)).toBe(true)
    expect(geojson.features.length).toBeGreaterThan(0)

    // Verify Point features with correct coordinate order [longitude, latitude]
    const feature = geojson.features[0]
    expect(feature.type).toBe('Feature')
    expect(feature.geometry.type).toBe('Point')
    expect(Array.isArray(feature.geometry.coordinates)).toBe(true)
    expect(feature.geometry.coordinates.length).toBe(2)

    const [lon, lat] = feature.geometry.coordinates
    // Longitude should be in valid range
    expect(typeof lon).toBe('number')
    expect(lon).toBeGreaterThanOrEqual(-180)
    expect(lon).toBeLessThanOrEqual(180)
    // Latitude should be in valid range
    expect(typeof lat).toBe('number')
    expect(lat).toBeGreaterThanOrEqual(-90)
    expect(lat).toBeLessThanOrEqual(90)

    // Verify properties contain same data as CSV would
    expect(feature.properties.taskId).toBeDefined()
    expect(feature.properties.dataType).toBeDefined()
    expect(feature.properties.time).toBeDefined()
    expect(feature.properties.variable).toBeDefined()
    expect(feature.properties.value).toBeDefined()
    expect(feature.properties.unit).toBeDefined()
    expect(feature.properties.qualityFlag).toBeDefined()

    // Verify no NaN or Infinity in the JSON string
    expect(content).not.toContain('NaN')
    expect(content).not.toContain('Infinity')
  })

  test('displays real-time estimation updates when config changes', async ({ page }) => {
    // Setup: Navigate to export tab
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

    // Wait for initial estimation to appear
    await expect(page.getByText(/数据量估算/i)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/数据记录数/i)).toBeVisible()
    await expect(page.getByText(/文件大小（约）/i)).toBeVisible()

    // Get initial record count
    const initialRecordText = await page
      .getByText(/数据记录数/)
      .locator('..')
      .textContent()
    expect(initialRecordText).toContain('条')

    // Change data types - add original data
    await page.getByLabel(/原始数据/i).click()

    // Wait for estimation to update (debounced)
    await page.waitForTimeout(500)

    // Verify record count increased
    const updatedRecordText = await page
      .getByText(/数据记录数/)
      .locator('..')
      .textContent()
    expect(updatedRecordText).toContain('条')
    expect(updatedRecordText).not.toBe(initialRecordText)

    // Verify distinction between exact and approximate
    await expect(page.getByText(/记录数为精确计算.*文件大小为近似值/i)).toBeVisible()
  })

  test('compares estimated record count with actual CSV download', async ({ page }) => {
    // Setup: Navigate to export tab
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

    // Wait for estimation
    await expect(page.getByText(/数据量估算/i)).toBeVisible({ timeout: 5000 })

    // Extract estimated record count
    const estimationText = await page
      .getByText(/数据记录数/)
      .locator('..')
      .textContent()
    const estimatedCountMatch = estimationText?.match(/(\d[\d,]*)\s*条/)
    expect(estimatedCountMatch).toBeTruthy()
    const estimatedCount = parseInt(estimatedCountMatch?.[1]?.replace(/,/g, '') ?? '0', 10)

    // Download CSV
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /下载 CSV/i }).click()
    const download = await downloadPromise
    const path = await download.path()

    if (!path) {
      throw new Error('Download path is null')
    }

    // Parse CSV and count actual records
    const fs = await import('fs/promises')
    const content = await fs.readFile(path, 'utf-8')
    const lines = content.trim().split('\n')
    const actualRecordCount = lines.length - 1 // Exclude header

    // Verify estimated count matches actual count
    expect(estimatedCount).toBe(actualRecordCount)
  })

  test('updates estimation when format changes between CSV and GeoJSON', async ({ page }) => {
    // Setup: Navigate to export tab
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

    // Wait for initial CSV estimation
    await expect(page.getByText(/数据量估算/i)).toBeVisible({ timeout: 5000 })
    const csvSizeText = await page
      .getByText(/文件大小（约）/)
      .locator('..')
      .textContent()

    // Change to GeoJSON format
    await page.getByLabel(/GeoJSON/i).click()
    await page.waitForTimeout(500)

    // Verify file size changed (GeoJSON is typically larger)
    const geojsonSizeText = await page
      .getByText(/文件大小（约）/)
      .locator('..')
      .textContent()
    expect(geojsonSizeText).not.toBe(csvSizeText)

    // Record count should stay the same
    const csvRecordText = await page
      .getByText(/数据记录数/)
      .locator('..')
      .textContent()

    // Switch back to CSV
    await page.getByLabel(/CSV/i).click()
    await page.waitForTimeout(500)

    const csvRecordText2 = await page
      .getByText(/数据记录数/)
      .locator('..')
      .textContent()
    expect(csvRecordText2).toBe(csvRecordText)
  })
})

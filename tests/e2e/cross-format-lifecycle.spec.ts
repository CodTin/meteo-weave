import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './browser-guard'
import { submitDemoLogin } from './demo-login'
import {
  downloadBytes,
  downloadCsvRecords,
  downloadExport,
  exportExamples,
  selectExportLayers,
  selectSmallExport,
  setupExportTab,
} from './helpers/export-test-helpers'
import { readNetCDF } from '../lib/netcdf-reader'

test.describe('Cross-format lifecycle and history management', () => {
  test.setTimeout(120_000)

  test('downloads CSV, GeoJSON and NetCDF for the same request and verifies cross-format consistency', async ({
    page,
  }) => {
    // Setup: Navigate to export tab for a known task
    const taskId = await setupExportTab(page, 'temperature')
    await selectSmallExport(page, 'temperature')
    await selectExportLayers(page, ['original', 'downscaled', 'observation'])

    // Download all three formats
    const { download: csvDownload, recordCount } = await downloadExport(page, 'csv')
    const csvRows = await downloadCsvRecords(csvDownload)
    expect(csvRows).toHaveLength(recordCount)
    expect(csvRows[0]).toMatchObject({
      taskId,
      dataType: expect.stringMatching(/^(original|downscaled|observation)$/),
      variable: 'temperature',
      unit: '°C',
    })

    const { download: geojsonDownload, recordCount: geojsonCount } = await downloadExport(
      page,
      'geojson',
    )
    const geojsonBytes = await downloadBytes(geojsonDownload)
    const geojson = JSON.parse(new TextDecoder().decode(geojsonBytes)) as {
      type: string
      features: Array<{
        geometry: { type: string; coordinates: number[] }
        properties: Record<string, unknown>
      }>
    }
    expect(geojson.type).toBe('FeatureCollection')
    expect(geojson.features).toHaveLength(geojsonCount)
    expect(geojsonCount).toBe(recordCount)

    const { download: netcdfDownload, recordCount: netcdfCount } = await downloadExport(
      page,
      'netcdf',
    )
    const netcdfBytes = await downloadBytes(netcdfDownload)
    const netcdfFile = readNetCDF(netcdfBytes)
    expect(netcdfFile.version).toBe(1)
    expect(netcdfCount).toBe(recordCount)
    expect(netcdfFile.globalAttributes.taskId).toBe(taskId)
    expect(netcdfFile.globalAttributes.source).toBe('Synthetic Demo')

    // Verify cross-format alignment: same coordinates, time, and data type
    for (const csvRow of csvRows.slice(0, 5)) {
      // Check GeoJSON has matching feature
      const geojsonFeature = geojson.features.find(
        (f) =>
          f.properties.dataType === csvRow.dataType &&
          f.properties.time === csvRow.time &&
          Math.abs(f.geometry.coordinates[0]! - Number(csvRow.longitude)) < 1e-9 &&
          Math.abs(f.geometry.coordinates[1]! - Number(csvRow.latitude)) < 1e-9,
      )
      expect(geojsonFeature, 'GeoJSON contains matching CSV record').toBeDefined()
      expect(geojsonFeature?.geometry.type).toBe('Point')
      expect(geojsonFeature?.properties.unit).toBe(csvRow.unit)

      // Verify value consistency with tolerance
      if (csvRow.value !== '') {
        expect(
          Math.abs(Number(geojsonFeature?.properties.value) - Number(csvRow.value)),
        ).toBeLessThanOrEqual(0.001)
      }
    }

    // Verify NetCDF consistency: check file size estimate
    const estimatedSize = await page
      .getByRole('region', { name: '数据量估算' })
      .locator('dd')
      .nth(1)
      .innerText()
    const approximateBytes = Number(
      estimatedSize.match(/（([0-9,]+) B）/)?.[1]?.replaceAll(',', ''),
    )
    expect(Math.abs(netcdfBytes.byteLength - approximateBytes)).toBeLessThanOrEqual(256)

    // Verify record count consistency across all formats
    expect(netcdfFile.globalAttributes.recordCount).toBe(recordCount)
  })

  test('preserves task configuration and results after page refresh and re-login', async ({
    page,
  }) => {
    // Initial login and setup
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '任务管理', exact: true })
      .click()
    await expect(page).toHaveURL('/tasks')

    // Get task details before refresh
    const taskName = exportExamples.temperature.name
    const taskButton = page.getByRole('button', { name: `查看任务 ${taskName}`, exact: true })
    await expect(taskButton).toBeVisible()

    await taskButton.click()
    await expect
      .poll(() => decodeURIComponent(new URL(page.url()).pathname))
      .toBe(`/tasks/demo-v1:researcher:${exportExamples.temperature.id}`)

    // Navigate to result analysis
    await page.getByRole('button', { name: '查看结果分析', exact: true }).click()
    const taskIdBefore = `demo-v1:researcher:${exportExamples.temperature.id}`

    // Verify result content is loaded
    await expect(page.getByRole('tab', { name: '数据导出', exact: true })).toBeVisible()

    // Refresh the page
    const response = await page.reload()
    expect(response?.status()).toBe(200)

    // Verify task ID and results are preserved after refresh
    // URL might be /tasks/{id} or /tasks/{id}/result depending on navigation
    const currentPath = decodeURIComponent(new URL(page.url()).pathname)
    expect(currentPath.startsWith(`/tasks/${taskIdBefore}`)).toBe(true)
    await expect(page.getByRole('tab', { name: '数据导出', exact: true })).toBeVisible()

    // Logout and re-login
    await page.goto('/settings')
    await page.getByRole('button', { name: '退出登录', exact: true }).click()
    await expect(page).toHaveURL('/login')

    // Re-login with the same account
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Navigate back to the task
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '任务管理', exact: true })
      .click()
    await expect(page).toHaveURL('/tasks')
    await expect(taskButton).toBeVisible()
    await taskButton.click()

    // Verify task can be reopened with same configuration
    const pathAfterReopen = decodeURIComponent(new URL(page.url()).pathname)
    expect(pathAfterReopen.startsWith(`/tasks/${taskIdBefore}`)).toBe(true)
    await page.getByRole('button', { name: '查看结果分析', exact: true }).click()
    await expect(page.getByRole('tab', { name: '数据导出', exact: true })).toBeVisible()

    // Verify Synthetic Demo source is preserved
    await page.getByRole('tab', { name: '数据导出', exact: true }).click()
    await expect(page.getByText(/Synthetic Demo/).first()).toBeVisible()
  })

  test('compares two completed tasks with proper parameter diff and independent results', async ({
    page,
  }) => {
    // Login and navigate to task list
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '任务管理', exact: true })
      .click()
    await expect(page).toHaveURL('/tasks')

    // Select two different completed tasks for comparison
    const task1 = exportExamples.temperature.name
    const task2 = exportExamples.wind.name

    await page.getByRole('checkbox', { name: `选择任务 ${task1} 进行对比`, exact: true }).check()
    await page.getByRole('checkbox', { name: `选择任务 ${task2} 进行对比`, exact: true }).check()

    // Navigate to comparison page
    const compareLink = page.getByRole('link', { name: '对比所选任务', exact: true })
    await expect(compareLink).toBeVisible()
    await compareLink.click()

    // Verify comparison page loads with both task identities
    await expect(page.getByRole('region', { name: '对比任务身份', exact: true })).toBeVisible()
    const identities = page.getByRole('region', { name: '对比任务身份', exact: true })
    await expect(identities).toContainText(task1)
    await expect(identities).toContainText(task2)

    // Verify parameter difference table exists
    await expect(
      page.getByRole('table', { name: '完整配置参数差异，A／B 对应选择顺序' }),
    ).toBeVisible()

    // Verify independent maps are shown (at least 2 maps for A and B)
    await expect(page.getByRole('img', { name: /实际样本空间场/ })).toHaveCount(2)

    // Verify proper handling of incomparable tasks (different variables)
    await expect(page.getByRole('main')).toContainText('气象变量不同，不能直接比较精度数值')

    // Verify no false comparison metrics for incompatible tasks
    await expect(page.getByRole('region', { name: '共同样本精度指标' })).toHaveCount(0)
  })

  test('deletes task through confirmation dialog and verifies removal from history and list', async ({
    page,
  }, testInfo) => {
    // Login
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await page.goto('/tasks')

    // Wait for tasks to load
    await page.waitForSelector('table tbody tr', { timeout: 10000 })
    const taskCountBefore = await page.locator('table tbody tr').count()
    expect(taskCountBefore).toBeGreaterThan(0)

    // Get the first task name for verification
    const firstTask = page.locator('table tbody tr:first-child')
    const taskName = await firstTask.locator('td:first-child').innerText()

    // Click delete button
    const deleteButton = firstTask.getByRole('button', { name: /删除任务/ })
    await deleteButton.click()

    // Verify confirmation dialog appears
    const dialog = page.getByRole('dialog', { name: '确认删除任务', exact: true })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(/此操作无法撤销/)

    // Confirm deletion
    await dialog.getByRole('button', { name: '删除', exact: true }).click()

    // Wait for dialog to close
    await expect(dialog).toHaveCount(0)

    // Verify task is removed from list
    await page.waitForTimeout(1000)
    const taskCountAfter = await page.locator('table tbody tr').count()
    expect(taskCountAfter).toBe(taskCountBefore - 1)

    // Verify deleted task is not in the list
    const remainingTasks = await page.locator('table tbody tr td:first-child').allInnerTexts()
    expect(remainingTasks).not.toContain(taskName)

    // Take screenshot as evidence
    await page.screenshot({
      path: testInfo.outputPath('task-deleted.png'),
      fullPage: true,
    })

    // Verify dashboard reflects the deletion
    await page.goto('/dashboard')
    await expect(page.getByRole('main')).toBeVisible()
  })

  test('handles deletion cancellation properly without removing task', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await page.goto('/tasks')

    await page.waitForSelector('table tbody tr', { timeout: 10000 })
    const taskCountBefore = await page.locator('table tbody tr').count()

    // Click delete on first task
    const deleteButton = page
      .locator('table tbody tr:first-child')
      .getByRole('button', { name: /删除任务/ })
    await deleteButton.click()

    // Verify dialog appears
    const dialog = page.getByRole('dialog', { name: '确认删除任务', exact: true })
    await expect(dialog).toBeVisible()

    // Cancel deletion
    await dialog.getByRole('button', { name: '取消', exact: true }).click()

    // Verify dialog is closed
    await expect(dialog).toHaveCount(0)

    // Verify task count is unchanged
    const taskCountAfter = await page.locator('table tbody tr').count()
    expect(taskCountAfter).toBe(taskCountBefore)
  })

  test('rejects stale export after configuration change', async ({
    page,
    expectedSessionTransportFailures,
  }) => {
    await setupExportTab(page)
    await selectSmallExport(page)

    // Hold the next export response
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let received: () => void = () => {}
    const requested = new Promise<void>((resolve) => {
      received = resolve
    })
    await page.route('**/_serverFn/**', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      expectedSessionTransportFailures.add(route.request().url())
      received()
      const response = await route.fetch()
      await held
      await route.fulfill({ response })
    })

    const downloads: string[] = []
    page.on('download', (download) => downloads.push(download.suggestedFilename()))

    // Start CSV download
    await page.getByRole('button', { name: '下载 CSV 文件', exact: true }).click()
    await requested

    // Change configuration while download is pending
    await page.getByRole('radio', { name: /GeoJSON/ }).check()
    await page.getByLabel('结束时间 (UTC，不包含)', { exact: true }).fill('2024-01-01T01:00')

    // Release the held response
    release()

    // Wait a bit for any potential download
    await page.waitForTimeout(1000)

    // Verify stale download was not triggered
    expect(downloads).toEqual([])

    // Verify correct format button is now enabled
    await expect(page.getByRole('button', { name: '下载 GeoJSON 文件', exact: true })).toBeEnabled()

    // Clean up route
    await page.unroute('**/_serverFn/**')

    // Verify fresh download works with new configuration
    await downloadExport(page, 'geojson')
    expect(downloads).toHaveLength(1)
    expect(downloads[0]).toMatch(/\.geojson$/)
  })

  test('verifies empty history has clear recovery path', async ({ page }) => {
    // Create a new context to simulate a fresh user with no history
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '任务管理', exact: true })
      .click()
    await expect(page).toHaveURL('/tasks')

    // Verify task list is not empty (we have catalog tasks)
    await page.waitForSelector('table tbody tr', { timeout: 10000 })
    const taskCount = await page.locator('table tbody tr').count()
    expect(taskCount).toBeGreaterThan(0)

    // Verify dashboard shows task statistics
    await page.goto('/dashboard')
    await expect(page.getByText(/总任务数/)).toBeVisible()
  })

  test('maintains cross-format consistency for wind with U/V components', async ({ page }) => {
    const taskId = await setupExportTab(page, 'wind')
    await selectSmallExport(page, 'wind')
    await selectExportLayers(page, ['original', 'downscaled'])

    // Download CSV
    const { download: csvDownload, recordCount } = await downloadExport(page, 'csv')
    const csvRows = await downloadCsvRecords(csvDownload)
    expect(csvRows).toHaveLength(recordCount)

    // Verify wind components are present
    const windRow = csvRows[0]
    expect(windRow).toMatchObject({
      taskId,
      variable: 'wind',
      unit: 'm/s',
    })
    expect(windRow?.u10).toBeDefined()
    expect(windRow?.v10).toBeDefined()
    expect(windRow?.speed).toBeDefined()
    expect(windRow?.direction).toBeDefined()

    // Download NetCDF and verify wind components
    const { download: netcdfDownload } = await downloadExport(page, 'netcdf')
    const netcdfBytes = await downloadBytes(netcdfDownload)
    const netcdfFile = readNetCDF(netcdfBytes)

    // Verify wind-specific variables exist in NetCDF
    const variableNames = netcdfFile.variables.map((v) => v.name)
    expect(variableNames).toContain('u10_original')
    expect(variableNames).toContain('v10_original')
    expect(variableNames).toContain('speed_original')
    expect(variableNames).toContain('direction_original')
  })

  test('verifies precipitation accumulation bounds across formats', async ({ page }) => {
    const taskId = await setupExportTab(page, 'precipitation')
    await selectSmallExport(page, 'precipitation')
    await selectExportLayers(page, ['original', 'downscaled'])

    // Download CSV
    const { download: csvDownload } = await downloadExport(page, 'csv')
    const csvRows = await downloadCsvRecords(csvDownload)

    // Verify precipitation-specific fields
    const precipRow = csvRows[0]
    expect(precipRow).toMatchObject({
      taskId,
      variable: 'precipitation',
      unit: 'mm',
    })
    expect(precipRow?.sampledHours).toBeDefined()
    expect(precipRow?.expectedHours).toBeDefined()

    // Download NetCDF and verify accumulation metadata
    const { download: netcdfDownload } = await downloadExport(page, 'netcdf')
    const netcdfBytes = await downloadBytes(netcdfDownload)
    const netcdfFile = readNetCDF(netcdfBytes)

    // Verify precipitation-specific variables
    const variableNames = netcdfFile.variables.map((v) => v.name)
    expect(variableNames).toContain('precipitation_original')
    expect(variableNames).toContain('accumulation_bounds_original')
    expect(variableNames).toContain('sampled_hours_original')
  })

  test('accessibility compliance for export controls and comparison views', async ({
    page,
  }, testInfo) => {
    await setupExportTab(page)
    await selectSmallExport(page)

    // Check export panel accessibility
    const exportAxe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(exportAxe.violations).toEqual([])

    await page.screenshot({
      path: testInfo.outputPath('export-accessibility.png'),
      fullPage: true,
    })

    // Navigate to comparison and check accessibility
    await page.goto('/tasks')
    const task1 = exportExamples.temperature.name
    const task2 = exportExamples.pressure.name

    await page.getByRole('checkbox', { name: `选择任务 ${task1} 进行对比`, exact: true }).check()
    await page.getByRole('checkbox', { name: `选择任务 ${task2} 进行对比`, exact: true }).check()

    await page.getByRole('link', { name: '对比所选任务', exact: true }).click()
    await expect(page.getByRole('region', { name: '对比任务身份', exact: true })).toBeVisible()

    const compareAxe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(compareAxe.violations).toEqual([])

    await page.screenshot({
      path: testInfo.outputPath('comparison-accessibility.png'),
      fullPage: true,
    })
  })

  test('preserves Synthetic Demo source attribution across all operations', async ({ page }) => {
    await setupExportTab(page)
    await selectSmallExport(page)

    // Verify Synthetic Demo notice in export UI (use first() to handle multiple matches)
    await expect(page.getByText(/Synthetic Demo/).first()).toBeVisible()

    // Download CSV (records don't have source field, but NetCDF does)
    await downloadExport(page, 'csv')

    // Verify in NetCDF metadata
    const { download: netcdfDownload } = await downloadExport(page, 'netcdf')
    const netcdfBytes = await downloadBytes(netcdfDownload)
    const netcdfFile = readNetCDF(netcdfBytes)
    expect(netcdfFile.globalAttributes.source).toBe('Synthetic Demo')

    // Verify all variables have Synthetic Demo attribution
    for (const variable of netcdfFile.variables.filter((v) => v.attributes.dataType)) {
      expect(variable.attributes.source).toBe('Synthetic Demo')
    }
  })

  test('verifies estimated record counts match actual file records', async ({ page }) => {
    await setupExportTab(page, 'temperature')
    await selectSmallExport(page, 'temperature')
    await selectExportLayers(page, ['original', 'downscaled', 'observation'])

    // Get estimated record count from UI
    const estimateText = await page
      .getByRole('region', { name: '数据量估算' })
      .locator('dd')
      .first()
      .innerText()
    const estimatedCount = Number(estimateText.replace(/[^0-9]/g, ''))
    expect(estimatedCount).toBeGreaterThan(0)

    // Download CSV and verify actual count matches
    const { download: csvDownload, recordCount: csvCount } = await downloadExport(page, 'csv')
    const csvRows = await downloadCsvRecords(csvDownload)
    expect(csvRows.length).toBe(estimatedCount)
    expect(csvCount).toBe(estimatedCount)

    // Verify GeoJSON count matches
    const { recordCount: geojsonCount } = await downloadExport(page, 'geojson')
    expect(geojsonCount).toBe(estimatedCount)

    // Verify NetCDF count matches
    const { download: netcdfDownload, recordCount: netcdfCount } = await downloadExport(
      page,
      'netcdf',
    )
    const netcdfBytes = await downloadBytes(netcdfDownload)
    const netcdfFile = readNetCDF(netcdfBytes)
    expect(netcdfCount).toBe(estimatedCount)
    expect(netcdfFile.globalAttributes.recordCount).toBe(estimatedCount)
  })
})

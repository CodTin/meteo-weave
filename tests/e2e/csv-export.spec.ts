/**
 * E2E tests for CSV export with cancellation, progress, and retry.
 * Tests the complete user flow including UI interactions.
 */

import { test, expect, type Page } from './browser-guard'

test.describe('CSV Export with Cancellation', () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    // Navigate to a completed task with export capability
    await page.goto('/tasks')
    await page.waitForLoadState('networkidle')

    // Click on the first completed task
    await page.click('[data-testid="task-card"]:has([data-status="Completed"])', { timeout: 10000 })
    await page.waitForLoadState('networkidle')

    // Navigate to export panel
    await page.click('text=数据导出')
    await expect(page.locator('text=选择坐标范围')).toBeVisible()
  })

  test('shows progress during export generation', async ({ page }: { page: Page }) => {
    // Start export
    await page.click('button:has-text("下载 CSV")')

    // Should show validation progress
    await expect(page.locator('text=正在验证导出参数')).toBeVisible({ timeout: 5000 })

    // Progress bar should be visible
    await expect(page.locator('[role="progressbar"]')).toBeVisible()

    // Wait for completion or further progress
    await expect(page.locator('text=正在读取数据, text=生成完成, text=导出完成')).toBeVisible({
      timeout: 10000,
    })
  })

  test('allows cancellation during generation', async ({ page }: { page: Page }) => {
    // Start export
    await page.click('button:has-text("下载 CSV")')

    // Wait for progress to start
    await expect(page.locator('text=正在验证导出参数')).toBeVisible({ timeout: 5000 })

    // Click cancel button
    await page.click('button:has-text("取消")')

    // Should show cancelled message
    await expect(page.locator('text=导出已取消')).toBeVisible({ timeout: 3000 })

    // Cancel button should disappear
    await expect(page.locator('button:has-text("取消")')).not.toBeVisible()

    // Download button should be available again
    await expect(page.locator('button:has-text("下载 CSV")')).toBeVisible()
  })

  test('shows error message on validation failure', async ({ page }: { page: Page }) => {
    // Set invalid bbox (too large)
    await page.fill('[id="west"]', '120')
    await page.fill('[id="east"]', '130') // ~1000km wide

    // Start export
    await page.click('button:has-text("下载 CSV")')

    // Should show error
    await expect(page.locator('text=exceeds maximum')).toBeVisible({ timeout: 5000 })

    // Retry button should be visible
    await expect(page.locator('button:has-text("重试")')).toBeVisible()
  })

  test('allows retry after failure', async ({ page }: { page: Page }) => {
    // Set invalid bbox
    await page.fill('[id="west"]', '120')
    await page.fill('[id="east"]', '130')

    // Start export
    await page.click('button:has-text("下载 CSV")')

    // Wait for error
    await expect(page.locator('text=exceeds maximum')).toBeVisible({ timeout: 5000 })

    // Fix the bbox
    await page.fill('[id="east"]', '120.5')

    // Click retry
    await page.click('button:has-text("重试")')

    // Should start validation again
    await expect(page.locator('text=正在验证导出参数')).toBeVisible({ timeout: 5000 })
  })

  test('invalidates old request on configuration change', async ({ page }: { page: Page }) => {
    // Start first export
    await page.click('button:has-text("下载 CSV")')

    // Wait for progress
    await expect(page.locator('text=正在验证导出参数')).toBeVisible({ timeout: 5000 })

    // Change configuration (data type)
    await page.click('[id="original"]')

    // Start new export
    await page.click('button:has-text("下载 CSV")')

    // Should restart validation
    await expect(page.locator('text=正在验证导出参数')).toBeVisible({ timeout: 5000 })
  })

  test('requires at least one data type selected', async ({ page }: { page: Page }) => {
    // Uncheck all data types
    await page.click('[id="downscaled"]')

    // Download button should be disabled
    await expect(page.locator('button:has-text("下载 CSV")')).toBeDisabled()
  })

  test('has accessible keyboard navigation', async ({ page }: { page: Page }) => {
    // Tab to download button
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    // Should be able to activate with Enter
    await page.keyboard.press('Enter')

    // Should show progress
    await expect(page.locator('text=正在验证导出参数')).toBeVisible({ timeout: 5000 })

    // Tab to cancel button
    await page.keyboard.press('Tab')

    // Should be able to cancel with Enter
    await page.keyboard.press('Enter')

    // Should show cancelled message
    await expect(page.locator('text=导出已取消')).toBeVisible({ timeout: 3000 })
  })

  test('announces progress to screen readers', async ({ page }: { page: Page }) => {
    // Start export
    await page.click('button:has-text("下载 CSV")')

    // Progress container should have proper ARIA attributes
    const progressContainer = page.locator('[role="status"][aria-live="polite"]')
    await expect(progressContainer).toBeVisible({ timeout: 5000 })

    // Progress bar should have aria-label
    const progressBar = page.locator('[aria-label="导出进度"]')
    await expect(progressBar).toBeVisible()
  })

  test('does not download on cancelled export', async ({ page }: { page: Page }) => {
    // Set up download listener
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 })

    // Start export
    await page.click('button:has-text("下载 CSV")')

    // Wait for progress
    await expect(page.locator('text=正在验证导出参数')).toBeVisible({ timeout: 5000 })

    // Cancel immediately
    await page.click('button:has-text("取消")')

    // Should show cancelled
    await expect(page.locator('text=导出已取消')).toBeVisible({ timeout: 3000 })

    // No download should have occurred
    await expect(downloadPromise).rejects.toThrow()
  })

  test('generates valid CSV file on success', async ({ page }: { page: Page }) => {
    // Set up download listener
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 })

    // Start export with valid parameters
    await page.click('button:has-text("下载 CSV")')

    // Wait for download
    const download = await downloadPromise

    // Verify filename format
    const filename = download.suggestedFilename()
    expect(filename).toMatch(/^export_.*_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/)

    // Download and verify content
    const path = await download.path()
    expect(path).toBeTruthy()

    // Read file content
    const fs = await import('fs/promises')
    const content = await fs.readFile(path!, 'utf-8')

    // Verify CSV structure
    const lines = content.split('\n')
    expect(lines.length).toBeGreaterThan(0)

    // Verify headers
    const headers = lines[0]
    expect(headers).toContain('taskId')
    expect(headers).toContain('dataType')
    expect(headers).toContain('time')
    expect(headers).toContain('longitude')
    expect(headers).toContain('latitude')
  })
})

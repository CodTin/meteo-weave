import type { Page } from '@playwright/test'

/**
 * Shared helper to set up a completed task and navigate to the export tab.
 * Reduces test duplication across data export E2E tests.
 */
export async function setupExportTab(page: Page): Promise<void> {
  // Navigate to the app
  await page.goto('/')

  // Login as researcher
  await page.getByRole('button', { name: /登录/i }).click()
  await page.getByRole('button', { name: /研究人员/i }).click()

  // Create a new task
  await page.getByRole('link', { name: /新建任务/i }).click()

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
}

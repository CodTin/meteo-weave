import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Login as a specific demo account role.
 */
export async function loginAs(page: Page, role: 'researcher' | 'policy' | 'agriculture') {
  await page.goto('/login')

  // Select the role-specific account
  const accountButton = page.getByRole('button', { name: new RegExp(role, 'i') })
  await accountButton.click()

  // Enter demo password
  await page.getByLabel('密码').fill('meteo-demo')
  await page.getByRole('button', { name: '登录' }).click()

  // Wait for redirect to workspace
  await expect(page).toHaveURL(/\/tasks/, { timeout: 5000 })
}

/**
 * Create a demo probabilistic task with specific configuration.
 */
export async function createDemoProbabilisticTask(
  page: Page,
  config: {
    variable: 'temperature' | 'precipitation' | 'wind' | 'pressure'
    method: 'deterministic' | 'probabilistic'
    seed?: string
  },
): Promise<string> {
  // Navigate to task creation
  await page.goto('/tasks')
  await page.getByRole('button', { name: '新建任务' }).click()

  // Fill in basic configuration
  await page.getByLabel('任务名称').fill(`Test ${config.variable} ${config.method}`)

  // Select variable
  await page.getByLabel('变量').click()
  await page.getByRole('option', { name: new RegExp(config.variable, 'i') }).click()

  // Select method
  await page.getByLabel('方法').click()
  await page.getByRole('option', { name: new RegExp(config.method, 'i') }).click()

  // If seed is provided and method is probabilistic, fill it in
  if (config.seed && config.method === 'probabilistic') {
    await page.getByLabel('随机种子').fill(config.seed)
  }

  // Submit task
  await page.getByRole('button', { name: '创建任务' }).click()

  // Wait for task to be created and completed
  await expect(page.getByText('任务已完成')).toBeVisible({ timeout: 10000 })

  // Extract task ID from URL
  const url = page.url()
  const match = url.match(/\/tasks\/([^/]+)/)
  if (!match || !match[1]) {
    throw new Error('Could not extract task ID from URL')
  }

  return match[1]
}

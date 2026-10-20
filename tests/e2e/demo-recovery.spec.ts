import { test, expect } from './browser-guard'
import { submitDemoLogin } from './demo-login'

test.describe('Demo recovery', () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage to start fresh
    await page.goto('/login')
    await page.evaluate(() => {
      indexedDB.deleteDatabase('meteo-downscaling-tasks')
    })
  })

  test('shows recovery dialog with missing cases on first use', async ({ page }) => {
    // Login as researcher
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')

    // Navigate to settings
    await expect(page).toHaveURL('/dashboard')
    await page.getByRole('link', { name: '设置' }).click()
    await expect(page).toHaveURL('/settings')

    // Open recovery dialog
    await page.getByRole('button', { name: '恢复演示样例' }).click()

    // Wait for checking to complete
    await expect(page.getByText('正在检查缺失的案例')).toBeVisible()
    await expect(page.getByText('正在检查缺失的案例')).not.toBeVisible({ timeout: 5000 })

    // Should show all 4 cases are missing
    await expect(page.getByText('演示案例总数：')).toBeVisible()
    await expect(page.getByText('4 个', { exact: true })).toBeVisible()
    await expect(page.getByText('待恢复案例：')).toBeVisible()
    await expect(page.getByText('4 个').nth(1)).toBeVisible()

    // Should show recovery button
    await expect(page.getByRole('button', { name: '确认恢复' })).toBeVisible()
    await expect(page.getByRole('button', { name: '取消' })).toBeVisible()
  })

  test('recovers missing catalog tasks successfully', async ({ page }) => {
    // Login as researcher
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Navigate to settings
    await page.getByRole('link', { name: '设置' }).click()
    await expect(page).toHaveURL('/settings')

    // Open recovery dialog
    await page.getByRole('button', { name: '恢复演示样例' }).click()

    // Wait for check to complete
    await expect(page.getByText('正在检查缺失的案例')).not.toBeVisible({ timeout: 5000 })

    // Confirm recovery
    await page.getByRole('button', { name: '确认恢复' }).click()

    // Wait for recovery to complete
    await expect(page.getByText('正在恢复演示案例')).toBeVisible()
    await expect(page.getByText('正在恢复演示案例')).not.toBeVisible({ timeout: 5000 })

    // Should show success message
    await expect(page.getByText('恢复成功')).toBeVisible()
    await expect(page.getByText('已恢复 4 个演示案例')).toBeVisible()

    // Close dialog
    await page.getByRole('button', { name: '关闭' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('shows no missing cases when all exist', async ({ page }) => {
    // Login and initialize tasks
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Navigate to tasks page to trigger initialization
    await page.getByRole('link', { name: '任务管理' }).click()
    await expect(page).toHaveURL('/tasks')

    // Wait for tasks to load (this initializes the catalog)
    await expect(page.getByText('降尺度任务')).toBeVisible()

    // Navigate to settings
    await page.getByRole('link', { name: '设置' }).click()
    await expect(page).toHaveURL('/settings')

    // Open recovery dialog
    await page.getByRole('button', { name: '恢复演示样例' }).click()

    // Wait for check to complete
    await expect(page.getByText('正在检查缺失的案例')).not.toBeVisible({ timeout: 5000 })

    // Should show no missing cases
    await expect(page.getByText('演示案例总数：')).toBeVisible()
    await expect(page.getByText('待恢复案例：')).toBeVisible()
    await expect(page.getByText('无缺失')).toBeVisible()
    await expect(page.getByText('所有演示案例均已存在，无需恢复。')).toBeVisible()

    // Should only show close button
    await expect(page.getByRole('button', { name: '关闭' })).toBeVisible()
    await expect(page.getByRole('button', { name: '确认恢复' })).not.toBeVisible()
  })

  test('does not duplicate cases on repeated recovery', async ({ page }) => {
    // Login as researcher
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Navigate to settings
    await page.getByRole('link', { name: '设置' }).click()
    await expect(page).toHaveURL('/settings')

    // First recovery
    await page.getByRole('button', { name: '恢复演示样例' }).click()
    await expect(page.getByText('正在检查缺失的案例')).not.toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: '确认恢复' }).click()
    await expect(page.getByText('恢复成功')).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: '关闭' }).click()

    // Second recovery attempt
    await page.getByRole('button', { name: '恢复演示样例' }).click()
    await expect(page.getByText('正在检查缺失的案例')).not.toBeVisible({ timeout: 5000 })

    // Should show no missing cases
    await expect(page.getByText('无缺失')).toBeVisible()
    await expect(page.getByText('所有演示案例均已存在，无需恢复。')).toBeVisible()
  })

  test('cancel button closes dialog without recovering', async ({ page }) => {
    // Login as researcher
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Navigate to settings
    await page.getByRole('link', { name: '设置' }).click()
    await expect(page).toHaveURL('/settings')

    // Open recovery dialog
    await page.getByRole('button', { name: '恢复演示样例' }).click()
    await expect(page.getByText('正在检查缺失的案例')).not.toBeVisible({ timeout: 5000 })

    // Cancel without recovering
    await page.getByRole('button', { name: '取消' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()

    // Re-open dialog - cases should still be missing
    await page.getByRole('button', { name: '恢复演示样例' }).click()
    await expect(page.getByText('正在检查缺失的案例')).not.toBeVisible({ timeout: 5000 })
    await expect(page.getByText('4 个').nth(1)).toBeVisible() // Still 4 missing
  })

  test('preserves other account tasks during recovery', async ({ page }) => {
    // Login as policy and initialize
    await page.goto('/login')
    await submitDemoLogin(page, 'policy')
    await expect(page).toHaveURL('/dashboard')

    // Initialize policy account tasks
    await page.getByRole('link', { name: '任务管理' }).click()
    await expect(page).toHaveURL('/tasks')
    await expect(page.getByText('降尺度任务')).toBeVisible()

    // Switch to researcher account
    await page.getByRole('link', { name: '设置' }).click()
    await page.getByRole('button', { name: '切换角色' }).click()
    await page.getByRole('radio', { name: /研究人员/ }).click()
    await page.getByRole('button', { name: '确认退出' }).click()

    // Login as researcher
    await expect(page).toHaveURL(/\/login/)
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Recover researcher catalog
    await page.getByRole('link', { name: '设置' }).click()
    await page.getByRole('button', { name: '恢复演示样例' }).click()
    await expect(page.getByText('正在检查缺失的案例')).not.toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: '确认恢复' }).click()
    await expect(page.getByText('恢复成功')).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: '关闭' }).click()

    // Switch back to policy account
    await page.getByRole('button', { name: '切换角色' }).click()
    await page.getByRole('radio', { name: /决策者/ }).click()
    await page.getByRole('button', { name: '确认退出' }).click()

    // Login as policy
    await expect(page).toHaveURL(/\/login/)
    await submitDemoLogin(page, 'policy')
    await expect(page).toHaveURL('/dashboard')

    // Verify policy tasks still exist
    await page.getByRole('link', { name: '任务管理' }).click()
    await expect(page).toHaveURL('/tasks')
    await expect(page.getByText('降尺度任务')).toBeVisible()
    // Policy should have its own 4 catalog tasks
  })

  test('handles refresh during recovery check', async ({ page }) => {
    // Login as researcher
    await page.goto('/login')
    await page.getByLabel('账号').selectOption('researcher')
    await page.getByLabel('密码').fill('meteo-demo')
    await page.getByRole('button', { name: '登录' }).click()
    await expect(page).toHaveURL('/dashboard')

    // Navigate to settings
    await page.getByRole('link', { name: '设置' }).click()
    await expect(page).toHaveURL('/settings')

    // Open recovery dialog and wait for check
    await page.getByRole('button', { name: '恢复演示样例' }).click()
    await expect(page.getByText('正在检查缺失的案例')).not.toBeVisible({ timeout: 5000 })

    // Close dialog by clicking outside or escape
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible()

    // Refresh page
    await page.reload()
    await expect(page).toHaveURL('/settings')

    // Re-open dialog - should re-check
    await page.getByRole('button', { name: '恢复演示样例' }).click()
    await expect(page.getByText('正在检查缺失的案例')).toBeVisible()
    await expect(page.getByText('正在检查缺失的案例')).not.toBeVisible({ timeout: 5000 })
    await expect(page.getByText('待恢复案例：')).toBeVisible()
  })
})

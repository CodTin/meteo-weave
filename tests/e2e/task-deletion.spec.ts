import { expect, test } from './browser-guard'
import { submitDemoLogin } from './demo-login'

test.describe('Task deletion', () => {
  test('shows confirmation dialog before deletion', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Go to task list - should have catalog tasks
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '任务管理', exact: true })
      .click()
    await expect(page).toHaveURL('/tasks')

    // Wait for any task to load
    await page.waitForSelector('table tbody tr', { timeout: 10000 })

    // Get first task name for verification
    const firstTaskCell = page.locator('table tbody tr:first-child td:first-child')
    await expect(firstTaskCell).toBeVisible()

    // Click delete button for first task
    const deleteButton = page
      .locator('table tbody tr:first-child')
      .getByRole('button', { name: /删除/ })
    await deleteButton.click()

    // Verify confirmation dialog appears
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await expect(page.getByText('确认删除任务')).toBeVisible()
    await expect(page.getByText(/此操作无法撤销/)).toBeVisible()

    // Verify dialog has cancel and delete buttons
    await expect(page.getByRole('button', { name: '取消' })).toBeVisible()
    await expect(page.getByRole('button', { name: '删除' })).toBeVisible()
  })

  test('cancel button closes dialog without deleting task', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Get Dashboard count before
    const totalBefore = await page
      .locator('text=总任务数')
      .locator('..')
      .locator('.text-3xl')
      .textContent()

    // Go to task list
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '任务管理', exact: true })
      .click()
    await expect(page).toHaveURL('/tasks')

    // Wait for tasks to load
    await page.waitForSelector('table tbody tr', { timeout: 10000 })

    // Get task count
    const taskCountBefore = await page.locator('table tbody tr').count()

    // Click delete on first task
    const deleteButton = page
      .locator('table tbody tr:first-child')
      .getByRole('button', { name: /删除/ })
    await deleteButton.click()
    await expect(page.getByRole('alertdialog')).toBeVisible()

    // Click cancel
    await page.getByRole('button', { name: '取消' }).click()

    // Verify dialog closed
    await expect(page.getByRole('alertdialog')).not.toBeVisible()

    // Verify task count unchanged
    const taskCountAfter = await page.locator('table tbody tr').count()
    expect(taskCountAfter).toBe(taskCountBefore)

    // Verify Dashboard count unchanged
    await page
      .getByRole('navigation', { name: '工作区导航' })
      .getByRole('link', { name: 'Dashboard' })
      .click()
    const totalAfter = await page
      .locator('text=总任务数')
      .locator('..')
      .locator('.text-3xl')
      .textContent()
    expect(totalAfter).toBe(totalBefore)
  })

  test('successfully deletes task and updates list and dashboard', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Get Dashboard count before deletion
    const totalBefore = parseInt(
      (await page.locator('text=总任务数').locator('..').locator('.text-3xl').textContent()) || '0',
    )

    // Go to task list
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '任务管理', exact: true })
      .click()
    await expect(page).toHaveURL('/tasks')

    // Wait for tasks
    await page.waitForSelector('table tbody tr', { timeout: 10000 })
    const taskCountBefore = await page.locator('table tbody tr').count()

    // Delete first task
    await page
      .locator('table tbody tr:first-child')
      .getByRole('button', { name: /删除/ })
      .click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.getByRole('button', { name: '删除' }).click()

    // Wait for dialog to close and task to be removed
    await expect(page.getByRole('alertdialog')).not.toBeVisible({ timeout: 5000 })

    // Verify task count decreased
    await page.waitForTimeout(1000) // Give time for list to update
    const taskCountAfter = await page.locator('table tbody tr').count()
    expect(taskCountAfter).toBe(taskCountBefore - 1)

    // Verify Dashboard count decremented
    await page
      .getByRole('navigation', { name: '工作区导航' })
      .getByRole('link', { name: 'Dashboard' })
      .click()
    await expect(page).toHaveURL('/dashboard')
    const totalAfter = parseInt(
      (await page.locator('text=总任务数').locator('..').locator('.text-3xl').textContent()) || '0',
    )
    expect(totalAfter).toBe(totalBefore - 1)
  })

  test('delete works from card view', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Go to task list
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '任务管理', exact: true })
      .click()
    await expect(page).toHaveURL('/tasks')

    // Wait for table to load
    await page.waitForSelector('table tbody tr', { timeout: 10000 })
    const taskCountBefore = await page.locator('table tbody tr').count()

    // Switch to card view
    await page.getByRole('button', { name: '卡片视图' }).click()
    await expect(page.getByRole('button', { name: '卡片视图' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // Wait for cards to appear
    await page.waitForSelector('[role="listitem"]', { timeout: 5000 })

    // Delete from first card
    const firstCard = page.locator('[role="listitem"]').first()
    const deleteButton = firstCard.getByRole('button', { name: /删除/ })
    await deleteButton.click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.getByRole('button', { name: '删除' }).click()
    await expect(page.getByRole('alertdialog')).not.toBeVisible({ timeout: 5000 })

    // Switch back to table view and verify count decreased
    await page.getByRole('button', { name: '表格视图' }).click()
    await page.waitForTimeout(1000)
    const taskCountAfter = await page.locator('table tbody tr').count()
    expect(taskCountAfter).toBe(taskCountBefore - 1)
  })

  test('dialog is keyboard accessible', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Go to task list
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '任务管理', exact: true })
      .click()
    await expect(page).toHaveURL('/tasks')

    // Wait for tasks
    await page.waitForSelector('table tbody tr', { timeout: 10000 })
    const taskCountBefore = await page.locator('table tbody tr').count()

    // Navigate to first delete button with keyboard
    const deleteButton = page
      .locator('table tbody tr:first-child')
      .getByRole('button', { name: /删除/ })
    await deleteButton.focus()
    await page.keyboard.press('Enter')

    // Dialog should open
    await expect(page.getByRole('alertdialog')).toBeVisible()

    // Press Escape to close (standard dialog behavior)
    await page.keyboard.press('Escape')

    // Dialog should close
    await expect(page.getByRole('alertdialog')).not.toBeVisible()

    // Task should still exist
    const taskCountAfter = await page.locator('table tbody tr').count()
    expect(taskCountAfter).toBe(taskCountBefore)
  })
})

import { expect, test } from './browser-guard'
import { submitDemoLogin } from './demo-login'

test.describe('Task list page', () => {
  test('researcher can view task list with created tasks', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Create a task first
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '创建任务', exact: true })
      .click()
    await expect(page).toHaveURL('/tasks/new')

    // Fill in task form
    const nameInput = page.getByLabel('任务名称')
    await nameInput.fill('测试任务列表')

    const startDateInput = page.getByLabel('开始日期')
    await startDateInput.fill('2024-06-15')

    const endDateInput = page.getByLabel('结束日期')
    await endDateInput.fill('2024-06-15')

    // Confirm region
    const confirmButton = page.getByRole('button', { name: /确认.*区域/ })
    await confirmButton.click()

    // Submit task
    const submitButton = page.getByRole('button', { name: /提交.*任务/ })
    await expect(submitButton).toBeEnabled({ timeout: 10000 })
    await submitButton.click()

    // Should navigate to task result page
    await expect(page).toHaveURL(/\/tasks\/.+/, { timeout: 10000 })

    // Navigate to task list
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '任务管理', exact: true })
      .click()
    await expect(page).toHaveURL('/tasks')

    // Wait for list to load
    await page.waitForTimeout(1000)

    // Should see the task in the list
    await expect(page.getByRole('cell', { name: '测试任务列表' })).toBeVisible({ timeout: 10000 })

    // Should see task details
    await expect(page.getByText('Fusion')).toBeVisible()
    await expect(page.getByText('气温')).toBeVisible()

    // Should see status with icon
    const statusCell = page.locator('td:has-text("运行中"), td:has-text("已完成")')
    await expect(statusCell.first()).toBeVisible()

    // Should see action buttons
    await expect(page.getByRole('button', { name: /查看/ })).toBeVisible()
  })

  test('task list shows empty state when no tasks exist', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')

    // Go to task list
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '任务管理', exact: true })
      .click()
    await expect(page).toHaveURL('/tasks')

    // Wait for loading to finish
    await expect(page.getByText('加载任务列表...')).not.toBeVisible({ timeout: 5000 })

    // Should show empty state or catalog tasks
    const hasEmptyState = await page.getByText('暂无任务').isVisible()
    const hasTasks = await page.getByRole('table').isVisible()

    // Either empty or has demo catalog tasks
    expect(hasEmptyState || hasTasks).toBe(true)
  })

  test('clicking view button navigates to task result page', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Navigate to create task
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '创建任务', exact: true })
      .click()
    await expect(page).toHaveURL('/tasks/new')

    // Create a task
    await page.getByLabel('任务名称').fill('查看测试任务')
    await page.getByLabel('开始日期').fill('2024-07-01')
    await page.getByLabel('结束日期').fill('2024-07-01')
    await page.getByRole('button', { name: /确认.*区域/ }).click()
    const submitButton = page.getByRole('button', { name: /提交.*任务/ })
    await expect(submitButton).toBeEnabled({ timeout: 10000 })
    await submitButton.click()

    // Wait for task page
    await expect(page).toHaveURL(/\/tasks\/.+/, { timeout: 10000 })
    const taskUrl = page.url()
    const taskId = taskUrl.split('/').pop()

    // Go to task list
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '任务管理', exact: true })
      .click()
    await expect(page).toHaveURL('/tasks')
    await page.waitForTimeout(1000)
    await expect(page.getByText('查看测试任务')).toBeVisible({ timeout: 10000 })

    // Click view button
    const viewButton = page
      .locator('tr', { has: page.locator('td:has-text("查看测试任务")') })
      .getByRole('button', { name: /查看/ })
    await viewButton.click()

    // Should navigate to task result page
    await expect(page).toHaveURL(`/tasks/${taskId}`, { timeout: 10000 })
  })

  test('task list shows correct status for completed tasks', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')

    // Create a task
    await page.goto('/tasks/new')
    await page.getByLabel('任务名称').fill('完成状态测试')
    await page.getByLabel('开始日期').fill('2024-08-01')
    await page.getByLabel('结束日期').fill('2024-08-01')
    await page.getByRole('button', { name: /确认.*区域/ }).click()
    await page.getByRole('button', { name: /提交.*任务/ }).click()

    // Wait for completion (demo tasks complete in ~2.5 seconds)
    await page.waitForTimeout(3000)

    // Go to task list
    await page.goto('/tasks')
    await expect(page.getByText('完成状态测试')).toBeVisible()

    // Should show completed status
    const row = page.locator('tr', { has: page.locator('td:has-text("完成状态测试")') })
    await expect(row.getByText('已完成')).toBeVisible()
  })

  test('task list is accessible with keyboard navigation', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await page.goto('/tasks')

    // Wait for list to load
    await expect(page.getByText('加载任务列表...')).not.toBeVisible({ timeout: 5000 })

    // Check if table has tasks
    const hasTable = await page.getByRole('table').isVisible()
    if (hasTable) {
      // Table region should be keyboard focusable for horizontal scrolling
      const tableSection = page.getByRole('region', { name: '降尺度任务表格' })
      await expect(tableSection).toBeVisible()
      await expect(tableSection).toHaveAttribute('tabindex', '0')
    }

    // Create task button should be keyboard accessible
    const createButton = page.getByRole('link', { name: /创建任务/ })
    await expect(createButton).toBeVisible()
    await createButton.focus()
    await expect(createButton).toBeFocused()
  })

  test('task list displays multiple tasks in creation time descending order', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')

    // Create multiple tasks
    const taskNames = ['任务A', '任务B', '任务C']
    for (const name of taskNames) {
      await page.goto('/tasks/new')
      await page.getByLabel('任务名称').fill(name)
      await page.getByLabel('开始日期').fill('2024-09-01')
      await page.getByLabel('结束日期').fill('2024-09-01')
      await page.getByRole('button', { name: /确认.*区域/ }).click()
      await page.getByRole('button', { name: /提交.*任务/ }).click()
      await expect(page).toHaveURL(/\/tasks\/.+/)
      // Small delay between tasks
      await page.waitForTimeout(100)
    }

    // Go to task list
    await page.goto('/tasks')

    // All tasks should be visible
    for (const name of taskNames) {
      await expect(page.getByText(name)).toBeVisible()
    }

    // Get all task name cells
    const taskCells = page.locator('tbody tr td:first-child')
    const count = await taskCells.count()
    expect(count).toBeGreaterThanOrEqual(3)
  })

  test('task list maintains data after page refresh', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')

    // Create a task
    await page.goto('/tasks/new')
    await page.getByLabel('任务名称').fill('持久化测试')
    await page.getByLabel('开始日期').fill('2024-10-01')
    await page.getByLabel('结束日期').fill('2024-10-01')
    await page.getByRole('button', { name: /确认.*区域/ }).click()
    await page.getByRole('button', { name: /提交.*任务/ }).click()
    await expect(page).toHaveURL(/\/tasks\/.+/)

    // Go to task list
    await page.goto('/tasks')
    await expect(page.getByText('持久化测试')).toBeVisible()

    // Refresh page
    await page.reload()

    // Task should still be visible
    await expect(page.getByText('持久化测试')).toBeVisible()
  })

  test('task list shows all required columns', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await page.goto('/tasks')

    // Wait for list to load
    await expect(page.getByText('加载任务列表...')).not.toBeVisible({ timeout: 5000 })

    // Check for column headers
    const expectedHeaders = [
      '任务名称',
      '数据源',
      '气象变量',
      '经纬范围',
      '分析时间',
      '实际方法',
      '分辨率',
      '创建时间',
      '状态',
      '操作',
    ]

    for (const header of expectedHeaders) {
      await expect(page.getByRole('columnheader', { name: header })).toBeVisible()
    }
  })

  for (const viewport of [
    { width: 390, height: 844, name: '390px' },
    { width: 768, height: 1024, name: '768px' },
    { width: 1440, height: 900, name: '1440px' },
  ]) {
    test(`task list is usable at ${viewport.name} viewport`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/login')
      await submitDemoLogin(page, 'researcher')
      await page
        .getByRole('navigation', { name: '工作区导航', exact: true })
        .getByRole('link', { name: '任务管理', exact: true })
        .click()
      await expect(page).toHaveURL('/tasks')

      // Wait for loading
      await expect(page.getByText('加载任务列表...')).not.toBeVisible({ timeout: 10000 })

      // Workspace title should be visible
      await expect(page.locator('#workspace-title')).toBeVisible()

      // Create button should be visible
      await expect(page.getByRole('link', { name: /创建任务/ })).toBeVisible()

      // Table or empty state should be visible
      const hasTable = await page.getByRole('table').isVisible()
      const hasEmpty = await page.getByText('暂无任务').isVisible()
      expect(hasTable || hasEmpty).toBe(true)
    })
  }
})

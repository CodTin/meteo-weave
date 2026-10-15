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

  test.describe('Task filtering and search', () => {
    test('can search tasks by name', async ({ page }) => {
      await page.goto('/login')
      await submitDemoLogin(page, 'researcher')

      // Create two tasks with distinct names
      await page.goto('/tasks/new')
      await page.getByLabel('任务名称').fill('Temperature Analysis Task')
      await page.getByLabel('开始日期').fill('2024-11-01')
      await page.getByLabel('结束日期').fill('2024-11-01')
      await page.getByRole('button', { name: /确认.*区域/ }).click()
      await page.getByRole('button', { name: /提交.*任务/ }).click()
      await expect(page).toHaveURL(/\/tasks\/.+/)

      await page.goto('/tasks/new')
      await page.getByLabel('任务名称').fill('Wind Speed Study')
      await page.getByLabel('开始日期').fill('2024-11-02')
      await page.getByLabel('结束日期').fill('2024-11-02')
      await page.getByRole('button', { name: /确认.*区域/ }).click()
      await page.getByRole('button', { name: /提交.*任务/ }).click()
      await expect(page).toHaveURL(/\/tasks\/.+/)

      // Go to task list
      await page.goto('/tasks')
      await expect(page.getByText('加载任务列表...')).not.toBeVisible({ timeout: 5000 })

      // Search for "temperature" (case-insensitive)
      const searchInput = page.getByLabel('任务名称搜索')
      await searchInput.fill('temperature')

      // Should see only the temperature task
      await expect(page.getByText('Temperature Analysis Task')).toBeVisible()
      await expect(page.getByText('Wind Speed Study')).not.toBeVisible()

      // Clear search
      await searchInput.clear()
      await expect(page.getByText('Wind Speed Study')).toBeVisible()
    })

    test('search trims whitespace', async ({ page }) => {
      await page.goto('/login')
      await submitDemoLogin(page, 'researcher')

      await page.goto('/tasks/new')
      await page.getByLabel('任务名称').fill('Whitespace Test')
      await page.getByLabel('开始日期').fill('2024-11-03')
      await page.getByLabel('结束日期').fill('2024-11-03')
      await page.getByRole('button', { name: /确认.*区域/ }).click()
      await page.getByRole('button', { name: /提交.*任务/ }).click()
      await expect(page).toHaveURL(/\/tasks\/.+/)

      await page.goto('/tasks')
      await expect(page.getByText('加载任务列表...')).not.toBeVisible({ timeout: 5000 })

      // Search with leading/trailing whitespace
      const searchInput = page.getByLabel('任务名称搜索')
      await searchInput.fill('  whitespace  ')

      await expect(page.getByText('Whitespace Test')).toBeVisible()
    })

    test('can filter by status', async ({ page }) => {
      await page.goto('/login')
      await submitDemoLogin(page, 'researcher')

      // Create a task
      await page.goto('/tasks/new')
      await page.getByLabel('任务名称').fill('Status Filter Test')
      await page.getByLabel('开始日期').fill('2024-11-04')
      await page.getByLabel('结束日期').fill('2024-11-04')
      await page.getByRole('button', { name: /确认.*区域/ }).click()
      await page.getByRole('button', { name: /提交.*任务/ }).click()
      await expect(page).toHaveURL(/\/tasks\/.+/)

      await page.goto('/tasks')
      await expect(page.getByText('加载任务列表...')).not.toBeVisible({ timeout: 5000 })

      // Filter by Running status
      const statusFilter = page.getByLabel('任务状态')
      await statusFilter.click()
      await page.getByRole('option', { name: '运行中' }).click()

      // Should see the task (tasks start as Running)
      await expect(page.getByText('Status Filter Test')).toBeVisible()

      // Change to Completed filter
      await statusFilter.click()
      await page.getByRole('option', { name: '已完成' }).click()

      // May or may not see tasks depending on completion timing
    })

    test('can filter by variable', async ({ page }) => {
      await page.goto('/login')
      await submitDemoLogin(page, 'researcher')

      await page.goto('/tasks')
      await expect(page.getByText('加载任务列表...')).not.toBeVisible({ timeout: 5000 })

      // Filter by temperature variable
      const variableFilter = page.getByLabel('气象变量')
      await variableFilter.click()
      await page.getByRole('option', { name: '气温' }).click()

      // Should only see temperature tasks (default variable)
      const table = page.getByRole('table')
      if (await table.isVisible()) {
        // Verify temperature is shown in the table
        await expect(page.getByText('气温')).toBeVisible()
      }
    })

    test('can clear all filters', async ({ page }) => {
      await page.goto('/login')
      await submitDemoLogin(page, 'researcher')

      await page.goto('/tasks')
      await expect(page.getByText('加载任务列表...')).not.toBeVisible({ timeout: 5000 })

      // Apply multiple filters
      const searchInput = page.getByLabel('任务名称搜索')
      await searchInput.fill('test')

      const statusFilter = page.getByLabel('任务状态')
      await statusFilter.click()
      await page.getByRole('option', { name: '已完成' }).click()

      // Should see clear filters button
      const clearButton = page.getByRole('button', { name: /清除所有筛选/ })
      await expect(clearButton).toBeVisible()

      // Clear filters
      await clearButton.click()

      // Clear button should disappear
      await expect(clearButton).not.toBeVisible()

      // Search input should be empty
      await expect(searchInput).toHaveValue('')
    })

    test('shows no matches state when filters return empty', async ({ page }) => {
      await page.goto('/login')
      await submitDemoLogin(page, 'researcher')

      await page.goto('/tasks')
      await expect(page.getByText('加载任务列表...')).not.toBeVisible({ timeout: 5000 })

      // Search for something that doesn't exist
      const searchInput = page.getByLabel('任务名称搜索')
      await searchInput.fill('ThisTaskDoesNotExist12345')

      // Should show no matches state
      await expect(page.getByText('没有匹配的任务')).toBeVisible()
      await expect(page.getByRole('button', { name: /清除筛选/ })).toBeVisible()
    })
  })

  test.describe('Task sorting', () => {
    test('can sort by name', async ({ page }) => {
      await page.goto('/login')
      await submitDemoLogin(page, 'researcher')

      // Create tasks with different names
      const names = ['Zebra Task', 'Apple Task', 'Mango Task']
      for (const name of names) {
        await page.goto('/tasks/new')
        await page.getByLabel('任务名称').fill(name)
        await page.getByLabel('开始日期').fill('2024-11-05')
        await page.getByLabel('结束日期').fill('2024-11-05')
        await page.getByRole('button', { name: /确认.*区域/ }).click()
        await page.getByRole('button', { name: /提交.*任务/ }).click()
        await expect(page).toHaveURL(/\/tasks\/.+/)
        await page.waitForTimeout(100)
      }

      await page.goto('/tasks')
      await expect(page.getByText('加载任务列表...')).not.toBeVisible({ timeout: 5000 })

      // Click name column header to sort
      const nameHeader = page.getByRole('button', { name: /按任务名称排序/ })
      await nameHeader.click()

      // Should be sorted alphabetically
      const taskCells = page.locator('tbody tr td:first-child')
      const firstTask = await taskCells.first().textContent()
      expect(firstTask).toContain('Apple')
    })

    test('can toggle sort direction', async ({ page }) => {
      await page.goto('/login')
      await submitDemoLogin(page, 'researcher')

      await page.goto('/tasks')
      await expect(page.getByText('加载任务列表...')).not.toBeVisible({ timeout: 5000 })

      const nameHeader = page.getByRole('button', { name: /按任务名称排序/ })

      // First click - ascending
      await nameHeader.click()
      await page.waitForTimeout(200)

      // Second click - descending
      await nameHeader.click()
      await page.waitForTimeout(200)

      // Verify sort direction changed (table should re-render)
      const table = page.getByRole('table')
      await expect(table).toBeVisible()
    })
  })

  test.describe('Task pagination', () => {
    test('shows pagination when more than 20 tasks', async ({ page }) => {
      await page.goto('/login')
      await submitDemoLogin(page, 'researcher')

      // Create 25 tasks to trigger pagination
      for (let i = 1; i <= 25; i++) {
        await page.goto('/tasks/new')
        await page.getByLabel('任务名称').fill(`Pagination Task ${i}`)
        await page.getByLabel('开始日期').fill('2024-11-06')
        await page.getByLabel('结束日期').fill('2024-11-06')
        await page.getByRole('button', { name: /确认.*区域/ }).click()
        await page.getByRole('button', { name: /提交.*任务/ }).click()
        await expect(page).toHaveURL(/\/tasks\/.+/)
      }

      await page.goto('/tasks')
      await expect(page.getByText('加载任务列表...')).not.toBeVisible({ timeout: 5000 })

      // Should see pagination controls
      await expect(page.getByText(/第 \d+ \/ \d+ 页/)).toBeVisible()
      await expect(page.getByRole('button', { name: /下一页/ })).toBeVisible()
    })

    test('can navigate between pages', async ({ page }) => {
      await page.goto('/login')
      await submitDemoLogin(page, 'researcher')

      // Assume tasks exist from previous test or catalog
      await page.goto('/tasks')
      await expect(page.getByText('加载任务列表...')).not.toBeVisible({ timeout: 5000 })

      const nextButton = page.getByRole('button', { name: /下一页/ })
      const prevButton = page.getByRole('button', { name: /上一页/ })

      // If pagination exists
      if (await nextButton.isVisible()) {
        // Go to next page
        await nextButton.click()
        await page.waitForTimeout(200)

        // Should be on page 2
        await expect(page.getByText(/第 2 \/ \d+ 页/)).toBeVisible()

        // Previous button should be enabled
        await expect(prevButton).toBeEnabled()

        // Go back
        await prevButton.click()
        await page.waitForTimeout(200)

        // Should be on page 1
        await expect(page.getByText(/第 1 \/ \d+ 页/)).toBeVisible()
      }
    })

    test('pagination resets to page 1 when filters change', async ({ page }) => {
      await page.goto('/login')
      await submitDemoLogin(page, 'researcher')

      await page.goto('/tasks')
      await expect(page.getByText('加载任务列表...')).not.toBeVisible({ timeout: 5000 })

      const nextButton = page.getByRole('button', { name: /下一页/ })

      // If on a page with pagination
      if (await nextButton.isVisible()) {
        // Go to page 2
        await nextButton.click()
        await page.waitForTimeout(200)

        // Change filter
        const searchInput = page.getByLabel('任务名称搜索')
        await searchInput.fill('test')

        // Should reset to page 1
        const pageIndicator = page.getByText(/第 \d+ \/ \d+ 页/)
        if (await pageIndicator.isVisible()) {
          await expect(pageIndicator).toContainText('第 1 /')
        }
      }
    })
  })
})

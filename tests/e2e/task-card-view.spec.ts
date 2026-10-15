import { expect, test } from './browser-guard'
import { submitDemoLogin } from './demo-login'

test.describe('Task card view', () => {
  test('displays view toggle between table and card views', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Navigate to task list via UI
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '任务管理', exact: true })
      .click()
    await expect(page).toHaveURL('/tasks')

    // Wait for loading to finish
    await expect(page.getByText('加载任务列表...')).not.toBeVisible({ timeout: 5000 })

    // Should see view toggle control
    const tableViewButton = page.getByRole('button', { name: /表格视图/ })
    const cardViewButton = page.getByRole('button', { name: /卡片视图/ })

    await expect(tableViewButton).toBeVisible()
    await expect(cardViewButton).toBeVisible()

    // Table view should be selected by default
    await expect(tableViewButton).toHaveAttribute('aria-pressed', 'true')
    await expect(cardViewButton).toHaveAttribute('aria-pressed', 'false')
  })

  test('switches to card view when card button is clicked', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Navigate to task list
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '任务管理', exact: true })
      .click()
    await expect(page).toHaveURL('/tasks')
    await expect(page.getByText('加载任务列表...')).not.toBeVisible({ timeout: 5000 })

    // Initially table should be visible
    await expect(page.getByRole('table')).toBeVisible()

    // Click card view button
    const cardViewButton = page.getByRole('button', { name: /卡片视图/ })
    await cardViewButton.click()

    // Card view button should now be pressed
    await expect(cardViewButton).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: /表格视图/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    // Table should not be visible, cards should be visible
    await expect(page.getByRole('table')).not.toBeVisible()
    // Check for card grid container
    await expect(page.locator('[role="list"]').first()).toBeVisible()
  })

  test('preserves search filter when switching between views', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Navigate to task list (demo catalog has pre-existing tasks)
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '任务管理', exact: true })
      .click()
    await expect(page).toHaveURL('/tasks')
    await expect(page.getByText('加载任务列表...')).not.toBeVisible({ timeout: 5000 })

    // Apply search filter for "Alpine" (matches demo catalog task)
    const searchInput = page.getByLabel('任务名称搜索')
    await searchInput.fill('Alpine')

    // Should see only Alpine task in table
    await expect(page.getByText(/Alpine/)).toBeVisible()

    // Switch to card view
    await page.getByRole('button', { name: /卡片视图/ }).click()

    // Should still see Alpine task in cards
    await expect(page.locator('[role="list"]')).toBeVisible()
    await expect(page.getByText(/Alpine/)).toBeVisible()

    // Switch back to table view
    await page.getByRole('button', { name: /表格视图/ }).click()

    // Search should still be applied
    await expect(searchInput).toHaveValue('Alpine')
    await expect(page.getByText(/Alpine/)).toBeVisible()
  })

  test('preserves sorting when switching between views', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Navigate to task list
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '任务管理', exact: true })
      .click()
    await expect(page).toHaveURL('/tasks')
    await expect(page.getByText('加载任务列表...')).not.toBeVisible({ timeout: 5000 })

    // Sort by name
    const nameSortButton = page.getByRole('button', { name: /按任务名称排序/ })
    await nameSortButton.click()
    await page.waitForTimeout(200)

    // Get first task name in table
    const firstTaskInTable = await page.locator('tbody tr td:first-child').first().textContent()

    // Switch to card view
    await page.getByRole('button', { name: /卡片视图/ }).click()

    // First card should have the same task name
    const firstCardTitle = await page.locator('[role="listitem"] h3').first().textContent()
    expect(firstCardTitle).toBe(firstTaskInTable)

    // Switch back to table
    await page.getByRole('button', { name: /表格视图/ }).click()

    // First task should still be the same
    const firstTaskAfter = await page.locator('tbody tr td:first-child').first().textContent()
    expect(firstTaskAfter).toBe(firstTaskInTable)
  })

  test('can view task from card view', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Navigate to task list
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '任务管理', exact: true })
      .click()
    await expect(page).toHaveURL('/tasks')
    await expect(page.getByText('加载任务列表...')).not.toBeVisible({ timeout: 5000 })

    // Switch to card view
    await page.getByRole('button', { name: /卡片视图/ }).click()

    // Get the first card's task name
    const firstCardTitle = await page.locator('[role="listitem"] h3').first().textContent()

    // Click view button on first card
    const viewButton = page.locator('[role="listitem"]').first().getByRole('button', { name: /查看/ })
    await viewButton.click()

    // Should navigate to task result page
    await expect(page).toHaveURL(/\/tasks\/.+/)

    // Should show the task details page (check main content area, not workspace title)
    await expect(page.locator('main h1').last()).toContainText(firstCardTitle || '')
  })

  for (const viewport of [
    { width: 390, height: 844, name: '390px' },
    { width: 768, height: 1024, name: '768px' },
    { width: 1440, height: 900, name: '1440px' },
  ]) {
    test(`card view is usable at ${viewport.name} viewport`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/login')
      await submitDemoLogin(page, 'researcher')
      await expect(page).toHaveURL('/dashboard')

      // For narrow viewports, need to open mobile nav drawer
      if (viewport.width < 1024) {
        const mobileNavButton = page.getByRole('button', { name: /打开工作区导航/ })
        await expect(mobileNavButton).toBeVisible({ timeout: 5000 })
        await mobileNavButton.click()
        // Wait for drawer to open
        await page.waitForTimeout(300)
      }

      await page
        .getByRole('navigation', { name: '工作区导航', exact: true })
        .getByRole('link', { name: '任务管理', exact: true })
        .click()
      await expect(page).toHaveURL('/tasks')
      await expect(page.getByText('加载任务列表...')).not.toBeVisible({ timeout: 10000 })

      // View toggle should be visible
      await expect(page.getByRole('button', { name: /表格视图/ })).toBeVisible()
      await expect(page.getByRole('button', { name: /卡片视图/ })).toBeVisible()

      // Switch to card view
      await page.getByRole('button', { name: /卡片视图/ }).click()

      // Cards should be visible
      await expect(page.locator('[role="list"]')).toBeVisible()

      // At least one card should be visible
      const cardCount = await page.locator('[role="listitem"]').count()
      expect(cardCount).toBeGreaterThan(0)

      // Card should have task name and view button
      await expect(page.locator('[role="listitem"] h3').first()).toBeVisible()
      await expect(
        page.locator('[role="listitem"]').first().getByRole('button', { name: /查看/ }),
      ).toBeVisible()
    })
  }
})


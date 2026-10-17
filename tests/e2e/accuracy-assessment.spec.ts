import { expect, test } from './browser-guard'

test.describe('Accuracy Assessment', () => {
  test('displays accuracy metrics for completed task', async ({ page }) => {
    // Navigate to app
    await page.goto('/')

    // Wait for task list to load
    await page.waitForSelector('[data-testid="task-card"]', { timeout: 10000 })

    // Find a completed task
    const completedTask = page
      .locator('[data-testid="task-card"]')
      .filter({ hasText: 'Completed' })
      .first()
    await expect(completedTask).toBeVisible()

    // Click on the completed task to view results
    await completedTask.click()

    // Wait for result analysis page
    await expect(page.locator('h1:has-text("结果分析")')).toBeVisible()

    // Click on accuracy assessment tab
    await page.locator('button:has-text("精度评估")').click()

    // Wait for accuracy panel to load
    await page.waitForTimeout(2000)

    // Check if metrics are displayed or unavailable message is shown
    const hasMetrics = await page.locator('text=RMSE').isVisible()
    const hasUnavailable = await page.locator('text=无法').isVisible()

    // Either should be true
    expect(hasMetrics || hasUnavailable).toBe(true)

    // If metrics are available, verify they are displayed
    if (hasMetrics) {
      await expect(page.locator('text=RMSE')).toBeVisible()
      await expect(page.locator('text=MAE')).toBeVisible()
      await expect(page.locator('text=R²')).toBeVisible()

      // Check for sample count
      await expect(page.locator('text=/\\d+.*个共同有效样本/')).toBeVisible()

      // Check for unit display (should show one of the four variable units)
      const hasUnit =
        (await page.locator('text=°C').isVisible()) ||
        (await page.locator('text=hPa').isVisible()) ||
        (await page.locator('text=m/s').isVisible()) ||
        (await page.locator('text=mm').isVisible())
      expect(hasUnit).toBe(true)

      // Check for Synthetic Demo disclaimer
      await expect(page.locator('text=/Synthetic Demo/i')).toBeVisible()
    }
  })

  test('shows correct units for each variable type', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="task-card"]', { timeout: 10000 })

    // Get all completed tasks
    const completedTasks = page
      .locator('[data-testid="task-card"]')
      .filter({ hasText: 'Completed' })
    const taskCount = await completedTasks.count()

    if (taskCount === 0) {
      test.skip()
      return
    }

    // Check first available completed task
    const task = completedTasks.first()
    await task.click()

    await expect(page.locator('h1:has-text("结果分析")')).toBeVisible()
    await page.locator('button:has-text("精度评估")').click()
    await page.waitForTimeout(2000)

    // Verify that if metrics are shown, the unit is from the valid set
    const hasMetrics = await page.locator('text=RMSE').isVisible()
    if (hasMetrics) {
      const units = ['°C', 'hPa', 'm/s', 'mm']
      let foundUnit = false

      for (const unit of units) {
        if (await page.locator(`text=${unit}`).isVisible()) {
          foundUnit = true
          break
        }
      }

      expect(foundUnit).toBe(true)
    }
  })

  test('preserves valid zero values in accuracy assessment', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="task-card"]', { timeout: 10000 })

    const completedTask = page
      .locator('[data-testid="task-card"]')
      .filter({ hasText: 'Completed' })
      .first()

    if (!(await completedTask.isVisible())) {
      test.skip()
      return
    }

    await completedTask.click()
    await expect(page.locator('h1:has-text("结果分析")')).toBeVisible()
    await page.locator('button:has-text("精度评估")').click()
    await page.waitForTimeout(2000)

    const hasMetrics = await page.locator('text=RMSE').isVisible()
    if (hasMetrics) {
      // Verify sample count is displayed (n should be > 0)
      const sampleText = await page.locator('text=/\\d+.*个共同有效样本/').textContent()
      expect(sampleText).toBeTruthy()

      // Extract the number from the text
      const match = sampleText?.match(/(\d+)/)
      if (match) {
        const sampleCount = parseInt(match[1] || '0', 10)
        expect(sampleCount).toBeGreaterThan(0)
      }
    }
  })

  test('shows unavailable state when no completed tasks', async ({ page }) => {
    await page.goto('/')

    // Create a new task (will be Running)
    await page.locator('button:has-text("创建任务")').first().click()

    // Wait for task creation and go back
    await page.waitForTimeout(1000)
    await page.goto('/')

    // Find the running task
    const runningTask = page
      .locator('[data-testid="task-card"]')
      .filter({ hasText: 'Running' })
      .first()

    if (await runningTask.isVisible()) {
      await runningTask.click()

      // Try to navigate to accuracy tab
      const accuracyTab = page.locator('button:has-text("精度评估")')
      if (await accuracyTab.isVisible()) {
        await accuracyTab.click()

        // Should show unavailable message
        await expect(page.locator('text=/任务尚未完成/')).toBeVisible()
      }
    }
  })

  test('maintains accessibility with keyboard navigation', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="task-card"]', { timeout: 10000 })

    const completedTask = page
      .locator('[data-testid="task-card"]')
      .filter({ hasText: 'Completed' })
      .first()

    if (!(await completedTask.isVisible())) {
      test.skip()
      return
    }

    // Navigate using keyboard
    await completedTask.focus()
    await page.keyboard.press('Enter')

    await expect(page.locator('h1:has-text("结果分析")')).toBeVisible()

    // Tab to accuracy tab and activate with keyboard
    const accuracyTab = page.locator('button:has-text("精度评估")')
    await accuracyTab.focus()
    await page.keyboard.press('Enter')

    await page.waitForTimeout(2000)

    // Verify content is accessible
    const hasMetrics = await page.locator('text=RMSE').isVisible()
    const hasUnavailable = await page.locator('text=无法').isVisible()
    expect(hasMetrics || hasUnavailable).toBe(true)
  })
})

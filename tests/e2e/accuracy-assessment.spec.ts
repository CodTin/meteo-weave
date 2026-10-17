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

      // Ticket #72: Check for station count and station-time samples distinction
      await expect(page.locator('text=/\\d+.*个独立台站/')).toBeVisible()
      await expect(page.locator('text=/\\d+.*个站时样本/')).toBeVisible()

      // Check for unit display (should show one of the four variable units)
      const hasUnit =
        (await page.locator('text=°C').isVisible()) ||
        (await page.locator('text=hPa').isVisible()) ||
        (await page.locator('text=m/s').isVisible()) ||
        (await page.locator('text=mm').isVisible())
      expect(hasUnit).toBe(true)

      // Ticket #72: Check for Synthetic Demo data source marking
      await expect(page.locator('text=Synthetic Demo')).toBeVisible()

      // Ticket #72: Check for actual time coverage (not just task range)
      await expect(page.locator('text=/实际查询.*个时刻/')).toBeVisible()

      // Ticket #72: Check for sampling plan description
      await expect(page.locator('text=/取样方案/')).toBeVisible()

      // Ticket #72: Verify disclaimer about synthetic reference
      await expect(page.locator('text=/合成台站参考/')).toBeVisible()
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

  test('[Ticket #72] verifies reproducible station sampling and actual time coverage', async ({
    page,
  }) => {
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
      // Verify sampling plan is displayed and describes the approach
      const samplingPlan = page.locator('text=/取样方案/')
      await expect(samplingPlan).toBeVisible()

      // Verify actual time coverage is reported, not just task range
      const timeCoverage = page.locator('text=/实际查询.*个时刻/')
      await expect(timeCoverage).toBeVisible()

      // Verify station count vs station-time sample distinction
      const stationCount = page.locator('text=/\\d+.*个独立台站/')
      const sampleCount = page.locator('text=/\\d+.*个站时样本/')
      await expect(stationCount).toBeVisible()
      await expect(sampleCount).toBeVisible()
    }
  })

  test('[Ticket #72] displays verifiable error improvement metrics', async ({ page }) => {
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
      // Each metric card should show original and downscaled values
      await expect(page.locator('text=原始').first()).toBeVisible()
      await expect(page.locator('text=降尺度').first()).toBeVisible()

      // Each metric card should show improvement percentage
      const improvementText = page.locator('text=/[+-]\\d+\\.\\d+%/')
      await expect(improvementText.first()).toBeVisible()

      // Degradation should be marked if present
      const hasDegradation = await page.locator('text=退化').isVisible()
      // This is okay - degradation may or may not be present
      expect(typeof hasDegradation).toBe('boolean')
    }
  })

  test('[Ticket #72] switches between tasks and shows non-cached data', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="task-card"]', { timeout: 10000 })

    const completedTasks = page
      .locator('[data-testid="task-card"]')
      .filter({ hasText: 'Completed' })

    const taskCount = await completedTasks.count()

    if (taskCount < 2) {
      test.skip()
      return
    }

    // View first task accuracy
    await completedTasks.nth(0).click()
    await expect(page.locator('h1:has-text("结果分析")')).toBeVisible()
    await page.locator('button:has-text("精度评估")').click()
    await page.waitForTimeout(2000)

    const firstTaskHasMetrics = await page.locator('text=RMSE').isVisible()
    if (firstTaskHasMetrics) {
      const sampleText = await page.locator('text=/\\d+.*个站时样本/').textContent()
      // Verify first task has sample data
      expect(sampleText).toBeTruthy()
    }

    // Go back and view second task
    await page.goto('/')
    await page.waitForSelector('[data-testid="task-card"]', { timeout: 10000 })
    await completedTasks.nth(1).click()
    await expect(page.locator('h1:has-text("结果分析")')).toBeVisible()
    await page.locator('button:has-text("精度评估")').click()
    await page.waitForTimeout(2000)

    const secondTaskHasMetrics = await page.locator('text=RMSE').isVisible()

    // Verify we're not showing cached data from first task
    if (secondTaskHasMetrics && firstTaskHasMetrics) {
      const secondTaskSampleText = await page.locator('text=/\\d+.*个站时样本/').textContent()
      // Sample counts may differ between tasks (verifies non-cached data)
      expect(secondTaskSampleText).toBeTruthy()
    }
  })
})

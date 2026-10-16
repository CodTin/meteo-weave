import { expect, test } from './browser-guard'

test.describe('Event Assessment', () => {
  test('displays event metrics for completed task', async ({ page }) => {
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

    // Click on event assessment tab if it exists
    const eventTab = page.locator('button:has-text("极端事件")')
    if (await eventTab.isVisible()) {
      await eventTab.click()
      await page.waitForTimeout(2000)

      // Check if metrics are displayed or unavailable message is shown
      const hasMetrics = await page.locator('text=命中率').isVisible()
      const hasUnavailable = await page.locator('text=无法').isVisible()

      // Either should be true
      expect(hasMetrics || hasUnavailable).toBe(true)

      // If metrics are available, verify they are displayed
      if (hasMetrics) {
        await expect(page.locator('text=命中率')).toBeVisible()
        await expect(page.locator('text=精确率')).toBeVisible()

        // Check for Hit Rate and Precision display
        await expect(page.locator('text=/Hit Rate/i')).toBeVisible()
        await expect(page.locator('text=/Precision/i')).toBeVisible()

        // Check for TP, FP, FN, TN counts
        await expect(page.locator('text=/TP:/i')).toBeVisible()
        await expect(page.locator('text=/FP:/i')).toBeVisible()
        await expect(page.locator('text=/FN:/i')).toBeVisible()
        await expect(page.locator('text=/TN:/i')).toBeVisible()

        // Check for sample count
        await expect(page.locator('text=/\\d+.*个共同有效样本/')).toBeVisible()

        // Check for threshold display
        const hasThreshold =
          (await page.locator('text=/>/).isVisible()) ||
          (await page.locator('text=/</).isVisible())
        expect(hasThreshold).toBe(true)
      }
    }
  })

  test('shows event threshold definition with correct units', async ({ page }) => {
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

    const eventTab = page.locator('button:has-text("极端事件")')
    if (await eventTab.isVisible()) {
      await eventTab.click()
      await page.waitForTimeout(2000)

      const hasMetrics = await page.locator('text=命中率').isVisible()
      if (hasMetrics) {
        // Verify unit is from the valid set
        const units = ['°C', 'hPa', 'm/s', 'mm']
        let foundUnit = false

        for (const unit of units) {
          if (await page.locator(`text=${unit}`).isVisible()) {
            foundUnit = true
            break
          }
        }

        expect(foundUnit).toBe(true)

        // Check for threshold direction indicator
        const hasDirection =
          (await page.locator('text=/>=/i').isVisible()) ||
          (await page.locator('text=/>/i').isVisible()) ||
          (await page.locator('text=/<=/i').isVisible()) ||
          (await page.locator('text=/</i').isVisible())
        expect(hasDirection).toBe(true)
      }
    }
  })

  test('displays both original and downscaled event metrics', async ({ page }) => {
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

    const eventTab = page.locator('button:has-text("极端事件")')
    if (await eventTab.isVisible()) {
      await eventTab.click()
      await page.waitForTimeout(2000)

      const hasMetrics = await page.locator('text=命中率').isVisible()
      if (hasMetrics) {
        // Check for both method labels
        await expect(page.locator('text=原始方法')).toBeVisible()
        await expect(page.locator('text=降尺度方法')).toBeVisible()

        // Verify both have the same structure
        const originalSection = page.locator('text=原始方法').locator('..')
        const downscaledSection = page.locator('text=降尺度方法').locator('..')

        // Both should have counts visible
        await expect(originalSection.locator('text=/TP:/i')).toBeVisible()
        await expect(downscaledSection.locator('text=/TP:/i')).toBeVisible()
      }
    }
  })

  test('shows denominator labels and explanations', async ({ page }) => {
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

    const eventTab = page.locator('button:has-text("极端事件")')
    if (await eventTab.isVisible()) {
      await eventTab.click()
      await page.waitForTimeout(2000)

      const hasMetrics = await page.locator('text=命中率').isVisible()
      if (hasMetrics) {
        // Check for denominator labels
        await expect(page.locator('text=/TP \\+ FN/i')).toBeVisible()
        await expect(page.locator('text=/TP \\+ FP/i')).toBeVisible()

        // Check for indicator legend/explanation
        await expect(page.locator('text=指标说明')).toBeVisible()
      }
    }
  })

  test('indicates demo threshold status', async ({ page }) => {
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

    const eventTab = page.locator('button:has-text("极端事件")')
    if (await eventTab.isVisible()) {
      await eventTab.click()
      await page.waitForTimeout(2000)

      const hasMetrics = await page.locator('text=命中率').isVisible()
      if (hasMetrics) {
        // Check for demo/non-validated warning
        const hasDemoWarning =
          (await page.locator('text=/演示评估口径/i').isVisible()) ||
          (await page.locator('text=/非.*验证.*标准/i').isVisible())
        expect(hasDemoWarning).toBe(true)
      }
    }
  })

  test('shows unavailable state with clear reason', async ({ page }) => {
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

      // Try to navigate to event tab
      const eventTab = page.locator('button:has-text("极端事件")')
      if (await eventTab.isVisible()) {
        await eventTab.click()

        // Should show unavailable message
        await expect(page.locator('text=/任务尚未完成|无法/')).toBeVisible()
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

    // Tab to event tab and activate with keyboard
    const eventTab = page.locator('button:has-text("极端事件")')
    if (await eventTab.isVisible()) {
      await eventTab.focus()
      await page.keyboard.press('Enter')

      await page.waitForTimeout(2000)

      // Verify content is accessible
      const hasMetrics = await page.locator('text=命中率').isVisible()
      const hasUnavailable = await page.locator('text=无法').isVisible()
      expect(hasMetrics || hasUnavailable).toBe(true)
    }
  })

  test('shows accumulation interval for precipitation events', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="task-card"]', { timeout: 10000 })

    // Find a completed precipitation task
    const precipTask = page
      .locator('[data-testid="task-card"]')
      .filter({ hasText: 'Completed' })
      .filter({ hasText: /降水|precipitation/i })
      .first()

    if (await precipTask.isVisible()) {
      await precipTask.click()
      await expect(page.locator('h1:has-text("结果分析")')).toBeVisible()

      const eventTab = page.locator('button:has-text("极端事件")')
      if (await eventTab.isVisible()) {
        await eventTab.click()
        await page.waitForTimeout(2000)

        const hasMetrics = await page.locator('text=命中率').isVisible()
        if (hasMetrics) {
          // Check for accumulation interval description
          const hasAccumulation =
            (await page.locator('text=/小时.*累计/i').isVisible()) ||
            (await page.locator('text=/24h/i').isVisible())
          expect(hasAccumulation).toBe(true)
        }
      }
    } else {
      test.skip()
    }
  })
})

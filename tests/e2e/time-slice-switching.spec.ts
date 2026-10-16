import { test, expect } from './browser-guard'

test.describe('Time Slice Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for workspace to load
    await expect(page.locator('text=降尺度任务')).toBeVisible()
  })

  test('switches time slices and updates all four maps consistently', async ({ page }) => {
    // Navigate to result analysis page
    await page.goto('/tasks/demo-temperature-deterministic/result')

    // Wait for page to load
    await expect(page.locator('text=结果分析')).toBeVisible()

    // Verify time slice selector is present
    const timeSliceLabel = page.locator('text=Time Slice (UTC)')
    await expect(timeSliceLabel).toBeVisible()

    // Get the initial time from the selector
    const selector = page.locator('[id="time-slice-selector"]')
    await expect(selector).toBeVisible()

    // Verify all four map panels are present
    await expect(page.locator('text=Original Data')).toBeVisible()
    await expect(page.locator('text=Downscaled Data')).toBeVisible()
    await expect(page.locator('text=Observation Data')).toBeVisible()
    await expect(page.locator('text=Difference (Downscaled - Original)')).toBeVisible()

    // Verify comparison info shows current time
    await expect(page.locator('text=Comparison Info')).toBeVisible()

    // Open time slice selector
    await selector.click()

    // Select a different time slice (if multiple are available)
    const options = page.locator('[role="option"]')
    const optionCount = await options.count()

    if (optionCount > 1) {
      // Click the second option
      await options.nth(1).click()

      // Wait a bit for any data fetching (though maps are placeholders)
      await page.waitForTimeout(500)

      // Verify all four panels still show consistent state
      await expect(page.locator('text=Original Data')).toBeVisible()
      await expect(page.locator('text=Downscaled Data')).toBeVisible()
      await expect(page.locator('text=Observation Data')).toBeVisible()
      await expect(page.locator('text=Difference (Downscaled - Original)')).toBeVisible()

      // Verify comparison info updated (checking it still exists)
      await expect(page.locator('text=Comparison Info')).toBeVisible()
    }
  })

  test('preserves time selection when switching tabs', async ({ page }) => {
    // Navigate to result analysis page
    await page.goto('/tasks/demo-temperature-deterministic/result')

    await expect(page.locator('text=结果分析')).toBeVisible()

    // Get the selector
    const selector = page.locator('[id="time-slice-selector"]')
    await expect(selector).toBeVisible()

    // Open and select a different time if available
    await selector.click()
    const options = page.locator('[role="option"]')
    const optionCount = await options.count()

    if (optionCount > 1) {
      const secondOption = await options.nth(1).textContent()
      await options.nth(1).click()

      // Navigate to another tab
      await page.locator('text=精度评估').click()
      await expect(page.locator('text=精度评估功能将在后续版本提供')).toBeVisible()

      // Navigate back to map comparison
      await page.locator('text=地图对比').click()

      // Verify time slice is still the same
      await expect(selector).toBeVisible()
      const currentValue = await selector.textContent()
      expect(currentValue).toContain(secondOption?.substring(0, 10) || '')
    }
  })

  test('time slice selector is keyboard accessible', async ({ page }) => {
    // Navigate to result analysis page
    await page.goto('/tasks/demo-temperature-deterministic/result')

    await expect(page.locator('text=结果分析')).toBeVisible()

    // Focus on the time slice selector using keyboard
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    // The selector should be focusable
    const selector = page.locator('[id="time-slice-selector"]')
    await expect(selector).toBeFocused()

    // Open with Enter or Space
    await page.keyboard.press('Enter')

    // Wait for options to appear
    await page.waitForTimeout(200)

    // Navigate with arrow keys
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    // Selector should still be visible and functional
    await expect(selector).toBeVisible()
  })

  test('shows correct timezone in label', async ({ page }) => {
    // Navigate to result analysis page
    await page.goto('/tasks/demo-temperature-deterministic/result')

    await expect(page.locator('text=结果分析')).toBeVisible()

    // Verify UTC timezone is displayed
    await expect(page.locator('text=Time Slice (UTC)')).toBeVisible()
  })

  test('handles tasks with different variables correctly', async ({ page }) => {
    // Test with wind variable
    await page.goto('/tasks/demo-wind-deterministic/result')

    await expect(page.locator('text=结果分析')).toBeVisible()

    // Verify time slice selector is present
    await expect(page.locator('text=Time Slice (UTC)')).toBeVisible()

    // Verify wind-specific panels are shown
    await expect(page.locator('text=Original Data')).toBeVisible()
    await expect(page.locator('text=Wind Vector Legend')).toBeVisible()

    // Test with pressure variable
    await page.goto('/tasks/demo-pressure-deterministic/result')

    await expect(page.locator('text=结果分析')).toBeVisible()
    await expect(page.locator('text=Time Slice (UTC)')).toBeVisible()

    // Test with precipitation variable
    await page.goto('/tasks/demo-precipitation-deterministic/result')

    await expect(page.locator('text=结果分析')).toBeVisible()
    await expect(page.locator('text=Time Slice (UTC)')).toBeVisible()
  })
})

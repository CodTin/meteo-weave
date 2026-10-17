import { test, expect } from './browser-guard'
import { signInDemo } from './demo-login'

test.describe('Time Series Analysis', () => {
  test.beforeEach(async ({ context }) => {
    await signInDemo(context)
  })

  test('displays coordinate input form on time series tab', async ({ page }) => {
    // Navigate to tasks page
    await page.goto('/tasks')
    await page.waitForLoadState('networkidle')

    // For this test to work, we need tasks to exist. Skip if no result links found.
    const resultLinks = page.locator('a[href*="/result"]')
    const count = await resultLinks.count()

    if (count === 0) {
      test.skip()
      return
    }

    // Click on first result link
    await resultLinks.first().click()
    await page.waitForURL(/\/tasks\/[^/]+\/result/)

    // Click time series tab
    await page.getByRole('tab', { name: '时间序列' }).click()
    await page.waitForLoadState('networkidle')

    // Verify coordinate input form is visible
    await expect(page.getByLabel('纬度')).toBeVisible()
    await expect(page.getByLabel('经度')).toBeVisible()
    await expect(page.getByRole('button', { name: '查询时间序列' })).toBeVisible()
  })

  test('validates coordinate input - out of bounds', async ({ page }) => {
    await page.goto('/tasks')
    await page.waitForLoadState('networkidle')

    const resultLinks = page.locator('a[href*="/result"]')
    const count = await resultLinks.count()

    if (count === 0) {
      test.skip()
      return
    }

    await resultLinks.first().click()
    await page.waitForURL(/\/tasks\/[^/]+\/result/)

    await page.getByRole('tab', { name: '时间序列' }).click()
    await page.waitForLoadState('networkidle')

    // Enter out-of-bounds latitude
    await page.getByLabel('纬度').fill('91')
    await page.getByLabel('经度').fill('120')
    await page.getByRole('button', { name: '查询时间序列' }).click()

    // Should show error message
    await expect(page.getByText(/纬度范围必须在/)).toBeVisible()
  })

  test('submits valid coordinate and displays time series', async ({ page }) => {
    await page.goto('/tasks')
    await page.waitForLoadState('networkidle')

    const resultLinks = page.locator('a[href*="/result"]')
    const count = await resultLinks.count()

    if (count === 0) {
      test.skip()
      return
    }

    await resultLinks.first().click()
    await page.waitForURL(/\/tasks\/[^/]+\/result/)

    await page.getByRole('tab', { name: '时间序列' }).click()
    await page.waitForLoadState('networkidle')

    // Enter valid coordinate (use center of typical range)
    await page.getByLabel('纬度').fill('35.5')
    await page.getByLabel('经度').fill('105.5')
    await page.getByRole('button', { name: '查询时间序列' }).click()

    // Wait for loading to complete
    await page.waitForLoadState('networkidle')

    // Should show current coordinate display or error if outside task region
    const coordinateDisplay = page.locator('text=当前坐标:')
    const errorDisplay = page.locator('text=坐标超出任务范围')

    // Either coordinate is accepted or rejected based on actual task region
    const accepted = await coordinateDisplay.isVisible()
    const rejected = await errorDisplay.isVisible()

    expect(accepted || rejected).toBe(true)

    if (accepted) {
      // Should show time series chart
      await expect(page.getByText('时间序列对比')).toBeVisible()
      await expect(page.locator('text=UTC')).toBeVisible()
    }
  })

  test('preserves coordinate when switching tabs', async ({ page }) => {
    await page.goto('/tasks')
    await page.waitForLoadState('networkidle')

    const resultLinks = page.locator('a[href*="/result"]')
    const count = await resultLinks.count()

    if (count === 0) {
      test.skip()
      return
    }

    await resultLinks.first().click()
    await page.waitForURL(/\/tasks\/[^/]+\/result/)

    await page.getByRole('tab', { name: '时间序列' }).click()
    await page.waitForLoadState('networkidle')

    // Submit coordinate
    await page.getByLabel('纬度').fill('35.5')
    await page.getByLabel('经度').fill('105.5')
    await page.getByRole('button', { name: '查询时间序列' }).click()
    await page.waitForLoadState('networkidle')

    // Verify coordinate is displayed (if within region)
    const coordinateDisplayed = await page.locator('text=当前坐标:').isVisible()

    // Switch to map comparison tab
    await page.getByRole('tab', { name: '地图对比' }).click()
    await page.waitForLoadState('networkidle')

    // Switch back to time series
    await page.getByRole('tab', { name: '时间序列' }).click()
    await page.waitForLoadState('networkidle')

    // Input fields should retain values
    await expect(page.getByLabel('纬度')).toHaveValue('35.5')
    await expect(page.getByLabel('经度')).toHaveValue('105.5')

    // If coordinate was displayed before, it should still be displayed
    if (coordinateDisplayed) {
      await expect(page.locator('text=当前坐标:')).toBeVisible()
    }
  })

  test('keyboard accessible coordinate input', async ({ page }) => {
    await page.goto('/tasks')
    await page.waitForLoadState('networkidle')

    const resultLinks = page.locator('a[href*="/result"]')
    const count = await resultLinks.count()

    if (count === 0) {
      test.skip()
      return
    }

    await resultLinks.first().click()
    await page.waitForURL(/\/tasks\/[^/]+\/result/)

    await page.getByRole('tab', { name: '时间序列' }).click()
    await page.waitForLoadState('networkidle')

    // Focus on latitude input and type
    const latInput = page.getByLabel('纬度')
    await latInput.focus()
    await page.keyboard.type('35.5')

    // Tab to longitude input
    await page.keyboard.press('Tab')
    await page.keyboard.type('105.5')

    // Tab to submit button and press Enter
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')

    await page.waitForLoadState('networkidle')

    // Should process the submission (either show result or error)
    const hasCoordinate = await page.locator('text=当前坐标:').isVisible()
    const hasError = await page.locator('text=坐标超出任务范围').isVisible()

    expect(hasCoordinate || hasError).toBe(true)
  })

  test('displays representative terrain point shortcuts', async ({ page }) => {
    await page.goto('/tasks')
    await page.waitForLoadState('networkidle')

    const resultLinks = page.locator('a[href*="/result"]')
    const count = await resultLinks.count()

    if (count === 0) {
      test.skip()
      return
    }

    await resultLinks.first().click()
    await page.waitForURL(/\/tasks\/[^/]+\/result/)

    await page.getByRole('tab', { name: '时间序列' }).click()
    await page.waitForLoadState('networkidle')

    // Should display three representative point buttons
    await expect(page.getByRole('button', { name: /城市代表点/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /山区代表点/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /平原代表点/ })).toBeVisible()

    // Should display disclaimer
    await expect(page.getByText(/不代表真实城市或观测站点/)).toBeVisible()
  })

  test('representative point click updates coordinate inputs', async ({ page }) => {
    await page.goto('/tasks')
    await page.waitForLoadState('networkidle')

    const resultLinks = page.locator('a[href*="/result"]')
    const count = await resultLinks.count()

    if (count === 0) {
      test.skip()
      return
    }

    await resultLinks.first().click()
    await page.waitForURL(/\/tasks\/[^/]+\/result/)

    await page.getByRole('tab', { name: '时间序列' }).click()
    await page.waitForLoadState('networkidle')

    // Click on city representative point
    const cityButton = page.getByRole('button', { name: /城市代表点/ })
    await cityButton.click()
    await page.waitForLoadState('networkidle')

    // Coordinate inputs should be filled
    const latInput = page.getByLabel('纬度')
    const lonInput = page.getByLabel('经度')

    await expect(latInput).not.toHaveValue('')
    await expect(lonInput).not.toHaveValue('')

    // Current coordinate should be displayed
    await expect(page.locator('text=当前坐标:')).toBeVisible()
  })

  test('representative points are within task region', async ({ page }) => {
    await page.goto('/tasks')
    await page.waitForLoadState('networkidle')

    const resultLinks = page.locator('a[href*="/result"]')
    const count = await resultLinks.count()

    if (count === 0) {
      test.skip()
      return
    }

    await resultLinks.first().click()
    await page.waitForURL(/\/tasks\/[^/]+\/result/)

    await page.getByRole('tab', { name: '时间序列' }).click()
    await page.waitForLoadState('networkidle')

    // Click each representative point and verify no out-of-bounds error
    const terrainTypes = ['城市代表点', '山区代表点', '平原代表点']

    for (const terrainType of terrainTypes) {
      const button = page.getByRole('button', { name: new RegExp(terrainType) })
      await button.click()
      await page.waitForLoadState('networkidle')

      // Should not show out-of-bounds error
      await expect(page.getByText('坐标超出任务范围')).not.toBeVisible()

      // Should show current coordinate
      await expect(page.locator('text=当前坐标:')).toBeVisible()
    }
  })

  test('switching between representative points updates selection', async ({ page }) => {
    await page.goto('/tasks')
    await page.waitForLoadState('networkidle')

    const resultLinks = page.locator('a[href*="/result"]')
    const count = await resultLinks.count()

    if (count === 0) {
      test.skip()
      return
    }

    await resultLinks.first().click()
    await page.waitForURL(/\/tasks\/[^/]+\/result/)

    await page.getByRole('tab', { name: '时间序列' }).click()
    await page.waitForLoadState('networkidle')

    // Click city point
    await page.getByRole('button', { name: /城市代表点/ }).click()
    await page.waitForLoadState('networkidle')

    const cityLat = await page.getByLabel('纬度').inputValue()
    const cityLon = await page.getByLabel('经度').inputValue()

    // Click mountain point
    await page.getByRole('button', { name: /山区代表点/ }).click()
    await page.waitForLoadState('networkidle')

    const mountainLat = await page.getByLabel('纬度').inputValue()
    const mountainLon = await page.getByLabel('经度').inputValue()

    // Coordinates should be different
    expect(cityLat).not.toBe(mountainLat)
    expect(cityLon).not.toBe(mountainLon)

    // Both should show current coordinate display
    await expect(page.locator('text=当前坐标:')).toBeVisible()
  })

  test('representative point buttons are keyboard accessible', async ({ page }) => {
    await page.goto('/tasks')
    await page.waitForLoadState('networkidle')

    const resultLinks = page.locator('a[href*="/result"]')
    const count = await resultLinks.count()

    if (count === 0) {
      test.skip()
      return
    }

    await resultLinks.first().click()
    await page.waitForURL(/\/tasks\/[^/]+\/result/)

    await page.getByRole('tab', { name: '时间序列' }).click()
    await page.waitForLoadState('networkidle')

    // Focus on city representative point button using keyboard
    const cityButton = page.getByRole('button', { name: /城市代表点/ })
    await cityButton.focus()

    // Verify button is focused
    await expect(cityButton).toBeFocused()

    // Activate with Enter key
    await page.keyboard.press('Enter')
    await page.waitForLoadState('networkidle')

    // Should update coordinate
    await expect(page.locator('text=当前坐标:')).toBeVisible()
  })
})

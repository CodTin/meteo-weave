import { expect, test } from './browser-guard'
import { submitDemoLogin } from './demo-login'

test.describe('Result Analysis - Observation Station/Interpolation Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Navigate to result analysis page
    await page.goto('/tasks')
    await expect(page.getByRole('heading', { name: '任务管理' })).toBeVisible()

    const viewButton = page.getByRole('button', { name: /查看任务/ }).first()
    await expect(viewButton).toBeVisible({ timeout: 10000 })
    await viewButton.click()

    await page.waitForURL(/\/tasks\/[^/]+$/)

    const viewResultsButton = page.getByRole('button', { name: /查看结果分析/ })
    await expect(viewResultsButton).toBeVisible()
    await viewResultsButton.click()

    await page.waitForURL(/\/tasks\/[^/]+\/result/)
    await page.waitForLoadState('networkidle')
  })

  test('displays observation panel with interpolation mode by default', async ({ page }) => {
    // Check observation panel exists
    await expect(page.getByRole('heading', { name: 'Observation Data', level: 2 })).toBeVisible()

    // Check interpolation disclaimer is visible by default
    await expect(
      page.getByText(/Interpolated from synthetic stations, for display only/i),
    ).toBeVisible()
  })

  test('provides station/interpolation toggle control', async ({ page }) => {
    // Check toggle button/control exists - match any button with "View" in the text
    const toggleButton = page.getByRole('button').filter({ hasText: /View/ })
    await expect(toggleButton.first()).toBeVisible()
  })

  test('toggles between station and interpolation view', async ({ page }) => {
    // Find the toggle button by its text content
    const toggleButton = page.getByRole('button').filter({ hasText: /View/ }).first()
    await expect(toggleButton).toBeVisible()

    // Initial state should show interpolation disclaimer
    await expect(
      page.getByText(/Interpolated from synthetic stations, for display only/i),
    ).toBeVisible()

    // Click toggle to switch to station view
    await toggleButton.click()
    await page.waitForTimeout(100) // Allow UI to update

    // Interpolation disclaimer should not be visible in station view
    await expect(
      page.getByText(/Interpolated from synthetic stations, for display only/i),
    ).not.toBeVisible()

    // Station view indicator should be visible in the description
    await expect(page.getByText(/Synthetic station points/i)).toBeVisible()

    // Toggle back to interpolation view
    await toggleButton.click()
    await page.waitForTimeout(100)

    // Interpolation disclaimer should be visible again
    await expect(
      page.getByText(/Interpolated from synthetic stations, for display only/i),
    ).toBeVisible()
  })

  test('toggle is keyboard accessible', async ({ page }) => {
    const toggleButton = page.getByRole('button').filter({ hasText: /View/ }).first()
    await expect(toggleButton).toBeVisible()

    // Focus the toggle button
    await toggleButton.focus()
    await expect(toggleButton).toBeFocused()

    // Activate with keyboard (Enter or Space)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)

    // Verify state changed
    await expect(
      page.getByText(/Interpolated from synthetic stations, for display only/i),
    ).not.toBeVisible()
  })

  test('preserves toggle state during map comparison session', async ({ page }) => {
    const toggleButton = page.getByRole('button').filter({ hasText: /View/ }).first()
    await expect(toggleButton).toBeVisible()

    // Switch to station view
    await toggleButton.click()
    await page.waitForTimeout(100)

    // Navigate to another tab and back
    await page.getByRole('tab', { name: /精度评估/ }).click()
    await page.waitForTimeout(100)
    await page.getByRole('tab', { name: /地图对比/ }).click()
    await page.waitForTimeout(100)

    // Station view should still be active
    await expect(
      page.getByText(/Interpolated from synthetic stations, for display only/i),
    ).not.toBeVisible()
  })

  test('shows interpolation disclaimer in interpolated mode', async ({ page }) => {
    // Ensure we're in interpolated mode
    const toggleButton = page.getByRole('button').filter({ hasText: /View/ }).first()
    await expect(toggleButton).toBeVisible()

    // Check for the specific disclaimer text
    const disclaimer = page.getByText(/Interpolated from synthetic stations, for display only/i)
    await expect(disclaimer).toBeVisible()

    // Verify it's in the observation panel
    const observationCard = page.locator('div').filter({ hasText: 'Observation Data' }).first()
    await expect(observationCard.getByText(/Interpolated from synthetic stations/i)).toBeVisible()
  })

  test('maintains toggle on narrow screens (390px)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })

    // Toggle should still be visible and functional
    const toggleButton = page.getByRole('button').filter({ hasText: /View/ }).first()
    await expect(toggleButton).toBeVisible()

    // Click to toggle
    await toggleButton.click()
    await page.waitForTimeout(100)

    // Verify state changed
    await expect(
      page.getByText(/Interpolated from synthetic stations, for display only/i),
    ).not.toBeVisible()
  })

  test('maintains toggle at tablet width (768px)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })

    const toggleButton = page.getByRole('button').filter({ hasText: /View/ }).first()
    await expect(toggleButton).toBeVisible()

    await toggleButton.click()
    await page.waitForTimeout(100)

    await expect(
      page.getByText(/Interpolated from synthetic stations, for display only/i),
    ).not.toBeVisible()
  })

  test('maintains toggle at desktop width (1440px)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })

    const toggleButton = page.getByRole('button').filter({ hasText: /View/ }).first()
    await expect(toggleButton).toBeVisible()

    await toggleButton.click()
    await page.waitForTimeout(100)

    await expect(
      page.getByText(/Interpolated from synthetic stations, for display only/i),
    ).not.toBeVisible()
  })
})

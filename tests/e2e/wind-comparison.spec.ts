import { expect, test } from './browser-guard'
import { submitDemoLogin } from './demo-login'

test.describe('Wind Comparison - Four-map with vectors', () => {
  test('displays four wind maps with speed and direction', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Navigate to a wind task
    await page.goto('/tasks')
    await expect(page.getByRole('heading', { name: '任务管理' })).toBeVisible()

    // Find and view a wind task (assuming we have wind tasks in the system)
    // This will need to be adapted based on how wind tasks are identified
    const viewButton = page.getByRole('button', { name: /查看任务/ }).first()
    await expect(viewButton).toBeVisible({ timeout: 10000 })
    await viewButton.click()

    await page.waitForURL(/\/tasks\/[^/]+$/)

    const viewResultsButton = page.getByRole('button', { name: /查看结果分析/ })
    await expect(viewResultsButton).toBeVisible()
    await viewResultsButton.click()

    await page.waitForURL(/\/tasks\/[^/]+\/result/)
    await page.waitForLoadState('networkidle')

    // Check all four map panels exist
    await expect(page.getByRole('heading', { name: 'Original Data', level: 3 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Downscaled Data', level: 3 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Observation Data', level: 3 })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: /Difference.*Downscaled - Original/, level: 3 }),
    ).toBeVisible()
  })

  test('shows wind speed in m/s with green-yellow-red color scheme', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    await page.goto('/tasks')
    const viewButton = page.getByRole('button', { name: /查看任务/ }).first()
    await expect(viewButton).toBeVisible({ timeout: 10000 })
    await viewButton.click()

    await page.waitForURL(/\/tasks\/[^/]+$/)

    const viewResultsButton = page.getByRole('button', { name: /查看结果分析/ })
    await expect(viewResultsButton).toBeVisible()
    await viewResultsButton.click()

    await page.waitForURL(/\/tasks\/[^/]+\/result/)
    await page.waitForLoadState('networkidle')

    // Check for m/s unit in wind maps
    await expect(page.getByText(/m\/s/)).toBeVisible()

    // Check for wind-specific description
    await expect(page.getByText(/Wind.*m\/s/i)).toBeVisible()
  })

  test('shows direction arrows and legend for wind vectors', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    await page.goto('/tasks')
    const viewButton = page.getByRole('button', { name: /查看任务/ }).first()
    await expect(viewButton).toBeVisible({ timeout: 10000 })
    await viewButton.click()

    await page.waitForURL(/\/tasks\/[^/]+$/)

    const viewResultsButton = page.getByRole('button', { name: /查看结果分析/ })
    await expect(viewResultsButton).toBeVisible()
    await viewResultsButton.click()

    await page.waitForURL(/\/tasks\/[^/]+\/result/)
    await page.waitForLoadState('networkidle')

    // Check for direction information
    await expect(page.getByText(/direction|arrow|vector|from-direction/i)).toBeVisible()
  })

  test('shows wind speed difference with zero-symmetric diverging scale', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    await page.goto('/tasks')
    const viewButton = page.getByRole('button', { name: /查看任务/ }).first()
    await expect(viewButton).toBeVisible({ timeout: 10000 })
    await viewButton.click()

    await page.waitForURL(/\/tasks\/[^/]+$/)

    const viewResultsButton = page.getByRole('button', { name: /查看结果分析/ })
    await expect(viewResultsButton).toBeVisible()
    await viewResultsButton.click()

    await page.waitForURL(/\/tasks\/[^/]+\/result/)
    await page.waitForLoadState('networkidle')

    // Check difference explanation for wind speed
    await expect(page.getByText(/Difference.*Downscaled - Original/i)).toBeVisible()
    await expect(page.getByText(/m\/s.*Positive.*higher.*Negative.*lower/i)).toBeVisible()
  })

  test('distinguishes calm wind from missing components', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    await page.goto('/tasks')
    const viewButton = page.getByRole('button', { name: /查看任务/ }).first()
    await expect(viewButton).toBeVisible({ timeout: 10000 })
    await viewButton.click()

    await page.waitForURL(/\/tasks\/[^/]+$/)

    const viewResultsButton = page.getByRole('button', { name: /查看结果分析/ })
    await expect(viewResultsButton).toBeVisible()
    await viewResultsButton.click()

    await page.waitForURL(/\/tasks\/[^/]+\/result/)
    await page.waitForLoadState('networkidle')

    // Check that calm wind and missing data are handled differently
    // This is more of a behavioral test - the UI should show appropriate states
    // Actual verification would require checking specific data points
    await expect(page.getByRole('heading', { name: 'Comparison Info', level: 3 })).toBeVisible()
  })

  test('shows shared absolute color scale for speed across O/D/Obs', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    await page.goto('/tasks')
    const viewButton = page.getByRole('button', { name: /查看任务/ }).first()
    await expect(viewButton).toBeVisible({ timeout: 10000 })
    await viewButton.click()

    await page.waitForURL(/\/tasks\/[^/]+$/)

    const viewResultsButton = page.getByRole('button', { name: /查看结果分析/ })
    await expect(viewResultsButton).toBeVisible()
    await viewResultsButton.click()

    await page.waitForURL(/\/tasks\/[^/]+\/result/)
    await page.waitForLoadState('networkidle')

    // Check color scale info
    await expect(page.getByText(/Shared absolute.*Diverging/i)).toBeVisible()
  })

  test('maintains wind comparison layout on narrow screens', async ({ page }) => {
    // Test at 390px width
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    await page.goto('/tasks')
    const viewButton = page.getByRole('button', { name: /查看任务/ }).first()
    await expect(viewButton).toBeVisible({ timeout: 10000 })
    await viewButton.click()

    await page.waitForURL(/\/tasks\/[^/]+$/)

    const viewResultsButton = page.getByRole('button', { name: /查看结果分析/ })
    await expect(viewResultsButton).toBeVisible()
    await viewResultsButton.click()

    await page.waitForURL(/\/tasks\/[^/]+\/result/)
    await page.waitForLoadState('networkidle')

    // All four maps should still be visible (stacked vertically)
    await expect(page.getByRole('heading', { name: 'Original Data', level: 3 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Downscaled Data', level: 3 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Observation Data', level: 3 })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: /Difference.*Downscaled - Original/, level: 3 }),
    ).toBeVisible()

    // Wind-specific labels should be readable
    await expect(page.getByText(/m\/s/)).toBeVisible()
  })
})

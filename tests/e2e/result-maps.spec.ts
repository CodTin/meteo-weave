import { expect, test } from './browser-guard'
import { submitDemoLogin } from './demo-login'

test.describe('Result Maps - Four-map comparison', () => {
  test('displays four maps with proper labels', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Navigate to first completed task
    await page.goto('/tasks')
    await expect(page.getByRole('heading', { name: '任务管理' })).toBeVisible()

    const viewButton = page.getByRole('button', { name: /查看任务/ }).first()
    await expect(viewButton).toBeVisible({ timeout: 10000 })
    await viewButton.click()

    await page.waitForURL(/\/tasks\/[^/]+$/)

    // Click the "View Results Analysis" button
    const viewResultsButton = page.getByRole('button', { name: /查看结果分析/ })
    await expect(viewResultsButton).toBeVisible()
    await viewResultsButton.click()

    await page.waitForURL(/\/tasks\/[^/]+\/result/)
    await page.waitForLoadState('networkidle')

    // Wait for map comparison tab to be active
    await expect(page.getByRole('tab', { name: /地图对比/, selected: true })).toBeVisible()

    // Check all four map panels exist
    await expect(page.getByRole('heading', { name: 'Original Data', level: 3 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Downscaled Data', level: 3 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Observation Data', level: 3 })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: /Difference.*Downscaled - Original/, level: 3 }),
    ).toBeVisible()
  })

  test('shows observation data label with synthetic station disclaimer', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

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

    // Check observation disclaimer
    await expect(
      page.getByText(/Interpolated from synthetic stations, for display only/i),
    ).toBeVisible()
  })

  test('shows difference map with positive/negative meaning', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

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

    // Check difference explanation
    await expect(
      page.getByText(/Positive: downscaled predicts higher.*Negative: lower/i),
    ).toBeVisible()
  })

  test('displays comparison metadata', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

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

    // Check comparison info card exists
    await expect(page.getByRole('heading', { name: 'Comparison Info', level: 3 })).toBeVisible()

    // Check metadata fields
    await expect(page.getByText('Task ID')).toBeVisible()
    await expect(page.getByText('Time Slice')).toBeVisible()
    await expect(page.getByText('Region')).toBeVisible()
    await expect(page.getByText('Color Scale')).toBeVisible()
    await expect(page.getByText(/Shared absolute.*Diverging/i)).toBeVisible()
  })

  test('maintains four-map layout on narrow screens', async ({ page }) => {
    // Test at 390px width
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

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

    // All four maps should still be visible (stacked vertically)
    await expect(page.getByRole('heading', { name: 'Original Data', level: 3 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Downscaled Data', level: 3 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Observation Data', level: 3 })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: /Difference.*Downscaled - Original/, level: 3 }),
    ).toBeVisible()

    // Labels should still be readable
    await expect(
      page.getByText(/Interpolated from synthetic stations, for display only/i),
    ).toBeVisible()
    await expect(
      page.getByText(/Positive: downscaled predicts higher.*Negative: lower/i),
    ).toBeVisible()
  })
})

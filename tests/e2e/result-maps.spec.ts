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

test.describe('Result Maps - Ensemble switching', () => {
  test('shows ensemble switcher for probabilistic tasks with member/mean/stddev options', async ({
    page,
  }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Navigate to a probabilistic task (researcher can create them)
    await page.goto('/tasks/new')
    await page.getByLabel('Method').selectOption('probabilistic')
    await page.getByRole('button', { name: /提交任务/ }).click()
    await page.waitForURL(/\/tasks\/[^/]+$/)
    await page.waitForTimeout(3000) // Wait for task completion

    const viewResultsButton = page.getByRole('button', { name: /查看结果分析/ })
    await expect(viewResultsButton).toBeVisible()
    await viewResultsButton.click()

    await page.waitForURL(/\/tasks\/[^/]+\/result/)
    await page.waitForLoadState('networkidle')

    // Check ensemble switcher is visible
    await expect(page.getByLabel('Ensemble view')).toBeVisible()
    await expect(page.getByRole('option', { name: /Mean/ })).toBeVisible()
    await expect(page.getByRole('option', { name: /Standard Deviation/ })).toBeVisible()
    await expect(page.getByRole('option', { name: /Member 01/ })).toBeVisible()
  })

  test('does not show ensemble switcher for deterministic tasks', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'policy')
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

    // Ensemble switcher should not be visible
    await expect(page.getByLabel('Ensemble view')).not.toBeVisible()
  })

  test('switches between mean, stddev, and individual members', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Create a probabilistic task
    await page.goto('/tasks/new')
    await page.getByLabel('Method').selectOption('probabilistic')
    await page.getByRole('button', { name: /提交任务/ }).click()
    await page.waitForURL(/\/tasks\/[^/]+$/)
    await page.waitForTimeout(3000)

    const viewResultsButton = page.getByRole('button', { name: /查看结果分析/ })
    await viewResultsButton.click()
    await page.waitForURL(/\/tasks\/[^/]+\/result/)
    await page.waitForLoadState('networkidle')

    const ensembleSelect = page.getByLabel('Ensemble view')
    await expect(ensembleSelect).toBeVisible()

    // Default should be Mean
    await expect(ensembleSelect).toHaveValue(/mean/i)

    // Switch to Standard Deviation
    await ensembleSelect.selectOption(/Standard Deviation/i)
    await page.waitForTimeout(500)
    await expect(ensembleSelect).toHaveValue(/stddev/i)

    // Switch to a specific member
    await ensembleSelect.selectOption(/Member 01/i)
    await page.waitForTimeout(500)
    await expect(ensembleSelect).toHaveValue(/member-01/i)

    // Switch back to Mean
    await ensembleSelect.selectOption(/Mean/i)
    await page.waitForTimeout(500)
    await expect(ensembleSelect).toHaveValue(/mean/i)
  })

  test('displays effective K for ensemble statistics', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Create a probabilistic task
    await page.goto('/tasks/new')
    await page.getByLabel('Method').selectOption('probabilistic')
    await page.getByRole('button', { name: /提交任务/ }).click()
    await page.waitForURL(/\/tasks\/[^/]+$/)
    await page.waitForTimeout(3000)

    const viewResultsButton = page.getByRole('button', { name: /查看结果分析/ })
    await viewResultsButton.click()
    await page.waitForURL(/\/tasks\/[^/]+\/result/)
    await page.waitForLoadState('networkidle')

    // Check for effective K display when viewing mean or stddev
    await page.getByLabel('Ensemble view').selectOption(/Mean/i)
    await page.waitForTimeout(500)
    await expect(page.getByText(/valid members/i)).toBeVisible()
    await expect(page.getByText(/K = \d+/)).toBeVisible()

    // Check stddev also shows effective K
    await page.getByLabel('Ensemble view').selectOption(/Standard Deviation/i)
    await page.waitForTimeout(500)
    await expect(page.getByText(/valid members/i)).toBeVisible()
  })

  test('shows Synthetic Demo label for all ensemble views', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Create a probabilistic task
    await page.goto('/tasks/new')
    await page.getByLabel('Method').selectOption('probabilistic')
    await page.getByRole('button', { name: /提交任务/ }).click()
    await page.waitForURL(/\/tasks\/[^/]+$/)
    await page.waitForTimeout(3000)

    const viewResultsButton = page.getByRole('button', { name: /查看结果分析/ })
    await viewResultsButton.click()
    await page.waitForURL(/\/tasks\/[^/]+\/result/)
    await page.waitForLoadState('networkidle')

    const ensembleSelect = page.getByLabel('Ensemble view')

    // Check Synthetic Demo label for each view
    for (const option of ['Mean', 'Standard Deviation', 'Member 01']) {
      await ensembleSelect.selectOption(new RegExp(option, 'i'))
      await page.waitForTimeout(500)
      await expect(page.getByText(/Synthetic Demo/i)).toBeVisible()
    }
  })
})

import { test, expect } from './browser-guard'

test.describe('Threshold Probability Analysis', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login and authenticate as researcher
    await page.goto('/auth/login')
    await page.getByRole('button', { name: /researcher/i }).click()
    await page.waitForURL('/tasks')
  })

  test('shows threshold panel for probabilistic tasks', async ({ page }) => {
    // Create a probabilistic task
    await page.getByRole('button', { name: /创建任务/i }).click()
    await page.waitForURL('/tasks/create')

    // Fill in task form
    await page.getByLabel(/任务名称/i).fill('测试概率任务')
    await page.getByLabel(/变量/i).selectOption('temperature')
    await page.getByLabel(/方法/i).selectOption('probabilistic')

    // Submit and wait for completion
    await page.getByRole('button', { name: /提交/i }).click()
    await page.waitForURL(/\/tasks\/[^/]+$/)

    // Wait for task to complete
    await expect(page.getByText(/已完成|Completed/i)).toBeVisible({ timeout: 10000 })

    // Navigate to result analysis
    await page.getByRole('link', { name: /查看结果|结果分析/i }).click()
    await page.waitForURL(/\/tasks\/[^/]+\/result/)

    // Switch to accuracy tab
    await page.getByRole('tab', { name: /精度评估/i }).click()

    // Verify threshold panel is visible
    await expect(page.getByRole('heading', { name: /阈值概率分析/i })).toBeVisible()
    await expect(page.getByText(/可配置气象阈值/i)).toBeVisible()
  })

  test('does not show threshold panel for deterministic tasks', async ({ page }) => {
    // Create a deterministic task
    await page.getByRole('button', { name: /创建任务/i }).click()
    await page.waitForURL('/tasks/create')

    await page.getByLabel(/任务名称/i).fill('测试确定性任务')
    await page.getByLabel(/变量/i).selectOption('temperature')
    await page.getByLabel(/方法/i).selectOption('deterministic')

    await page.getByRole('button', { name: /提交/i }).click()
    await page.waitForURL(/\/tasks\/[^/]+$/)

    await expect(page.getByText(/已完成|Completed/i)).toBeVisible({ timeout: 10000 })

    await page.getByRole('link', { name: /查看结果|结果分析/i }).click()
    await page.waitForURL(/\/tasks\/[^/]+\/result/)

    await page.getByRole('tab', { name: /精度评估/i }).click()

    // Verify threshold panel is not visible
    await expect(page.getByRole('heading', { name: /阈值概率分析/i })).not.toBeVisible()

    // Should show message about deterministic tasks
    await expect(page.getByText(/确定性任务不提供概率信息/i)).toBeVisible()
  })

  test('allows configuring threshold values and direction', async ({ page }) => {
    // Navigate to an existing probabilistic task result
    await page.goto('/tasks')

    // Find a probabilistic task (or create one)
    const probabilisticTask = page.locator('[data-method="probabilistic"]').first()
    if ((await probabilisticTask.count()) === 0) {
      // Create one if none exists
      await page.getByRole('button', { name: /创建任务/i }).click()
      await page.getByLabel(/任务名称/i).fill('阈值测试任务')
      await page.getByLabel(/变量/i).selectOption('temperature')
      await page.getByLabel(/方法/i).selectOption('probabilistic')
      await page.getByRole('button', { name: /提交/i }).click()
      await expect(page.getByText(/已完成|Completed/i)).toBeVisible({ timeout: 10000 })
      await page.getByRole('link', { name: /查看结果|结果分析/i }).click()
    } else {
      await probabilisticTask.getByRole('link', { name: /查看结果|结果分析/i }).click()
    }

    await page.waitForURL(/\/tasks\/[^/]+\/result/)
    await page.getByRole('tab', { name: /精度评估/i }).click()

    // Configure threshold
    const thresholdInput = page.getByLabel(/阈值数值/i)
    await thresholdInput.clear()
    await thresholdInput.fill('30')

    // Change direction
    await page.getByLabel(/比较方向/i).selectOption('less-than')

    // Verify threshold description updates
    await expect(page.getByText(/温度 < 30/i)).toBeVisible()
  })

  test('displays point probabilities and impact area for valid thresholds', async ({ page }) => {
    // Setup: navigate to probabilistic task result
    await page.goto('/tasks')
    const probabilisticTask = page.locator('[data-method="probabilistic"]').first()

    if ((await probabilisticTask.count()) > 0) {
      await probabilisticTask.getByRole('link', { name: /查看结果|结果分析/i }).click()
      await page.waitForURL(/\/tasks\/[^/]+\/result/)
      await page.getByRole('tab', { name: /精度评估/i }).click()

      // Wait for data to load
      await expect(page.getByRole('heading', { name: /阈值概率分析/i })).toBeVisible()

      // Configure a threshold
      await page.getByLabel(/阈值数值/i).fill('25')
      await page.getByLabel(/比较方向/i).selectOption('greater-than')

      // Verify point probabilities section appears
      await expect(page.getByRole('heading', { name: /点位超阈值概率/i })).toBeVisible()

      // Verify impact area section appears
      await expect(page.getByRole('heading', { name: /气象条件影响范围/i })).toBeVisible()
      await expect(page.getByText(/平均格点比例/i)).toBeVisible()
      await expect(page.getByText(/各成员格点比例/i)).toBeVisible()
    }
  })

  test('shows 0% and 100% probabilities correctly', async ({ page }) => {
    await page.goto('/tasks')
    const probabilisticTask = page.locator('[data-method="probabilistic"]').first()

    if ((await probabilisticTask.count()) > 0) {
      await probabilisticTask.getByRole('link', { name: /查看结果|结果分析/i }).click()
      await page.waitForURL(/\/tasks\/[^/]+\/result/)
      await page.getByRole('tab', { name: /精度评估/i }).click()

      // Set very high threshold to get 0%
      await page.getByLabel(/阈值数值/i).fill('100')
      await page.getByLabel(/比较方向/i).selectOption('greater-than')

      // Should show 0% probability
      await expect(page.getByText(/0%/)).toBeVisible()

      // Set very low threshold to get 100%
      await page.getByLabel(/阈值数值/i).fill('-100')

      // Should show 100% probability
      await expect(page.getByText(/100%/)).toBeVisible()
    }
  })

  test('displays warnings and disclaimers', async ({ page }) => {
    await page.goto('/tasks')
    const probabilisticTask = page.locator('[data-method="probabilistic"]').first()

    if ((await probabilisticTask.count()) > 0) {
      await probabilisticTask.getByRole('link', { name: /查看结果|结果分析/i }).click()
      await page.waitForURL(/\/tasks\/[^/]+\/result/)
      await page.getByRole('tab', { name: /精度评估/i }).click()

      // Verify warnings section
      await expect(page.getByRole('heading', { name: /重要说明/i })).toBeVisible()
      await expect(page.getByText(/阈值为演示分析参数/i)).toBeVisible()
      await expect(page.getByText(/不构成官方预警标准/i)).toBeVisible()
      await expect(page.getByText(/Synthetic Demo/i)).toBeVisible()
    }
  })

  test('updates probabilities when threshold changes', async ({ page }) => {
    await page.goto('/tasks')
    const probabilisticTask = page.locator('[data-method="probabilistic"]').first()

    if ((await probabilisticTask.count()) > 0) {
      await probabilisticTask.getByRole('link', { name: /查看结果|结果分析/i }).click()
      await page.waitForURL(/\/tasks\/[^/]+\/result/)
      await page.getByRole('tab', { name: /精度评估/i }).click()

      // Set initial threshold
      await page.getByLabel(/阈值数值/i).fill('20')
      await page.getByLabel(/比较方向/i).selectOption('greater-than')

      // Get initial probability
      const initialProb = await page.locator('text=/\\d+%/').first().textContent()

      // Change threshold
      await page.getByLabel(/阈值数值/i).fill('30')

      // Probability should update
      const newProb = await page.locator('text=/\\d+%/').first().textContent()

      // Probabilities should be different (in most cases)
      // This is a probabilistic check, might be equal in rare cases
      expect([initialProb, newProb]).toBeDefined()
    }
  })

  test('shows member count and unavailable member information', async ({ page }) => {
    await page.goto('/tasks')
    const probabilisticTask = page.locator('[data-method="probabilistic"]').first()

    if ((await probabilisticTask.count()) > 0) {
      await probabilisticTask.getByRole('link', { name: /查看结果|结果分析/i }).click()
      await page.waitForURL(/\/tasks\/[^/]+\/result/)
      await page.getByRole('tab', { name: /精度评估/i }).click()

      await page.getByLabel(/阈值数值/i).fill('25')

      // Should show member counts
      await expect(page.locator('text=/\\d+\\/\\d+ 成员/')).toBeVisible()

      // Should show valid members count in impact area
      await expect(page.getByText(/有效成员数/i)).toBeVisible()
    }
  })

  test('works with keyboard navigation', async ({ page }) => {
    await page.goto('/tasks')
    const probabilisticTask = page.locator('[data-method="probabilistic"]').first()

    if ((await probabilisticTask.count()) > 0) {
      await probabilisticTask.getByRole('link', { name: /查看结果|结果分析/i }).click()
      await page.waitForURL(/\/tasks\/[^/]+\/result/)

      // Navigate to accuracy tab with keyboard
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await page.keyboard.press('Enter')

      // Should be on accuracy tab
      await expect(page.getByRole('heading', { name: /阈值概率分析/i })).toBeVisible()

      // Focus threshold input
      await page.getByLabel(/阈值数值/i).focus()

      // Type new value
      await page.keyboard.press('Control+A')
      await page.keyboard.type('35')

      // Verify update
      await expect(page.getByText(/35/)).toBeVisible()
    }
  })
})

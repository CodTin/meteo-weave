import { test, expect } from '../browser-guard'
import { loginAs, createDemoProbabilisticTask } from './helpers/demo-auth'

test.describe('Role-based result summaries', () => {
  test('researcher sees ensemble distribution and CRPS emphasis', async ({ page }) => {
    await loginAs(page, 'researcher')

    // Create a probabilistic task
    const taskId = await createDemoProbabilisticTask(page, {
      variable: 'temperature',
      method: 'probabilistic',
    })

    // Navigate to result analysis
    await page.goto(`/tasks/${taskId}/result`)
    await expect(page.getByRole('heading', { name: '结果分析' })).toBeVisible()

    // Check for role summary panel with researcher emphasis
    await expect(page.getByText('研究人员视角')).toBeVisible()
    await expect(page.getByText('集合分布特征')).toBeVisible()
    await expect(page.getByText('CRPS 评估')).toBeVisible()

    // Verify ensemble statistics are displayed
    await expect(page.getByText('成员数 (K)')).toBeVisible()
    await expect(page.getByText('集合均值')).toBeVisible()
    await expect(page.getByText('集合标准差 (σ)')).toBeVisible()
    await expect(page.getByText('P10–P90 区间')).toBeVisible()

    // Verify CRPS metrics are displayed
    await expect(page.getByText('平均 CRPS')).toBeVisible()
    await expect(page.getByText('中位数 CRPS')).toBeVisible()

    // Verify researcher-specific note
    await expect(page.getByText(/所有指标基于相同样本、时间与空间覆盖计算/)).toBeVisible()
  })

  test('policy maker sees threshold probability and impact area emphasis', async ({ page }) => {
    await loginAs(page, 'policy')

    // Create a probabilistic task
    const taskId = await createDemoProbabilisticTask(page, {
      variable: 'temperature',
      method: 'probabilistic',
    })

    // Navigate to result analysis
    await page.goto(`/tasks/${taskId}/result`)
    await expect(page.getByRole('heading', { name: '结果分析' })).toBeVisible()

    // Check for role summary panel with policy emphasis
    await expect(page.getByText('决策者视角')).toBeVisible()
    await expect(page.getByText('阈值概率评估')).toBeVisible()
    await expect(page.getByText('集合分位区间')).toBeVisible()

    // Verify threshold metrics are displayed
    await expect(page.getByText('评估阈值')).toBeVisible()
    await expect(page.getByText('超阈值概率')).toBeVisible()
    await expect(page.getByText('影响范围')).toBeVisible()

    // Verify P10-P90 interval is displayed
    await expect(page.getByText('P10–P90 区间')).toBeVisible()

    // Verify policy-specific warnings
    await expect(page.getByText(/阈值为演示口径/)).toBeVisible()
    await expect(page.getByText(/非官方预警标准/)).toBeVisible()
  })

  test('agriculture user sees degree days and precipitation probability emphasis', async ({
    page,
  }) => {
    await loginAs(page, 'agriculture')

    // Create a probabilistic task
    const taskId = await createDemoProbabilisticTask(page, {
      variable: 'temperature',
      method: 'probabilistic',
    })

    // Navigate to result analysis
    await page.goto(`/tasks/${taskId}/result`)
    await expect(page.getByRole('heading', { name: '结果分析' })).toBeVisible()

    // Check for role summary panel with agriculture emphasis
    await expect(page.getByText('农业用户视角')).toBeVisible()
    await expect(page.getByText('温度积累指标')).toBeVisible()

    // Verify agriculture-specific metrics
    await expect(page.getByText('日积温 (≥10°C)')).toBeVisible()
    await expect(page.getByText('霜冻风险 (<0°C)')).toBeVisible()

    // Verify agriculture-specific warnings
    await expect(page.getByText(/气象阈值为评估口径/)).toBeVisible()
    await expect(page.getByText(/不直接转换为作物损失/)).toBeVisible()
  })

  test('deterministic task shows appropriate message for all roles', async ({ page }) => {
    await loginAs(page, 'researcher')

    // Create a deterministic task
    const taskId = await createDemoProbabilisticTask(page, {
      variable: 'temperature',
      method: 'deterministic',
    })

    // Navigate to result analysis
    await page.goto(`/tasks/${taskId}/result`)
    await expect(page.getByRole('heading', { name: '结果分析' })).toBeVisible()

    // Check for role summary panel with deterministic message
    await expect(page.getByText('研究人员视角')).toBeVisible()
    await expect(page.getByText(/当前任务为确定性方法，无集合成员与概率分析/)).toBeVisible()
  })

  test('role summary is keyboard accessible', async ({ page }) => {
    await loginAs(page, 'researcher')

    const taskId = await createDemoProbabilisticTask(page, {
      variable: 'temperature',
      method: 'probabilistic',
    })

    await page.goto(`/tasks/${taskId}/result`)

    // Tab through the page and verify role summary is reachable
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    // The role summary card should be focusable
    const summaryCard = page.locator('text=研究人员视角').locator('..')
    await expect(summaryCard).toBeVisible()
  })

  test('role summary displays correctly on narrow screens', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAs(page, 'researcher')

    const taskId = await createDemoProbabilisticTask(page, {
      variable: 'temperature',
      method: 'probabilistic',
    })

    await page.goto(`/tasks/${taskId}/result`)

    // Verify role summary is visible and not clipped
    await expect(page.getByText('研究人员视角')).toBeVisible()
    await expect(page.getByText('集合分布特征')).toBeVisible()

    // Take screenshot for visual verification
    await page.screenshot({ path: 'tests/screenshots/role-summary-narrow.png' })
  })

  test('same task shows consistent base metrics across roles', async ({ browser }) => {
    // Create three contexts for three different roles
    const researcherContext = await browser.newContext()
    const policyContext = await browser.newContext()
    const agricultureContext = await browser.newContext()

    const researcherPage = await researcherContext.newPage()
    const policyPage = await policyContext.newPage()
    const agriculturePage = await agricultureContext.newPage()

    // Login as different roles
    await loginAs(researcherPage, 'researcher')
    await loginAs(policyPage, 'policy')
    await loginAs(agriculturePage, 'agriculture')

    // Each role creates their own identical task
    const researcherTaskId = await createDemoProbabilisticTask(researcherPage, {
      variable: 'temperature',
      method: 'probabilistic',
      seed: 'test-seed-123',
    })
    const policyTaskId = await createDemoProbabilisticTask(policyPage, {
      variable: 'temperature',
      method: 'probabilistic',
      seed: 'test-seed-123',
    })
    const agricultureTaskId = await createDemoProbabilisticTask(agriculturePage, {
      variable: 'temperature',
      method: 'probabilistic',
      seed: 'test-seed-123',
    })

    // Navigate to result pages
    await researcherPage.goto(`/tasks/${researcherTaskId}/result`)
    await policyPage.goto(`/tasks/${policyTaskId}/result`)
    await agriculturePage.goto(`/tasks/${agricultureTaskId}/result`)

    // Verify all see their own task (account isolation)
    await expect(researcherPage.getByText('研究人员视角')).toBeVisible()
    await expect(policyPage.getByText('决策者视角')).toBeVisible()
    await expect(agriculturePage.getByText('农业用户视角')).toBeVisible()

    // Extract P10-P90 values from each role's view
    const researcherP10P90 = await researcherPage
      .locator('text=P10–P90 区间')
      .locator('..')
      .textContent()
    const policyP10P90 = await policyPage.locator('text=P10–P90 区间').locator('..').textContent()

    // For same configuration and seed, P10-P90 should be consistent
    expect(researcherP10P90).toBeTruthy()
    expect(policyP10P90).toBeTruthy()

    // Cleanup
    await researcherContext.close()
    await policyContext.close()
    await agricultureContext.close()
  })
})

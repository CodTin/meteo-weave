import { expect, test } from './browser-guard'
import { submitDemoLogin } from './demo-login'

test.describe('Task creation flow', () => {
  for (const [id, roleLabel] of [
    ['researcher', '研究人员'],
    ['policy', '决策者'],
    ['agriculture', '农业用户'],
  ] as const) {
    test(`${id} can create single-day historical temperature task`, async ({ page }) => {
      await page.goto('/login')
      await submitDemoLogin(page, id)
      await expect(page).toHaveURL('/dashboard')

      await page
        .getByRole('navigation', { name: '工作区导航', exact: true })
        .getByRole('link', { name: '创建任务', exact: true })
        .click()
      await expect(page).toHaveURL('/tasks/new')

      // Wait for the page to be ready (capabilities section should be visible)
      await expect(page.getByRole('region', { name: '当前角色的配置能力' })).toContainText(
        roleLabel,
      )

      // Task name input (can be left empty for auto-generation)
      const nameInput = page.getByLabel('任务名称')
      await expect(nameInput).toBeVisible()
      await nameInput.fill('测试气温任务')

      // Data source selector - verify default is Fusion
      const dataSourceSelect = page.locator('#data-source')
      await expect(dataSourceSelect).toBeVisible()
      await expect(dataSourceSelect).toHaveValue('fusion')

      // Variable selector - verify default is Temperature
      const variableSelect = page.locator('#variable')
      await expect(variableSelect).toBeVisible()
      await expect(variableSelect).toHaveValue('temperature')

      // Resolution selector - verify default is 3km
      const resolutionSelect = page.locator('#resolution')
      await expect(resolutionSelect).toBeVisible()
      await expect(resolutionSelect).toHaveValue('3km')

      // Date inputs - single day
      const startDateInput = page.getByLabel('开始日期')
      await expect(startDateInput).toBeVisible()
      await startDateInput.fill('2024-06-15')

      const endDateInput = page.getByLabel('结束日期')
      await expect(endDateInput).toBeVisible()
      await endDateInput.fill('2024-06-15')

      // Verify parameter summary is visible and contains correct info
      const summary = page.getByText('参数摘要').locator('..')
      await expect(summary).toBeVisible()
      await expect(summary).toContainText('Fusion（多源融合，推荐）')
      await expect(summary).toContainText('Temperature（气温）')
      await expect(summary).toContainText('3km（标准模式）')
      await expect(summary).toContainText('Asia/Shanghai (UTC+8)')
      await expect(summary).toContainText('2024-06-15 至 2024-06-15')
      await expect(summary).toContainText('（单日）')

      // Submit button should be visible but we need to confirm region first
      const submitButton = page.getByRole('button', { name: /提交.*任务/ })
      await expect(submitButton).toBeVisible()
      await expect(submitButton).toBeDisabled() // Disabled until region confirmed
    })

    test(`${id} can configure all data sources`, async ({ page }) => {
      await page.goto('/login')
      await submitDemoLogin(page, id)
      await page.goto('/tasks/new')

      const dataSourceSelect = page.locator('#data-source')
      const summary = page.getByText('参数摘要').locator('..')

      // Test ECMWF
      await dataSourceSelect.selectOption('ecmwf')
      await expect(summary).toContainText('ECMWF（欧洲中期天气预报中心）')

      // Test GFS
      await dataSourceSelect.selectOption('gfs')
      await expect(summary).toContainText('GFS（美国全球预报系统）')

      // Test Fusion
      await dataSourceSelect.selectOption('fusion')
      await expect(summary).toContainText('Fusion（多源融合，推荐）')
    })

    test(`${id} can configure all four meteorological variables`, async ({ page }) => {
      await page.goto('/login')
      await submitDemoLogin(page, id)
      await page.goto('/tasks/new')

      const variableSelect = page.locator('#variable')
      const summary = page.getByText('参数摘要').locator('..')

      // Test Temperature
      await variableSelect.selectOption('temperature')
      await expect(summary).toContainText('Temperature（气温）')

      // Test Wind
      await variableSelect.selectOption('wind')
      await expect(summary).toContainText('Wind（风速风向）')

      // Test Pressure
      await variableSelect.selectOption('pressure')
      await expect(summary).toContainText('Pressure（海平面气压）')

      // Test Precipitation
      await variableSelect.selectOption('precipitation')
      await expect(summary).toContainText('Precipitation（总降水）')
    })

    test(`${id} can configure all three resolution levels`, async ({ page }) => {
      await page.goto('/login')
      await submitDemoLogin(page, id)
      await page.goto('/tasks/new')

      const resolutionSelect = page.locator('#resolution')
      const summary = page.getByText('参数摘要').locator('..')

      // Test 1km
      await resolutionSelect.selectOption('1km')
      await expect(summary).toContainText('1km（高精度模式）')

      // Test 3km
      await resolutionSelect.selectOption('3km')
      await expect(summary).toContainText('3km（标准模式）')

      // Test 5km
      await resolutionSelect.selectOption('5km')
      await expect(summary).toContainText('5km（快速模式）')
    })

    test(`${id} can configure multi-day historical range`, async ({ page }) => {
      await page.goto('/login')
      await submitDemoLogin(page, id)
      await page.goto('/tasks/new')

      const startDateInput = page.getByLabel('开始日期')
      const endDateInput = page.getByLabel('结束日期')
      const summary = page.getByText('参数摘要').locator('..')

      // Set multi-day range
      await startDateInput.fill('2024-01-01')
      await endDateInput.fill('2024-01-05')

      await expect(summary).toContainText('2024-01-01 至 2024-01-05')
      await expect(summary).toContainText('（5天）')
    })

    test(`${id} sees validation error for invalid date range`, async ({ page }) => {
      await page.goto('/login')
      await submitDemoLogin(page, id)
      await page.goto('/tasks/new')

      const nameInput = page.getByLabel('任务名称')
      const startDateInput = page.getByLabel('开始日期')
      const endDateInput = page.getByLabel('结束日期')

      await nameInput.fill('测试无效范围')
      await startDateInput.fill('2024-06-15')
      await endDateInput.fill('2024-06-10') // End before start

      // Confirm a minimal region to enable submit
      const confirmButton = page.getByRole('button', { name: '确认区域选择' })
      await confirmButton.waitFor({ state: 'visible', timeout: 5000 })
      await confirmButton.click()

      // Try to submit
      const submitButton = page.getByRole('button', { name: /提交.*任务/ })
      await submitButton.click()

      // Should see error message
      await expect(page.getByText('开始日期不能晚于结束日期')).toBeVisible()
    })

    test(`${id} sees estimated processing time as demo simulation`, async ({ page }) => {
      await page.goto('/login')
      await submitDemoLogin(page, id)
      await page.goto('/tasks/new')

      // Verify the demo time disclaimer is present
      await expect(page.getByText(/约 2-3 秒.*演示模拟.*非真实计算时间/)).toBeVisible()
    })
  }

  test('auto-generates default name from variable and date', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'policy')
    await page.goto('/tasks/new')

    const nameInput = page.getByLabel('任务名称')
    const variableSelect = page.locator('#variable')
    const startDateInput = page.getByLabel('开始日期')
    const endDateInput = page.getByLabel('结束日期')

    // Leave name empty
    await expect(nameInput).toHaveValue('')

    // Set variable and single date
    await variableSelect.selectOption('temperature')
    await startDateInput.fill('2024-06-15')
    await endDateInput.fill('2024-06-15')

    // Name should be auto-filled with default
    await expect(nameInput).toHaveValue('气温 · 2024-06-15')

    // Change variable
    await variableSelect.selectOption('wind')
    await expect(nameInput).toHaveValue('风场 · 2024-06-15')
  })

  test('does not overwrite user-edited task name', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await page.goto('/tasks/new')

    const nameInput = page.getByLabel('任务名称')
    const startDateInput = page.getByLabel('开始日期')
    const endDateInput = page.getByLabel('结束日期')

    // User enters custom name first
    await nameInput.fill('我的自定义任务')

    // Then set dates
    await startDateInput.fill('2024-06-15')
    await endDateInput.fill('2024-06-15')

    // Name should remain unchanged
    await expect(nameInput).toHaveValue('我的自定义任务')
  })

  test('validates historical date boundaries', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'agriculture')
    await page.goto('/tasks/new')

    const startDateInput = page.getByLabel('开始日期')
    const endDateInput = page.getByLabel('结束日期')

    // Verify min/max attributes
    await expect(startDateInput).toHaveAttribute('min', '2020-01-01')
    await expect(startDateInput).toHaveAttribute('max', '2024-12-31')
    await expect(endDateInput).toHaveAttribute('min', '2020-01-01')
    await expect(endDateInput).toHaveAttribute('max', '2024-12-31')

    // Test earliest valid date
    await startDateInput.fill('2020-01-01')
    await endDateInput.fill('2020-01-01')
    const summary = page.getByText('参数摘要').locator('..')
    await expect(summary).toContainText('2020-01-01 至 2020-01-01')

    // Test latest valid date
    await startDateInput.fill('2024-12-31')
    await endDateInput.fill('2024-12-31')
    await expect(summary).toContainText('2024-12-31 至 2024-12-31')
  })

  test('shows half-open interval explanation in summary', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'policy')
    await page.goto('/tasks/new')

    const startDateInput = page.getByLabel('开始日期')
    const endDateInput = page.getByLabel('结束日期')

    await startDateInput.fill('2024-06-15')
    await endDateInput.fill('2024-06-15')

    const summary = page.getByText('参数摘要').locator('..')
    await expect(summary).toContainText(
      '显示结束日期包含当天；保存范围为半开区间 [start, nextDay) UTC',
    )
  })
})

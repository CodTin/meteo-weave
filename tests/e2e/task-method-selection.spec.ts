import { expect, test } from './browser-guard'
import { submitDemoLogin } from './demo-login'

test.describe('Task method selection and role restrictions', () => {
  test('researcher sees all three method options', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '创建任务', exact: true })
      .click()
    await expect(page).toHaveURL('/tasks/new')

    // Check that all method options are visible
    await expect(page.getByText('降尺度方法')).toBeVisible()
    await expect(page.getByLabel('推荐方法')).toBeVisible()
    await expect(page.getByLabel('确定性方法')).toBeVisible()
    await expect(page.getByLabel('概率式方法')).toBeVisible()

    // Check capabilities section shows all methods
    const capabilities = page.getByRole('region', { name: '当前角色的配置能力' })
    await expect(capabilities).toContainText('推荐方法')
    await expect(capabilities).toContainText('确定性方法')
    await expect(capabilities).toContainText('概率式方法')
  })

  test('policy maker only sees recommended method and no method selector', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'policy')
    await expect(page).toHaveURL('/dashboard')

    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '创建任务', exact: true })
      .click()
    await expect(page).toHaveURL('/tasks/new')

    // Method selector should not be visible
    await expect(page.getByText('降尺度方法')).not.toBeVisible()
    await expect(page.getByLabel('确定性方法')).not.toBeVisible()
    await expect(page.getByLabel('概率式方法')).not.toBeVisible()

    // Capabilities section should only show recommended method
    const capabilities = page.getByRole('region', { name: '当前角色的配置能力' })
    const methodList = capabilities.getByRole('list', { name: '可用降尺度方法' })
    await expect(methodList.getByRole('listitem')).toHaveText(['推荐方法'])
  })

  test('agriculture user only sees recommended method', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'agriculture')
    await expect(page).toHaveURL('/dashboard')

    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '创建任务', exact: true })
      .click()
    await expect(page).toHaveURL('/tasks/new')

    // Method selector should not be visible
    await expect(page.getByText('降尺度方法')).not.toBeVisible()

    // Capabilities section should only show recommended method
    const capabilities = page.getByRole('region', { name: '当前角色的配置能力' })
    const methodList = capabilities.getByRole('list', { name: '可用降尺度方法' })
    await expect(methodList.getByRole('listitem')).toHaveText(['推荐方法'])
  })

  test('researcher can select deterministic method without advanced parameters', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await page.goto('/tasks/new')

    // Select deterministic method
    await page.getByLabel('确定性方法').check()
    await expect(page.getByLabel('确定性方法')).toBeChecked()

    // Advanced parameters section should not be visible
    await expect(page.getByText('高级参数')).not.toBeVisible()
    await expect(page.getByText('启用不确定性量化')).not.toBeVisible()

    // Current configuration should show deterministic
    const config = page.getByText('当前配置').locator('..')
    await expect(config).toContainText('确定性方法')
  })

  test('researcher can select probabilistic method with ensemble options', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await page.goto('/tasks/new')

    // Select probabilistic method
    await page.getByLabel('概率式方法').check()
    await expect(page.getByLabel('概率式方法')).toBeChecked()

    // Advanced parameters section should be visible
    await expect(page.getByText('高级参数')).toBeVisible()
    await expect(page.getByText('概率集合成员数')).toBeVisible()

    // Check ensemble member options
    await expect(page.getByLabel('5 个成员')).toBeVisible()
    await expect(page.getByLabel('10 个成员（默认）')).toBeVisible()
    await expect(page.getByLabel('20 个成员')).toBeVisible()

    // Default should be 10
    await expect(page.getByLabel('10 个成员（默认）')).toBeChecked()

    // Change to 20
    await page.getByLabel('20 个成员').check()
    const config = page.getByText('当前配置').locator('..')
    await expect(config).toContainText('集合成员数：20 个')
  })

  test('researcher can enable uncertainty quantification on recommended method', async ({
    page,
  }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await page.goto('/tasks/new')

    // Recommended method is default
    await expect(page.getByLabel('推荐方法')).toBeChecked()

    // Advanced parameters should not be visible initially
    await expect(page.getByText('高级参数')).not.toBeVisible()

    // Enable uncertainty quantification
    await page.getByLabel('启用不确定性量化').check()
    await expect(page.getByLabel('启用不确定性量化')).toBeChecked()

    // Ensemble options should now be visible
    await expect(page.getByText('概率集合成员数')).toBeVisible()
    await expect(page.getByLabel('10 个成员（默认）')).toBeChecked()

    // Current configuration should show uncertainty enabled
    const config = page.getByText('当前配置').locator('..')
    await expect(config).toContainText('推荐方法')
    await expect(config).toContainText('启用不确定性量化')
    await expect(config).toContainText('集合成员数：10 个')
  })

  test('switching from deterministic clears incompatible settings', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await page.goto('/tasks/new')

    // Start with recommended and enable uncertainty
    await page.getByLabel('推荐方法').check()
    await page.getByLabel('启用不确定性量化').check()
    await page.getByLabel('20 个成员').check()

    // Verify settings are applied
    let config = page.getByText('当前配置').locator('..')
    await expect(config).toContainText('集合成员数：20 个')

    // Switch to deterministic
    await page.getByLabel('确定性方法').check()

    // Advanced parameters should disappear
    await expect(page.getByText('高级参数')).not.toBeVisible()

    // Config should show deterministic without ensemble info
    config = page.getByText('当前配置').locator('..')
    await expect(config).toContainText('确定性方法')
    await expect(config).not.toContainText('集合成员数')
    await expect(config).not.toContainText('启用不确定性量化')
  })

  test('role switch removes advanced parameters from UI and task submission', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await page.goto('/tasks/new')

    // Configure advanced settings as researcher
    await page.getByLabel('概率式方法').check()
    await page.getByLabel('20 个成员').check()
    await expect(page.getByText('高级参数')).toBeVisible()

    // Switch to policy maker role
    await page.goto('/settings')
    await page.getByRole('button', { name: '切换演示角色', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '切换演示角色', exact: true })
    await dialog.getByRole('radio', { name: /决策者/ }).check()
    await dialog.getByRole('button', { name: '退出并重新登录', exact: true }).click()
    await expect(page).toHaveURL('/login?account=policy')
    await page.getByLabel('密码', { exact: true }).fill('meteo-demo')
    await page.getByRole('button', { name: '登录演示账号', exact: true }).click()
    await expect(page).toHaveURL('/dashboard')

    // Go to task creation
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '创建任务', exact: true })
      .click()

    // Should not see method selector or advanced parameters
    await expect(page.getByLabel('概率式方法')).not.toBeVisible()
    await expect(page.getByText('高级参数')).not.toBeVisible()

    // Configuration should show only recommended method
    const config = page.getByText('当前配置').locator('..')
    await expect(config).toContainText('推荐方法')
  })

  test('ensemble member boundaries: only 5, 10, 20 are valid', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await page.goto('/tasks/new')

    await page.getByLabel('概率式方法').check()

    // All three options should be visible
    await expect(page.getByLabel('5 个成员')).toBeVisible()
    await expect(page.getByLabel('10 个成员（默认）')).toBeVisible()
    await expect(page.getByLabel('20 个成员')).toBeVisible()

    // Select each and verify it updates the config
    await page.getByLabel('5 个成员').check()
    let config = page.getByText('当前配置').locator('..')
    await expect(config).toContainText('集合成员数：5 个')

    await page.getByLabel('10 个成员（默认）').check()
    config = page.getByText('当前配置').locator('..')
    await expect(config).toContainText('集合成员数：10 个')

    await page.getByLabel('20 个成员').check()
    config = page.getByText('当前配置').locator('..')
    await expect(config).toContainText('集合成员数：20 个')
  })
})

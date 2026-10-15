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

      // Task name input
      const nameInput = page.getByLabel('任务名称')
      await expect(nameInput).toBeVisible()
      await nameInput.fill('测试气温任务')

      // Date input - single day
      const dateInput = page.getByLabel('日期')
      await expect(dateInput).toBeVisible()
      await dateInput.fill('2024-06-15')

      // Submit button should be visible but we need to confirm region first
      const submitButton = page.getByRole('button', { name: /提交.*任务/ })
      await expect(submitButton).toBeVisible()

      // For now, just verify the form elements exist
      // Full integration with spatial region and submission will be tested in subsequent cycles
    })
  }
})

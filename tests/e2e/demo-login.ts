import { expect, type BrowserContext, type Page } from './browser-guard'

// Always exercise the published login form; never manufacture an authenticated cookie.
export async function submitDemoLogin(page: Page, account = 'researcher') {
  await page.getByLabel('账号', { exact: true }).fill(account)
  await page.getByLabel('密码', { exact: true }).fill('meteo-demo')
  await page.getByRole('button', { name: '登录演示账号', exact: true }).click()
}

// A separate page leaves the tested page's module cache, history and document counts untouched.
export async function signInDemo(context: BrowserContext, account = 'researcher') {
  const login = await context.newPage()
  try {
    await login.goto('/login')
    await submitDemoLogin(login, account)
    await expect(login).toHaveURL('/dashboard')
    await expect(login.getByRole('region', { name: '当前演示账号' })).toContainText(account)
  } finally {
    await login.close()
  }
}

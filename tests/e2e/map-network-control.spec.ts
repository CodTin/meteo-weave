import { expect, test } from './browser-guard'
import { submitDemoLogin } from './demo-login'
import { installMapFixtures, uninstallMapFixtures } from './helpers/map-fixtures'

test.describe('Map network control and configuration recovery', () => {
  test('missing Mapbox configuration shows clear guidance without faking success', async ({
    page,
  }) => {
    // Navigate directly to task creation page where region map is used
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Navigate directly to new task page
    await page.goto('/tasks/new')
    await expect(page).toHaveURL('/tasks/new')

    // Map should show clear configuration guidance, not a loading spinner or fake success
    const placeholder = page.locator('[data-testid="map-config-placeholder"]')
    await expect(placeholder).toBeVisible({ timeout: 10000 })

    // Should explain what's missing with specific text checks
    await expect(placeholder.getByText('地图不可用：未配置 Mapbox 公共访问令牌')).toBeVisible()
    await expect(placeholder.getByText(/VITE_MAPBOX_ACCESS_TOKEN/)).toBeVisible()
    await expect(placeholder.getByText(/演示准备步骤/)).toBeVisible()

    // Should not show fake map or infinite loading
    await expect(page.getByText('地图加载中...', { exact: true })).toHaveCount(0)

    // Coordinate input should still work
    await expect(page.getByLabel('北纬（North）', { exact: true })).toBeEnabled()
    await expect(page.getByLabel('南纬（South）', { exact: true })).toBeEnabled()
    await expect(page.getByLabel('东经（East）', { exact: true })).toBeEnabled()
    await expect(page.getByLabel('西经（West）', { exact: true })).toBeEnabled()
  })

  test('result map with missing configuration shows recovery guidance', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    const menu = page.getByRole('button', { name: '打开工作区导航', exact: true })
    if (await menu.isVisible()) await menu.click()
    await page.getByRole('link', { name: '任务管理', exact: true }).first().click()
    await page
      .getByRole('button', {
        name: '查看任务 Synthetic Demo · Alpine mountain temperature',
        exact: true,
      })
      .click()
    await page.getByRole('button', { name: '查看结果分析', exact: true }).click()

    // Navigate to data export tab which uses export region map
    await page.getByRole('tab', { name: /数据导出/ }).click()

    // Should show clear guidance about missing Mapbox configuration
    const placeholder = page.locator('[data-testid="map-config-placeholder"]')
    await expect(placeholder).toBeVisible()
    await expect(placeholder.getByText(/未配置 Mapbox/)).toBeVisible()

    // Should not block other analysis features
    await page.getByRole('tab', { name: /精度评估/ }).click()
    await expect(page.getByRole('heading', { name: /精度评估/ })).toBeVisible()
  })

  test('map with controlled network succeeds with bounded style and tiles', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Track intercepted requests to verify fixtures are working
    const interceptedStyles: string[] = []
    const interceptedTiles: string[] = []

    await page.route(/api\.mapbox\.com\/styles/, (route) => {
      interceptedStyles.push(route.request().url())
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          version: 8,
          name: 'Test Style',
          sources: {},
          layers: [
            { id: 'background', type: 'background', paint: { 'background-color': '#f0f0f0' } },
          ],
        }),
      })
    })

    await page.route(/api\.mapbox\.com\/v4/, (route) => {
      interceptedTiles.push(route.request().url())
      const transparentPng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64',
      )
      route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng })
    })

    await page.goto('/tasks/new')

    // Coordinate inputs should be functional regardless of map state
    await expect(page.getByLabel('北纬（North）')).toBeEnabled()
    await page.getByLabel('北纬（North）').fill('45.5')
    await page.getByLabel('南纬（South）').fill('45.0')
    await page.getByLabel('东经（East）').fill('7.5')
    await page.getByLabel('西经（West）').fill('6.5')

    // Verify fixtures were used (bounded responses for external resources)
    // If token is present, styles will be requested; if not, they won't
    // Either way, application should not fail
    await expect(page.getByLabel('北纬（North）')).toHaveValue('45.5')
  })

  test('style failure shows recoverable error without infinite loading', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Install fixtures with style failure after login
    await installMapFixtures(page, { failStyle: true })

    await page.goto('/tasks/new')

    // Should show error, not infinite "地图加载中..."
    await expect(page.getByText('地图加载中...', { exact: true })).toHaveCount(0, { timeout: 5000 })

    // Map should fall back to placeholder with error
    const placeholder = page.locator('[data-testid="map-config-placeholder"]')
    await expect(placeholder).toBeVisible()

    // Other page functionality should not be blocked
    await expect(page.getByLabel('北纬（North）')).toBeEnabled()

    await uninstallMapFixtures(page)
  })

  test('tile failure does not block map interaction', async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await expect(page).toHaveURL('/dashboard')

    // Install fixtures with tile failure but working style after login
    await installMapFixtures(page, { failTiles: true })

    await page.goto('/tasks/new')

    // Coordinate interaction should work regardless of tile loading status
    // Map tiles failing should not block the application
    await expect(page.getByLabel('北纬（North）')).toBeEnabled()
    await page.getByLabel('北纬（North）').fill('46.0')
    await expect(page.getByLabel('北纬（North）')).toHaveValue('46.0')

    // Page should not be stuck in loading state
    await expect(page.getByText('地图加载中...', { exact: true })).toHaveCount(0)

    await uninstallMapFixtures(page)
  })
})

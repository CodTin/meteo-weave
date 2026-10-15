import { test, expect } from './browser-guard'
import { signInDemo } from './demo-login'

test.describe('Spatial Region Place Search', () => {
  test.beforeEach(async ({ page, context }) => {
    await signInDemo(context, 'researcher')
    await page.goto('/tasks/new')
    await expect(page.getByRole('heading', { name: '空间区域选择' })).toBeVisible()
  })

  test('shows place search input with clear labels', async ({ page }) => {
    await expect(page.getByLabel('搜索演示地点')).toBeVisible()
    await expect(page.getByPlaceholder('搜索城市、平原或山区...')).toBeVisible()
  })

  test('shows built-in directory disclaimer', async ({ page }) => {
    const disclaimer = page.getByText('这是内置演示目录')
    await expect(disclaimer).toBeVisible()
    await expect(disclaimer).toContainText('不是全球地理编码服务')
  })

  test('shows all places when search is empty', async ({ page }) => {
    const searchInput = page.getByLabel('搜索演示地点')
    await searchInput.click()

    // Should show multiple places
    await expect(page.getByTestId('place-option-beijing')).toBeVisible()
    await expect(page.getByTestId('place-option-shanghai')).toBeVisible()
    await expect(page.getByTestId('place-option-north-china-plain')).toBeVisible()
    await expect(page.getByTestId('place-option-qinghai-tibet')).toBeVisible()
  })

  test('filters places by Chinese name', async ({ page }) => {
    const searchInput = page.getByLabel('搜索演示地点')
    await searchInput.fill('北京')

    await expect(page.getByTestId('place-option-beijing')).toBeVisible()
    await expect(page.getByTestId('place-option-shanghai')).not.toBeVisible()
  })

  test('filters places by English name', async ({ page }) => {
    const searchInput = page.getByLabel('搜索演示地点')
    await searchInput.fill('Beijing')

    await expect(page.getByTestId('place-option-beijing')).toBeVisible()
    await expect(page.getByTestId('place-option-shanghai')).not.toBeVisible()
  })

  test('filters places by category description', async ({ page }) => {
    const searchInput = page.getByLabel('搜索演示地点')
    await searchInput.fill('平原')

    await expect(page.getByTestId('place-option-north-china-plain')).toBeVisible()
    await expect(page.getByTestId('place-option-yangtze-delta')).toBeVisible()
    await expect(page.getByTestId('place-option-beijing')).not.toBeVisible()
  })

  test('shows no results message for unmatched query', async ({ page }) => {
    const searchInput = page.getByLabel('搜索演示地点')
    await searchInput.fill('xyz不存在的地方')

    await expect(page.getByText('未找到匹配的地点')).toBeVisible()
    await expect(page.getByText('您可以使用下方坐标输入定义任意区域')).toBeVisible()
  })

  test('selecting a city updates coordinates, map, and summary', async ({ page }) => {
    const searchInput = page.getByLabel('搜索演示地点')
    await searchInput.click()
    await page.getByTestId('place-option-beijing').click()

    // Check coordinates are filled
    await expect(page.getByLabel('西经（West）')).toHaveValue('116.2')
    await expect(page.getByLabel('南纬（South）')).toHaveValue('39.8')
    await expect(page.getByLabel('东经（East）')).toHaveValue('116.6')
    await expect(page.getByLabel('北纬（North）')).toHaveValue('40.1')

    // Check confirmed region summary appears
    const summary = page.locator('output[aria-label="已确认的区域信息"]')
    await expect(summary).toBeVisible()
    await expect(summary).toContainText('116.2°')
    await expect(summary).toContainText('116.6°')
    await expect(summary).toContainText('39.8°')
    await expect(summary).toContainText('40.1°')
    await expect(summary).toContainText('已选地点：北京市区')
    await expect(summary).toContainText('约')
    await expect(summary).toContainText('km')

    // Check map shows rectangle (via canvas element)
    await expect(page.locator('canvas.mapboxgl-canvas')).toBeVisible()
  })

  test('selecting a plain updates to larger region', async ({ page }) => {
    const searchInput = page.getByLabel('搜索演示地点')
    await searchInput.click()
    await page.getByTestId('place-option-north-china-plain').click()

    // Check coordinates are filled with plain bbox
    await expect(page.getByLabel('西经（West）')).toHaveValue('114')
    await expect(page.getByLabel('南纬（South）')).toHaveValue('35')
    await expect(page.getByLabel('东经（East）')).toHaveValue('117')
    await expect(page.getByLabel('北纬（North）')).toHaveValue('38')

    // Check summary shows the place
    const summary = page.locator('output[aria-label="已确认的区域信息"]')
    await expect(summary).toBeVisible()
    await expect(summary).toContainText('已选地点：华北平原')
  })

  test('selecting a mountain updates to mountain region', async ({ page }) => {
    const searchInput = page.getByLabel('搜索演示地点')
    await searchInput.click()
    await page.getByTestId('place-option-qinghai-tibet').click()

    // Check coordinates are filled with mountain bbox
    await expect(page.getByLabel('西经（West）')).toHaveValue('100')
    await expect(page.getByLabel('南纬（South）')).toHaveValue('30')
    await expect(page.getByLabel('东经（East）')).toHaveValue('103')
    await expect(page.getByLabel('北纬（North）')).toHaveValue('33')

    // Check summary shows the place
    const summary = page.locator('output[aria-label="已确认的区域信息"]')
    await expect(summary).toBeVisible()
    await expect(summary).toContainText('已选地点：青藏高原东缘')
  })

  test('repeatedly selecting same place gives consistent coordinates', async ({ page }) => {
    const searchInput = page.getByLabel('搜索演示地点')

    // First selection
    await searchInput.click()
    await page.getByTestId('place-option-shanghai').click()

    const firstWest = await page.getByLabel('西经（West）').inputValue()
    const firstSouth = await page.getByLabel('南纬（South）').inputValue()
    const firstEast = await page.getByLabel('东经（East）').inputValue()
    const firstNorth = await page.getByLabel('北纬（North）').inputValue()

    // Reset
    await page.getByRole('button', { name: /重置/ }).click()

    // Second selection of same place
    await searchInput.click()
    await page.getByTestId('place-option-shanghai').click()

    await expect(page.getByLabel('西经（West）')).toHaveValue(firstWest)
    await expect(page.getByLabel('南纬（South）')).toHaveValue(firstSouth)
    await expect(page.getByLabel('东经（East）')).toHaveValue(firstEast)
    await expect(page.getByLabel('北纬（North）')).toHaveValue(firstNorth)
  })

  test('switching places replaces previous region completely', async ({ page }) => {
    const searchInput = page.getByLabel('搜索演示地点')

    // Select first place
    await searchInput.click()
    await page.getByTestId('place-option-beijing').click()

    let summary = page.locator('output[aria-label="已确认的区域信息"]')
    await expect(summary).toContainText('已选地点：北京市区')

    // Select different place
    await searchInput.click()
    await page.getByTestId('place-option-shanghai').click()

    // Check old coordinates are replaced
    await expect(page.getByLabel('西经（West）')).toHaveValue('121.3')
    await expect(page.getByLabel('南纬（South）')).toHaveValue('31.1')
    await expect(page.getByLabel('东经（East）')).toHaveValue('121.7')
    await expect(page.getByLabel('北纬（North）')).toHaveValue('31.4')

    // Check summary updated
    summary = page.locator('output[aria-label="已确认的区域信息"]')
    await expect(summary).toContainText('已选地点：上海市区')
    await expect(summary).not.toContainText('北京')
  })

  test('manually editing coordinates clears selected place name', async ({ page }) => {
    const searchInput = page.getByLabel('搜索演示地点')

    // Select a place
    await searchInput.click()
    await page.getByTestId('place-option-beijing').click()

    let summary = page.locator('output[aria-label="已确认的区域信息"]')
    await expect(summary).toContainText('已选地点：北京市区')

    // Manually edit a coordinate
    await page.getByLabel('西经（West）').fill('116.3')
    await page.getByRole('button', { name: '确认区域' }).click()

    // Place name should be gone
    summary = page.locator('output[aria-label="已确认的区域信息"]')
    await expect(summary).toBeVisible()
    await expect(summary).not.toContainText('已选地点')
  })

  test('reset clears selected place and coordinates', async ({ page }) => {
    const searchInput = page.getByLabel('搜索演示地点')

    // Select a place
    await searchInput.click()
    await page.getByTestId('place-option-chengdu').click()

    const summary = page.locator('output[aria-label="已确认的区域信息"]')
    await expect(summary).toBeVisible()

    // Reset
    await page.getByRole('button', { name: /重置/ }).click()

    // Coordinates should be empty
    await expect(page.getByLabel('西经（West）')).toHaveValue('')
    await expect(page.getByLabel('南纬（South）')).toHaveValue('')
    await expect(page.getByLabel('东经（East）')).toHaveValue('')
    await expect(page.getByLabel('北纬（North）')).toHaveValue('')

    // Summary should be hidden
    await expect(summary).not.toBeVisible()
    await expect(page.getByText('尚未选择区域')).toBeVisible()
  })

  test('place search works without map token', async ({ page }) => {
    // Even if map fails, place search should work
    const searchInput = page.getByLabel('搜索演示地点')
    await searchInput.click()
    await page.getByTestId('place-option-beijing').click()

    // Coordinates and summary should still work
    await expect(page.getByLabel('西经（West）')).toHaveValue('116.2')
    const summary = page.locator('output[aria-label="已确认的区域信息"]')
    await expect(summary).toBeVisible()
    await expect(summary).toContainText('已选地点：北京市区')
  })

  test('keyboard navigation works for place search', async ({ page }) => {
    const searchInput = page.getByLabel('搜索演示地点')
    await searchInput.fill('北京')

    // Tab to first result
    await searchInput.press('Tab')

    // Should be able to activate with Enter
    const beijingOption = page.getByTestId('place-option-beijing')
    await beijingOption.press('Enter')

    await expect(page.getByLabel('西经（West）')).toHaveValue('116.2')
  })

  test('escape key closes search results', async ({ page }) => {
    const searchInput = page.getByLabel('搜索演示地点')
    await searchInput.click()

    // Results should be visible
    await expect(page.getByTestId('place-option-beijing')).toBeVisible()

    // Press Escape
    await searchInput.press('Escape')

    // Results should be hidden (with delay)
    await page.waitForTimeout(250)
    await expect(page.getByTestId('place-option-beijing')).not.toBeVisible()
  })

  test('place categories are displayed correctly', async ({ page }) => {
    const searchInput = page.getByLabel('搜索演示地点')
    await searchInput.click()

    // Check city category
    const beijingOption = page.getByTestId('place-option-beijing')
    await expect(beijingOption).toContainText('城市')

    // Check plain category
    const plainOption = page.getByTestId('place-option-north-china-plain')
    await expect(plainOption).toContainText('平原')

    // Check mountain category
    const mountainOption = page.getByTestId('place-option-qinghai-tibet')
    await expect(mountainOption).toContainText('山区')
  })

  test('place search works at different viewport sizes', async ({ page }) => {
    // Test at 390px (mobile)
    await page.setViewportSize({ width: 390, height: 844 })
    let searchInput = page.getByLabel('搜索演示地点')
    await expect(searchInput).toBeVisible()
    await searchInput.click()
    await page.getByTestId('place-option-beijing').click()
    await expect(page.locator('output[aria-label="已确认的区域信息"]')).toBeVisible()

    await page.getByRole('button', { name: /重置/ }).click()

    // Test at 768px (tablet)
    await page.setViewportSize({ width: 768, height: 1024 })
    searchInput = page.getByLabel('搜索演示地点')
    await expect(searchInput).toBeVisible()
    await searchInput.click()
    await page.getByTestId('place-option-shanghai').click()
    await expect(page.locator('output[aria-label="已确认的区域信息"]')).toBeVisible()

    await page.getByRole('button', { name: /重置/ }).click()

    // Test at 1440px (desktop)
    await page.setViewportSize({ width: 1440, height: 900 })
    searchInput = page.getByLabel('搜索演示地点')
    await expect(searchInput).toBeVisible()
    await searchInput.click()
    await page.getByTestId('place-option-chengdu').click()
    await expect(page.locator('output[aria-label="已确认的区域信息"]')).toBeVisible()
  })
})

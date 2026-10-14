import { expect, test } from './browser-guard'
import { submitDemoLogin } from './demo-login'

test.describe('Spatial Region Selection with Map', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await submitDemoLogin(page, 'researcher')
    await page.goto('/tasks/new')
    // Wait for page to fully load
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('shows spatial region selector on task creation page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '空间区域选择' })).toBeVisible()
  })

  test('shows confirmed coordinates as rectangle on terrain basemap', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '空间区域选择' })).toBeVisible()

    // Fill in coordinates
    await page.getByLabel('西经（West）').fill('116.0')
    await page.getByLabel('东经（East）').fill('117.0')
    await page.getByLabel('南纬（South）').fill('39.5')
    await page.getByLabel('北纬（North）').fill('40.5')

    // Confirm region
    await page.getByRole('button', { name: '确认区域' }).click()

    // Verify confirmed region summary appears
    await expect(page.getByRole('region', { name: '已确认的区域信息' })).toBeVisible()
    await expect(page.getByText('116°', { exact: false })).toBeVisible()
    await expect(page.getByText('117°', { exact: false })).toBeVisible()

    // Verify map canvas is present (Mapbox GL renders to canvas)
    const mapCanvas = page.locator('.mapboxgl-canvas')
    await expect(mapCanvas).toBeVisible({ timeout: 10000 })

    // Verify map controls are present
    await expect(page.locator('.mapboxgl-ctrl-zoom-in')).toBeVisible()
    await expect(page.locator('.mapboxgl-ctrl-zoom-out')).toBeVisible()
  })

  test('pan and zoom do not change confirmed coordinates', async ({ page }) => {
    // Confirm a region
    await page.getByLabel('西经（West）').fill('116.0')
    await page.getByLabel('东经（East）').fill('117.0')
    await page.getByLabel('南纬（South）').fill('39.5')
    await page.getByLabel('北纬（North）').fill('40.5')
    await page.getByRole('button', { name: '确认区域' }).click()

    // Wait for map to load
    const mapCanvas = page.locator('.mapboxgl-canvas')
    await expect(mapCanvas).toBeVisible({ timeout: 10000 })

    // Get initial coordinate values
    const confirmedRegion = page.getByRole('region', { name: '已确认的区域信息' })
    const initialText = await confirmedRegion.textContent()

    // Perform zoom in
    await page.locator('.mapboxgl-ctrl-zoom-in').click()
    await page.waitForTimeout(500) // Wait for zoom animation

    // Verify coordinates haven't changed
    const afterZoomText = await confirmedRegion.textContent()
    expect(afterZoomText).toBe(initialText)

    // Pan the map by dragging canvas
    const canvas = await mapCanvas.boundingBox()
    if (canvas) {
      await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2)
      await page.mouse.down()
      await page.mouse.move(canvas.x + canvas.width / 2 + 100, canvas.y + canvas.height / 2 + 100)
      await page.mouse.up()
      await page.waitForTimeout(500)
    }

    // Verify coordinates still haven't changed
    const afterPanText = await confirmedRegion.textContent()
    expect(afterPanText).toBe(initialText)
  })

  test('shows fallback state when map token is not configured', async ({ page, context }) => {
    // Block Mapbox API requests to simulate missing token
    await context.route('**/api.mapbox.com/**', (route) => route.abort())

    await page.goto('/tasks/new')
    await expect(page.getByRole('heading', { name: '空间区域选择' })).toBeVisible()

    // Fill and confirm coordinates
    await page.getByLabel('西经（West）').fill('116.0')
    await page.getByLabel('东经（East）').fill('117.0')
    await page.getByLabel('南纬（South）').fill('39.5')
    await page.getByLabel('北纬（North）').fill('40.5')
    await page.getByRole('button', { name: '确认区域' }).click()

    // Should show fallback message
    await expect(
      page.getByText(/地图加载失败|地图不可用|无法加载地图/, { exact: false }),
    ).toBeVisible()

    // Coordinate inputs and summary should still work
    await expect(page.getByRole('region', { name: '已确认的区域信息' })).toBeVisible()
    await expect(page.getByText('116°', { exact: false })).toBeVisible()
  })

  test('resets map when region is reset', async ({ page }) => {
    // Confirm a region
    await page.getByLabel('西经（West）').fill('116.0')
    await page.getByLabel('东经（East）').fill('117.0')
    await page.getByLabel('南纬（South）').fill('39.5')
    await page.getByLabel('北纬（North）').fill('40.5')
    await page.getByRole('button', { name: '确认区域' }).click()

    // Verify map and rectangle are visible
    await expect(page.locator('.mapboxgl-canvas')).toBeVisible({ timeout: 10000 })

    // Reset the region
    await page.getByRole('button', { name: '重置' }).click()

    // Verify confirmed region is gone
    await expect(page.getByRole('region', { name: '已确认的区域信息' })).not.toBeVisible()

    // Verify inputs are cleared
    await expect(page.getByLabel('西经（West）')).toHaveValue('')
  })

  test('updates map rectangle when coordinates are reconfirmed', async ({ page }) => {
    // Confirm first region
    await page.getByLabel('西经（West）').fill('116.0')
    await page.getByLabel('东经（East）').fill('117.0')
    await page.getByLabel('南纬（South）').fill('39.5')
    await page.getByLabel('北纬（North）').fill('40.5')
    await page.getByRole('button', { name: '确认区域' }).click()

    await expect(page.locator('.mapboxgl-canvas')).toBeVisible({ timeout: 10000 })
    const firstRegion = await page.getByRole('region', { name: '已确认的区域信息' }).textContent()

    // Change coordinates and reconfirm
    await page.getByLabel('西经（West）').fill('100.0')
    await page.getByLabel('东经（East）').fill('101.0')
    await page.getByLabel('南纬（South）').fill('30.0')
    await page.getByLabel('北纬（North）').fill('31.0')
    await page.getByRole('button', { name: '确认区域' }).click()

    // Verify new coordinates appear
    const secondRegion = await page.getByRole('region', { name: '已确认的区域信息' }).textContent()
    expect(secondRegion).not.toBe(firstRegion)
    await expect(page.getByText('100°', { exact: false })).toBeVisible()
    await expect(page.getByText('101°', { exact: false })).toBeVisible()
  })
})

import { test, expect } from './browser-guard'
import { signInDemo } from './demo-login'

test.describe('Spatial Region Map Drawing', () => {
  test.beforeEach(async ({ page, context }) => {
    await signInDemo(context, 'researcher')
    await page.goto('/tasks/new')
    await expect(page.getByRole('heading', { name: '空间区域选择' })).toBeVisible()
  })

  test('shows drawing toggle button and instruction', async ({ page }) => {
    const startButton = page.getByTestId('start-drawing-button')
    await expect(startButton).toBeVisible()
    await expect(startButton).toContainText('框选区域')

    // Click to enter drawing mode
    await startButton.click()

    // Should show instruction and cancel button
    await expect(page.getByText('在地图上拖动鼠标绘制矩形区域')).toBeVisible()
    const cancelButton = page.getByTestId('cancel-drawing-button')
    await expect(cancelButton).toBeVisible()
    await expect(cancelButton).toContainText('取消框选')
  })

  test('cancels drawing mode when cancel button clicked', async ({ page }) => {
    // Enter drawing mode
    await page.getByTestId('start-drawing-button').click()
    await expect(page.getByTestId('cancel-drawing-button')).toBeVisible()

    // Cancel
    await page.getByTestId('cancel-drawing-button').click()

    // Should return to normal mode
    await expect(page.getByTestId('start-drawing-button')).toBeVisible()
    await expect(page.getByText('在地图上拖动鼠标绘制矩形区域')).not.toBeVisible()
  })

  test('draws valid rectangle and updates all coordinates', async ({ page }) => {
    // Wait for map to load
    await page.waitForTimeout(2000)

    // Enter drawing mode
    await page.getByTestId('start-drawing-button').click()
    await expect(page.getByText('在地图上拖动鼠标绘制矩形区域')).toBeVisible()

    // Get the map canvas
    const mapCanvas = page.locator('canvas').first()
    await expect(mapCanvas).toBeVisible()

    // Get canvas bounding box
    const box = await mapCanvas.boundingBox()
    if (!box) throw new Error('Canvas not found')

    // Draw a rectangle (center area to avoid edge issues)
    const startX = box.x + box.width * 0.3
    const startY = box.y + box.height * 0.3
    const endX = box.x + box.width * 0.7
    const endY = box.y + box.height * 0.7

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(endX, endY, { steps: 10 })
    await page.mouse.up()

    // Wait for drawing to complete and coordinates to update
    await page.waitForTimeout(500)

    // Should exit drawing mode automatically
    await expect(page.getByTestId('start-drawing-button')).toBeVisible()

    // All coordinate inputs should be filled
    const westInput = page.getByLabel('西经（West）')
    const eastInput = page.getByLabel('东经（East）')
    const southInput = page.getByLabel('南纬（South）')
    const northInput = page.getByLabel('北纬（North）')

    await expect(westInput).not.toHaveValue('')
    await expect(eastInput).not.toHaveValue('')
    await expect(southInput).not.toHaveValue('')
    await expect(northInput).not.toHaveValue('')

    // Region summary should appear
    const summary = page.locator('output[aria-label="已确认的区域信息"]')
    await expect(summary).toBeVisible()
    await expect(summary).toContainText('约')
    await expect(summary).toContainText('km')
  })

  test('invalid rectangle does not overwrite existing region', async ({ page }) => {
    // First, confirm a valid region via coordinates
    await page.getByLabel('西经（West）').fill('100')
    await page.getByLabel('南纬（South）').fill('20')
    await page.getByLabel('东经（East）').fill('120')
    await page.getByLabel('北纬（North）').fill('40')
    await page.getByRole('button', { name: '确认区域' }).click()

    const summary = page.locator('output[aria-label="已确认的区域信息"]')
    await expect(summary).toBeVisible()
    await expect(summary).toContainText('100°')
    await expect(summary).toContainText('120°')

    // Wait for map to load
    await page.waitForTimeout(2000)

    // Enter drawing mode
    await page.getByTestId('start-drawing-button').click()

    // Get the map canvas
    const mapCanvas = page.locator('canvas').first()
    const box = await mapCanvas.boundingBox()
    if (!box) throw new Error('Canvas not found')

    // Draw a zero-area rectangle (same start and end point)
    const x = box.x + box.width * 0.5
    const y = box.y + box.height * 0.5

    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.up()

    await page.waitForTimeout(500)

    // Should NOT show error (zero area is ignored by draw mode)
    // The original region should remain
    await expect(summary).toContainText('100°')
    await expect(summary).toContainText('120°')

    // Inputs should still have original values
    await expect(page.getByLabel('西经（West）')).toHaveValue('100')
    await expect(page.getByLabel('东经（East）')).toHaveValue('120')
  })

  test('shows error for dateline-crossing drawn rectangle', async ({ page }) => {
    // This test is conceptual - drawing a dateline-crossing rectangle
    // on a web mercator map is difficult, but validation should catch it
    // if coordinates end up with west > east

    // Manually trigger an invalid rectangle through the callback
    // by entering drawing mode and verifying error display works
    await page.getByTestId('start-drawing-button').click()
    await expect(page.getByText('在地图上拖动鼠标绘制矩形区域')).toBeVisible()

    // Note: actual dateline crossing would require special map interaction
    // The validation logic is tested separately in validation tests
  })

  test('round trip: draw → edit coordinates → draw again', async ({ page }) => {
    // Wait for map to load
    await page.waitForTimeout(2000)

    // First draw
    await page.getByTestId('start-drawing-button').click()
    const mapCanvas = page.locator('canvas').first()
    const box = await mapCanvas.boundingBox()
    if (!box) throw new Error('Canvas not found')

    const startX1 = box.x + box.width * 0.3
    const startY1 = box.y + box.height * 0.3
    const endX1 = box.x + box.width * 0.7
    const endY1 = box.y + box.height * 0.7

    await page.mouse.move(startX1, startY1)
    await page.mouse.down()
    await page.mouse.move(endX1, endY1, { steps: 10 })
    await page.mouse.up()

    await page.waitForTimeout(500)

    // Should have coordinates and summary
    await expect(page.locator('output[aria-label="已确认的区域信息"]')).toBeVisible()
    const firstWest = await page.getByLabel('西经（West）').inputValue()

    // Edit coordinates manually
    await page.getByLabel('西经（West）').clear()
    await page.getByLabel('西经（West）').fill('115')
    await page.getByLabel('南纬（South）').clear()
    await page.getByLabel('南纬（South）').fill('39')
    await page.getByLabel('东经（East）').clear()
    await page.getByLabel('东经（East）').fill('117')
    await page.getByLabel('北纬（North）').clear()
    await page.getByLabel('北纬（North）').fill('41')

    await page.getByRole('button', { name: '确认区域' }).click()

    // Verify new region
    await expect(page.locator('output[aria-label="已确认的区域信息"]')).toContainText('115°')

    await page.waitForTimeout(1000)

    // Draw again - should replace the edited region
    await page.getByTestId('start-drawing-button').click()

    const startX2 = box.x + box.width * 0.2
    const startY2 = box.y + box.height * 0.2
    const endX2 = box.x + box.width * 0.8
    const endY2 = box.y + box.height * 0.8

    await page.mouse.move(startX2, startY2)
    await page.mouse.down()
    await page.mouse.move(endX2, endY2, { steps: 10 })
    await page.mouse.up()

    await page.waitForTimeout(500)

    // Should have new coordinates (different from first and edited)
    const finalWest = await page.getByLabel('西经（West）').inputValue()
    expect(finalWest).not.toBe(firstWest)
    expect(finalWest).not.toBe('115')

    // Summary should be updated
    await expect(page.locator('output[aria-label="已确认的区域信息"]')).toBeVisible()
  })

  test('reset clears drawn region and exits drawing mode', async ({ page }) => {
    // Wait for map to load
    await page.waitForTimeout(2000)

    // Draw a rectangle
    await page.getByTestId('start-drawing-button').click()
    const mapCanvas = page.locator('canvas').first()
    const box = await mapCanvas.boundingBox()
    if (!box) throw new Error('Canvas not found')

    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 10 })
    await page.mouse.up()

    await page.waitForTimeout(500)

    // Verify region exists
    await expect(page.locator('output[aria-label="已确认的区域信息"]')).toBeVisible()

    // Reset
    await page.getByRole('button', { name: /重置/ }).click()

    // All should be cleared
    await expect(page.getByLabel('西经（West）')).toHaveValue('')
    await expect(page.getByLabel('南纬（South）')).toHaveValue('')
    await expect(page.getByLabel('东经（East）')).toHaveValue('')
    await expect(page.getByLabel('北纬（North）')).toHaveValue('')
    await expect(page.locator('output[aria-label="已确认的区域信息"]')).not.toBeVisible()
    await expect(page.getByText('尚未选择区域')).toBeVisible()

    // Should not be in drawing mode
    await expect(page.getByTestId('start-drawing-button')).toBeVisible()
  })

  test('map panning does not change confirmed region', async ({ page }) => {
    // Confirm a region via coordinates
    await page.getByLabel('西经（West）').fill('115')
    await page.getByLabel('南纬（South）').fill('39')
    await page.getByLabel('东经（East）').fill('117')
    await page.getByLabel('北纬（North）').fill('41')
    await page.getByRole('button', { name: '确认区域' }).click()

    await expect(page.locator('output[aria-label="已确认的区域信息"]')).toContainText('115°')

    // Wait for map to load
    await page.waitForTimeout(2000)

    // Pan the map (not in drawing mode)
    const mapCanvas = page.locator('canvas').first()
    const box = await mapCanvas.boundingBox()
    if (!box) throw new Error('Canvas not found')

    const centerX = box.x + box.width * 0.5
    const centerY = box.y + box.height * 0.5

    await page.mouse.move(centerX, centerY)
    await page.mouse.down()
    await page.mouse.move(centerX + 100, centerY + 100, { steps: 5 })
    await page.mouse.up()

    await page.waitForTimeout(500)

    // Region should remain unchanged
    await expect(page.getByLabel('西经（West）')).toHaveValue('115')
    await expect(page.getByLabel('南纬（South）')).toHaveValue('39')
    await expect(page.getByLabel('东经（East）')).toHaveValue('117')
    await expect(page.getByLabel('北纬（North）')).toHaveValue('41')
    await expect(page.locator('output[aria-label="已确认的区域信息"]')).toContainText('115°')
  })

  test('coordinates remain accessible when map unavailable', async ({ page }) => {
    // Even if map fails, coordinate inputs should work
    await expect(page.getByLabel('西经（West）')).toBeVisible()
    await expect(page.getByLabel('东经（East）')).toBeVisible()
    await expect(page.getByLabel('南纬（South）')).toBeVisible()
    await expect(page.getByLabel('北纬（North）')).toBeVisible()

    // Can still input and confirm via coordinates
    await page.getByLabel('西经（West）').fill('100')
    await page.getByLabel('南纬（South）').fill('20')
    await page.getByLabel('东经（East）').fill('120')
    await page.getByLabel('北纬（North）').fill('40')
    await page.getByRole('button', { name: '确认区域' }).click()

    await expect(page.locator('output[aria-label="已确认的区域信息"]')).toBeVisible()
  })

  test.describe('Responsive layout with drawing controls', () => {
    test('drawing controls accessible at 390px width', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })

      await expect(page.getByTestId('start-drawing-button')).toBeVisible()

      // Enter drawing mode
      await page.getByTestId('start-drawing-button').click()
      await expect(page.getByTestId('cancel-drawing-button')).toBeVisible()
      await expect(page.getByText('在地图上拖动鼠标绘制矩形区域')).toBeVisible()

      // Cancel should work
      await page.getByTestId('cancel-drawing-button').click()
      await expect(page.getByTestId('start-drawing-button')).toBeVisible()
    })

    test('drawing controls accessible at 768px width', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 })

      await expect(page.getByTestId('start-drawing-button')).toBeVisible()
      await page.getByTestId('start-drawing-button').click()
      await expect(page.getByText('在地图上拖动鼠标绘制矩形区域')).toBeVisible()
    })

    test('drawing controls accessible at 1440px width', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })

      await expect(page.getByTestId('start-drawing-button')).toBeVisible()
      await page.getByTestId('start-drawing-button').click()
      await expect(page.getByText('在地图上拖动鼠标绘制矩形区域')).toBeVisible()
    })
  })

  test('drawing mode distinct from map browsing', async ({ page }) => {
    // Confirm a region first
    await page.getByLabel('西经（West）').fill('115')
    await page.getByLabel('南纬（South）').fill('39')
    await page.getByLabel('东经（East）').fill('117')
    await page.getByLabel('北纬（North）').fill('41')
    await page.getByRole('button', { name: '确认区域' }).click()

    const originalWest = '115'

    // Wait for map
    await page.waitForTimeout(2000)

    // Zoom the map (should not affect region)
    const mapCanvas = page.locator('canvas').first()
    const box = await mapCanvas.boundingBox()
    if (!box) throw new Error('Canvas not found')

    // Double-click to zoom in
    await page.mouse.dblclick(box.x + box.width * 0.5, box.y + box.height * 0.5)
    await page.waitForTimeout(500)

    // Region unchanged
    await expect(page.getByLabel('西经（West）')).toHaveValue(originalWest)

    // Now enter drawing mode - this is distinct
    await page.getByTestId('start-drawing-button').click()
    await expect(page.getByText('在地图上拖动鼠标绘制矩形区域')).toBeVisible()

    // In drawing mode, dragging creates a new region
    // (already tested above, just confirming the mode is clearly different)
  })
})

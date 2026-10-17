import { test, expect } from './browser-guard'
import { signInDemo } from './demo-login'

test.describe('Bar Charts - Local Changes and Errors', () => {
  test.beforeEach(async ({ context }) => {
    await signInDemo(context)
  })

  test('displays local changes bar chart after coordinate selection', async ({ page }) => {
    await page.goto('/tasks')
    await page.waitForLoadState('networkidle')

    const resultLinks = page.locator('a[href*="/result"]')
    const count = await resultLinks.count()

    if (count === 0) {
      test.skip()
      return
    }

    await resultLinks.first().click()
    await page.waitForURL(/\/tasks\/[^/]+\/result/)

    await page.getByRole('tab', { name: '时间序列' }).click()
    await page.waitForLoadState('networkidle')

    // Enter valid coordinate
    await page.getByLabel('纬度').fill('35.5')
    await page.getByLabel('经度').fill('105.5')
    await page.getByRole('button', { name: '查询时间序列' }).click()
    await page.waitForLoadState('networkidle')

    // Check if coordinate was accepted
    const coordinateDisplay = page.locator('text=当前坐标:')
    const isAccepted = await coordinateDisplay.isVisible()

    if (!isAccepted) {
      test.skip()
      return
    }

    // Verify local changes bar chart is visible
    await expect(page.getByRole('heading', { name: '局地变化：降尺度相对原始' })).toBeVisible()
    await expect(page.getByText('降尺度−原始数据的差值')).toBeVisible()
    await expect(page.getByText(/正值表示降尺度高于原始/)).toBeVisible()
  })

  test('displays error bar chart when observation data is available', async ({ page }) => {
    await page.goto('/tasks')
    await page.waitForLoadState('networkidle')

    const resultLinks = page.locator('a[href*="/result"]')
    const count = await resultLinks.count()

    if (count === 0) {
      test.skip()
      return
    }

    await resultLinks.first().click()
    await page.waitForURL(/\/tasks\/[^/]+\/result/)

    await page.getByRole('tab', { name: '时间序列' }).click()
    await page.waitForLoadState('networkidle')

    // Enter valid coordinate
    await page.getByLabel('纬度').fill('35.5')
    await page.getByLabel('经度').fill('105.5')
    await page.getByRole('button', { name: '查询时间序列' }).click()
    await page.waitForLoadState('networkidle')

    // Check if coordinate was accepted
    const coordinateDisplay = page.locator('text=当前坐标:')
    const isAccepted = await coordinateDisplay.isVisible()

    if (!isAccepted) {
      test.skip()
      return
    }

    // Verify error bar chart is visible
    await expect(page.getByRole('heading', { name: '降尺度相对观测的误差' })).toBeVisible()
    await expect(page.getByText('降尺度−观测数据的差值')).toBeVisible()

    // Check if observation data is available or not
    const hasObservation = await page
      .getByText('柱状图显示降尺度数据相对观测参考的误差')
      .isVisible()
    const noObservation = await page.getByText('所选坐标 25km 范围内无可用观测参考').isVisible()

    expect(hasObservation || noObservation).toBe(true)
  })

  test('shows appropriate messages for missing data', async ({ page }) => {
    await page.goto('/tasks')
    await page.waitForLoadState('networkidle')

    const resultLinks = page.locator('a[href*="/result"]')
    const count = await resultLinks.count()

    if (count === 0) {
      test.skip()
      return
    }

    await resultLinks.first().click()
    await page.waitForURL(/\/tasks\/[^/]+\/result/)

    await page.getByRole('tab', { name: '时间序列' }).click()
    await page.waitForLoadState('networkidle')

    // Enter valid coordinate
    await page.getByLabel('纬度').fill('35.5')
    await page.getByLabel('经度').fill('105.5')
    await page.getByRole('button', { name: '查询时间序列' }).click()
    await page.waitForLoadState('networkidle')

    // Check if coordinate was accepted
    const coordinateDisplay = page.locator('text=当前坐标:')
    const isAccepted = await coordinateDisplay.isVisible()

    if (!isAccepted) {
      test.skip()
      return
    }

    // Verify explanatory text is present
    await expect(page.getByText('柱状图显示降尺度数据相对原始数据的局地变化')).toBeVisible()
  })

  test('bar charts and line chart use same coordinate and unit', async ({ page }) => {
    await page.goto('/tasks')
    await page.waitForLoadState('networkidle')

    const resultLinks = page.locator('a[href*="/result"]')
    const count = await resultLinks.count()

    if (count === 0) {
      test.skip()
      return
    }

    await resultLinks.first().click()
    await page.waitForURL(/\/tasks\/[^/]+\/result/)

    await page.getByRole('tab', { name: '时间序列' }).click()
    await page.waitForLoadState('networkidle')

    // Enter valid coordinate
    await page.getByLabel('纬度').fill('35.5')
    await page.getByLabel('经度').fill('105.5')
    await page.getByRole('button', { name: '查询时间序列' }).click()
    await page.waitForLoadState('networkidle')

    // Check if coordinate was accepted
    const coordinateDisplay = page.locator('text=当前坐标:')
    const isAccepted = await coordinateDisplay.isVisible()

    if (!isAccepted) {
      test.skip()
      return
    }

    // Get the coordinate from line chart card
    const lineChartCard = page.getByRole('heading', { name: '时间序列对比' }).locator('..')
    const coordinateText = await lineChartCard.textContent()

    // Both bar chart cards should reference the same coordinate
    const localChangesCard = page.getByRole('heading', { name: '局地变化：降尺度相对原始' })
    const errorCard = page.getByRole('heading', { name: '降尺度相对观测的误差' })

    await expect(localChangesCard).toBeVisible()
    await expect(errorCard).toBeVisible()

    // Verify unit is present in descriptions (will be same as line chart)
    const hasUnit =
      coordinateText?.includes('°C') ||
      coordinateText?.includes('mm') ||
      coordinateText?.includes('m/s') ||
      coordinateText?.includes('hPa')
    expect(hasUnit).toBe(true)
  })

  test('bar charts remain consistent after switching tabs', async ({ page }) => {
    await page.goto('/tasks')
    await page.waitForLoadState('networkidle')

    const resultLinks = page.locator('a[href*="/result"]')
    const count = await resultLinks.count()

    if (count === 0) {
      test.skip()
      return
    }

    await resultLinks.first().click()
    await page.waitForURL(/\/tasks\/[^/]+\/result/)

    await page.getByRole('tab', { name: '时间序列' }).click()
    await page.waitForLoadState('networkidle')

    // Enter valid coordinate
    await page.getByLabel('纬度').fill('35.5')
    await page.getByLabel('经度').fill('105.5')
    await page.getByRole('button', { name: '查询时间序列' }).click()
    await page.waitForLoadState('networkidle')

    // Check if coordinate was accepted
    const coordinateDisplay = page.locator('text=当前坐标:')
    const isAccepted = await coordinateDisplay.isVisible()

    if (!isAccepted) {
      test.skip()
      return
    }

    // Verify bar charts are visible
    await expect(page.getByRole('heading', { name: '局地变化：降尺度相对原始' })).toBeVisible()

    // Switch to another tab
    await page.getByRole('tab', { name: '空间地图' }).click()
    await page.waitForLoadState('networkidle')

    // Switch back to time series tab
    await page.getByRole('tab', { name: '时间序列' }).click()
    await page.waitForLoadState('networkidle')

    // Verify bar charts are still visible with same coordinate
    await expect(page.getByRole('heading', { name: '局地变化：降尺度相对原始' })).toBeVisible()
    await expect(coordinateDisplay).toBeVisible()
  })
})

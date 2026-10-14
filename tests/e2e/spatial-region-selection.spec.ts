import { test, expect } from './browser-guard'
import { signInDemo } from './demo-login'

test.describe('Spatial Region Selection', () => {
  test.beforeEach(async ({ page, context }) => {
    await signInDemo(context, 'researcher')
    await page.goto('/tasks/new')
    await expect(page.getByRole('heading', { name: '空间区域选择' })).toBeVisible()
  })

  test('shows coordinate inputs with clear labels', async ({ page }) => {
    await expect(page.getByLabel('西经（West）')).toBeVisible()
    await expect(page.getByLabel('东经（East）')).toBeVisible()
    await expect(page.getByLabel('南纬（South）')).toBeVisible()
    await expect(page.getByLabel('北纬（North）')).toBeVisible()
    await expect(page.getByRole('button', { name: '确认区域' })).toBeVisible()
    await expect(page.getByRole('button', { name: /重置/ })).toBeVisible()
  })

  test('confirms valid coordinates and shows region summary', async ({ page }) => {
    // Beijing area
    await page.getByLabel('西经（West）').fill('115.5')
    await page.getByLabel('南纬（South）').fill('39.5')
    await page.getByLabel('东经（East）').fill('116.5')
    await page.getByLabel('北纬（North）').fill('40.5')

    await page.getByRole('button', { name: '确认区域' }).click()

    // Check confirmed region summary appears
    const summary = page.locator('output[aria-label="已确认的区域信息"]')
    await expect(summary).toBeVisible()
    await expect(summary).toContainText('115.5°')
    await expect(summary).toContainText('116.5°')
    await expect(summary).toContainText('39.5°')
    await expect(summary).toContainText('40.5°')
    await expect(summary).toContainText('约')
    await expect(summary).toContainText('km')
  })

  test('shows error for longitude out of bounds', async ({ page }) => {
    await page.getByLabel('西经（West）').fill('-181')
    await page.getByLabel('南纬（South）').fill('20')
    await page.getByLabel('东经（East）').fill('120')
    await page.getByLabel('北纬（North）').fill('40')

    await page.getByRole('button', { name: '确认区域' }).click()

    await expect(page.getByRole('alert')).toContainText('180')
  })

  test('shows error for latitude out of bounds', async ({ page }) => {
    await page.getByLabel('西经（West）').fill('100')
    await page.getByLabel('南纬（South）').fill('-91')
    await page.getByLabel('东经（East）').fill('120')
    await page.getByLabel('北纬（North）').fill('40')

    await page.getByRole('button', { name: '确认区域' }).click()

    await expect(page.getByRole('alert')).toContainText('90')
  })

  test('shows error for west >= east', async ({ page }) => {
    await page.getByLabel('西经（West）').fill('120')
    await page.getByLabel('南纬（South）').fill('20')
    await page.getByLabel('东经（East）').fill('100')
    await page.getByLabel('北纬（North）').fill('40')

    await page.getByRole('button', { name: '确认区域' }).click()

    const alerts = page.getByRole('alert')
    await expect(alerts.first()).toBeVisible()
    await expect(alerts.first()).toContainText('日期变更线')
  })

  test('shows error for south >= north', async ({ page }) => {
    await page.getByLabel('西经（West）').fill('100')
    await page.getByLabel('南纬（South）').fill('40')
    await page.getByLabel('东经（East）').fill('120')
    await page.getByLabel('北纬（North）').fill('20')

    await page.getByRole('button', { name: '确认区域' }).click()

    await expect(page.getByRole('alert').first()).toContainText('南纬必须小于北纬')
  })

  test('shows error for dateline-crossing region', async ({ page }) => {
    await page.getByLabel('西经（West）').fill('170')
    await page.getByLabel('南纬（South）').fill('20')
    await page.getByLabel('东经（East）').fill('-170')
    await page.getByLabel('北纬（North）').fill('40')

    await page.getByRole('button', { name: '确认区域' }).click()

    await expect(page.getByRole('alert').first()).toContainText('日期变更线')
  })

  test('clears error when user starts correcting input', async ({ page }) => {
    // Enter invalid data
    await page.getByLabel('西经（West）').fill('-181')
    await page.getByLabel('南纬（South）').fill('20')
    await page.getByLabel('东经（East）').fill('120')
    await page.getByLabel('北纬（North）').fill('40')

    await page.getByRole('button', { name: '确认区域' }).click()

    await expect(page.getByRole('alert')).toBeVisible()

    // Start correcting
    await page.getByLabel('西经（West）').clear()
    await page.getByLabel('西经（West）').fill('100')

    // Error should disappear for that field
    await expect(page.getByText('西经必须在 -180 到 180 之间')).not.toBeVisible()
  })

  test('preserves confirmed region when entering new invalid input', async ({ page }) => {
    // Confirm valid region
    await page.getByLabel('西经（West）').fill('100')
    await page.getByLabel('南纬（South）').fill('20')
    await page.getByLabel('东经（East）').fill('120')
    await page.getByLabel('北纬（North）').fill('40')
    await page.getByRole('button', { name: '确认区域' }).click()

    await expect(page.locator('output[aria-label="已确认的区域信息"]')).toContainText('100°')

    // Try to enter invalid data
    await page.getByLabel('西经（West）').clear()
    await page.getByLabel('西经（West）').fill('200')
    await page.getByRole('button', { name: '确认区域' }).click()

    // Should show error but preserve old confirmed region
    await expect(page.getByRole('alert')).toContainText('180')
    await expect(page.locator('output[aria-label="已确认的区域信息"]')).toContainText('100°')
  })

  test('resets clears all inputs and confirmed region', async ({ page }) => {
    // Confirm region
    await page.getByLabel('西经（West）').fill('100')
    await page.getByLabel('南纬（South）').fill('20')
    await page.getByLabel('东经（East）').fill('120')
    await page.getByLabel('北纬（North）').fill('40')
    await page.getByRole('button', { name: '确认区域' }).click()

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
  })

  test('supports keyboard-only operation', async ({ page }) => {
    // Focus the first input directly
    await page.getByLabel('西经（West）').focus()
    await expect(page.getByLabel('西经（West）')).toBeFocused()

    await page.keyboard.type('100')
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('东经（East）')).toBeFocused()

    await page.keyboard.type('120')
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('南纬（South）')).toBeFocused()

    await page.keyboard.type('20')
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('北纬（North）')).toBeFocused()

    await page.keyboard.type('40')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: '确认区域' })).toBeFocused()

    await page.keyboard.press('Enter')

    await expect(page.locator('output[aria-label="已确认的区域信息"]')).toContainText('100°')
  })

  test('handles transient input like negative signs', async ({ page }) => {
    const westInput = page.getByLabel('西经（West）')

    await westInput.fill('-')
    // Transient input should not cause errors or confirmation
    await expect(page.getByRole('alert')).not.toBeVisible()
    await expect(page.locator('output[aria-label="已确认的区域信息"]')).not.toBeVisible()

    await westInput.fill('-100')
    await page.getByLabel('南纬（South）').fill('-30')
    await page.getByLabel('东经（East）').fill('120')
    await page.getByLabel('北纬（North）').fill('40')
    await page.getByRole('button', { name: '确认区域' }).click()

    await expect(page.locator('output[aria-label="已确认的区域信息"]')).toContainText('-100°')
    await expect(page.locator('output[aria-label="已确认的区域信息"]')).toContainText('-30°')
  })

  test.describe('Responsive layout', () => {
    test('displays correctly at 390px width', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })

      await expect(page.getByRole('heading', { name: '空间区域选择' })).toBeVisible()
      await expect(page.getByLabel('西经（West）')).toBeVisible()
      await expect(page.getByRole('button', { name: '确认区域' })).toBeVisible()

      // Confirm a region
      await page.getByLabel('西经（West）').fill('100')
      await page.getByLabel('南纬（South）').fill('20')
      await page.getByLabel('东经（East）').fill('120')
      await page.getByLabel('北纬（North）').fill('40')
      await page.getByRole('button', { name: '确认区域' }).click()

      // Summary should be readable
      const summary = page.locator('output[aria-label="已确认的区域信息"]')
      await expect(summary).toBeVisible()
      await expect(summary.getByText(/约.*km/)).toBeVisible()
    })

    test('displays correctly at 768px width', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 })

      await expect(page.getByRole('heading', { name: '空间区域选择' })).toBeVisible()
      await page.getByLabel('西经（West）').fill('100')
      await page.getByLabel('南纬（South）').fill('20')
      await page.getByLabel('东经（East）').fill('120')
      await page.getByLabel('北纬（North）').fill('40')
      await page.getByRole('button', { name: '确认区域' }).click()

      await expect(page.locator('output[aria-label="已确认的区域信息"]')).toContainText('km')
    })

    test('displays correctly at 1440px width', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })

      await expect(page.getByRole('heading', { name: '空间区域选择' })).toBeVisible()
      await page.getByLabel('西经（West）').fill('100')
      await page.getByLabel('南纬（South）').fill('20')
      await page.getByLabel('东经（East）').fill('120')
      await page.getByLabel('北纬（North）').fill('40')
      await page.getByRole('button', { name: '确认区域' }).click()

      await expect(page.locator('output[aria-label="已确认的区域信息"]')).toContainText('km')
    })
  })
})

import fs from 'node:fs/promises'
import { test, expect } from './browser-guard'
import { selectSmallExport, setupExportTab } from './helpers/export-test-helpers'

test.describe('Data Export current selection controls', () => {
  test('preserves the full task and presents useful limits instead of silently cropping', async ({
    page,
  }) => {
    await setupExportTab(page)
    await expect(page.getByLabel('西经 (°E)', { exact: true })).toHaveValue('10')
    await expect(page.getByLabel('东经 (°E)', { exact: true })).toHaveValue('12')
    await expect(page.getByLabel('结束时间 (UTC，不包含)', { exact: true })).toHaveValue(
      '2024-01-04T00:00',
    )
    await expect(page.getByLabel('时间粒度', { exact: true })).toHaveValue('hourly')
    await expect(page.getByLabel('估算状态')).toContainText('BBOX_TOO_LARGE')
    await expect(page.getByRole('button', { name: '下载 CSV 文件', exact: true })).toBeDisabled()
    await expect(page.getByRole('radio', { name: /NetCDF/ })).toBeVisible()
    await expect(page.getByText(/地图不可用：未配置 Mapbox/)).toBeVisible()
    await selectSmallExport(page)
    await expect(page.getByRole('button', { name: '下载 CSV 文件', exact: true })).toBeEnabled()
    await expect(page.getByRole('region', { name: '数据量估算' })).toContainText('文件大小为约数')
  })

  test('clears every old estimate immediately when native coordinate/time controls become invalid', async ({
    page,
  }) => {
    await setupExportTab(page)
    await selectSmallExport(page)
    await page.getByLabel('西经 (°E)', { exact: true }).fill('')
    await expect(page.getByLabel('估算状态')).toContainText('INVALID_REGION')
    await expect(page.getByRole('region', { name: '数据量估算' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '下载 CSV 文件', exact: true })).toBeDisabled()
    await page.getByLabel('西经 (°E)', { exact: true }).fill('9.9')
    await expect(page.getByLabel('估算状态')).toContainText('REGION_OUTSIDE_TASK')
    await page.getByLabel('西经 (°E)', { exact: true }).fill('10')
    await page.getByLabel('开始时间 (UTC，包含)', { exact: true }).fill('2024-01-01T00:30')
    await expect(page.getByLabel('估算状态')).toContainText('INVALID_TIME_RANGE')
    await expect(page.getByRole('region', { name: '数据量估算' })).toHaveCount(0)
    await page.getByLabel('开始时间 (UTC，包含)', { exact: true }).fill('2024-01-01T00:00')
    await expect(page.getByRole('button', { name: '下载 CSV 文件', exact: true })).toBeEnabled()
  })

  test('offers daily UTC temperature and rain without enabling daily wind or pressure', async ({
    page,
  }) => {
    await setupExportTab(page)
    await selectSmallExport(page)
    await page.getByLabel('时间粒度', { exact: true }).selectOption('daily')
    await expect(page.getByLabel('估算状态')).toContainText('INVALID_TIME_RANGE')
    await page.getByLabel('结束时间 (UTC，不包含)', { exact: true }).fill('2024-01-02T00:00')
    await expect(page.getByLabel('估算状态')).toHaveText('当前选择估算已更新。')
    await expect(page.getByText(/气温逐日为 UTC 日均值/)).toBeVisible()
    await setupExportTab(page, 'wind')
    await expect(
      page.getByLabel('时间粒度', { exact: true }).locator('option[value="daily"]'),
    ).toBeDisabled()
  })

  for (const width of [390, 768, 1440]) {
    for (const reducedMotion of ['no-preference', 'reduce'] as const) {
      test(`readable ${width}px ${reducedMotion} controls and keyboard recovery`, async ({
        page,
      }) => {
        // Open at desktop width using the common public navigation; then inspect the actual export surface.
        await setupExportTab(page)
        await page.setViewportSize({ width, height: 900 })
        await page.emulateMedia({ reducedMotion })
        await expect(page.getByLabel('估算状态')).toContainText('BBOX_TOO_LARGE')
        await page.getByLabel('西经 (°E)', { exact: true }).focus()
        await expect(page.getByLabel('西经 (°E)', { exact: true })).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(page.getByLabel('东经 (°E)', { exact: true })).toBeFocused()
        await selectSmallExport(page)
        const format = page.getByRole('radio', { name: /NetCDF/ })
        await format.focus()
        await page.keyboard.press('Space')
        await expect(format).toBeChecked()
        await expect(
          page.getByRole('button', { name: '下载 NetCDF 文件', exact: true }),
        ).toBeEnabled()
        const panel = page.getByRole('tabpanel', { name: '数据导出', exact: true })
        const geometry = await panel.evaluate((element) => ({
          scroll: element.scrollWidth,
          width: element.clientWidth,
        }))
        expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1)
        for (const label of [
          '西经 (°E)',
          '东经 (°E)',
          '开始时间 (UTC，包含)',
          '结束时间 (UTC，不包含)',
          '时间粒度',
        ]) {
          const box = await page.getByLabel(label, { exact: true }).boundingBox()
          expect(box?.width).toBeGreaterThan(100)
        }
        const evidence =
          '/Users/xiaoyu/Projects/meteo-weave/.git/agent-runs/spec13-20261019-review-fixes/visual-final'
        await fs.mkdir(evidence, { recursive: true })
        const stem = `${evidence}/export-${width}-${reducedMotion}`
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.screenshot({ path: `${stem}-fullpage.png`, fullPage: true })
        await page.screenshot({ path: `${stem}-top.png` })
        await page.getByLabel('西经 (°E)', { exact: true }).focus()
        await page.keyboard.press('Tab')
        await expect(page.getByLabel('东经 (°E)', { exact: true })).toBeFocused()
        await page.screenshot({ path: `${stem}-keyboard.png` })
        await page.getByRole('button', { name: '下载 NetCDF 文件', exact: true }).focus()
        await expect(
          page.getByRole('button', { name: '下载 NetCDF 文件', exact: true }),
        ).toBeFocused()
        await page.screenshot({ path: `${stem}-bottom.png` })
      })
    }
  }
})

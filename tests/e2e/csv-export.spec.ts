import { test, expect } from './browser-guard'
import { submitDemoLogin } from './demo-login'
import {
  downloadCsvRecords,
  downloadExport,
  holdNextExportResponse,
  selectSmallExport,
  setupExportTab,
} from './helpers/export-test-helpers'

test.describe('Data Export text lifecycle', () => {
  test('downloads and verifies CSV records with the current exact estimate', async ({ page }) => {
    const taskId = await setupExportTab(page)
    await selectSmallExport(page)
    const { download, recordCount } = await downloadExport(page, 'csv')
    const records = await downloadCsvRecords(download)
    expect(records).toHaveLength(recordCount)
    expect(records[0]).toMatchObject({
      taskId,
      dataType: 'downscaled',
      variable: 'temperature',
      unit: '°C',
    })
    expect(Number(records[0]?.longitude)).toBeCloseTo(10, 9)
    expect(Number(records[0]?.latitude)).toBeCloseTo(46, 9)
    expect(records[0]?.time).toBe('2024-01-01T00:00:00.000Z')
    expect(download.suggestedFilename()).toMatch(/\.csv$/)
  })

  test('cancels a held real generation and ignores its late file before a successful retry', async ({
    page,
    expectedSessionTransportFailures,
  }) => {
    await setupExportTab(page)
    await selectSmallExport(page)
    const held = await holdNextExportResponse(page, expectedSessionTransportFailures)
    const downloads: string[] = []
    page.on('download', (download) => downloads.push(download.suggestedFilename()))
    await page.getByRole('button', { name: '下载 CSV 文件', exact: true }).click()
    await held.ready
    await expect(page.getByLabel('导出阶段')).toContainText('正在读取并编码 CSV')
    await expect(page.getByRole('progressbar')).toHaveCount(0)
    await page.getByRole('button', { name: '取消导出', exact: true }).click()
    await expect(page.getByLabel('导出阶段')).toContainText('导出已取消，未提交浏览器下载')
    held.release()
    await held.finished
    await held.dispose()
    expect(downloads).toEqual([])
    const { download, recordCount } = await downloadExport(page, 'csv')
    expect(await downloadCsvRecords(download)).toHaveLength(recordCount)
    expect(downloads).toHaveLength(1)
  })

  test('does not publish an old file after format and time selection changes', async ({
    page,
    expectedSessionTransportFailures,
  }) => {
    await setupExportTab(page)
    await selectSmallExport(page)
    const held = await holdNextExportResponse(page, expectedSessionTransportFailures)
    const downloads: string[] = []
    page.on('download', (download) => downloads.push(download.suggestedFilename()))
    await page.getByRole('button', { name: '下载 CSV 文件', exact: true }).click()
    await held.ready
    await page.getByRole('radio', { name: /GeoJSON/ }).check()
    await page.getByLabel('结束时间 (UTC，不包含)', { exact: true }).fill('2024-01-01T01:00')
    held.release()
    await held.finished
    await held.dispose()
    await expect(page.getByRole('button', { name: '下载 GeoJSON 文件', exact: true })).toBeEnabled()
    expect(downloads).toEqual([])
    await downloadExport(page, 'geojson')
    expect(downloads).toHaveLength(1)
    expect(downloads[0]).toMatch(/\.geojson$/)
  })

  test('transport failure shows recovery and retries once with displayed parameters', async ({
    page,
    expectedSessionTransportFailures,
  }) => {
    await setupExportTab(page)
    await selectSmallExport(page)
    let failed = false
    await page.route('**/_serverFn/**', async (route) => {
      if (route.request().method() !== 'POST' || failed) return route.continue()
      failed = true
      expectedSessionTransportFailures.add(route.request().url())
      await route.fulfill({
        status: 503,
        contentType: 'text/plain',
        body: '导出传输暂时不可用，请重试。',
      })
    })
    const downloads: string[] = []
    page.on('download', (download) => downloads.push(download.suggestedFilename()))
    await page.getByRole('button', { name: '下载 CSV 文件', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText(/EXPORT_FAILED/)
    expect(downloads).toEqual([])
    await expect(page.getByRole('button', { name: '重试导出', exact: true })).toBeEnabled()
    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: '重试导出', exact: true }).dblclick()
    const download = await downloading
    const records = await downloadCsvRecords(download)
    expect(records[0]?.time).toBe('2024-01-01T00:00:00.000Z')
    await expect(page.getByLabel('导出阶段')).toContainText('已发起浏览器下载')
    expect(downloads).toHaveLength(1)
  })

  test('route exit and a new account cannot receive an old held download', async ({
    page,
    expectedSessionTransportFailures,
  }) => {
    await setupExportTab(page)
    await selectSmallExport(page)
    const held = await holdNextExportResponse(page, expectedSessionTransportFailures)
    const downloads: string[] = []
    page.on('download', (download) => downloads.push(download.suggestedFilename()))
    await page.getByRole('button', { name: '下载 CSV 文件', exact: true }).click()
    await held.ready
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: 'Dashboard', exact: true })
      .click()
    await expect(page).toHaveURL('/dashboard')
    held.release()
    await held.finished
    await held.dispose()
    await page.getByRole('button', { name: '退出登录', exact: true }).click()
    await expect(page).toHaveURL('/login')
    await submitDemoLogin(page, 'policy')
    await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('policy')
    expect(downloads).toEqual([])
  })
})

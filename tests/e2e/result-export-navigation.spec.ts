import { expect, test } from './browser-guard'
import { setupExportTab } from './helpers/export-test-helpers'

test('public task detail opens result export and survives direct entry and refresh', async ({
  page,
}) => {
  const taskId = await setupExportTab(page)
  const resultPath = `/tasks/${taskId}/result`
  await expect.poll(() => decodeURIComponent(new URL(page.url()).pathname)).toBe(resultPath)
  await expect(page.getByRole('heading', { name: '结果分析', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '查看结果分析', exact: true })).toHaveCount(0)
  await page.goto(page.url())
  await expect(page.getByRole('heading', { name: '结果分析', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '数据导出', exact: true }).click()
  await expect(page.getByRole('tabpanel', { name: '数据导出', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '结果分析', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '数据导出', exact: true }).click()
  await expect(page.getByRole('tabpanel', { name: '数据导出', exact: true })).toBeVisible()
})

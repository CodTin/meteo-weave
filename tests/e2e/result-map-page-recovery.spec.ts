import { expect, test } from './browser-guard'
import { resultMap, setupResultMapPage } from './helpers/result-map-page'
import { resultMapEvidence } from './helpers/result-map-evidence'

test('same-route A to missing B settles as a recoverable error, then A loads without stale errors', async ({
  page,
}, testInfo) => {
  const evidence = resultMapEvidence(testInfo)
  const { url: originalUrl } = await setupResultMapPage(page)
  await expect(resultMap(page, 'original').getByRole('img').first()).toBeVisible()
  // Browser history is the real public navigation boundary; no task/loader state is injected.
  await page.evaluate(() =>
    window.history.pushState(null, '', '/tasks/missing-spec15-review/result'),
  )
  await expect(page).toHaveURL(/\/tasks\/missing-spec15-review\/result/)
  await expect(page.getByText('任务未找到', { exact: true })).toBeVisible({ timeout: 5000 })
  await expect(page.getByText('加载结果分析中...', { exact: true })).toHaveCount(0)
  await expect(resultMap(page, 'original')).toHaveCount(0)
  await evidence.capture(page, 'missing-task-settled-error')
  await page.getByRole('button', { name: '返回任务列表', exact: true }).click()
  await expect(page.getByRole('heading', { name: '任务管理', exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', {
      name: '查看任务 Synthetic Demo · Alpine mountain temperature',
      exact: true,
    }),
  ).toBeVisible()
  await page.evaluate((url) => window.history.pushState(null, '', url), originalUrl)
  await expect(resultMap(page, 'original').getByRole('img').first()).toBeVisible()
  await expect(page.getByText('任务未找到', { exact: true })).toHaveCount(0)
  await evidence.capture(page, 'recovered-original-task')
})

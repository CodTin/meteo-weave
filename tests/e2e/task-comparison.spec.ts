import { expect, test, type Page } from './browser-guard'
import { signInDemo } from './demo-login'
import { compareCase } from './workspace-cases'

test('missing and duplicate selections explain recovery through task management', async ({
  context,
  page,
}) => {
  await signInDemo(context)
  for (const search of ['', '?a=one&b=one']) {
    await page.goto(`${compareCase.path}${search}`)
    await expect(page.getByRole('heading', { name: compareCase.title, exact: true })).toBeVisible()
    await expect(page.getByRole('alert')).toContainText('请选择两个不同且已完成的任务')
    await expect(page.getByRole('table')).toHaveCount(0)
    await expect(page.getByRole('region', { name: '共同样本精度指标' })).toHaveCount(0)
    await page.getByRole('link', { name: '返回任务管理', exact: true }).click()
    await expect(page).toHaveURL('/tasks')
    await expect(page.getByRole('heading', { name: '任务管理', exact: true })).toBeVisible()
  }
})

test('opens the real ordered catalog pair with full parameters and independent map fields', async ({
  context,
  page,
}) => {
  await signInDemo(context)
  await page.goto('/tasks')
  const a = 'Synthetic Demo · Coastal plain wind ensemble'
  const b = 'Synthetic Demo · Alpine mountain temperature'
  await page.getByRole('checkbox', { name: `选择任务 ${a} 进行对比`, exact: true }).check()
  await page.getByRole('checkbox', { name: `选择任务 ${b} 进行对比`, exact: true }).check()
  await page.getByRole('link', { name: '对比所选任务', exact: true }).click()
  const target = new URL(page.url())
  expect(target.pathname).toBe(compareCase.path)
  expect(target.searchParams.get('a')).toBe('demo-v1:researcher:coastal-wind')
  expect(target.searchParams.get('b')).toBe('demo-v1:researcher:alpine-temperature')
  const identities = page.getByRole('region', { name: '对比任务身份', exact: true })
  await expect(identities).toContainText(`A · ${a}`)
  await expect(identities).toContainText(`B · ${b}`)
  await expect(
    page.getByRole('table', { name: '完整配置参数差异，A／B 对应选择顺序' }),
  ).toBeVisible()
  for (const label of [
    '数据源',
    '气象变量与单位',
    '空间范围',
    '时间模式',
    '时间范围（UTC）',
    '时间粒度／降水累计区间',
    '请求方法',
    '实际方法',
    '目标分辨率',
    '集合成员数',
    '高级参数',
    '创建时间（UTC）',
  ]) {
    await expect(page.getByRole('rowheader', { name: label, exact: true })).toBeVisible()
  }
  await expect(page.getByRole('img', { name: /实际样本空间场/ })).toHaveCount(2)
  await expect(page.getByRole('main')).toContainText('气象变量不同，不能直接比较精度数值')
  await expect(page.getByRole('region', { name: '共同样本精度指标' })).toHaveCount(0)
  const href = page.url()
  await page.reload()
  await expect(identities).toContainText(`A · ${a}`)
  await expect(identities).toContainText(`B · ${b}`)
  expect(page.url()).toBe(href)
})

async function submitComparisonTask(page: Page, name: string, probabilistic: boolean) {
  await page.goto('/tasks/new')
  await page.getByLabel('任务名称', { exact: true }).fill(name)
  await page.getByLabel('开始日期', { exact: true }).fill('2024-06-15')
  await page.getByLabel('结束日期', { exact: true }).fill('2024-06-15')
  await page.locator('#resolution').selectOption(probabilistic ? '5km' : '1km')
  await page
    .getByRole('radio', { name: probabilistic ? '概率式方法' : '确定性方法', exact: true })
    .check()
  if (probabilistic) await page.getByRole('radio', { name: '5 个成员', exact: true }).check()
  for (const [label, value] of [
    ['西经（West）', '110'],
    ['东经（East）', '111'],
    ['南纬（South）', '30'],
    ['北纬（North）', '31'],
  ])
    await page.getByLabel(label!, { exact: true }).fill(value!)
  await page.getByRole('button', { name: '确认区域', exact: true }).click()
  await page.getByRole('button', { name: '提交降尺度任务', exact: true }).click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  await expect(
    page.getByText('任务已完成 · Synthetic Demo 演示结果', { exact: true }),
  ).toBeVisible()
  return decodeURIComponent(new URL(page.url()).pathname.split('/').at(-1)!)
}

test('two real form-created tasks show shared fields and recalculated common-reference metrics', async ({
  context,
  page,
}) => {
  await signInDemo(context)
  const a = await submitComparisonTask(page, '共同参考 A 确定性', false)
  const b = await submitComparisonTask(page, '共同参考 B 概率式', true)
  await page.goto('/tasks')
  for (const name of ['共同参考 A 确定性', '共同参考 B 概率式'])
    await page.getByRole('checkbox', { name: `选择任务 ${name} 进行对比`, exact: true }).check()
  await page.getByRole('link', { name: '对比所选任务', exact: true }).click()
  expect(new URL(page.url()).searchParams.get('a')).toBe(a)
  expect(new URL(page.url()).searchParams.get('b')).toBe(b)
  const metrics = page.getByRole('region', { name: '共同样本精度指标', exact: true })
  await expect(metrics).toContainText('n = 8')
  await expect(metrics).toContainText('RMSE')
  await expect(metrics).toContainText('MAE')
  await expect(metrics).toContainText('R²')
  await expect(page.getByRole('main')).toContainText('共同有效台站：4')
  await expect(page.getByRole('main')).toContainText('2024-06-14T16:00:00.000Z')
  await expect(page.getByRole('main')).toContainText('2024-06-15T16:00:00.000Z')
  await expect(page.getByRole('main')).toContainText('referenceSeed：1729')
  await expect(page.getByRole('main')).toContainText('共享绝对色阶')
  await expect(page.getByRole('img', { name: /实际样本空间场/ })).toHaveCount(2)
  await expect(
    page
      .getByRole('row')
      .filter({ has: page.getByRole('rowheader', { name: '目标分辨率', exact: true }) }),
  ).toContainText('不同')
  await page.reload()
  await expect(metrics).toContainText('n = 8')
  await expect(page.getByRole('region', { name: '对比任务身份', exact: true })).toContainText(a)
  await expect(page.getByRole('region', { name: '对比任务身份', exact: true })).toContainText(b)
})

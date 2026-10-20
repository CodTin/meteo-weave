import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './browser-guard'
import { signInDemo } from './demo-login'
import { exportExamples } from './helpers/export-test-helpers'

const alpine = exportExamples.temperature.name
const coastal = exportExamples.wind.name
const plateau = exportExamples.pressure.name

// The authority confirms the real task-management page as the selection seam.
test.describe('Task comparison selection', () => {
  test.beforeEach(async ({ context, page }) => {
    await signInDemo(context)
    await page.goto('/tasks')
    await expect(page.getByRole('cell', { name: alpine, exact: true })).toBeVisible()
  })

  test('keeps a stable two-task pair and explains a third selection', async ({ page }) => {
    const selection = page.getByRole('region', { name: '任务对比选择', exact: true })
    const action = page.getByRole('region', { name: '任务对比操作', exact: true })
    const compare = action.getByRole('link', { name: '对比所选任务', exact: true })
    const first = page.getByRole('checkbox', { name: `选择任务 ${coastal} 进行对比`, exact: true })
    const second = page.getByRole('checkbox', { name: `选择任务 ${plateau} 进行对比`, exact: true })
    const third = page.getByRole('checkbox', { name: `选择任务 ${alpine} 进行对比`, exact: true })

    await expect(selection.getByRole('status')).toHaveText('已选择 0 / 2 个任务')
    await expect(action).toHaveCount(0)
    await first.check()
    await expect(selection.getByRole('status')).toHaveText('已选择 1 / 2 个任务')
    await expect(selection).toContainText(coastal)
    await expect(action).toHaveCount(0)

    await second.check()
    await expect(selection.getByRole('status')).toHaveText('已选择 2 / 2 个任务')
    const selected = selection.getByRole('list', { name: '已选择的对比任务' }).getByRole('listitem')
    await expect(selected).toHaveCount(2)
    await expect(selected.nth(0)).toContainText(`A · ${coastal}`)
    await expect(selected.nth(1)).toContainText(`B · ${plateau}`)
    await expect(action).toContainText('已选择 2 / 2 个任务')
    await expect(action).toContainText(coastal)
    await expect(action).toContainText(plateau)
    await expect(compare).toBeVisible()
    const href = await compare.getAttribute('href')
    expect(href).not.toBeNull()
    const target = new URL(href!, page.url())
    expect(target.pathname).toBe('/tasks/compare')
    expect(target.searchParams.get('a')).toBe('demo-v1:researcher:coastal-wind')
    expect(target.searchParams.get('b')).toBe('demo-v1:researcher:plateau-pressure')

    // A rejected click is observable; setChecked would throw when rejection is correct.
    await third.click()
    await expect(third).not.toBeChecked()
    await expect(first).toBeChecked()
    await expect(second).toBeChecked()
    await expect(selection.getByRole('status')).toHaveText('已选择 2 / 2 个任务')
    await expect(selection.getByRole('alert')).toContainText('请先取消一个已选任务')
    await expect(compare).toHaveAttribute('href', href!)
  })

  test('retains selection across table/card/filter changes and can remove hidden tasks', async ({
    page,
  }) => {
    const selection = page.getByRole('region', { name: '任务对比选择', exact: true })
    const compare = page.getByRole('link', { name: '对比所选任务', exact: true })
    const first = page.getByRole('checkbox', { name: `选择任务 ${plateau} 进行对比`, exact: true })
    const second = page.getByRole('checkbox', { name: `选择任务 ${coastal} 进行对比`, exact: true })

    await first.check()
    await page.getByRole('button', { name: '卡片视图', exact: true }).click()
    await expect(first).toBeChecked()
    await second.check()
    const href = await compare.getAttribute('href')
    await page.getByRole('button', { name: '表格视图', exact: true }).click()
    await page.getByRole('button', { name: '按任务名称排序', exact: true }).click()
    await expect(first).toBeChecked()
    await expect(second).toBeChecked()
    await expect(compare).toHaveAttribute('href', href!)

    await page.getByLabel('任务名称搜索', { exact: true }).fill('Alpine')
    await expect(first).toHaveCount(0)
    await expect(second).toHaveCount(0)
    const hidden = selection.getByRole('list', { name: '已选择的对比任务' }).getByRole('listitem')
    await expect(hidden.nth(0)).toContainText(plateau)
    await expect(hidden.nth(1)).toContainText(coastal)
    await expect(hidden.nth(0)).toContainText('当前筛选或分页隐藏')
    await expect(hidden.nth(1)).toContainText('当前筛选或分页隐藏')
    await expect(compare).toHaveAttribute('href', href!)

    await selection.getByRole('button', { name: `移除对比任务 ${plateau}`, exact: true }).click()
    await expect(selection.getByRole('status')).toHaveText('已选择 1 / 2 个任务')
    await expect(compare).toHaveCount(0)
    await expect(selection).not.toContainText(plateau)
    await expect(selection).toContainText(coastal)
    await selection.getByRole('button', { name: '清除对比选择', exact: true }).click()
    await expect(selection.getByRole('status')).toHaveText('已选择 0 / 2 个任务')
    await expect(selection.getByRole('list')).toHaveCount(0)

    await page.getByRole('button', { name: '清除所有筛选', exact: true }).click()
    await expect(first).not.toBeChecked()
    await expect(second).not.toBeChecked()
    await page.getByRole('button', { name: '卡片视图', exact: true }).click()
    await expect(first).not.toBeChecked()
    await second.check()
    await second.uncheck()
    await expect(selection.getByRole('status')).toHaveText('已选择 0 / 2 个任务')
  })

  test('removes deleted selections from the real table/card list without a stale floating action', async ({
    page,
  }) => {
    const selection = page.getByRole('region', { name: '任务对比选择', exact: true })
    const action = page.getByRole('region', { name: '任务对比操作', exact: true })
    const first = page.getByRole('checkbox', { name: `选择任务 ${alpine} 进行对比`, exact: true })
    const second = page.getByRole('checkbox', { name: `选择任务 ${coastal} 进行对比`, exact: true })
    await first.check()
    await second.check()
    await expect(action).toBeVisible()

    await page.getByRole('button', { name: `删除任务 ${alpine}`, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '确认删除任务', exact: true })
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(first).toBeChecked()
    await expect(action).toBeVisible()
    await page.getByRole('button', { name: `删除任务 ${alpine}`, exact: true }).click()
    await dialog.getByRole('button', { name: '删除', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(first).toHaveCount(0)
    await expect(selection.getByRole('status')).toHaveText('已选择 1 / 2 个任务')
    await expect(selection).not.toContainText(alpine)
    await expect(second).toBeChecked()
    await expect(action).toHaveCount(0)

    await page.getByRole('button', { name: '卡片视图', exact: true }).click()
    await page.getByRole('checkbox', { name: `选择任务 ${plateau} 进行对比`, exact: true }).check()
    await expect(action).toBeVisible()
    await page.getByRole('button', { name: `删除任务 ${coastal}`, exact: true }).click()
    await dialog.getByRole('button', { name: '删除', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(second).toHaveCount(0)
    await expect(selection.getByRole('status')).toHaveText('已选择 1 / 2 个任务')
    await expect(selection).not.toContainText(coastal)
    await expect(action).toHaveCount(0)
    await page.getByRole('button', { name: '表格视图', exact: true }).click()
    await expect(page.getByRole('cell', { name: alpine, exact: true })).toHaveCount(0)
    await expect(page.getByRole('cell', { name: coastal, exact: true })).toHaveCount(0)
  })

  test('keeps selection and the floating action readable at 390/768/1440px with inner table scrolling', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000)
    const selection = page.getByRole('region', { name: '任务对比选择', exact: true })
    const action = page.getByRole('region', { name: '任务对比操作', exact: true })
    await page.getByRole('checkbox', { name: `选择任务 ${alpine} 进行对比`, exact: true }).check()
    await page.getByRole('checkbox', { name: `选择任务 ${coastal} 进行对比`, exact: true }).check()

    for (const reducedMotion of ['no-preference', 'reduce'] as const) {
      await page.emulateMedia({ reducedMotion })
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 844 })
        for (const view of ['表格视图', '卡片视图'] as const) {
          await page.getByRole('button', { name: view, exact: true }).click()
          await expect(selection.getByRole('status')).toHaveText('已选择 2 / 2 个任务')
          await expect(
            action.getByRole('link', { name: '对比所选任务', exact: true }),
          ).toBeVisible()
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
          if (view === '表格视图') {
            const geometry = await page
              .getByRole('region', { name: '降尺度任务表格' })
              .evaluate((element) => ({
                client: element.clientWidth,
                scroll: element.scrollWidth,
              }))
            expect(geometry.scroll).toBeGreaterThan(geometry.client)
            await page.getByRole('region', { name: '降尺度任务表格' }).focus()
            await page.keyboard.press('Home')
          }
          for (const control of [selection, action, action.getByRole('link')]) {
            const bounds = await control.boundingBox()
            expect(bounds).not.toBeNull()
            expect(bounds!.x).toBeGreaterThanOrEqual(0)
            expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
          }
          expect(
            (
              await new AxeBuilder({ page })
                .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
                .analyze()
            ).violations,
          ).toEqual([])
          await page.screenshot({
            path: testInfo.outputPath(
              `selection-${width}-${reducedMotion}-${view === '表格视图' ? 'table' : 'card'}.png`,
            ),
            fullPage: true,
          })
        }
      }
    }
  })

  test('keyboard users can select, recover from a third choice and focus the stable comparison link', async ({
    page,
  }) => {
    const selection = page.getByRole('region', { name: '任务对比选择', exact: true })
    const action = page.getByRole('region', { name: '任务对比操作', exact: true })
    const first = page.getByRole('checkbox', { name: `选择任务 ${coastal} 进行对比`, exact: true })
    const second = page.getByRole('checkbox', { name: `选择任务 ${plateau} 进行对比`, exact: true })
    const third = page.getByRole('checkbox', { name: `选择任务 ${alpine} 进行对比`, exact: true })
    await first.focus()
    await page.keyboard.press('Space')
    await expect(first).toBeChecked()
    await second.focus()
    await page.keyboard.press('Space')
    await expect(second).toBeChecked()
    await third.focus()
    await page.keyboard.press('Space')
    await expect(third).not.toBeChecked()
    await expect(third).toBeFocused()
    await expect(
      action.getByText('最多选择两个任务，请先取消一个已选任务后再选择。', { exact: true }),
    ).toBeInViewport()
    const cancelSecond = action.getByRole('button', {
      name: `取消第二个对比任务 ${plateau}`,
      exact: true,
    })
    await cancelSecond.focus()
    await page.keyboard.press('Enter')
    await expect(action).toHaveCount(0)
    await expect(selection.getByRole('status')).toHaveText('已选择 1 / 2 个任务')
    await expect(first).toBeChecked()
    await expect(second).not.toBeChecked()
    await third.focus()
    await page.keyboard.press('Space')
    const compare = action.getByRole('link', { name: '对比所选任务', exact: true })
    await compare.focus()
    await expect(compare).toBeFocused()
    const target = new URL((await compare.getAttribute('href'))!, page.url())
    expect(target.searchParams.get('a')).toBe('demo-v1:researcher:coastal-wind')
    expect(target.searchParams.get('b')).toBe('demo-v1:researcher:alpine-temperature')
    const clear = selection.getByRole('button', { name: '清除对比选择', exact: true })
    await clear.focus()
    await page.keyboard.press('Enter')
    await expect(selection.getByRole('status')).toHaveText('已选择 0 / 2 个任务')
    await expect(action).toHaveCount(0)
  })

  test('a newly submitted running task is disabled and its long name fits the narrow card', async ({
    page,
  }) => {
    const name = 'ComparisonTaskNameWithoutSpacesComparisonTaskNameWithoutSpacesComparisonTaskName'
    await page.goto('/tasks/new')
    await page.getByLabel('任务名称', { exact: true }).fill(name)
    await page.getByLabel('开始日期', { exact: true }).fill('2024-06-15')
    await page.getByLabel('结束日期', { exact: true }).fill('2024-06-15')
    await page.getByLabel('西经（West）', { exact: true }).fill('110')
    await page.getByLabel('东经（East）', { exact: true }).fill('110.5')
    await page.getByLabel('南纬（South）', { exact: true }).fill('30')
    await page.getByLabel('北纬（North）', { exact: true }).fill('30.5')
    await page.getByRole('button', { name: '确认区域', exact: true }).click()
    await page.getByRole('button', { name: '提交降尺度任务', exact: true }).click()
    await expect(page.getByRole('heading', { name: '任务状态：运行中', exact: true })).toBeVisible()
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '任务管理', exact: true })
      .click()
    const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name, exact: true }) })
    await expect(row.getByText('运行中', { exact: true })).toBeVisible()
    await expect(row.getByRole('checkbox')).toBeDisabled()
    await expect(row.getByRole('checkbox')).not.toBeChecked()
    await expect(page.getByRole('region', { name: '任务对比选择' }).getByRole('status')).toHaveText(
      '已选择 0 / 2 个任务',
    )
    await expect(page.getByRole('region', { name: '任务对比操作' })).toHaveCount(0)
    await page.getByRole('button', { name: '卡片视图', exact: true }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    const card = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name, exact: true }) })
    await expect(card.getByRole('checkbox')).toBeDisabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
    await expect(card.getByRole('button', { name: `查看任务 ${name}`, exact: true })).toBeVisible()
    await expect(card.getByRole('button', { name: `删除任务 ${name}`, exact: true })).toBeVisible()
  })

  test('retains selection across real pagination, filters and presentation changes', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    // The catalog has four real tasks; 17 actual submissions exercise the 20-task page boundary.
    for (let index = 1; index <= 17; index += 1) {
      await page.goto('/tasks/new')
      await page.getByLabel('任务名称', { exact: true }).fill(`分页对比任务 ${index}`)
      await page.getByLabel('开始日期', { exact: true }).fill('2024-06-15')
      await page.getByLabel('结束日期', { exact: true }).fill('2024-06-15')
      await page.getByLabel('西经（West）', { exact: true }).fill('110')
      await page.getByLabel('东经（East）', { exact: true }).fill('110.5')
      await page.getByLabel('南纬（South）', { exact: true }).fill('30')
      await page.getByLabel('北纬（North）', { exact: true }).fill('30.5')
      await page.getByRole('button', { name: '确认区域', exact: true }).click()
      await page.getByRole('button', { name: '提交降尺度任务', exact: true }).click()
      await expect(
        page.getByRole('heading', { name: `分页对比任务 ${index}`, exact: true }),
      ).toBeVisible()
    }
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '任务管理', exact: true })
      .click()
    await expect(page.getByText('第 1 / 2 页', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '按任务名称排序', exact: true }).click()
    const first = page.getByRole('checkbox', { name: `选择任务 ${alpine} 进行对比`, exact: true })
    const second = page.getByRole('checkbox', { name: `选择任务 ${plateau} 进行对比`, exact: true })
    const selection = page.getByRole('region', { name: '任务对比选择', exact: true })
    const compare = page.getByRole('link', { name: '对比所选任务', exact: true })
    await first.check()
    await second.check()
    const href = await compare.getAttribute('href')
    await page.getByRole('button', { name: '下一页', exact: true }).click()
    await expect(page.getByText('第 2 / 2 页', { exact: true })).toBeVisible()
    await expect(first).toHaveCount(0)
    await expect(second).toHaveCount(0)
    await expect(selection.getByRole('status')).toHaveText('已选择 2 / 2 个任务')
    await expect(selection.getByText('当前筛选或分页隐藏', { exact: true })).toHaveCount(2)
    await expect(compare).toHaveAttribute('href', href!)
    await page.getByRole('button', { name: '卡片视图', exact: true }).click()
    await expect(page.getByText('第 2 / 2 页', { exact: true })).toBeVisible()
    await expect(compare).toHaveAttribute('href', href!)
    await page.getByLabel('任务名称搜索', { exact: true }).fill('Alpine')
    await expect(first).toBeChecked()
    await expect(compare).toHaveAttribute('href', href!)
    await page.getByRole('button', { name: '清除所有筛选', exact: true }).click()
    await expect(page.getByText('第 1 / 2 页', { exact: true })).toBeVisible()
    await expect(second).toBeChecked()
    await page.getByRole('button', { name: '表格视图', exact: true }).click()
    await expect(first).toBeChecked()
    await expect(second).toBeChecked()
  })

  test('the next signed-in account starts with no old pair and only its own stable ids', async ({
    context,
    page,
  }) => {
    const selection = page.getByRole('region', { name: '任务对比选择', exact: true })
    const compare = page.getByRole('link', { name: '对比所选任务', exact: true })
    await page.getByRole('checkbox', { name: `选择任务 ${alpine} 进行对比`, exact: true }).check()
    await page.getByRole('checkbox', { name: `选择任务 ${coastal} 进行对比`, exact: true }).check()
    await expect(compare).toBeVisible()
    await signInDemo(context, 'policy')
    await page.goto('/tasks')
    await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('policy')
    await expect(selection.getByRole('status')).toHaveText('已选择 0 / 2 个任务')
    await expect(compare).toHaveCount(0)
    await page.getByRole('checkbox', { name: `选择任务 ${coastal} 进行对比`, exact: true }).check()
    await page.getByRole('checkbox', { name: `选择任务 ${plateau} 进行对比`, exact: true }).check()
    const target = new URL((await compare.getAttribute('href'))!, page.url())
    expect(target.searchParams.get('a')).toBe('demo-v1:policy:coastal-wind')
    expect(target.searchParams.get('b')).toBe('demo-v1:policy:plateau-pressure')
  })
})

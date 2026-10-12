import AxeBuilder from '@axe-core/playwright'
import { expect } from '@playwright/test'
import { test } from './browser-guard'
import { submitDemoLogin } from './demo-login'

for (const [id, role, methods, advanced] of [
  ['researcher', '研究人员', ['推荐方法', '确定性方法', '概率式方法'], true],
  ['policy', '决策者', ['推荐方法'], false],
  ['agriculture', '农业用户', ['推荐方法'], false],
] as const) {
  test(`${id} sees current-role admission capabilities after real login and refresh`, async ({
    page,
  }, testInfo) => {
    await page.goto('/login')
    await submitDemoLogin(page, id)
    await expect(page).toHaveURL('/dashboard')
    await page
      .getByRole('navigation', { name: '工作区导航', exact: true })
      .getByRole('link', { name: '创建任务', exact: true })
      .click()
    await expect(page).toHaveURL('/tasks/new')
    const capabilities = page.getByRole('region', { name: '当前角色的配置能力' })
    await expect(capabilities).toContainText(role)
    await expect(
      capabilities.getByRole('list', { name: '可用降尺度方法' }).getByRole('listitem'),
    ).toHaveText([...methods])
    await expect(capabilities).toContainText('数据源、空间区域、时间范围、气象变量与目标分辨率')
    await expect(capabilities).toContainText('推荐方法默认解析为确定性输出')
    await expect(capabilities).toContainText('不限制查看后续提供的预置概率案例')
    if (advanced) {
      await expect(capabilities).toContainText('可使用研究高级参数')
      await expect(capabilities).toContainText('5 / 10 / 20')
      await expect(capabilities).toContainText('默认 10')
      await expect(capabilities).toContainText('不代表训练多个真实模型')
    } else {
      await expect(capabilities).toContainText('不可覆盖研究专属方法或高级参数')
      await expect(capabilities).not.toContainText('可使用研究高级参数')
    }
    await expect(page.getByRole('button', { name: '提交降尺度任务' })).toBeDisabled()
    const response = await page.reload()
    expect(response?.headers()['cache-control']).toContain('no-store')
    expect(await response?.text()).toContain('当前角色的配置能力')
    await expect(capabilities).toContainText(role)
    await expect(
      capabilities.getByRole('list', { name: '可用降尺度方法' }).getByRole('listitem'),
    ).toHaveText([...methods])
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(`${id}-capabilities.png`), fullPage: true })
  })
}

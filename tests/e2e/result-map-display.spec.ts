import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from './browser-guard'
import { resultMap, setupResultMapPage } from './helpers/result-map-page'
import {
  downloadCsvRecords,
  downloadExport,
  selectSmallExport,
} from './helpers/export-test-helpers'

const evidence =
  process.env.RESULT_MAP_DISPLAY_EVIDENCE_DIR ??
  '/Users/xiaoyu/Projects/meteo-weave/.git/agent-runs/spec-15-20261020/ticket-05'

async function capture(page: Page, name: string) {
  await mkdir(evidence, { recursive: true })
  await page.screenshot({ path: join(evidence, `${name}.png`), fullPage: true })
}

async function manualRange(page: Page, group: string, unit: string, min: string, max: string) {
  const controls = page.getByRole('group', { name: group, exact: true })
  await controls.getByRole('radio', { name: 'Manual range', exact: true }).check()
  await controls.getByRole('textbox', { name: `Minimum (${unit})`, exact: true }).fill(min)
  await controls.getByRole('textbox', { name: `Maximum (${unit})`, exact: true }).fill(max)
  await controls.getByRole('button', { name: 'Apply range', exact: true }).click()
  return controls
}

async function smallCsv(page: Page) {
  await page.getByRole('tab', { name: '数据导出', exact: true }).click()
  await selectSmallExport(page)
  const { download, recordCount } = await downloadExport(page, 'csv')
  const records = await downloadCsvRecords(download)
  expect(records).toHaveLength(recordCount)
  return records
}

test('real map and legends change together; invalid ranges keep previous mapping and scientific labels/parsed CSV remain unchanged', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await setupResultMapPage(page)
  const beforeExport = await smallCsv(page)
  await page.getByRole('tab', { name: /地图对比/ }).click()
  const edge = resultMap(page, 'original').getByRole('img', {
    name: /longitude 10, latitude 48.*16.2787 °C/,
  })
  await expect(edge).toBeVisible()
  const trueLabel = await edge.getAttribute('aria-label')
  const nativeShape = edge.locator('rect').first()
  const automaticFill = await nativeShape.getAttribute('fill')
  const legends = page.getByRole('group', { name: 'Map color legend', exact: true })
  const controls = await manualRange(page, 'Absolute maps range', '°C', '40', '50')
  await expect(nativeShape).toHaveAttribute('fill', '#2563eb')
  expect(await nativeShape.getAttribute('fill')).not.toBe(automaticFill)
  for (const index of [0, 1, 2]) {
    await expect(legends.nth(index)).toContainText('40 °C')
    await expect(legends.nth(index)).toContainText('50 °C')
    await expect(legends.nth(index)).toContainText('Below lower boundary')
    await expect(legends.nth(index)).toContainText('True scientific values are not clipped')
  }
  await expect(edge).toHaveAttribute('aria-label', trueLabel!)
  await controls.getByRole('textbox', { name: 'Maximum (°C)', exact: true }).fill('Infinity')
  await controls.getByRole('button', { name: 'Apply range', exact: true }).click()
  await expect(controls.getByRole('alert')).toContainText('finite numbers')
  await expect(
    controls.getByRole('textbox', { name: 'Maximum (°C)', exact: true }),
  ).toHaveAttribute('aria-invalid', 'true')
  await expect(nativeShape).toHaveAttribute('fill', '#2563eb')
  await expect(legends.first()).toContainText('50 °C')
  await controls.getByRole('textbox', { name: 'Maximum (°C)', exact: true }).fill('30')
  await controls.getByRole('button', { name: 'Apply range', exact: true }).click()
  await expect(controls.getByRole('alert')).toContainText('less than maximum')
  await expect(nativeShape).toHaveAttribute('fill', '#2563eb')
  await controls.getByRole('textbox', { name: 'Maximum (°C)', exact: true }).fill('50')
  await controls.getByRole('button', { name: 'Apply range', exact: true }).click()
  await expect(controls.getByRole('alert')).toHaveCount(0)
  await capture(page, 'temperature-1440-manual-map-and-legends')
  const afterExport = await smallCsv(page)
  expect(afterExport).toEqual(beforeExport)
  await mkdir(evidence, { recursive: true })
  await writeFile(
    join(evidence, 'parsed-csv-invariance.json'),
    JSON.stringify(
      {
        recordCount: afterExport.length,
        equalBeforeAfter: true,
        originalScientificLabel: trueLabel,
        before: beforeExport,
        after: afterExport,
      },
      null,
      2,
    ),
  )
  await page.getByRole('tab', { name: /地图对比/ }).click()
  // The baseline panel unmounts on tab change; restoration is checked after a fresh manual edit.
  const restoredControls = await manualRange(page, 'Absolute maps range', '°C', '40', '50')
  await restoredControls.getByRole('radio', { name: 'Automatic range', exact: true }).check()
  await expect(nativeShape).toHaveAttribute('fill', automaticFill!)
  await expect(legends.first()).toContainText('Current-frame finite union')
})

test('real rainfall maps keep legal zero separate from missing and explain signed Difference saturation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await setupResultMapPage(page, 'precipitation')
  await page.getByRole('button', { name: 'Switch to Station View' }).click()
  const zero = resultMap(page, 'observation').getByRole('img', {
    name: /synthetic-station-v1:114:30.*0 mm/,
  })
  await expect(zero).toBeVisible()
  const controls = await manualRange(page, 'Absolute maps range', 'mm', '-1', '1')
  await expect(controls.getByRole('alert')).toContainText('nonnegative minimum')
  await controls.getByRole('textbox', { name: 'Minimum (mm)', exact: true }).fill('0')
  await controls.getByRole('button', { name: 'Apply range', exact: true }).click()
  await expect(controls.getByRole('alert')).toHaveCount(0)
  await expect(zero.locator('circle').first()).toHaveAttribute('fill', '#ffffff')
  const difference = await manualRange(page, 'Difference range', 'mm', '-0.1', '0.2')
  await expect(difference.getByRole('checkbox', { name: 'Symmetric around zero' })).toBeChecked()
  await expect(page.getByRole('group', { name: 'Map color legend' }).last()).toContainText(
    '-0.2 mm',
  )
  await expect(page.getByRole('group', { name: 'Map color legend' }).last()).toContainText('0.2 mm')
  await expect(page.getByRole('group', { name: 'Map color legend' }).last()).toContainText(
    'Zero: 0 mm',
  )
  await expect(page.getByRole('group', { name: 'Map color legend' }).last()).toContainText(
    'Downscaled − Original, not accuracy improvement',
  )
  await capture(page, 'precipitation-manual-signed-range')
  await page.getByRole('combobox', { name: 'Ensemble view' }).click()
  await page.getByRole('option', { name: 'Member 05', exact: true }).click()
  const missing = resultMap(page, 'downscaled').getByRole('img', { name: /missing/ })
  await expect(missing.first()).toBeVisible()
  await expect(missing.first().locator('rect').first()).toHaveAttribute(
    'fill',
    /^url\(#.*-missing\)$/,
  )
  await expect(zero.locator('circle').first()).toHaveAttribute('fill', '#ffffff')
  await expect(page.getByRole('group', { name: 'Map color legend' }).nth(1)).toContainText(
    'missing or nonfinite, not zero',
  )
  await capture(page, 'precipitation-missing-zero-saturation')
})

test('390px keyboard controls operate the real map and accessible range controls without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await setupResultMapPage(page, 'pressure')
  const controls = page.getByRole('group', { name: 'Absolute maps range', exact: true })
  await controls.getByRole('radio', { name: 'Automatic range', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(controls.getByRole('radio', { name: 'Manual range', exact: true })).toBeChecked()
  await page.keyboard.press('Tab')
  await expect(controls.getByRole('textbox', { name: 'Minimum (hPa)', exact: true })).toBeFocused()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('2000')
  await page.keyboard.press('Tab')
  await expect(controls.getByRole('textbox', { name: 'Maximum (hPa)', exact: true })).toBeFocused()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('3000')
  await page.keyboard.press('Tab')
  await expect(controls.getByRole('button', { name: 'Apply range', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('group', { name: 'Map color legend' }).first()).toContainText(
    '2000 hPa',
  )
  await expect(
    resultMap(page, 'original').getByRole('img').first().locator('rect').first(),
  ).toHaveAttribute('fill', '#9333ea')
  const map = resultMap(page, 'original')
  const camera = map.getByLabel('Original Data viewport')
  const before = await camera.innerText()
  await map.getByRole('group', { name: 'Original Data geographic samples' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(camera).not.toHaveText(before)
  expect((await map.boundingBox())!.width).toBeGreaterThan(250)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391)
  const axe = await new AxeBuilder({ page }).include('[aria-label="Map display ranges"]').analyze()
  expect(axe.violations).toEqual([])
  await capture(page, 'pressure-390-keyboard-reduced-motion')
  await controls.scrollIntoViewIfNeeded()
  await expect(page.getByRole('group', { name: 'Difference range', exact: true })).toContainText(
    '0.1196 hPa',
  )
  await page.screenshot({ path: join(evidence, 'pressure-390-range-controls.png') })
  const differenceLegend = page.getByRole('group', { name: 'Map color legend', exact: true }).last()
  await differenceLegend.scrollIntoViewIfNeeded()
  await expect(differenceLegend).toContainText('Zero: 0 hPa')
  await expect(differenceLegend).toContainText('Negative (blue)')
  await expect(differenceLegend).toContainText('missing or nonfinite, not zero')
  await page.screenshot({ path: join(evidence, 'pressure-390-difference-legend.png') })
})

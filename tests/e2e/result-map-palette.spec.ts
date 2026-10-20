import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from './browser-guard'
import { resultMap, selectResultFrame, setupResultMapPage } from './helpers/result-map-page'
import {
  downloadCsvRecords,
  downloadExport,
  selectSmallExport,
} from './helpers/export-test-helpers'

const evidence =
  process.env.RESULT_MAP_PALETTE_EVIDENCE_DIR ??
  '/Users/xiaoyu/Projects/meteo-weave/.git/agent-runs/spec-15-20261020/ticket-06'

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

async function editPalette(
  controls: Locator,
  colors: string[],
  positions: string[] = ['0', '0.5', '1'],
) {
  await controls.getByRole('button', { name: 'Edit custom palette', exact: true }).click()
  for (const [index, color] of colors.entries()) {
    await controls
      .getByRole('textbox', { name: `Color ${index + 1} (#RRGGBB)`, exact: true })
      .fill(color)
    await controls
      .getByRole('textbox', { name: `Position ${index + 1} (0–1)`, exact: true })
      .fill(positions[index]!)
  }
  await controls.getByRole('button', { name: 'Apply palette', exact: true }).click()
}

async function smallCsv(page: Page) {
  await page.getByRole('tab', { name: '数据导出', exact: true }).click()
  await selectSmallExport(page)
  const { download, recordCount } = await downloadExport(page, 'csv')
  const records = await downloadCsvRecords(download)
  expect(records).toHaveLength(recordCount)
  return records
}

test('nonuniform custom stops recolor actual public samples and legends; invalid drafts and palette restoration leave science and parsed CSV unchanged', async ({
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
  const label = await edge.getAttribute('aria-label')
  const shape = edge.locator('rect').first()
  const range = await manualRange(page, 'Absolute maps range', '°C', '0', '100')
  const palette = page.getByRole('group', { name: 'Absolute maps palette', exact: true })
  const legends = page.getByRole('group', { name: 'Map color legend', exact: true })
  await editPalette(palette, ['#000000', '#ffffff', '#ff0000'], ['0', '0.25', '1'])
  // 16.2787 °C at 0..100 lies 65.1148% along black→white: RGB rounds to 166.
  await expect(shape).toHaveAttribute('fill', '#a6a6a6')
  await expect(
    resultMap(page, 'downscaled')
      .getByRole('img', { name: /longitude 10, latitude 48.*14.8358 °C/ })
      .locator('rect')
      .first(),
  ).toHaveAttribute('fill', '#979797')
  for (const index of [0, 1, 2]) {
    await expect(legends.nth(index)).toContainText('Custom palette')
    await expect(legends.nth(index)).toContainText('0 °C')
    await expect(legends.nth(index).locator('stop[offset="0.25"]')).toHaveAttribute(
      'stop-color',
      '#ffffff',
    )
  }
  await mkdir(evidence, { recursive: true })
  await legends
    .first()
    .locator('..')
    .screenshot({ path: join(evidence, 'temperature-1440-interpolated-map-and-legend.png') })
  await range.getByRole('textbox', { name: 'Minimum (°C)', exact: true }).fill('40')
  await range.getByRole('textbox', { name: 'Maximum (°C)', exact: true }).fill('50')
  await range.getByRole('button', { name: 'Apply range', exact: true }).click()
  await expect(shape).toHaveAttribute('fill', '#000000')
  await expect(legends.first()).toContainText('Below lower boundary (40 °C)')
  await expect(legends.first()).toContainText('True scientific values are not clipped')
  for (const [name, value, feedback, restore] of [
    ['Color 2 (#RRGGBB)', 'blue', '#RRGGBB', '#ffffff'],
    ['Position 2 (0–1)', '0', 'strictly increasing', '0.25'],
    ['Position 1 (0–1)', '0.01', 'exactly 0 and 1', '0'],
    ['Position 2 (0–1)', 'Infinity', 'finite numbers', '0.25'],
    ['Position 2 (0–1)', '2', 'between 0 and 1', '0.25'],
  ]) {
    const input = palette.getByRole('textbox', { name: name!, exact: true })
    await input.fill(value!)
    await palette.getByRole('button', { name: 'Apply palette', exact: true }).click()
    await expect(palette.getByRole('alert')).toContainText(feedback!)
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await expect(input).toHaveValue(value!)
    await expect(shape).toHaveAttribute('fill', '#000000')
    await expect(legends.first().locator('stop[offset="0.25"]')).toHaveAttribute(
      'stop-color',
      '#ffffff',
    )
    await input.fill(restore!)
  }
  await palette.getByRole('button', { name: 'Apply palette', exact: true }).click()
  await expect(palette.getByRole('alert')).toHaveCount(0)
  await capture(page, 'temperature-1440-custom-maps-legends')
  for (const color of ['#ff00ff', '#00ff00']) {
    await palette.getByRole('textbox', { name: 'Color 1 (#RRGGBB)', exact: true }).fill(color)
    await palette.getByRole('button', { name: 'Apply palette', exact: true }).click()
    await expect(shape).toHaveAttribute('fill', color)
    await palette.getByRole('button', { name: 'Restore standard palette', exact: true }).click()
    await expect(shape).toHaveAttribute('fill', '#2563eb')
    await expect(range.getByRole('radio', { name: 'Manual range', exact: true })).toBeChecked()
    await expect(legends.first()).toContainText('40 °C')
    await expect(palette).toContainText('Project standard · 5 colors')
    if (color === '#ff00ff')
      await palette.getByRole('button', { name: 'Edit custom palette', exact: true }).click()
  }
  await expect(edge).toHaveAttribute('aria-label', label!)
  const afterExport = await smallCsv(page)
  expect(afterExport).toHaveLength(330)
  expect(afterExport).toEqual(beforeExport)
  await mkdir(evidence, { recursive: true })
  await writeFile(
    join(evidence, 'parsed-csv-invariance.json'),
    JSON.stringify(
      {
        recordCount: afterExport.length,
        equalBeforeAfter: true,
        scientificLabel: label,
        before: beforeExport,
        after: afterExport,
      },
      null,
      2,
    ),
  )
})

test('Difference hue reversal never removes negative values or their meaning and resets to all seven project colors without changing frame/range/camera', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1000 })
  await setupResultMapPage(page)
  await selectResultFrame(page, '02')
  const frame = await page.getByLabel('Map frame', { exact: true }).innerText()
  const map = resultMap(page, 'difference')
  const negative = map.getByRole('img', { name: /· -[0-9.]+ °C$/ }).first()
  await expect(negative).toBeVisible()
  const label = await negative.getAttribute('aria-label')
  const shape = negative.locator('rect').first()
  const range = await manualRange(page, 'Difference range', '°C', '-0.1', '0.1')
  const palette = page.getByRole('group', { name: 'Difference palette', exact: true })
  const legend = page.getByRole('group', { name: 'Map color legend', exact: true }).last()
  await map
    .getByRole('group', { name: 'Difference (Downscaled - Original) geographic samples' })
    .focus()
  await page.keyboard.press('ArrowRight')
  const camera = map.getByLabel('Difference (Downscaled - Original) viewport')
  const cameraText = await camera.innerText()
  for (let cycle = 0; cycle < 2; cycle++) {
    await editPalette(palette, ['#ff0000', '#000000', '#0000ff'])
    await expect(shape).toHaveAttribute('fill', '#ff0000')
    await expect(legend).toContainText('Zero: 0 °C')
    await expect(legend).toContainText('Zero color: #000000')
    await expect(legend).toContainText('Negative: downscaled lower')
    await expect(legend).toContainText('Positive: downscaled higher')
    await expect(legend).not.toContainText('Negative (blue)')
    await expect(legend).toContainText('not accuracy improvement')
    await expect(legend).toContainText('missing or nonfinite, not zero')
    await expect(legend.locator('stop[offset="0.5"]')).toHaveAttribute('stop-color', '#000000')
    await expect(negative).toHaveAttribute('aria-label', label!)
    if (cycle === 0) {
      await capture(page, 'difference-768-custom-signs-maps')
      await legend.scrollIntoViewIfNeeded()
      await page.screenshot({ path: join(evidence, 'difference-768-readable-legend.png') })
    }
    await palette.getByRole('button', { name: 'Restore standard palette', exact: true }).click()
    await expect(palette).toContainText('Project standard · 7 colors')
    await expect(shape).toHaveAttribute('fill', '#0c4a6e')
    const standard = await legend
      .locator('div[aria-hidden="true"] > span')
      .evaluateAll((spans) => spans.map((span) => getComputedStyle(span).backgroundColor))
    expect(standard).toEqual([
      'rgb(12, 74, 110)',
      'rgb(14, 165, 233)',
      'rgb(224, 242, 254)',
      'rgb(255, 255, 255)',
      'rgb(254, 242, 242)',
      'rgb(248, 113, 113)',
      'rgb(153, 27, 27)',
    ])
    await expect(range.getByRole('radio', { name: 'Manual range', exact: true })).toBeChecked()
    await expect(legend).toContainText('-0.1 °C')
    await expect(camera).toHaveText(cameraText)
    await expect(page.getByLabel('Map frame', { exact: true })).toHaveText(frame)
  }
})

test('rainfall custom colors preserve legal zero, missing hatching, accumulation and provenance with actual samples', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await setupResultMapPage(page, 'precipitation')
  await page.getByRole('button', { name: 'Switch to Station View', exact: true }).click()
  await page.getByRole('combobox', { name: 'Ensemble view', exact: true }).click()
  await page.getByRole('option', { name: 'Member 05', exact: true }).click()
  const zero = resultMap(page, 'observation').getByRole('img', {
    name: /synthetic-station-v1:114:30.*0 mm/,
  })
  const missing = resultMap(page, 'downscaled')
    .getByRole('img', { name: /missing/ })
    .first()
  await expect(zero).toBeVisible()
  await expect(missing).toBeVisible()
  const zeroLabel = await zero.getAttribute('aria-label')
  const missingLabel = await missing.getAttribute('aria-label')
  await manualRange(page, 'Absolute maps range', 'mm', '0', '1')
  const palette = page.getByRole('group', { name: 'Absolute maps palette', exact: true })
  await editPalette(palette, ['#ff00ff', '#000000', '#00ffff'])
  await expect(zero.locator('circle').first()).toHaveAttribute('fill', '#ff00ff')
  await expect(missing.locator('rect').first()).toHaveAttribute('fill', /^url\(#.*-missing\)$/)
  await expect(zero).toHaveAttribute('aria-label', zeroLabel!)
  await expect(missing).toHaveAttribute('aria-label', missingLabel!)
  const legends = page.getByRole('group', { name: 'Map color legend', exact: true })
  await expect(legends.nth(1)).toContainText('missing or nonfinite, not zero')
  await expect(legends.nth(1)).toContainText('No finite values · no numeric color scale')
  await expect(legends.nth(2)).toContainText('1 mm')
  await expect(page.getByText(/Accumulation Interval \(UTC\):/).first()).toBeVisible()
  await expect(page.getByText(/Reference:.*synthetic-stations/).first()).toBeVisible()
  await capture(page, 'rainfall-1440-custom-zero-missing-science')
  await palette.getByRole('button', { name: 'Restore standard palette', exact: true }).click()
  await expect(zero.locator('circle').first()).toHaveAttribute('fill', '#ffffff')
  await expect(missing.locator('rect').first()).toHaveAttribute('fill', /^url\(#.*-missing\)$/)
})

test('390px keyboard palette edits, 3–5 stop controls and restore work on real maps with readable legends', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await setupResultMapPage(page, 'pressure')
  const range = await manualRange(page, 'Absolute maps range', 'hPa', '2000', '3000')
  const palette = page.getByRole('group', { name: 'Absolute maps palette', exact: true })
  await palette.getByRole('button', { name: 'Edit custom palette', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(
    palette.getByRole('textbox', { name: 'Position 1 (0–1)', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(
    palette.getByRole('textbox', { name: 'Color 1 (#RRGGBB)', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('#ff00ff')
  for (let step = 0; step < 5; step++) await page.keyboard.press('Tab')
  await expect(palette.getByRole('button', { name: 'Add stop', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(
    palette.getByRole('textbox', { name: 'Position 4 (0–1)', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(
    palette.getByRole('textbox', { name: 'Position 5 (0–1)', exact: true }),
  ).toBeVisible()
  await expect(palette.getByRole('button', { name: 'Add stop', exact: true })).toBeDisabled()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(palette.getByRole('button', { name: 'Apply palette', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  const sample = resultMap(page, 'original').getByRole('img', {
    name: /longitude 90, latitude 32.*1021.55 hPa/,
  })
  await expect(sample.locator('rect').first()).toHaveAttribute('fill', '#ff00ff')
  const legend = page.getByRole('group', { name: 'Map color legend', exact: true }).first()
  await expect(legend).toContainText('Custom palette')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391)
  const axe = await new AxeBuilder({ page }).include('[aria-label="Map palettes"]').analyze()
  expect(axe.violations).toEqual([])
  await capture(page, 'pressure-390-keyboard-custom-map-and-legend')
  await palette.scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(evidence, 'pressure-390-palette-controls.png') })
  await legend.scrollIntoViewIfNeeded()
  await expect(legend).toContainText('2000 hPa')
  await expect(legend).toContainText('missing or nonfinite, not zero')
  await page.screenshot({ path: join(evidence, 'pressure-390-readable-legend.png') })
  await legend
    .locator('..')
    .screenshot({ path: join(evidence, 'pressure-390-actual-map-and-readable-legend.png') })
  const invalidColor = palette.getByRole('textbox', { name: 'Color 2 (#RRGGBB)', exact: true })
  await invalidColor.focus()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('#oops')
  await palette.getByRole('button', { name: 'Apply palette', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(palette.getByRole('alert')).toContainText('#RRGGBB')
  await expect(invalidColor).toHaveAttribute('aria-invalid', 'true')
  await expect(sample.locator('rect').first()).toHaveAttribute('fill', '#ff00ff')
  await palette.screenshot({ path: join(evidence, 'pressure-390-invalid-draft-feedback.png') })
  await invalidColor.focus()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('#ffffff')
  await palette.getByRole('button', { name: 'Apply palette', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(palette.getByRole('alert')).toHaveCount(0)
  await palette.getByRole('button', { name: 'Restore standard palette', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(sample.locator('rect').first()).toHaveAttribute('fill', '#9333ea')
  await expect(range.getByRole('radio', { name: 'Manual range', exact: true })).toBeChecked()
  await expect(legend).toContainText('2000 hPa')
})

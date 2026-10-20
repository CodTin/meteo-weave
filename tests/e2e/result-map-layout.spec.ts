import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { TestInfo } from '@playwright/test'
import { fromJSON } from 'seroval'
import type { ResultQuery } from '@/features/downscaling-tasks/service'
import { expect, test, type Locator, type Page } from './browser-guard'
import {
  resultMap,
  selectResultFrame,
  selectResultPoint,
  setupResultMapPage,
} from './helpers/result-map-page'
import {
  downloadCsvRecords,
  downloadExport,
  selectSmallExport,
} from './helpers/export-test-helpers'

const products = [
  ['original', 'Original Data'],
  ['downscaled', 'Downscaled Data'],
  ['observation', 'Observation Data'],
  ['difference', 'Difference (Downscaled - Original)'],
] as const

function artifactPath(info: TestInfo, name: string) {
  const override = process.env.RESULT_MAP_LAYOUT_EVIDENCE_DIR
  return override
    ? join(override, `${info.title.replace(/[^\w-]/g, '_')}-${name}`)
    : info.outputPath(name)
}

async function capture(page: Page, info: TestInfo, name: string) {
  const path = artifactPath(info, `${name}.png`)
  await mkdir(dirname(path), { recursive: true })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path, fullPage: true })
  await info.attach(name, { path, contentType: 'image/png' })
}

async function manualRange(page: Page, group: string, unit: string, min: string, max: string) {
  const range = page.getByRole('group', { name: group, exact: true })
  await range.getByRole('radio', { name: 'Manual range', exact: true }).check()
  await range.getByRole('textbox', { name: `Minimum (${unit})`, exact: true }).fill(min)
  await range.getByRole('textbox', { name: `Maximum (${unit})`, exact: true }).fill(max)
  await range.getByRole('button', { name: 'Apply range', exact: true }).click()
}

async function customPalette(page: Page, group: string, colors: readonly string[]) {
  const palette = page.getByRole('group', { name: group, exact: true })
  await palette.getByRole('button', { name: 'Edit custom palette', exact: true }).click()
  for (const [index, color] of colors.entries()) {
    await palette
      .getByRole('textbox', { name: `Color ${index + 1} (#RRGGBB)`, exact: true })
      .fill(color)
    await palette
      .getByRole('textbox', { name: `Position ${index + 1} (0–1)`, exact: true })
      .fill(['0', '0.25', '1'][index]!)
  }
  await palette.getByRole('button', { name: 'Apply palette', exact: true }).click()
}

async function pinPoint(page: Page, longitude: string, latitude: string) {
  const query = await selectResultPoint(page, longitude, latitude)
  await query.getByRole('button', { name: /^(Pin current point|Replace pinned point)$/ }).click()
  const detail = page.getByRole('region', { name: 'Pinned point detail', exact: true })
  await expect(
    detail.getByRole('region', { name: 'Original Data point value', exact: true }),
  ).toBeVisible()
  return detail
}

async function cameras(page: Page) {
  return Promise.all(
    products.map(([, title]) => page.getByLabel(`${title} viewport`, { exact: true }).innerText()),
  )
}

function card(page: Page, title: string) {
  return page
    .getByLabel('Result comparison maps', { exact: true })
    .getByRole('heading', { name: title, exact: true })
    .locator('..')
    .locator('..')
}

/** Observe painted public SVG geometry relative to its live surface, not engine/state objects. */
async function markGeometry(map: Locator, mark: Locator) {
  const surface = await map.getByRole('group', { name: /geographic samples$/ }).boundingBox()
  const shape = await mark.boundingBox()
  if (!surface || !shape) throw new Error('Visible geographic sample has no live bounds')
  return {
    x: (shape.x + shape.width / 2 - surface.x) / surface.width,
    y: (shape.y + shape.height / 2 - surface.y) / surface.height,
  }
}

async function assertGeometry(map: Locator, mark: Locator, before: { x: number; y: number }) {
  const after = await markGeometry(map, mark)
  expect(after.x).toBeCloseTo(before.x, 2)
  expect(after.y).toBeCloseTo(before.y, 2)
}

async function parsedScientificCsv(page: Page) {
  await page.getByRole('tab', { name: '数据导出', exact: true }).click()
  await selectSmallExport(page)
  const { download, recordCount } = await downloadExport(page, 'csv')
  const records = await downloadCsvRecords(download)
  expect(records).toHaveLength(recordCount)
  const science = records.map((record) => ({
    ...record,
    longitude: Number(record.longitude),
    latitude: Number(record.latitude),
    provenance: record.provenance,
    unit: record.unit,
    value: record.value === '' ? null : Number(record.value),
  }))
  const valid = science.filter((record) => record.value !== null)
  expect(valid.length).toBeGreaterThan(0)
  for (const record of valid) {
    expect(Number.isFinite(record.longitude)).toBe(true)
    expect(Number.isFinite(record.latitude)).toBe(true)
    expect(Number.isFinite(record.value)).toBe(true)
    expect(record.provenance).toBe('Synthetic Demo')
    expect(record.unit).toBe('°C')
  }
  return science
}

async function configureAnalysis(page: Page) {
  await selectResultFrame(page, '02')
  await page.getByRole('button', { name: 'Switch to Station View', exact: true }).click()
  await expect(
    resultMap(page, 'observation').getByRole('img', { name: /synthetic-station-v1:11:47/ }),
  ).toBeVisible()
  await page.getByRole('checkbox', { name: 'Synchronize map cameras', exact: true }).uncheck()
  await resultMap(page, 'original')
    .getByRole('button', { name: 'Zoom out Original Data', exact: true })
    .click()
  await resultMap(page, 'downscaled')
    .getByRole('button', { name: 'Pan east Downscaled Data', exact: true })
    .click()
  await resultMap(page, 'observation')
    .getByRole('button', { name: 'Pan north Observation Data', exact: true })
    .click()
  await resultMap(page, 'difference')
    .getByRole('button', { name: 'Pan west Difference (Downscaled - Original)', exact: true })
    .click()
  await manualRange(page, 'Absolute maps range', '°C', '0', '100')
  await manualRange(page, 'Difference range', '°C', '-1', '1')
  await customPalette(page, 'Absolute maps palette', ['#000000', '#ffffff', '#ff0000'])
  await customPalette(page, 'Difference palette', ['#00ff00', '#ffffff', '#0000ff'])
  const detail = await pinPoint(page, '11', '47')
  await expect(
    detail.getByRole('region', { name: 'Original Data point value', exact: true }),
  ).toContainText('16.8248 °C')
  await expect(
    detail.getByRole('region', { name: 'Downscaled Data point value', exact: true }),
  ).toContainText('17.4844 °C')
  await expect(
    detail.getByRole('region', { name: 'Observation Data point value', exact: true }),
  ).toContainText('-0.7484 °C')
  await expect(
    detail.getByRole('region', {
      name: 'Difference (Downscaled - Original) point value',
      exact: true,
    }),
  ).toContainText('0.6596 °C')
  return detail
}

async function assertSelections(page: Page, detail: Locator) {
  await expect(page.getByLabel('Map frame', { exact: true })).toContainText(
    '2024-01-02T00:00:00.000Z',
  )
  await expect(
    page.getByRole('button', { name: 'Switch to Interpolated View', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByRole('checkbox', { name: 'Synchronize map cameras', exact: true }),
  ).not.toBeChecked()
  await expect(detail.getByLabel('Pinned coordinate', { exact: true })).toHaveText(
    'longitude 11 · latitude 47 · EPSG:4326',
  )
  await expect(
    detail.getByRole('region', { name: 'Original Data point value', exact: true }),
  ).toContainText('16.8248 °C')
  await expect(page.getByRole('group', { name: 'Absolute maps range', exact: true })).toContainText(
    'Active: Manual · 0–100 °C',
  )
  await expect(page.getByRole('group', { name: 'Difference range', exact: true })).toContainText(
    'Active: Manual · -1–1 °C',
  )
}

async function assertProduct(page: Page, kind: (typeof products)[number][0], title: string) {
  const map = resultMap(page, kind)
  const legend = card(page, title).getByRole('group', { name: 'Map color legend', exact: true })
  await expect(map).toBeVisible()
  await expect(legend).toContainText('Custom palette')
  await expect(legend).toContainText('Manual range')
  await expect(legend).toContainText('missing or nonfinite, not zero')
  await expect(legend).toContainText('True scientific values are not clipped')
  await expect(legend.locator('stop[offset="0.25"]')).toHaveAttribute('stop-color', '#ffffff')
  await expect(
    map.getByRole('img', { name: 'Shared crosshair · longitude 11 · latitude 47', exact: true }),
  ).toBeVisible()
  if (kind === 'difference') {
    await expect(legend).toContainText('Zero: 0 °C')
    await expect(legend).toContainText('Downscaled − Original, not accuracy improvement')
  } else {
    await expect(legend).toContainText('100 °C')
  }
}

test('all three actual desktop layouts preserve independent cameras, true point geometry, custom legends and scientifically parsed CSV', async ({
  page,
}, info) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await setupResultMapPage(page)
  const beforeCsv = await parsedScientificCsv(page)
  await page.getByRole('tab', { name: /地图对比/ }).click()
  const detail = await configureAnalysis(page)
  const beforeCameras = await cameras(page)
  expect(new Set(beforeCameras).size).toBe(4)
  const beforeDetail = await detail.innerText()
  const original = resultMap(page, 'original')
  const sample = original.getByRole('img', { name: /longitude 10, latitude 48 · .*16.3819 °C/ })
  const beforeSample = await markGeometry(original, sample)
  const beforeMarker = await markGeometry(
    original,
    original.getByRole('img', {
      name: 'Shared crosshair · longitude 11 · latitude 47',
      exact: true,
    }),
  )
  const beforeFill = await sample.locator('rect').first().getAttribute('fill')
  // 16.3819 / 25 on the black→white interval rounds to RGB 167.
  expect(beforeFill).toBe('#a7a7a7')
  const boxes = await Promise.all(products.map(([, title]) => card(page, title).boundingBox()))
  expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThan(2)
  expect(boxes[2]!.y).toBeGreaterThan(boxes[0]!.y + 200)
  await capture(page, info, '1440-2x2')
  await page.getByRole('button', { name: '1×4 wide', exact: true }).click()
  await expect(page.getByLabel('Map layout', { exact: true })).toHaveText('1×4 comparison')
  const row = await Promise.all(products.map(([, title]) => card(page, title).boundingBox()))
  for (let index = 1; index < row.length; index++) {
    expect(Math.abs(row[index]!.y - row[0]!.y)).toBeLessThan(2)
    expect(row[index]!.x).toBeGreaterThan(row[index - 1]!.x)
    expect(row[index]!.width).toBeGreaterThan(200)
  }
  expect(await cameras(page)).toEqual(beforeCameras)
  await assertGeometry(original, sample, beforeSample)
  await capture(page, info, '1440-1x4')
  for (const [kind, title] of products) {
    const trigger = page.getByRole('button', { name: `Expand ${title}`, exact: true })
    await trigger.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('Map layout', { exact: true })).toHaveText(`Single map · ${title}`)
    await expect(page.getByRole('group', { name: 'Map color legend', exact: true })).toHaveCount(1)
    await assertProduct(page, kind, title)
    await assertSelections(page, detail)
    await expect(detail).toHaveText(beforeDetail, { useInnerText: true })
    if (kind === 'original') {
      await assertGeometry(original, sample, beforeSample)
      await expect(sample.locator('rect').first()).toHaveAttribute('fill', beforeFill!)
      const marker = original.getByRole('img', { name: /Shared crosshair/ })
      const markerGeometry = await markGeometry(original, marker)
      expect(markerGeometry.x).toBeCloseTo(beforeMarker.x, 2)
      expect(markerGeometry.y).toBeCloseTo(beforeMarker.y, 2)
      const surface = original.getByRole('group', {
        name: 'Original Data geographic samples',
        exact: true,
      })
      await surface.scrollIntoViewIfNeeded()
      const bounds = await surface.boundingBox()
      if (!bounds) throw new Error('Expanded map has no live bounds')
      await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      await page.mouse.move(0, 0)
      await expect(detail.getByLabel('Pinned coordinate')).toHaveText(
        'longitude 11 · latitude 47 · EPSG:4326',
      )
    }
    await capture(page, info, `1440-single-${kind}`)
    const back = page.getByRole('button', { name: 'Return to 1×4 comparison', exact: true })
    await back.focus()
    await page.keyboard.press('Enter')
    await expect(trigger).toBeFocused()
    expect(await cameras(page)).toEqual(beforeCameras)
  }
  await page.getByRole('button', { name: '2×2', exact: true }).click()
  await expect(page.getByLabel('Map layout', { exact: true })).toHaveText('2×2 comparison')
  expect(await cameras(page)).toEqual(beforeCameras)
  await assertGeometry(original, sample, beforeSample)
  await assertSelections(page, detail)
  for (const [kind, title] of products) await assertProduct(page, kind, title)
  await expect(sample.locator('rect').first()).toHaveAttribute('fill', beforeFill!)
  await capture(page, info, '1440-returned-2x2')
  const afterCsv = await parsedScientificCsv(page)
  expect(afterCsv).toEqual(beforeCsv)
  const path = artifactPath(info, 'scientific-csv-invariance.json')
  await mkdir(dirname(path), { recursive: true })
  await writeFile(
    path,
    JSON.stringify({ recordCount: beforeCsv.length, before: beforeCsv, after: afterCsv }, null, 2),
  )
  await info.attach('scientific CSV invariance', { path, contentType: 'application/json' })
})

for (const width of [390, 768, 1440]) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`keyboard layouts at ${width}px ${reducedMotion} keep readable maps, point geometry and return focus`, async ({
      page,
    }, info) => {
      test.setTimeout(90_000)
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 })
      await page.emulateMedia({ reducedMotion })
      await setupResultMapPage(page)
      const detail = await configureAnalysis(page)
      const before = await cameras(page)
      const original = resultMap(page, 'original')
      const sample = original.getByRole('img', { name: /longitude 10, latitude 48 · .*16.3819 °C/ })
      const geometry = await markGeometry(original, sample)
      await capture(page, info, `${width}-2x2-keyboard-full`)
      const wide = page.getByRole('button', { name: '1×4 wide', exact: true })
      await wide.focus()
      await page.keyboard.press('Enter')
      const boxes = await Promise.all(products.map(([, title]) => card(page, title).boundingBox()))
      for (const box of boxes) expect(box!.width).toBeGreaterThan(width === 1440 ? 220 : 280)
      if (width < 1440) {
        await expect(
          page.getByText('1×4 wide is unavailable at this width.', { exact: false }),
        ).toBeVisible()
        for (let index = 1; index < boxes.length; index++)
          expect(boxes[index]!.y).toBeGreaterThan(boxes[index - 1]!.y + 250)
      } else {
        expect(Math.abs(boxes[0]!.y - boxes[3]!.y)).toBeLessThan(2)
      }
      await capture(page, info, `${width}-wide-or-readable-column-full`)
      const expand = page.getByRole('button', { name: 'Expand Original Data', exact: true })
      await expand.focus()
      await page.keyboard.press('Enter')
      await expect(
        page.getByRole('button', { name: 'Return to 1×4 comparison', exact: true }),
      ).toBeFocused()
      await assertProduct(page, 'original', 'Original Data')
      await assertSelections(page, detail)
      await assertGeometry(original, sample, geometry)
      const surface = original.getByRole('group', {
        name: 'Original Data geographic samples',
        exact: true,
      })
      await surface.scrollIntoViewIfNeeded()
      const bounds = await surface.boundingBox()
      if (!bounds) throw new Error('Expanded map has no current dimensions')
      await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      await page.mouse.move(0, 0)
      await expect(detail.getByLabel('Pinned coordinate', { exact: true })).toHaveText(
        'longitude 11 · latitude 47 · EPSG:4326',
      )
      await expect(
        detail.getByRole('region', { name: 'Original Data point value', exact: true }),
      ).toContainText('16.8248 °C')
      await capture(page, info, `${width}-single-true-point-full`)
      await page.getByRole('button', { name: 'Return to 1×4 comparison', exact: true }).focus()
      await page.keyboard.press('Enter')
      await expect(expand).toBeFocused()
      expect(await cameras(page)).toEqual(before)
      await page.getByRole('button', { name: '2×2', exact: true }).focus()
      await page.keyboard.press('Enter')
      await expect(page.getByLabel('Map layout', { exact: true })).toHaveText('2×2 comparison')
      expect(await cameras(page)).toEqual(before)
      await assertGeometry(original, sample, geometry)
      await assertSelections(page, detail)
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true)
      await capture(page, info, `${width}-returned-keyboard-full`)
      const detailPath = artifactPath(info, `${width}-pinned-detail.png`)
      await mkdir(dirname(detailPath), { recursive: true })
      await detail.screenshot({ path: detailPath })
    })
  }
}

function resultRequest(body: string | null) {
  if (!body) return undefined
  try {
    const input: { data?: { task?: { id: string }; query?: ResultQuery } } = fromJSON(
      JSON.parse(body),
    )
    return input.data?.query
  } catch {
    return undefined
  }
}

test('real frame and mode HTTP pending updates retain single-layout cameras, pin and custom display owners', async ({
  page,
}, info) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await setupResultMapPage(page)
  const detail = await configureAnalysis(page)
  const before = await cameras(page)
  await page.getByRole('button', { name: '1×4 wide', exact: true }).click()
  await page.getByRole('button', { name: 'Expand Original Data', exact: true }).click()
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let previewHeld = false
  let pointHeld = false
  let holding = true
  const next = '2024-01-03T00:00:00.000Z'
  const handler: Parameters<Page['route']>[1] = async (route) => {
    const query = resultRequest(route.request().postData())
    if (holding && query?.layer === 'original' && 'times' in query && query.times.includes(next)) {
      const response = await route.fetch()
      expect(response.ok()).toBe(true)
      if (query.kind === 'preview') previewHeld = true
      if (query.kind === 'points' && query.points.length === 1) pointHeld = true
      await held
      await route.fulfill({ response })
    } else await route.continue()
  }
  await page.route('**/_serverFn/**', handler)
  try {
    await page.getByRole('combobox', { name: 'Time Slice (UTC)', exact: true }).click()
    await page.getByRole('option', { name: '2024-01-03 00:00 UTC', exact: true }).click()
    await expect.poll(() => previewHeld && pointHeld).toBe(true)
    await expect(page.getByLabel('Map data loading', { exact: true })).toBeVisible()
    await expect(resultMap(page, 'original')).toHaveCount(0)
    await expect(detail.getByLabel('Pinned query pending', { exact: true })).toBeVisible()
    await expect(
      detail.getByRole('region', { name: 'Original Data point value', exact: true }),
    ).toHaveCount(0)
    await page.getByRole('button', { name: 'Switch to Interpolated View', exact: true }).click()
    await expect(page.getByLabel('Map data loading', { exact: true })).toBeVisible()
    await expect(detail.getByLabel('Pinned coordinate')).toHaveText(
      'longitude 11 · latitude 47 · EPSG:4326',
    )
    await capture(page, info, 'pending-frame-mode-hidden-science')
    holding = false
    release()
    await expect(resultMap(page, 'original')).toBeVisible()
    await expect(
      detail.getByRole('region', { name: 'Original Data point value', exact: true }),
    ).toBeVisible()
    await expect(page.getByLabel('Map layout')).toHaveText('Single map · Original Data')
    await expect(page.getByLabel('Original Data viewport')).toHaveText(before[0]!)
    await expect(
      page.getByRole('button', { name: 'Switch to Station View', exact: true }),
    ).toBeVisible()
    await expect(detail.getByLabel('Pinned frame')).toContainText(next)
    await expect(detail.getByLabel('Pinned coordinate')).toHaveText(
      'longitude 11 · latitude 47 · EPSG:4326',
    )
    await expect(
      card(page, 'Original Data').getByRole('group', { name: 'Map color legend' }),
    ).toContainText('Custom palette')
    await expect(page.getByRole('group', { name: 'Absolute maps range' })).toContainText(
      'Active: Manual · 0–100 °C',
    )
    await page.getByRole('button', { name: 'Return to 1×4 comparison', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Expand Original Data', exact: true }),
    ).toBeFocused()
    expect(await cameras(page)).toEqual(before)
    await capture(page, info, 'pending-frame-mode-current-returned')
  } finally {
    holding = false
    release()
    await page.unroute('**/_serverFn/**', handler)
  }
})

test('member selection and independent wind cameras survive layouts; leaving remounts fresh page-only owners', async ({
  page,
}, info) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const { url } = await setupResultMapPage(page, 'wind')
  await selectResultFrame(page, '02')
  await page.getByRole('button', { name: 'Switch to Station View', exact: true }).click()
  await page.getByRole('combobox', { name: 'Ensemble view', exact: true }).click()
  await page.getByRole('option', { name: 'Member 02', exact: true }).click()
  await expect(resultMap(page, 'downscaled')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Synchronize map cameras', exact: true }).uncheck()
  await resultMap(page, 'original')
    .getByRole('button', { name: 'Pan east Original Data', exact: true })
    .click()
  await resultMap(page, 'downscaled')
    .getByRole('button', { name: 'Zoom out Downscaled Data', exact: true })
    .click()
  await manualRange(page, 'Absolute maps range', 'm/s', '0', '100')
  await customPalette(page, 'Absolute maps palette', ['#000000', '#ffffff', '#ff0000'])
  const detail = await pinPoint(page, '121', '31')
  const science = await detail.innerText()
  const before = await cameras(page)
  await page.getByRole('button', { name: '1×4 wide', exact: true }).click()
  await page.getByRole('button', { name: 'Expand Downscaled Data', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('combobox', { name: 'Ensemble view' })).toContainText('Member 02')
  await expect(card(page, 'Downscaled Data')).toContainText('member-02')
  await expect(detail).toHaveText(science, { useInnerText: true })
  await expect(
    card(page, 'Downscaled Data').getByRole('group', { name: 'Map color legend' }),
  ).toContainText('100 m/s')
  await capture(page, info, 'wind-member2-single-reduced')
  await page.getByRole('button', { name: 'Return to 1×4 comparison', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('button', { name: 'Expand Downscaled Data', exact: true }),
  ).toBeFocused()
  expect(await cameras(page)).toEqual(before)
  await page.getByRole('button', { name: '2×2', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Ensemble view' })).toContainText('Member 02')
  await expect(detail).toHaveText(science, { useInnerText: true })
  await page.getByRole('link', { name: '任务管理', exact: true }).first().click()
  await expect(page.getByLabel('Map layout')).toHaveCount(0)
  await page.goto(url)
  await expect(page.getByLabel('Map layout')).toHaveText('2×2 comparison')
  await expect(
    page.getByRole('checkbox', { name: 'Synchronize map cameras', exact: true }),
  ).toBeChecked()
  await expect(page.getByRole('region', { name: 'Pinned point detail', exact: true })).toHaveCount(
    0,
  )
  await expect(page.getByRole('combobox', { name: 'Ensemble view' })).toContainText('Ensemble Mean')
  await expect(page.getByRole('group', { name: 'Absolute maps range' })).toContainText(
    'Active: Automatic',
  )
})

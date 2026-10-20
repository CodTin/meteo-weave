import { resultMapEvidence } from './helpers/result-map-evidence'
import { fromJSON } from 'seroval'
import type { ResultQuery } from '@/features/downscaling-tasks/service'
import { test, expect, type Page } from './browser-guard'
import { resultMap, setupResultMapPage, selectResultFrame } from './helpers/result-map-page'

const titles = [
  'Original Data',
  'Downscaled Data',
  'Observation Data',
  'Difference (Downscaled - Original)',
]
const queryRegion = (page: Page) =>
  page.getByRole('region', { name: 'Joint point query', exact: true })

async function keyboardPoint(page: Page, longitude: string, latitude: string) {
  const query = queryRegion(page)
  await query.getByRole('textbox', { name: 'Longitude', exact: true }).fill(longitude)
  await query.getByRole('textbox', { name: 'Latitude', exact: true }).fill(latitude)
  await query.getByRole('textbox', { name: 'Latitude', exact: true }).press('Enter')
}

test('real geographic hover gives the same four values and point as keyboard entry without forcing independent cameras', async ({
  page,
}, testInfo) => {
  const evidence = resultMapEvidence(testInfo, process.env.RESULT_MAP_EVIDENCE_DIR)
  await page.setViewportSize({ width: 1440, height: 1050 })
  await setupResultMapPage(page)
  await page.getByRole('button', { name: 'Switch to Station View', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Synchronize map cameras', exact: true }).uncheck()
  const original = resultMap(page, 'original')
  const downscaled = resultMap(page, 'downscaled')
  const otherCamera = await downscaled
    .getByLabel('Downscaled Data viewport', { exact: true })
    .innerText()
  await downscaled.getByRole('button', { name: 'Pan east Downscaled Data', exact: true }).click()
  const shiftedCamera = await downscaled
    .getByLabel('Downscaled Data viewport', { exact: true })
    .innerText()
  expect(shiftedCamera).not.toBe(otherCamera)
  const surface = original.getByRole('group', {
    name: 'Original Data geographic samples',
    exact: true,
  })
  await surface.scrollIntoViewIfNeeded()
  const box = await surface.boundingBox()
  if (!box) throw new Error('Real map has no viewport bounds')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  const query = queryRegion(page)
  await expect(query.getByLabel('Canonical point', { exact: true })).toHaveText(
    'longitude 11 · latitude 47',
  )
  const expected = ['16.7216 °C', '17.2749 °C', '-0.8 °C', '0.5533 °C']
  for (const [index, title] of titles.entries())
    await expect(
      query.getByRole('region', { name: `${title} point value`, exact: true }),
    ).toContainText(expected[index]!)
  for (const kind of ['original', 'downscaled', 'observation', 'difference'] as const) {
    await expect(
      resultMap(page, kind).getByLabel(
        `${titles[['original', 'downscaled', 'observation', 'difference'].indexOf(kind)]} point position`,
        { exact: true },
      ),
    ).toContainText('longitude 11 · latitude 47')
    await expect(
      resultMap(page, kind).getByRole('img', {
        name: 'Shared crosshair · longitude 11 · latitude 47',
        exact: true,
      }),
    ).toBeVisible()
  }
  const markerOriginal = await original.getByRole('img', { name: /Shared crosshair/ }).boundingBox()
  const markerDownscaled = await downscaled
    .getByRole('img', { name: /Shared crosshair/ })
    .boundingBox()
  const downSurface = await downscaled
    .getByRole('group', { name: 'Downscaled Data geographic samples' })
    .boundingBox()
  expect((markerOriginal!.x - box.x) / box.width).toBeGreaterThan(
    (markerDownscaled!.x - downSurface!.x) / downSurface!.width,
  )
  await expect(downscaled.getByLabel('Downscaled Data viewport')).toHaveText(shiftedCamera)
  await keyboardPoint(page, '11', '47')
  for (const [index, title] of titles.entries())
    await expect(
      query.getByRole('region', { name: `${title} point value`, exact: true }),
    ).toContainText(expected[index]!)
  await expect(query.getByLabel('Canonical point')).toHaveText('longitude 11 · latitude 47')
  await evidence.capture(page, 'point-1440-hover-keyboard-independent')
})

function pointRequest(body: string | null) {
  if (!body) return undefined
  try {
    // This is Start's real HTTP payload serialization, not component/store inspection.
    const payload: { data?: { task?: { id: string }; query?: ResultQuery } } = fromJSON(
      JSON.parse(body),
    )
    return payload.data?.query?.kind === 'points' && payload.data.query.points.length === 1
      ? payload.data
      : undefined
  } catch {
    return undefined
  }
}

test('real delayed and failed result HTTP never restores a stale point or frame and pending refresh preserves camera', async ({
  page,
  expectedSessionTransportFailures,
}, testInfo) => {
  const evidence = resultMapEvidence(testInfo, process.env.RESULT_MAP_EVIDENCE_DIR)
  await setupResultMapPage(page)
  await page.getByRole('button', { name: 'Switch to Station View', exact: true }).click()
  let release: () => void = () => {}
  let received: () => void = () => {}
  let delivered: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const ready = new Promise<void>((resolve) => {
    received = resolve
  })
  const finished = new Promise<void>((resolve) => {
    delivered = resolve
  })
  let heldOnce = false
  let failedOnce = false
  await page.route('**/_serverFn/**', async (route) => {
    const input = pointRequest(route.request().postData())
    const selected = input?.query
    if (
      selected?.kind === 'points' &&
      selected.layer === 'original' &&
      selected.points[0]?.longitude === 10 &&
      !heldOnce
    ) {
      heldOnce = true
      const response = await route.fetch()
      expect(response.ok()).toBe(true)
      received()
      await held
      try {
        await route.fulfill({ response })
      } finally {
        delivered()
      }
    } else if (
      selected?.kind === 'points' &&
      selected.layer === 'observation' &&
      selected.points[0]?.longitude === 11.1 &&
      !failedOnce
    ) {
      failedOnce = true
      const response = await route.fetch()
      expect(response.ok()).toBe(true)
      expectedSessionTransportFailures.add(route.request().url())
      await route.fulfill({
        status: 503,
        contentType: 'text/plain',
        body: 'Point observation service unavailable',
      })
    } else await route.continue()
  })
  try {
    await keyboardPoint(page, '10', '48')
    await ready
    const query = queryRegion(page)
    await keyboardPoint(page, '11', '47')
    await expect(query.getByLabel('Canonical point')).toHaveText('longitude 11 · latitude 47')
    await expect(query.getByLabel('Point query pending')).toBeVisible()
    await expect(
      query.getByRole('region', { name: 'Original Data point value', exact: true }),
    ).toHaveCount(0)
    await resultMap(page, 'original')
      .getByRole('button', { name: 'Zoom in Original Data', exact: true })
      .click()
    const camera = await resultMap(page, 'original')
      .getByLabel('Original Data viewport')
      .innerText()
    await selectResultFrame(page, '02')
    await expect(resultMap(page, 'original').getByLabel('Original Data viewport')).toHaveText(
      camera,
    )
    await expect(query.getByLabel('Point query pending')).toBeVisible()
    release()
    await finished
    await expect(
      query.getByRole('region', { name: 'Original Data point value', exact: true }),
    ).toContainText('16.8248 °C')
    await expect(
      query.getByRole('region', { name: 'Downscaled Data point value', exact: true }),
    ).toContainText('17.4844 °C')
    await expect(
      query.getByRole('region', { name: 'Observation Data point value', exact: true }),
    ).toContainText('-0.7484 °C')
    await expect(
      query.getByRole('region', {
        name: 'Difference (Downscaled - Original) point value',
        exact: true,
      }),
    ).toContainText('0.6596 °C')
    await expect(query.getByLabel('Point frame')).toContainText('2024-01-02T00:00:00.000Z')
    await expect(query).not.toContainText('16.2787 °C')
    await keyboardPoint(page, '11.1', '47')
    await expect(
      query.getByRole('region', { name: 'Observation Data point value', exact: true }),
    ).toContainText(/Query failed.*QUERY_FAILED/)
    await expect(
      query.getByRole('region', { name: 'Original Data point value', exact: true }),
    ).toContainText('°C')
    await expect(
      query.getByRole('region', {
        name: 'Difference (Downscaled - Original) point value',
        exact: true,
      }),
    ).toContainText('°C')
    await expect(query).not.toContainText('-0.7484 °C')
    await evidence.capture(page, 'point-real-http-delay-failure-frame')
    await page.getByRole('link', { name: '任务管理', exact: true }).first().click()
    await expect(query).toHaveCount(0)
    await page
      .getByRole('button', { name: '查看任务 Synthetic Demo · Plateau MSL pressure', exact: true })
      .click()
    await page.getByRole('button', { name: '查看结果分析', exact: true }).click()
    await expect(queryRegion(page).getByLabel('Canonical point')).toHaveCount(0)
    await keyboardPoint(page, '90', '32')
    await expect(
      queryRegion(page).getByRole('region', { name: 'Original Data point value', exact: true }),
    ).toContainText('1021.55 hPa')
    await expect(queryRegion(page)).not.toContainText('°C')
  } finally {
    release()
  }
})

test('responsive current bounds support keyboard and hover at the same point at 390px without querying during drag', async ({
  page,
}, testInfo) => {
  const evidence = resultMapEvidence(testInfo, process.env.RESULT_MAP_EVIDENCE_DIR)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await setupResultMapPage(page)
  const surface = resultMap(page, 'original').getByRole('group', {
    name: 'Original Data geographic samples',
    exact: true,
  })
  await surface.scrollIntoViewIfNeeded()
  const box = await surface.boundingBox()
  if (!box) throw new Error('Responsive map has no current bounds')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await expect(queryRegion(page).getByLabel('Canonical point')).toHaveText(
    'longitude 11 · latitude 47',
  )
  await expect(
    queryRegion(page).getByRole('region', { name: 'Original Data point value', exact: true }),
  ).toContainText('16.7216 °C')
  await keyboardPoint(page, '11', '47')
  await expect(
    queryRegion(page).getByRole('region', { name: 'Downscaled Data point value', exact: true }),
  ).toContainText('17.2749 °C')
  await evidence.capture(page, 'point-390-keyboard-reduced-motion')
  await queryRegion(page).getByRole('button', { name: 'Clear point', exact: true }).click()
  await surface.scrollIntoViewIfNeeded()
  const current = await surface.boundingBox()
  if (!current) throw new Error('Responsive map disappeared')
  await page.mouse.move(current.x + current.width / 2, current.y + current.height / 2)
  await page.mouse.down()
  await page.mouse.move(current.x + current.width / 2 + 25, current.y + current.height / 2 + 10, {
    steps: 8,
  })
  await expect(queryRegion(page).getByLabel('Canonical point')).toHaveCount(0)
  await page.mouse.up()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391)
})

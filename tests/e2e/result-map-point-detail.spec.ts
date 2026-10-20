import { resultMapEvidence } from './helpers/result-map-evidence'
import { fromJSON } from 'seroval'
import type { ResultQuery } from '@/features/downscaling-tasks/service'
import { test, expect, type Page } from './browser-guard'
import { resultMap, setupResultMapPage, selectResultFrame } from './helpers/result-map-page'

const detailRegion = (page: Page) =>
  page.getByRole('region', { name: 'Pinned point detail', exact: true })
const queryRegion = (page: Page) =>
  page.getByRole('region', { name: 'Joint point query', exact: true })

test('actual click pins independently of hover and camera drag, then reads the same coordinate in a new frame', async ({
  page,
}, testInfo) => {
  const evidence = resultMapEvidence(testInfo, process.env.RESULT_MAP_EVIDENCE_DIR)
  await page.setViewportSize({ width: 1440, height: 1050 })
  await setupResultMapPage(page)
  await page.getByRole('button', { name: 'Switch to Station View', exact: true }).click()
  const surface = resultMap(page, 'original').getByRole('group', {
    name: 'Original Data geographic samples',
    exact: true,
  })
  await surface.scrollIntoViewIfNeeded()
  const box = await surface.boundingBox()
  if (!box) throw new Error('Real map has no viewport bounds')
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.click(center.x, center.y)
  const detail = detailRegion(page)
  await expect(detail.getByLabel('Pinned coordinate', { exact: true })).toContainText(
    'longitude 11 · latitude 47',
  )
  await expect(
    detail.getByRole('region', { name: 'Original Data point value', exact: true }),
  ).toContainText('16.7216 °C')
  await expect(detail.getByLabel('Local error improvement', { exact: true })).toHaveText('-3.1578%')
  const beforeCamera = await resultMap(page, 'original')
    .getByLabel('Original Data viewport')
    .innerText()
  await page.mouse.move(center.x + box.width / 4, center.y)
  await expect(queryRegion(page).getByLabel('Canonical point', { exact: true })).not.toHaveText(
    'longitude 11 · latitude 47',
  )
  await expect(detail.getByLabel('Pinned coordinate')).toContainText('longitude 11 · latitude 47')
  await expect(detail.getByLabel('Local error improvement')).toHaveText('-3.1578%')
  await page.mouse.move(center.x, center.y)
  await page.mouse.down()
  await page.mouse.move(center.x + 70, center.y + 25, { steps: 5 })
  await page.mouse.up()
  await expect(resultMap(page, 'original').getByLabel('Original Data viewport')).not.toHaveText(
    beforeCamera,
  )
  await expect(detail.getByLabel('Pinned coordinate')).toContainText('longitude 11 · latitude 47')
  await expect(detail.getByLabel('Local error improvement')).toHaveText('-3.1578%')
  await selectResultFrame(page, '02')
  await expect(detail.getByLabel('Pinned frame')).toContainText('2024-01-02T00:00:00.000Z')
  await expect(detail.getByLabel('Pinned coordinate')).toContainText('longitude 11 · latitude 47')
  await expect(
    detail.getByRole('region', { name: 'Original Data point value', exact: true }),
  ).toContainText('16.8248 °C')
  await expect(
    detail.getByRole('region', { name: 'Downscaled Data point value', exact: true }),
  ).toContainText('17.4844 °C')
  await evidence.capture(page, 'pin-1440-click-hover-drag-frame')
})

async function keyboardPoint(page: Page, longitude: string, latitude: string) {
  const query = queryRegion(page)
  await query.getByRole('textbox', { name: 'Longitude', exact: true }).fill(longitude)
  await query.getByRole('textbox', { name: 'Latitude', exact: true }).fill(latitude)
  await query.getByRole('textbox', { name: 'Latitude', exact: true }).press('Enter')
}

test('keyboard Pin Replace Clear has understandable focus and positive/unavailable current reference at 390px', async ({
  page,
}, testInfo) => {
  const evidence = resultMapEvidence(testInfo, process.env.RESULT_MAP_EVIDENCE_DIR)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await setupResultMapPage(page)
  await page.getByRole('button', { name: 'Switch to Station View', exact: true }).click()
  await keyboardPoint(page, '10', '48')
  const query = queryRegion(page)
  const pin = query.getByRole('button', { name: 'Pin current point', exact: true })
  await pin.focus()
  await page.keyboard.press('Enter')
  await expect(
    query.getByRole('button', { name: 'Replace pinned point', exact: true }),
  ).toBeFocused()
  const detail = detailRegion(page)
  await expect(detail.getByLabel('Local error improvement', { exact: true })).toHaveText('9.3218%')
  await expect(detail.getByLabel('Pinned task', { exact: true })).toContainText(
    'demo-v1:researcher:alpine-temperature',
  )
  await expect(detail.getByLabel('Pinned frame', { exact: true })).toContainText(
    '2024-01-01T00:00:00.000Z',
  )
  await expect(
    detail.getByRole('region', { name: 'Observation Data point value', exact: true }),
  ).toContainText('longitude 10 · latitude 48')
  await expect(detail).not.toContainText(/NaN|Infinity/)
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)
  await evidence.capture(page, 'pin-390-keyboard-positive-reduced-motion')
  await detail.screenshot({ path: await evidence.path('pin-390-detail-positive.png') })
  await evidence.attach('pin-390-detail-positive.png')
  await keyboardPoint(page, '11.5', '47.5')
  await expect(detail.getByLabel('Pinned coordinate')).toContainText('longitude 10 · latitude 48')
  await expect(detail.getByLabel('Local error improvement')).toHaveText('9.3218%')
  const replace = query.getByRole('button', { name: 'Replace pinned point', exact: true })
  await replace.focus()
  await page.keyboard.press('Space')
  await expect(replace).toBeFocused()
  await expect(detail.getByLabel('Pinned coordinate')).toContainText(
    'longitude 11.5 · latitude 47.5',
  )
  await expect(detail.getByLabel('Local error improvement')).toContainText('NO_OBSERVATION')
  await expect(
    detail.getByRole('region', {
      name: 'Difference (Downscaled - Original) point value',
      exact: true,
    }),
  ).toContainText('-0.7334 °C')
  await page.getByRole('button', { name: 'Switch to Interpolated View', exact: true }).click()
  await expect(detail.getByLabel('Pinned coordinate')).toContainText(
    'longitude 11.5 · latitude 47.5',
  )
  await expect(detail.getByLabel('Local error improvement')).toHaveText('4.4441%')
  await expect(detail).toContainText('Interpolated-reference improvement')
  await expect(detail).toContainText('not measured-station validation')
  await expect(
    detail.getByRole('region', { name: 'Observation Data point value', exact: true }),
  ).toContainText('weight 0.25')
  await evidence.capture(page, 'pin-390-interpolated-support')
  const clear = query.getByRole('button', { name: 'Clear pinned point', exact: true })
  await clear.focus()
  await page.keyboard.press('Enter')
  await expect(clear).toBeFocused()
  await expect(detail).toHaveCount(0)
  await expect(query.getByLabel('Pinned point status')).toContainText('No pinned point')
  await page.setViewportSize({ width: 768, height: 1024 })
  await keyboardPoint(page, '10', '48')
  await query.getByRole('button', { name: 'Pin current point', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(detail.getByLabel('Local error improvement')).toHaveText('9.3218%')
  await evidence.capture(page, 'pin-768-keyboard-positive')
})

function pointRequest(body: string | null) {
  if (!body) return undefined
  try {
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

test('current pinned HTTP failure can retry and delayed frame response cannot survive clearing or leaving', async ({
  page,
  expectedSessionTransportFailures,
}, testInfo) => {
  const evidence = resultMapEvidence(testInfo, process.env.RESULT_MAP_EVIDENCE_DIR)
  await page.setViewportSize({ width: 1440, height: 1050 })
  await setupResultMapPage(page)
  await page.getByRole('button', { name: 'Switch to Station View', exact: true }).click()
  await keyboardPoint(page, '10', '48')
  const query = queryRegion(page)
  await query.getByRole('button', { name: 'Pin current point', exact: true }).click()
  const detail = detailRegion(page)
  await expect(detail.getByLabel('Local error improvement')).toHaveText('9.3218%')
  let release: () => void = () => {}
  let received: () => void = () => {}
  let delivered: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const started = new Promise<void>((resolve) => {
    received = resolve
  })
  const finished = new Promise<void>((resolve) => {
    delivered = resolve
  })
  let failedOnce = false
  let heldOnce = false
  await page.route('**/_serverFn/**', async (route) => {
    const selected = pointRequest(route.request().postData())?.query
    if (
      selected?.kind === 'points' &&
      selected.layer === 'observation' &&
      selected.times[0]?.startsWith('2024-01-02') &&
      !failedOnce
    ) {
      failedOnce = true
      const response = await route.fetch()
      expect(response.ok()).toBe(true)
      expectedSessionTransportFailures.add(route.request().url())
      await route.fulfill({
        status: 503,
        contentType: 'text/plain',
        body: 'Current pinned reference service unavailable',
      })
    } else if (
      selected?.kind === 'points' &&
      selected.layer === 'observation' &&
      selected.times[0]?.startsWith('2024-01-03') &&
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
    } else await route.continue()
  })
  try {
    await selectResultFrame(page, '02')
    await expect(detail.getByLabel('Pinned coordinate')).toContainText('longitude 10 · latitude 48')
    await expect(detail.getByLabel('Pinned frame')).toContainText('2024-01-02T00:00:00.000Z')
    await expect(detail.getByRole('alert')).toContainText('Current pinned query failed')
    await expect(detail.getByLabel('Local error improvement')).toContainText('QUERY_FAILED')
    await expect(
      detail.getByRole('region', { name: 'Observation Data point value', exact: true }),
    ).not.toContainText('0.8 °C')
    await detail.getByRole('button', { name: 'Retry pinned query', exact: true }).click()
    await expect(detail.getByRole('alert')).toHaveCount(0)
    await expect(
      detail.getByRole('region', { name: 'Observation Data point value', exact: true }),
    ).toContainText('0.8516 °C')
    await expect(detail.getByLabel('Local error improvement')).toHaveText(/%$/)
    await selectResultFrame(page, '03')
    await started
    await expect(detail.getByLabel('Pinned query pending', { exact: true })).toBeVisible()
    await expect(
      detail.getByRole('region', { name: 'Original Data point value', exact: true }),
    ).toHaveCount(0)
    await query.getByRole('button', { name: 'Clear pinned point', exact: true }).click()
    await expect(detail).toHaveCount(0)
    await page.getByRole('link', { name: '任务管理', exact: true }).first().click()
    await expect(query).toHaveCount(0)
    release()
    await finished
    await page
      .getByRole('button', { name: '查看任务 Synthetic Demo · Plateau MSL pressure', exact: true })
      .click()
    await page.getByRole('button', { name: '查看结果分析', exact: true }).click()
    await expect(detailRegion(page)).toHaveCount(0)
    await expect(queryRegion(page).getByLabel('Pinned point status')).toContainText(
      'No pinned point',
    )
    await keyboardPoint(page, '90', '32')
    await queryRegion(page).getByRole('button', { name: 'Pin current point', exact: true }).click()
    await expect(detailRegion(page).getByLabel('Local error improvement')).toHaveText('0.0000%')
    await expect(
      detailRegion(page).getByRole('region', { name: 'Original Data point value', exact: true }),
    ).toContainText('1021.55 hPa')
    await expect(detailRegion(page)).not.toContainText('°C')
    await evidence.capture(page, 'pin-real-http-retry-disposal-pressure')
  } finally {
    release()
  }
})

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from './browser-guard'
import { setupResultMapPage, resultMap, selectResultFrame } from './helpers/result-map-page'
import { submitDemoLogin } from './demo-login'

const evidence =
  process.env.RESULT_MAP_EVIDENCE_DIR ??
  '/Users/xiaoyu/Projects/meteo-weave/.git/agent-runs/spec-15-20261020/ticket-01'

async function capture(page: import('./browser-guard').Page, name: string) {
  await mkdir(evidence, { recursive: true })
  await page.screenshot({ path: join(evidence, `${name}.png`), fullPage: true })
}

test('renders native temperature/Difference coordinates, changes frames, and pans/zooms a real map independently', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await setupResultMapPage(page)
  const original = resultMap(page, 'original')
  const downscaled = resultMap(page, 'downscaled')
  for (const kind of ['original', 'downscaled', 'observation', 'difference'] as const)
    await expect(resultMap(page, kind).getByRole('img').first()).toBeVisible()
  const originalEdge = original.getByRole('img', { name: /longitude 10, latitude 48.*16.2787 °C/ })
  const targetEdge = downscaled.getByRole('img', { name: /longitude 10, latitude 48.*14.8358 °C/ })
  await expect(originalEdge).toBeVisible()
  await expect(targetEdge).toBeVisible()
  await expect(
    resultMap(page, 'difference').getByRole('img', { name: /longitude 10, latitude 48.*-1.442/ }),
  ).toBeVisible()
  const north = await originalEdge.boundingBox()
  const south = await original
    .getByRole('img', { name: /longitude 10, latitude 46 ·/ })
    .boundingBox()
  expect(north!.y).toBeLessThan(south!.y)
  expect(Math.abs(north!.x - south!.x)).toBeLessThan(2)
  const card = page
    .getByRole('heading', { name: 'Original Data', exact: true })
    .locator('..')
    .locator('..')
  await expect(card).toContainText('10 km native spacing')
  await expect(card).toContainText('decimated preview')
  await expect(card.getByLabel('Map color legend')).toContainText('°C')
  await capture(page, 'temperature-1440-four-maps')

  await selectResultFrame(page, '02')
  await expect(original.getByRole('img').first()).toHaveAccessibleName(/2024-01-02T00:00:00.000Z/)
  await expect(originalEdge).toHaveCount(0)
  await page.getByRole('button', { name: 'Switch to Station View' }).click()
  const station = resultMap(page, 'observation').getByRole('img', {
    name: /synthetic-station-v1:11:47/,
  })
  await expect(station).toBeVisible()
  await expect(resultMap(page, 'observation').getByRole('img')).toHaveCount(9)

  await page.getByRole('checkbox', { name: 'Synchronize map cameras' }).uncheck()

  const summary = original.getByLabel('Original Data viewport')
  const before = await summary.innerText()
  const other = await downscaled.getByLabel('Downscaled Data viewport').innerText()
  const surface = original.getByRole('group', { name: 'Original Data geographic samples' })
  await surface.scrollIntoViewIfNeeded()
  const box = await surface.boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width / 2 + 45, box!.y + box!.height / 2 + 20, { steps: 6 })
  await page.mouse.up()
  await expect(summary).not.toHaveText(before)
  await expect(downscaled.getByLabel('Downscaled Data viewport')).toHaveText(other)
  const moved = await summary.innerText()
  await original.getByRole('button', { name: 'Zoom in Original Data' }).click()
  await expect(summary).not.toHaveText(moved)
  await capture(page, 'temperature-frame2-stations-camera')
})

test('renders MSL pressure with a public literal, refresh/direct entry and normal navigation', async ({
  page,
}) => {
  const { url } = await setupResultMapPage(page, 'pressure')
  await expect(
    resultMap(page, 'original').getByRole('img', {
      name: /longitude 90, latitude 32.*1021.55 hPa/,
    }),
  ).toBeVisible()
  await page.reload()
  await expect(
    resultMap(page, 'original')
      .getByRole('img', { name: /1021.55 hPa/ })
      .first(),
  ).toBeVisible()
  await page.goto(url)
  await expect(resultMap(page, 'downscaled')).toBeVisible()
  await page.getByRole('link', { name: '任务管理', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: '任务管理', exact: true })).toBeVisible()
  await expect(resultMap(page, 'original')).toHaveCount(0)
  await capture(page, 'pressure-navigation-released')
})

test('renders wind speed/vectors and calm stations, switches members, and explains unavailable stddev', async ({
  page,
}) => {
  await setupResultMapPage(page, 'wind')
  await page.getByRole('button', { name: 'Switch to Station View' }).click()
  await expect(
    resultMap(page, 'observation').getByRole('img', {
      name: /synthetic-station-v1:121:31.*0 m\/s.*calm/,
    }),
  ).toBeVisible()
  await expect(resultMap(page, 'original').getByRole('img').first()).toHaveAccessibleName(
    /U10.*V10/,
  )
  const mean = await resultMap(page, 'downscaled')
    .getByRole('img')
    .first()
    .getAttribute('aria-label')
  await page.getByRole('combobox', { name: 'Ensemble view' }).click()
  await page.getByRole('option', { name: 'Member 01', exact: true }).click()
  await expect(resultMap(page, 'downscaled').getByRole('img').first()).not.toHaveAccessibleName(
    mean!,
  )
  await expect(page.getByText('Member values:', { exact: false })).toContainText('member-01')
  await page.getByRole('combobox', { name: 'Ensemble view' }).click()
  await page.getByRole('option', { name: 'Standard Deviation', exact: true }).click()
  await expect(page.getByText(/Wind Standard Deviation is unavailable/)).toBeVisible()
  await expect(resultMap(page, 'downscaled')).toHaveCount(0)
  await expect(resultMap(page, 'original')).toBeVisible()
  await capture(page, 'wind-stddev-honest-unavailable')
})

test('renders precipitation units, complete native accumulation intervals and valid zero stations', async ({
  page,
}) => {
  await setupResultMapPage(page, 'precipitation')
  await page.getByRole('button', { name: 'Switch to Station View' }).click()
  await expect(
    resultMap(page, 'observation').getByRole('img', { name: /synthetic-station-v1:114:30.*0 mm/ }),
  ).toBeVisible()
  await expect(page.getByText(/Accumulation Interval \(UTC\)/).first()).toContainText(
    '2024-01-02T00:00:00.000Z',
  )
  await expect(page.getByText(/Accumulation Interval \(UTC\)/).first()).toContainText(
    '24/24 hours · complete',
  )
  await selectResultFrame(page, '02')
  await expect(page.getByText(/Accumulation Interval \(UTC\)/).first()).toContainText(
    '2024-01-03T00:00:00.000Z',
  )
  await capture(page, 'precipitation-interval-frame2')
})

test('keeps controls and maps readable at 390px and supports keyboard camera and observation controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await setupResultMapPage(page, 'wind')
  const map = resultMap(page, 'original')
  const surface = map.getByRole('group', { name: 'Original Data geographic samples' })
  await surface.focus()
  const before = await map.getByLabel('Original Data viewport').innerText()
  await page.keyboard.press('ArrowRight')
  await expect(map.getByLabel('Original Data viewport')).not.toHaveText(before)
  await page.getByRole('button', { name: 'Switch to Station View' }).focus()
  await page.keyboard.press('Enter')
  await expect(
    resultMap(page, 'observation').getByRole('img', { name: /synthetic-station-v1:121:31/ }),
  ).toBeVisible()
  const size = await map.boundingBox()
  expect(size!.width).toBeGreaterThan(250)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391)
  await capture(page, 'wind-390-keyboard-reduced-motion')
})

test('does not retain outgoing task maps after logout and another account login', async ({
  page,
}) => {
  await setupResultMapPage(page)
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await expect(page).toHaveURL('/login')
  await expect(resultMap(page, 'original')).toHaveCount(0)
  await submitDemoLogin(page, 'policy')
  await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('policy')
  await expect(resultMap(page, 'original')).toHaveCount(0)
})

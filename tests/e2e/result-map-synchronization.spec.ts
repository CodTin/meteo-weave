import { resultMapEvidence } from './helpers/result-map-evidence'
import { expect, test, type Locator, type Page } from './browser-guard'
import { setupResultMapPage, resultMap } from './helpers/result-map-page'

const kinds = ['original', 'downscaled', 'observation', 'difference'] as const
const titles = {
  original: 'Original Data',
  downscaled: 'Downscaled Data',
  observation: 'Observation Data',
  difference: 'Difference (Downscaled - Original)',
}
type MapKind = (typeof kinds)[number]

function summary(page: Page, kind: MapKind) {
  return resultMap(page, kind).getByLabel(`${titles[kind]} viewport`)
}

function surface(page: Page, kind: MapKind) {
  return resultMap(page, kind).getByRole('group', { name: `${titles[kind]} geographic samples` })
}

/** Public rendered SVG sample footprint, not a map engine or application store. */
async function footprint(page: Page, kind: MapKind) {
  return resultMap(page, kind)
    .getByRole('img', { name: /^longitude 10, latitude 48 ·/ })
    .locator('rect, circle')
    .first()
    .evaluate((shape) =>
      Object.fromEntries(
        ['x', 'y', 'width', 'height', 'cx', 'cy', 'r'].map((name) => [
          name,
          shape.getAttribute(name),
        ]),
      ),
    )
}

async function cameras(page: Page) {
  return Promise.all(kinds.map((kind) => summary(page, kind).innerText()))
}

async function shapes(page: Page) {
  return Promise.all(kinds.map((kind) => footprint(page, kind)))
}

async function drag(page: Page, map: Locator, dx: number, dy: number) {
  await map.scrollIntoViewIfNeeded()
  const box = await map.boundingBox()
  expect(box).not.toBeNull()
  const x = box!.x + box!.width / 2
  const y = box!.y + box!.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 8 })
  await page.mouse.up()
}

async function expectAligned(page: Page, expected: string) {
  for (const kind of kinds) await expect(summary(page, kind)).toHaveText(expected)
}

async function expectSettled(page: Page) {
  const acceptedCameras = await cameras(page)
  const acceptedShapes = await shapes(page)
  // A bounded quiet window detects continued camera chasing after the user stops.
  for (let check = 0; check < 3; check++) {
    await page.waitForTimeout(250)
    expect(await cameras(page)).toEqual(acceptedCameras)
    expect(await shapes(page)).toEqual(acceptedShapes)
  }
}

test('synchronizes real pointer pan and wheel zoom from different maps, including sample geometry, then settles', async ({
  page,
}, testInfo) => {
  const evidence = resultMapEvidence(testInfo, process.env.RESULT_MAP_EVIDENCE_DIR)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await setupResultMapPage(page)
  await expect(page.getByRole('checkbox', { name: 'Synchronize map cameras' })).toBeChecked()
  const originalSample = resultMap(page, 'original').getByRole('img', {
    name: /^longitude 10, latitude 48 .*16.2787 °C/,
  })
  const downscaledSample = resultMap(page, 'downscaled').getByRole('img', {
    name: /^longitude 10, latitude 48 .*14.8358 °C/,
  })
  await expect(originalSample).toBeVisible()
  await expect(downscaledSample).toBeVisible()
  const initial = await cameras(page)
  const beforePan = await shapes(page)
  await drag(page, surface(page, 'original'), 36, 14)
  const panned = await summary(page, 'original').innerText()
  expect(panned).not.toBe(initial[0])
  await expectAligned(page, panned)
  const afterPan = await shapes(page)
  for (let index = 0; index < kinds.length; index++)
    expect(afterPan[index]).not.toEqual(beforePan[index])
  await expect(page.getByLabel('Active map camera')).toContainText('Original Data')

  const wheelMap = surface(page, 'downscaled')
  await wheelMap.focus()
  await wheelMap.hover()
  await page.mouse.wheel(0, -160)
  await expect(summary(page, 'downscaled')).not.toHaveText(panned)
  const zoomed = await summary(page, 'downscaled').innerText()
  await expectAligned(page, zoomed)
  for (let index = 0; index < kinds.length; index++)
    expect((await shapes(page))[index]).not.toEqual(afterPan[index])
  await expect(page.getByLabel('Active map camera')).toContainText('Downscaled Data')
  await expect(originalSample).toHaveAccessibleName(/16.2787 °C/)
  await expect(downscaledSample).toHaveAccessibleName(/14.8358 °C/)
  await expectSettled(page)
  await evidence.capture(page, 'sync-1440-pointer-wheel-aligned')
})

test('disables synchronization for independent real cameras and re-aligns from the keyboard-focused active map', async ({
  page,
}, testInfo) => {
  const evidence = resultMapEvidence(testInfo, process.env.RESULT_MAP_EVIDENCE_DIR)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await setupResultMapPage(page)
  const sync = page.getByRole('checkbox', { name: 'Synchronize map cameras' })
  await sync.focus()
  await page.keyboard.press('Space')
  await expect(sync).not.toBeChecked()
  const initial = await cameras(page)
  const before = await shapes(page)
  await resultMap(page, 'original').getByRole('button', { name: 'Pan west Original Data' }).click()
  const originalCamera = await summary(page, 'original').innerText()
  expect(originalCamera).not.toBe(initial[0])
  expect(await footprint(page, 'original')).not.toEqual(before[0])
  for (const kind of ['downscaled', 'observation', 'difference'] as const) {
    await expect(summary(page, kind)).toHaveText(initial[kinds.indexOf(kind)]!)
    expect(await footprint(page, kind)).toEqual(before[kinds.indexOf(kind)])
  }
  const originalShape = await footprint(page, 'original')
  await resultMap(page, 'downscaled')
    .getByRole('button', { name: 'Zoom in Downscaled Data' })
    .click()
  await expect(summary(page, 'original')).toHaveText(originalCamera)
  expect(await footprint(page, 'original')).toEqual(originalShape)
  await expect(summary(page, 'downscaled')).not.toHaveText(initial[1]!)
  await expect(page.getByLabel('Active map camera')).toContainText('Downscaled Data')
  await evidence.capture(page, 'sync-off-1440-independent-cameras')

  // Merely focusing the desired source must determine alignment, not the previous mover.
  await surface(page, 'original').focus()
  await expect(page.getByLabel('Active map camera')).toContainText('Original Data')
  await sync.focus()
  await page.keyboard.press('Space')
  await expect(sync).toBeChecked()
  await expectAligned(page, originalCamera)
  expect(await footprint(page, 'original')).toEqual(originalShape)
  for (const kind of ['downscaled', 'observation', 'difference'] as const) {
    expect(await footprint(page, kind)).not.toEqual(before[kinds.indexOf(kind)])
  }
  await expectSettled(page)
  await evidence.capture(page, 'sync-reenabled-current-active-source')
})

test('keeps sync controls readable at 390px and converges after alternating button and keyboard sources', async ({
  page,
}, testInfo) => {
  const evidence = resultMapEvidence(testInfo, process.env.RESULT_MAP_EVIDENCE_DIR)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await setupResultMapPage(page)
  await expect(page.getByRole('checkbox', { name: 'Synchronize map cameras' })).toBeChecked()
  const initial = await summary(page, 'original').innerText()
  await resultMap(page, 'original').getByRole('button', { name: 'Zoom in Original Data' }).click()
  await surface(page, 'downscaled').focus()
  await page.keyboard.press('ArrowRight')
  await surface(page, 'observation').focus()
  await page.keyboard.press('ArrowUp')
  await surface(page, 'difference').focus()
  await page.keyboard.press('-')
  const final = await summary(page, 'difference').innerText()
  expect(final).not.toBe(initial)
  await expectAligned(page, final)
  await expect(page.getByLabel('Active map camera')).toContainText(
    'Difference (Downscaled - Original)',
  )
  await expectSettled(page)
  for (const kind of kinds) {
    const box = await resultMap(page, kind).boundingBox()
    expect(box!.width).toBeGreaterThan(250)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391)
  await evidence.capture(page, 'sync-390-keyboard-alternating-reduced-motion')
})

test('releases outgoing cameras on navigation and reload and re-enters without multiplying camera responses', async ({
  page,
}) => {
  const { url } = await setupResultMapPage(page)
  const initial = await summary(page, 'original').innerText()
  await page.getByRole('checkbox', { name: 'Synchronize map cameras' }).uncheck()
  await resultMap(page, 'original').getByRole('button', { name: 'Zoom in Original Data' }).click()
  await page.getByRole('link', { name: '任务管理', exact: true }).first().click()
  await expect(resultMap(page, 'original')).toHaveCount(0)
  await expect(page.getByRole('checkbox', { name: 'Synchronize map cameras' })).toHaveCount(0)
  await page.goto(url)
  await expect(page.getByRole('checkbox', { name: 'Synchronize map cameras' })).toBeChecked()
  await expectAligned(page, initial)
  await resultMap(page, 'original').getByRole('button', { name: 'Zoom in Original Data' }).click()
  const zoomedOnce = await summary(page, 'original').innerText()
  await expectAligned(page, zoomedOnce)
  await page.reload()
  await expectAligned(page, initial)
  await resultMap(page, 'original').getByRole('button', { name: 'Zoom in Original Data' }).click()
  await expectAligned(page, zoomedOnce)
  await expectSettled(page)
})

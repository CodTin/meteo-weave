import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'

// This is a black-box check of the real fixture: the child tests MUST fail.
// Run it with browser checks, not the fast pre-commit/unit-test path.
const directory = mkdtempSync(join(tmpdir(), 'meteo-browser-guard-'))
try {
  const guard = resolve('tests/e2e/browser-guard.ts')
  writeFileSync(
    join(directory, 'guard.spec.ts'),
    `
import { test } from ${JSON.stringify(guard)}
test('control passes', async ({ page }) => { await page.goto('about:blank') })
test('uncaught error is rejected', async ({ page }) => {
  await page.goto('about:blank')
  const observed = page.waitForEvent('pageerror')
  await page.evaluate(() => { setTimeout(() => { throw new Error('GUARD_PAGE_CANARY') }, 0) })
  await observed
})
test('console error is rejected', async ({ page }) => {
  await page.goto('about:blank')
  await page.evaluate(() => console.error('GUARD_CONSOLE_CANARY'))
})
`,
  )
  writeFileSync(
    join(directory, 'playwright.config.mjs'),
    `export default ${JSON.stringify({ testDir: directory, outputDir: join(directory, 'results'), workers: 1, retries: 0, timeout: 15000, use: { browserName: 'chromium', headless: true } })}`,
  )
  const child = spawnSync(
    resolve('node_modules/.bin/playwright'),
    ['test', '--config', join(directory, 'playwright.config.mjs'), '--reporter=json'],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  )
  if (child.error) throw child.error
  assert.equal(child.status, 1, 'The two unanticipated browser errors must fail the real fixture.')
  const report = JSON.parse(child.stdout)
  assert.equal(
    report.stats.expected,
    1,
    'The control must pass; setup failures do not prove the guard works.',
  )
  assert.equal(report.stats.unexpected, 2)
  assert.equal(report.stats.skipped, 0)
  assert.equal(report.stats.flaky, 0)
  for (const marker of ['GUARD_PAGE_CANARY', 'GUARD_CONSOLE_CANARY'])
    assert.ok(JSON.stringify(report).includes(marker))
  console.log(
    'Browser guard self-check passed: control succeeded; both unexpected errors were rejected.',
  )
} finally {
  rmSync(directory, { recursive: true, force: true })
}

import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { TestInfo } from '@playwright/test'
import type { Page } from '../browser-guard'

/** CI artifacts belong to Playwright; explicit local copies still get a unique test/run directory. */
export function resultMapEvidence(
  testInfo: Pick<TestInfo, 'outputPath' | 'outputDir' | 'attach'>,
  localDirectory?: string,
) {
  const localOutput = localDirectory
    ? join(localDirectory, basename(testInfo.outputDir), randomUUID())
    : undefined
  async function path(name: string) {
    const output = localOutput ? join(localOutput, name) : testInfo.outputPath(name)
    await mkdir(dirname(output), { recursive: true })
    return output
  }
  async function attach(name: string) {
    await testInfo.attach(name, {
      path: await path(name),
      contentType: name.endsWith('.png') ? 'image/png' : 'application/json',
    })
  }
  return {
    path,
    attach,
    async capture(page: Page, name: string) {
      const filename = `${name}.png`
      await page.screenshot({ path: await path(filename), fullPage: true })
      await attach(filename)
    },
    async json(name: string, value: unknown) {
      const filename = `${name}.json`
      await writeFile(await path(filename), JSON.stringify(value, null, 2))
      await attach(filename)
    },
  }
}

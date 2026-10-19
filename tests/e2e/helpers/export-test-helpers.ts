import fs from 'node:fs/promises'
import type { Download, Page } from '@playwright/test'
import Papa from 'papaparse'
import { expect } from '../browser-guard'
import { submitDemoLogin } from '../demo-login'

export const exportExamples = {
  temperature: {
    id: 'alpine-temperature',
    name: 'Synthetic Demo · Alpine mountain temperature',
    west: 10,
    south: 46,
  },
  wind: {
    id: 'coastal-wind',
    name: 'Synthetic Demo · Coastal plain wind ensemble',
    west: 120,
    south: 30,
  },
  pressure: {
    id: 'plateau-pressure',
    name: 'Synthetic Demo · Plateau MSL pressure',
    west: 90,
    south: 32,
  },
  precipitation: {
    id: 'lowland-rain',
    name: 'Synthetic Demo · Lowland plain rainfall ensemble',
    west: 113,
    south: 29,
  },
} as const
export type ExportVariable = keyof typeof exportExamples
export type ExportLayer = 'original' | 'downscaled' | 'observation'
export type ExportFormat = 'csv' | 'geojson' | 'netcdf'

/** Canonical examples are opened using the actual authenticated task list, never injected into storage. */
export async function setupExportTab(page: Page, variable: ExportVariable = 'temperature') {
  await page.goto('/login')
  await submitDemoLogin(page)
  await expect(page).toHaveURL('/dashboard')
  await page
    .getByRole('navigation', { name: '工作区导航', exact: true })
    .getByRole('link', { name: '任务管理', exact: true })
    .click()
  const example = exportExamples[variable]
  await page.getByRole('button', { name: `查看任务 ${example.name}`, exact: true }).click()
  await expect
    .poll(() => decodeURIComponent(new URL(page.url()).pathname))
    .toBe(`/tasks/demo-v1:researcher:${example.id}`)
  await page.getByRole('button', { name: '查看结果分析', exact: true }).click()
  await page.getByRole('tab', { name: '数据导出', exact: true }).click()
  await expect(page.getByRole('tabpanel', { name: '数据导出', exact: true })).toBeVisible()
  return `demo-v1:researcher:${example.id}`
}

/** Keep a real native-grid corner and short half-open UTC interval; do not redefine a crop lattice. */
export async function selectSmallExport(page: Page, variable: ExportVariable = 'temperature') {
  const { west, south } = exportExamples[variable]
  await page.getByLabel('东经 (°E)', { exact: true }).fill(String(west + 0.4))
  await page.getByLabel('北纬 (°N)', { exact: true }).fill(String(south + 0.4))
  await page.getByLabel('开始时间 (UTC，包含)', { exact: true }).fill('2024-01-01T00:00')
  await page.getByLabel('结束时间 (UTC，不包含)', { exact: true }).fill('2024-01-01T02:00')
  await expect(page.getByLabel('估算状态')).toHaveText('当前选择估算已更新。')
}

export async function selectExportLayers(page: Page, layers: ExportLayer[]) {
  for (const [layer, label] of [
    ['original', '原始数据（粗网格）'],
    ['downscaled', '降尺度数据（目标网格）'],
    ['observation', '观测数据（实际台站）'],
  ] as const)
    await page
      .getByRole('checkbox', { name: label, exact: true })
      .setChecked(layers.includes(layer))
}

export async function downloadExport(page: Page, format: ExportFormat) {
  const label = { csv: 'CSV', geojson: 'GeoJSON', netcdf: 'NetCDF' }[format]
  await page.getByRole('radio', { name: new RegExp(`^${label}（`) }).check()
  await expect(page.getByLabel('估算状态')).toHaveText('当前选择估算已更新。')
  const estimate = await page
    .getByRole('region', { name: '数据量估算' })
    .locator('dd')
    .first()
    .innerText()
  const recordCount = Number(estimate.replace(/[^0-9]/g, ''))
  const sizeText = await page
    .getByRole('region', { name: '数据量估算' })
    .locator('dd')
    .nth(1)
    .innerText()
  const approximateBytes = Number(sizeText.match(/（([0-9,]+) B）/)?.[1]?.replaceAll(',', ''))
  expect(approximateBytes).toBeGreaterThan(0)
  expect(recordCount).toBeGreaterThan(0)
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: `下载 ${label} 文件`, exact: true }).click()
  const download = await downloading
  await expect(page.getByLabel('导出阶段')).toContainText('已发起浏览器下载')
  expect(await download.failure()).toBeNull()
  return { download, recordCount, approximateBytes }
}

export async function downloadBytes(download: Download) {
  const path = await download.path()
  expect(path).not.toBeNull()
  return new Uint8Array(await fs.readFile(path!))
}

export async function downloadCsvRecords(download: Download) {
  const text = new TextDecoder().decode(await downloadBytes(download))
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
  expect(parsed.errors).toEqual([])
  return parsed.data
}

/** Hold a real response at the HTTP transport seam; no mock hook, store or successful file. */
export async function holdNextExportResponse(page: Page, expectedTransportFailures: Set<string>) {
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let ready!: () => void
  const received = new Promise<void>((resolve) => {
    ready = resolve
  })
  let done!: () => void
  const finished = new Promise<void>((resolve) => {
    done = resolve
  })
  let claimed = false
  const handler: Parameters<Page['route']>[1] = async (route) => {
    if (claimed || route.request().method() !== 'POST') return route.continue()
    claimed = true
    expectedTransportFailures.add(route.request().url())
    const response = await route.fetch()
    ready()
    await held
    try {
      await route.fulfill({ response })
    } finally {
      done()
    }
  }
  await page.route('**/_serverFn/**', handler)
  return {
    ready: received,
    release,
    finished,
    dispose: () => page.unroute('**/_serverFn/**', handler),
  }
}

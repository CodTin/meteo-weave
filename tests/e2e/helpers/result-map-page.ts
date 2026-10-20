import { expect, type Page } from '../browser-guard'
import { submitDemoLogin } from '../demo-login'

export type ResultMapCase = 'temperature' | 'wind' | 'pressure' | 'precipitation'
const caseNames: Record<ResultMapCase, string> = {
  temperature: 'Alpine mountain temperature',
  wind: 'Coastal plain wind ensemble',
  pressure: 'Plateau MSL pressure',
  precipitation: 'Lowland plain rainfall ensemble',
}

/** Real login → persisted catalog task → result navigation. No injected business state/API. */
export async function setupResultMapPage(page: Page, variable: ResultMapCase = 'temperature') {
  await page.goto('/login')
  await submitDemoLogin(page, 'researcher')
  await expect(page).toHaveURL('/dashboard')
  const menu = page.getByRole('button', { name: '打开工作区导航', exact: true })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('link', { name: '任务管理', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: '任务管理', exact: true })).toBeVisible()
  await page
    .getByRole('button', { name: `查看任务 Synthetic Demo · ${caseNames[variable]}`, exact: true })
    .click()
  await page.getByRole('button', { name: '查看结果分析', exact: true }).click()
  await expect(page.getByRole('tab', { name: /地图对比/, selected: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Original Data map', exact: true })).toBeVisible()
  return {
    url: page.url(),
    original: page.getByRole('region', { name: 'Original Data map', exact: true }),
  }
}

export function resultMap(
  page: Page,
  kind: 'original' | 'downscaled' | 'observation' | 'difference',
) {
  const titles = {
    original: 'Original Data',
    downscaled: 'Downscaled Data',
    observation: 'Observation Data',
    difference: 'Difference (Downscaled - Original)',
  }
  return page.getByRole('region', { name: `${titles[kind]} map`, exact: true })
}

export async function selectResultFrame(page: Page, day: '01' | '02' | '03') {
  await page.getByRole('combobox', { name: 'Time Slice (UTC)', exact: true }).click()
  await page.getByRole('option', { name: `2024-01-${day} 00:00 UTC`, exact: true }).click()
  await expect(page.getByLabel('Map frame', { exact: true })).toContainText(
    `2024-01-${day}T00:00:00.000Z`,
  )
  await expect(resultMap(page, 'original')).toBeVisible()
}

/** Shared user entry used by layout acceptance; only the visible coordinate form is touched. */
export async function selectResultPoint(page: Page, longitude: string, latitude: string) {
  const query = page.getByRole('region', { name: 'Joint point query', exact: true })
  await query.getByRole('textbox', { name: 'Longitude', exact: true }).fill(longitude)
  await query.getByRole('textbox', { name: 'Latitude', exact: true }).fill(latitude)
  await query.getByRole('textbox', { name: 'Latitude', exact: true }).press('Enter')
  return query
}

import { test, expect } from './browser-guard'
import { readNetCDF, type NetCDFFile } from '../lib/netcdf-reader'
import {
  downloadBytes,
  downloadCsvRecords,
  downloadExport,
  exportExamples,
  holdNextExportResponse,
  selectExportLayers,
  selectSmallExport,
  setupExportTab,
  type ExportLayer,
  type ExportVariable,
} from './helpers/export-test-helpers'

const quantities = {
  temperature: [{ name: 'temperature', csv: 'value', unit: '°C' }],
  wind: [
    { name: 'u10', csv: 'u10', unit: 'm/s' },
    { name: 'v10', csv: 'v10', unit: 'm/s' },
    { name: 'speed', csv: 'speed', unit: 'm/s' },
    { name: 'direction', csv: 'direction', unit: 'degrees' },
  ],
  pressure: [{ name: 'msl', csv: 'value', unit: 'hPa' }],
  precipitation: [{ name: 'precipitation', csv: 'value', unit: 'mm' }],
} as const
const combinations: Array<{ name: string; layers: ExportLayer[] }> = [
  { name: 'original only', layers: ['original'] },
  { name: 'downscaled only', layers: ['downscaled'] },
  { name: 'stations only', layers: ['observation'] },
  { name: 'original, downscaled and stations', layers: ['original', 'downscaled', 'observation'] },
]

function ncVariable(file: NetCDFFile, name: string) {
  const variable = file.variables.find((candidate) => candidate.name === name)
  expect(variable, `independent NetCDF reader found ${name}`).toBeDefined()
  return variable!
}

function stationIds(file: NetCDFFile) {
  const variable = ncVariable(file, 'stationId')
  const width = file.dimensions.find((dimension) => dimension.name === variable.dimensions[1])?.size
  expect(width).toBeGreaterThan(0)
  const stations = file.dimensions.find((dimension) => dimension.name === 'station')?.size ?? 0
  return Array.from({ length: stations }, (_, index) =>
    new TextDecoder('utf-8', { fatal: true })
      .decode(variable.data.slice(index * width!, (index + 1) * width!))
      .replace(/\0+$/, ''),
  )
}

function slotIndex(file: NetCDFFile, row: Record<string, string>, layer: ExportLayer) {
  const times = ncVariable(file, 'time')
  const time = Array.from(times.data).findIndex((value) => value === Date.parse(row.time!) / 1000)
  expect(time).toBeGreaterThanOrEqual(0)
  if (layer === 'observation') {
    const station = stationIds(file).indexOf(row.stationId!)
    expect(station).toBeGreaterThanOrEqual(0)
    expect(ncVariable(file, 'station_longitude').data[station]).toBeCloseTo(
      Number(row.longitude),
      9,
    )
    expect(ncVariable(file, 'station_latitude').data[station]).toBeCloseTo(Number(row.latitude), 9)
    return time * stationIds(file).length + station
  }
  const latitudes = ncVariable(file, `${layer}_latitude`).data
  const longitudes = ncVariable(file, `${layer}_longitude`).data
  const latitude = Array.from(latitudes).findIndex(
    (value) => Math.abs(value - Number(row.latitude)) < 1e-9,
  )
  const longitude = Array.from(longitudes).findIndex(
    (value) => Math.abs(value - Number(row.longitude)) < 1e-9,
  )
  expect(latitude).toBeGreaterThanOrEqual(0)
  expect(longitude).toBeGreaterThanOrEqual(0)
  return time * latitudes.length * longitudes.length + latitude * longitudes.length + longitude
}

function verifyPointSamples(
  file: NetCDFFile,
  rows: Array<Record<string, string>>,
  variable: ExportVariable,
  layers: ExportLayer[],
) {
  for (const layer of layers) {
    const selected = rows.filter((row) => row.dataType === layer)
    if (!selected.length) {
      expect(layer).toBe('observation')
      expect(file.globalAttributes.observation_coverage).toBeTruthy()
      continue
    }
    const science = quantities[variable].map((quantity) => ({
      ...quantity,
      encoded: ncVariable(file, `${quantity.name}_${layer}`),
    }))
    expect(science[0]?.encoded.data.length).toBe(selected.length)
    for (const quantity of science) {
      expect(quantity.encoded.attributes.units).toBe(quantity.unit)
      expect(quantity.encoded.attributes.dataType).toBe(layer)
      expect(quantity.encoded.attributes.source).toBe('Synthetic Demo')
      expect(quantity.encoded.attributes._FillValue).toBe(-9999)
      expect(quantity.encoded.dimensions).toEqual(
        layer === 'observation'
          ? ['time', 'station']
          : ['time', `${layer}_latitude`, `${layer}_longitude`],
      )
    }
    // Every time/position is matched independently by identity, not by writer row ordering.
    for (const row of selected) {
      const slot = slotIndex(file, row, layer)
      for (const quantity of science) {
        const value = quantity.encoded.data[slot]
        const expected = row[quantity.csv]
        if (expected === '' || expected === undefined) expect(value).toBe(-9999)
        else expect(Math.abs(value! - Number(expected))).toBeLessThanOrEqual(0.001)
      }
      if (variable === 'precipitation') {
        const actual = ncVariable(file, `accumulation_bounds_${layer}`).data
        const requested = ncVariable(file, `requested_accumulation_bounds_${layer}`).data
        if (row.accumulationStart) {
          expect(actual[slot * 2]).toBe(Date.parse(row.accumulationStart) / 1000)
          expect(actual[slot * 2 + 1]).toBe(Date.parse(row.accumulationEnd!) / 1000)
        }
        if (row.requestedStart) {
          expect(requested[slot * 2]).toBe(Date.parse(row.requestedStart) / 1000)
          expect(requested[slot * 2 + 1]).toBe(Date.parse(row.requestedEnd!) / 1000)
        }
        expect(ncVariable(file, `sampled_hours_${layer}`).data[slot]).toBe(Number(row.sampledHours))
        expect(ncVariable(file, `expected_hours_${layer}`).data[slot]).toBe(
          Number(row.expectedHours),
        )
      }
    }
  }
}

test.describe('NetCDF independent public download verification', () => {
  test.setTimeout(90_000)
  for (const variable of Object.keys(exportExamples) as ExportVariable[]) {
    for (const combination of combinations) {
      test(`downloads and verifies ${variable} with ${combination.name} against CSV and GeoJSON`, async ({
        page,
      }) => {
        const taskId = await setupExportTab(page, variable)
        await selectSmallExport(page, variable)
        await selectExportLayers(page, combination.layers)
        const { download: csvDownload, recordCount } = await downloadExport(page, 'csv')
        const rows = await downloadCsvRecords(csvDownload)
        expect(rows).toHaveLength(recordCount)
        const { download: jsonDownload, recordCount: featureCount } = await downloadExport(
          page,
          'geojson',
        )
        const geojson = JSON.parse(new TextDecoder().decode(await downloadBytes(jsonDownload))) as {
          type: string
          features: Array<{
            geometry: { type: string; coordinates: number[] }
            properties: Record<string, unknown>
          }>
        }
        expect(geojson.type).toBe('FeatureCollection')
        expect(geojson.features).toHaveLength(featureCount)
        expect(featureCount).toBe(recordCount)
        for (const row of combination.layers.flatMap((layer) =>
          rows.filter((item) => item.dataType === layer).slice(0, 2),
        )) {
          const feature = geojson.features.find(
            (candidate) =>
              candidate.properties.dataType === row.dataType &&
              candidate.properties.time === row.time &&
              candidate.geometry.coordinates[0] === Number(row.longitude) &&
              candidate.geometry.coordinates[1] === Number(row.latitude),
          )
          expect(feature).toBeDefined()
          expect(feature?.geometry.type).toBe('Point')
          expect(feature?.properties.unit).toBe(row.unit)
          expect(feature?.properties.value).toBe(row.value === '' ? null : Number(row.value))
        }
        const {
          download,
          recordCount: binaryCount,
          approximateBytes,
        } = await downloadExport(page, 'netcdf')
        expect(download.suggestedFilename()).toMatch(/\.nc$/)
        const bytes = await downloadBytes(download)
        expect(Math.abs(bytes.byteLength - approximateBytes)).toBeLessThanOrEqual(256)
        // The test-only adapter is netcdfjs-owned; signature-only checks cannot satisfy these assertions.
        const file = readNetCDF(bytes)
        expect(file.version).toBe(1)
        expect(binaryCount).toBe(recordCount)
        expect(file.globalAttributes.taskId).toBe(taskId)
        expect(file.globalAttributes.recordCount).toBe(recordCount)
        expect(file.globalAttributes.source).toBe('Synthetic Demo')
        expect(file.globalAttributes.export_time_bounds).toBe('[start,end)')
        expect(file.globalAttributes.precision).toContain('0.001')
        const time = ncVariable(file, 'time')
        expect(time.attributes.units).toContain('seconds since 1970-01-01')
        expect(Array.from(time.data)).toEqual([1704067200, 1704070800])
        verifyPointSamples(file, rows, variable, combination.layers)
      })
    }
  }

  for (const variable of ['temperature', 'precipitation'] as const) {
    test(`downloads and verifies daily ${variable} mixed data with UTC day bounds`, async ({
      page,
    }) => {
      await setupExportTab(page, variable)
      await selectSmallExport(page, variable)
      await selectExportLayers(page, ['original', 'downscaled', 'observation'])
      await page.getByLabel('时间粒度', { exact: true }).selectOption('daily')
      await page.getByLabel('结束时间 (UTC，不包含)', { exact: true }).fill('2024-01-02T00:00')
      const { download: csv, recordCount } = await downloadExport(page, 'csv')
      const rows = await downloadCsvRecords(csv)
      expect(rows).toHaveLength(recordCount)
      const {
        download,
        recordCount: binaryCount,
        approximateBytes,
      } = await downloadExport(page, 'netcdf')
      expect(binaryCount).toBe(recordCount)
      const bytes = await downloadBytes(download)
      expect(Math.abs(bytes.byteLength - approximateBytes)).toBeLessThanOrEqual(256)
      const file = readNetCDF(bytes)
      expect(file.globalAttributes.temporalResolution).toBe('daily')
      expect(Array.from(ncVariable(file, 'time').data)).toEqual([1704067200])
      verifyPointSamples(file, rows, variable, ['original', 'downscaled', 'observation'])
    })
  }

  test('does not download a held stale binary response and successfully retries the current selection', async ({
    page,
    expectedSessionTransportFailures,
  }) => {
    await setupExportTab(page)
    await selectSmallExport(page)
    await page.getByRole('radio', { name: /NetCDF/ }).check()
    await expect(page.getByRole('button', { name: '下载 NetCDF 文件', exact: true })).toBeEnabled()
    const held = await holdNextExportResponse(page, expectedSessionTransportFailures)
    const downloads: string[] = []
    page.on('download', (download) => downloads.push(download.suggestedFilename()))
    await page.getByRole('button', { name: '下载 NetCDF 文件', exact: true }).click()
    await held.ready
    await page.getByRole('button', { name: '取消导出', exact: true }).click()
    held.release()
    await held.finished
    await held.dispose()
    expect(downloads).toEqual([])
    const { download } = await downloadExport(page, 'netcdf')
    expect(readNetCDF(await downloadBytes(download)).globalAttributes.source).toBe('Synthetic Demo')
    expect(downloads).toHaveLength(1)
  })
  test('rejects a binary transport failure without a fake .nc and retries to an independently readable file', async ({
    page,
    expectedSessionTransportFailures,
  }) => {
    await setupExportTab(page)
    await selectSmallExport(page)
    await page.getByRole('radio', { name: /NetCDF/ }).check()
    await expect(page.getByRole('button', { name: '下载 NetCDF 文件', exact: true })).toBeEnabled()
    let failed = false
    await page.route('**/_serverFn/**', async (route) => {
      if (failed || route.request().method() !== 'POST') return route.continue()
      failed = true
      expectedSessionTransportFailures.add(route.request().url())
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"ok":false,"code":"TRANSPORT_FAILED","message":"NetCDF 传输失败"}',
      })
    })
    const downloads: string[] = []
    page.on('download', (download) => downloads.push(download.suggestedFilename()))
    await page.getByRole('button', { name: '下载 NetCDF 文件', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('EXPORT_FAILED')
    expect(downloads).toEqual([])
    await expect(page.getByLabel('导出阶段')).not.toContainText('已发起浏览器下载')
    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: '重试导出', exact: true }).click()
    const download = await downloading
    expect(readNetCDF(await downloadBytes(download)).globalAttributes.source).toBe('Synthetic Demo')
    expect(downloads).toHaveLength(1)
  })

  test('retains zero-station notes without fabricating stations or allowing a station-only empty file', async ({
    page,
  }) => {
    await setupExportTab(page)
    await selectSmallExport(page)
    await selectExportLayers(page, ['original', 'downscaled', 'observation'])
    await page.getByLabel('西经 (°E)', { exact: true }).fill('10.1')
    await page.getByLabel('南纬 (°N)', { exact: true }).fill('46.1')
    const { download, recordCount } = await downloadExport(page, 'netcdf')
    await expect(page.getByRole('region', { name: '数据量估算' })).toContainText(
      '观测数据（实际台站）：0 个位置，0 条记录',
    )
    const file = readNetCDF(await downloadBytes(download))
    expect(file.globalAttributes.recordCount).toBe(recordCount)
    expect(file.dimensions.some((dimension) => dimension.name === 'station')).toBe(false)
    expect(file.variables.some((variable) => variable.name === 'stationId')).toBe(false)
    await selectExportLayers(page, ['observation'])
    await expect(page.getByLabel('估算状态')).toContainText('NO_EXPORT_DATA')
    await expect(page.getByRole('button', { name: '下载 NetCDF 文件', exact: true })).toBeDisabled()
    await expect(page.getByRole('region', { name: '数据量估算' })).toHaveCount(0)
  })
})

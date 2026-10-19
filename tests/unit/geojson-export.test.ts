import { describe, expect, it } from 'vitest'
import Papa from 'papaparse'
import { generateCsvPlan, generateGeoJsonPlan } from '@/server/services/csv-export.server'
import { createExportPlan } from '@/server/services/result-export-plan.server'
import { readExportRecords } from '@/server/services/result-export-records.server'
import type { ExportRecord } from '@/features/result-analysis/types/export'
import { exportRequest, exportTask } from '../factories/export-task'

describe('shared CSV / GeoJSON records', () => {
  it('serializes actual records into Point features and matching unrounded CSV scalars', async () => {
    const task = exportTask()
    const plan = createExportPlan(exportRequest(task), task)
    if (!plan.ok) throw new Error(plan.message)
    const expected = await readExportRecords(plan)
    if (!expected.ok) throw new Error(expected.message)
    const csv = await generateCsvPlan(plan)
    const geojson = await generateGeoJsonPlan({
      ...plan,
      request: { ...plan.request, format: 'geojson' },
    })
    if (!csv.ok || !geojson.ok) throw new Error('Expected text exports')
    const parsed = JSON.parse(geojson.content) as {
      type: string
      features: Array<{
        type: string
        geometry: { type: string; coordinates: number[] }
        properties: ExportRecord
      }>
    }
    expect(parsed.type).toBe('FeatureCollection')
    expect(parsed.features.map((feature) => feature.properties)).toEqual(expected.records)
    expect(parsed.features[0]!.geometry).toEqual({ type: 'Point', coordinates: [120, 30] })
    const rows = Papa.parse<Record<string, string>>(csv.content, {
      header: true,
      skipEmptyLines: true,
    })
    expect(rows.errors).toEqual([])
    expect(rows.data).toHaveLength(54)
    for (const [index, row] of rows.data.entries()) {
      const record = expected.records[index]!
      expect(row.value).toBe(String(record.value))
      expect(row.longitude).toBe(String(record.longitude))
      expect(row.latitude).toBe(String(record.latitude))
      expect(row.dataType).toBe(record.dataType)
      expect(row.provenance).toBe('Synthetic Demo')
    }
    expect(csv.csv).toBe(csv.content)
    expect(geojson.geojson).toBe(geojson.content)
  })
})

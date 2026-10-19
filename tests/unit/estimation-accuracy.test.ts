import { describe, expect, it } from 'vitest'
import Papa from 'papaparse'
import {
  estimateTextPlan,
  generateCsvPlan,
  generateGeoJsonPlan,
} from '@/server/services/csv-export.server'
import { createExportPlan } from '@/server/services/result-export-plan.server'
import { exportRequest, exportTask } from '../factories/export-task'

describe('representative UTF8 sizing accuracy', () => {
  it.each(['temperature', 'pressure', 'wind', 'precipitation'] as const)(
    'counts %s records exactly in both formats within the stated small-fixture byte rule',
    async (variable) => {
      const task = exportTask({ variable, id: '气象-示例-é-🛰️' })
      for (const format of ['csv', 'geojson'] as const) {
        const plan = createExportPlan(exportRequest(task, { format }), task)
        if (!plan.ok) throw new Error(plan.message)
        const estimate = estimateTextPlan(plan)
        if (!estimate.ok) throw new Error(estimate.message)
        const result = await (format === 'csv' ? generateCsvPlan(plan) : generateGeoJsonPlan(plan))
        if (!result.ok) throw new Error(result.message)
        const actualCount =
          format === 'csv'
            ? Papa.parse(result.content, { header: true, skipEmptyLines: true }).data.length
            : JSON.parse(result.content).features.length
        expect(actualCount).toBe(54)
        expect(estimate.recordCount).toBe(actualCount)
        const bytes = new TextEncoder().encode(result.content).byteLength
        expect(bytes).toBeGreaterThan(result.content.length)
        expect(Math.abs(estimate.approximateSize - bytes)).toBeLessThanOrEqual(
          Math.max(512, bytes * 0.35),
        )
      }
    },
  )
})

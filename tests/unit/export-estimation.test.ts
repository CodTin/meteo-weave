import { describe, expect, it } from 'vitest'
import { estimateTextPlan } from '@/server/services/csv-export.server'
import { createExportPlan } from '@/server/services/result-export-plan.server'
import { exportRequest, exportTask } from '../factories/export-task'

describe('authoritative text export estimate', () => {
  it('reports exact native layer contributions, request identity, and representative UTF8 sizing without reading science', () => {
    const task = exportTask()
    const plan = createExportPlan(exportRequest(task), task)
    if (!plan.ok) throw new Error(plan.message)
    const result = estimateTextPlan(plan)
    if (!result.ok) throw new Error(result.message)
    expect(result.recordCount).toBe(54)
    expect(result.counts).toEqual([
      { dataType: 'original', pointCount: 6, recordCount: 12 },
      { dataType: 'downscaled', pointCount: 20, recordCount: 40 },
      { dataType: 'observation', pointCount: 1, recordCount: 2 },
    ])
    expect(result.identity).toBe(plan.identity)
    expect(result.approximateSize).toBeGreaterThan(0)
    expect(Number.isSafeInteger(result.approximateSize)).toBe(true)
    expect(result.sizeRule).toMatch(/UTF-8.*representative.*no scientific reads/i)
  })
})

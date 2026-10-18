import { createServerFn } from '@tanstack/react-start'
import { generateCsvExport } from '../services/csv-export.server'

export const exportCsv = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid request')
    }
    return data as {
      taskId: string
      bbox: { west: number; east: number; south: number; north: number }
      timeRange: { start: string; end: string }
      dataTypes: string[]
    }
  })
  .handler(async ({ data }) => {
    const result = generateCsvExport(data)

    if (!result.ok) {
      throw new Error(result.message)
    }

    return {
      csv: result.csv,
      filename: result.filename,
    }
  })

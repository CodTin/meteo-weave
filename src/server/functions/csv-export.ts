import { createServerFn } from '@tanstack/react-start'
import { getRequest, setResponseHeader } from '@tanstack/react-start/server'
import { generateResultExport, estimateResultExport } from '@/server/services/netcdf-export.server'

/** Text and binary formats share one authenticated generation and estimation seam. */
export const generateExportFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input)
  .handler(({ data }) => {
    setResponseHeader('Cache-Control', 'no-store')
    return generateResultExport(data, getRequest().signal)
  })

export const estimateExportFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input)
  .handler(({ data }) => {
    setResponseHeader('Cache-Control', 'no-store')
    return estimateResultExport(data)
  })

// Historical name remains an alias, not a second admission or generation path.
export const exportCsv = generateExportFn

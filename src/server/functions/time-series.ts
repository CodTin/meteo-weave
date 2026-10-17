import { createServerFn } from '@tanstack/react-start'
import { getTimeSeriesData } from '@/server/services/time-series.server'

export const fetchTimeSeriesData = createServerFn({ method: 'GET' })
  .validator((data: unknown) => {
    if (typeof data !== 'object' || data === null) {
      throw new Error('Invalid input')
    }
    return data
  })
  .handler(async ({ data }) => {
    return await getTimeSeriesData(data)
  })

/**
 * Hook to fetch and manage result data for threshold analysis.
 */

import { useQuery } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import type { ResultReply } from '@/features/downscaling-tasks/service/contracts'

const getResultDataFn = createServerFn({ method: 'POST' })
  .validator((data: { taskId: string; timeSlice: string; region: any }) => data)
  .handler(async ({ data }) => {
    const { getResultData } = await import('@/server/services/result-data.server')
    return getResultData(data.taskId, data.timeSlice, data.region)
  })

interface UseThresholdResultDataProps {
  taskId: string
  timeSlice: string
  region: {
    west: number
    east: number
    south: number
    north: number
  }
  enabled?: boolean
}

export function useThresholdResultData({
  taskId,
  timeSlice,
  region,
  enabled = true,
}: UseThresholdResultDataProps) {
  return useQuery({
    queryKey: ['threshold-result', taskId, timeSlice, region],
    queryFn: async () => {
      const result = await getResultDataFn({
        data: { taskId, timeSlice, region },
      })
      return result as ResultReply
    },
    enabled: enabled && !!taskId && !!timeSlice,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

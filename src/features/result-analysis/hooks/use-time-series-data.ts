import { useQuery } from '@tanstack/react-query'
import { fetchTimeSeriesData } from '@/server/functions/time-series'
import type { DownscalingTask } from '@/features/downscaling-tasks/service/contracts'
import type { Coordinate } from '../service/time-series-data'

interface UseTimeSeriesDataProps {
  task: DownscalingTask | null
  coordinate: Coordinate | null
}

export function useTimeSeriesData({ task, coordinate }: UseTimeSeriesDataProps) {
  const queryKey = ['time-series', task?.id, coordinate?.latitude, coordinate?.longitude]

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (!task || !coordinate) {
        throw new Error('Task and coordinate are required')
      }

      const result = await fetchTimeSeriesData({
        data: {
          task,
          coordinate,
        },
      })

      if (!result.ok) {
        throw new Error(result.error)
      }

      return result
    },
    enabled: Boolean(task && coordinate && task.status === 'Completed'),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}

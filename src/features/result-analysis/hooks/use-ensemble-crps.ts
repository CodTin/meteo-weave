import { useQuery } from '@tanstack/react-query'
import { getEnsembleCRPS } from '@/server/functions/ensemble-crps'

/**
 * Hook to fetch ensemble CRPS assessment data for a task.
 * Uses the same station sampling as accuracy assessment (ticket #72).
 */
export function useEnsembleCRPS(taskId: string | undefined) {
  return useQuery({
    queryKey: ['ensemble-crps', taskId],
    queryFn: async () => {
      if (!taskId) throw new Error('Task ID is required')
      return await getEnsembleCRPS({ data: taskId })
    },
    enabled: !!taskId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

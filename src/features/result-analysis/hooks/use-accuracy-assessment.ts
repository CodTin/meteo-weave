import { useQuery } from '@tanstack/react-query'
import { getAccuracyAssessment } from '@/server/functions/accuracy-assessment'

export function useAccuracyAssessment(taskId: string) {
  return useQuery({
    queryKey: ['accuracy-assessment', taskId],
    queryFn: async () => {
      const result = await getAccuracyAssessment({ data: { taskId } })
      return result.data
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

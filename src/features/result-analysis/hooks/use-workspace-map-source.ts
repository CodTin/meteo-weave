import { useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createTaskService } from '@/features/downscaling-tasks/service'
import type { ResultMapSource } from '../service/result-map-data'

export function useWorkspaceMapSource(): ResultMapSource {
  const queryClient = useQueryClient()
  const service = useMemo(() => createTaskService({ queryClient }), [queryClient])
  useEffect(() => () => service.close(), [service])
  return useMemo(
    () => ({
      async result(taskId, query) {
        if (service.getState() !== 'ready') await service.initialize()
        return service.result(taskId, query)
      },
    }),
    [service],
  )
}

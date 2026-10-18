import { createServerFn } from '@tanstack/react-start'
import { getEnsembleCRPSData } from '@/server/services/ensemble-crps.server'

/**
 * Server function to fetch ensemble CRPS assessment data for a task.
 * Uses the same station sampling and budget as station accuracy assessment (ticket #72).
 */
export const getEnsembleCRPS = createServerFn({ method: 'GET' })
  .validator((taskId: string) => taskId)
  .handler(async ({ data: taskId }) => {
    return await getEnsembleCRPSData(taskId)
  })

import { createServerFn } from '@tanstack/react-start'
import { getEventAssessmentData } from '@/server/services/event-assessment.server'

export const getEventAssessment = createServerFn({ method: 'GET' })
  .validator((data: unknown) => {
    if (typeof data !== 'object' || data === null) {
      throw new Error('Invalid input')
    }
    const input = data as Record<string, unknown>
    if (typeof input.taskId !== 'string') {
      throw new Error('taskId must be a string')
    }
    return { taskId: input.taskId }
  })
  .handler(async ({ data }) => {
    return await getEventAssessmentData(data.taskId)
  })

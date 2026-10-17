import { createServerFn } from '@tanstack/react-start'
import { getEventAssessmentData } from '@/server/services/event-assessment.server'
import { validateTaskIdInput } from '@/server/functions/shared/assessment-validators'

export const getEventAssessment = createServerFn({ method: 'GET' })
  .validator(validateTaskIdInput)
  .handler(async ({ data }) => {
    return await getEventAssessmentData(data.taskId)
  })

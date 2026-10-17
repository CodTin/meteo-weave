import { createServerFn } from '@tanstack/react-start'
import { getAccuracyAssessmentData } from '@/server/services/accuracy-assessment.server'
import { validateTaskIdInput } from '@/server/functions/shared/assessment-validators'

export const getAccuracyAssessment = createServerFn({ method: 'GET' })
  .validator(validateTaskIdInput)
  .handler(async ({ data }) => {
    return await getAccuracyAssessmentData(data.taskId)
  })

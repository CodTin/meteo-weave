import { createLazyFileRoute } from '@tanstack/react-router'
import { ResultAnalysisPage } from '@/features/result-analysis/result-analysis-page'

export const Route = createLazyFileRoute('/_workspace/tasks/$taskId/result/')({
  component: ResultAnalysisPage,
})

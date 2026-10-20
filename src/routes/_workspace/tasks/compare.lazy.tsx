import { createLazyFileRoute } from '@tanstack/react-router'
import { TaskComparisonPage } from '@/features/task-comparison/comparison-page'

export const Route = createLazyFileRoute('/_workspace/tasks/compare')({
  component: TaskComparisonPage,
})

import { createLazyFileRoute } from '@tanstack/react-router'
import { TaskResultPage } from '@/features/downscaling-tasks/task-result-page'

export const Route = createLazyFileRoute('/_workspace/tasks/$taskId')({
  component: TaskResultPage,
})

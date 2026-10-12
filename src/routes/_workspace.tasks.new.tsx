import { createFileRoute } from '@tanstack/react-router'
import { TaskCreatePage } from '@/features/downscaling-tasks/task-create-page'

export const Route = createFileRoute('/_workspace/tasks/new')({
  head: () => ({ meta: [{ title: '创建任务 · MeteoWeave' }] }),
  component: TaskCreatePage,
})

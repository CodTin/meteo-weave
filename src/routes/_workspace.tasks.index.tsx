import { createFileRoute } from '@tanstack/react-router'
import { TaskListPage } from '@/features/downscaling-tasks/task-list-page'

export const Route = createFileRoute('/_workspace/tasks/')({
  head: () => ({ meta: [{ title: '任务管理 · MeteoWeave' }] }),
  component: TaskListPage,
})

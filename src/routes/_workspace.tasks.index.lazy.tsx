import { createLazyFileRoute } from '@tanstack/react-router'
import { TaskListPage } from '@/features/downscaling-tasks/task-list-page'

export const Route = createLazyFileRoute('/_workspace/tasks/')({ component: TaskListPage })

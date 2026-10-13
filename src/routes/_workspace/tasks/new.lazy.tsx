import { createLazyFileRoute } from '@tanstack/react-router'
import { TaskCreatePage } from '@/features/downscaling-tasks/task-create-page'

export const Route = createLazyFileRoute('/_workspace/tasks/new')({ component: TaskCreatePage })

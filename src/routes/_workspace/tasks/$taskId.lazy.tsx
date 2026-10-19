import { createLazyFileRoute, Outlet, useMatches } from '@tanstack/react-router'
import { TaskResultPage } from '@/features/downscaling-tasks/task-result-page'

export const Route = createLazyFileRoute('/_workspace/tasks/$taskId')({
  component: TaskRoute,
})

function TaskRoute() {
  const isTaskDetail = useMatches({
    select: (matches) => matches.at(-1)?.routeId === '/_workspace/tasks/$taskId',
  })
  return isTaskDetail ? <TaskResultPage /> : <Outlet />
}

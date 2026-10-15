import { useCallback, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { createTaskService, type DownscalingTask } from '../service'

export function useTaskActions() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [isDeleting, setIsDeleting] = useState(false)

  const viewTask = useCallback(
    (task: DownscalingTask) => {
      if (task.status === 'Completed') {
        navigate({ to: `/tasks/${task.id}` })
      } else if (task.status === 'Running') {
        navigate({ to: `/tasks/${task.id}` })
      } else if (task.status === 'Failed') {
        // For failed tasks, show the failure reason and allow reconfiguration
        navigate({ to: `/tasks/${task.id}` })
      }
    },
    [navigate],
  )

  const deleteTask = useCallback(
    async (taskId: string) => {
      // Prevent duplicate operations
      if (isDeleting) {
        return {
          ok: false as const,
          error: '正在删除中，请稍候',
        }
      }

      setIsDeleting(true)
      try {
        const taskService = createTaskService({ queryClient })
        await taskService.initialize()
        const result = await taskService.delete(taskId)

        if (!result.ok) {
          throw new Error(result.error)
        }

        // Invalidate the list query to refresh
        await queryClient.invalidateQueries({ queryKey: ['downscaling-tasks'] })

        return { ok: true as const }
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : '删除失败',
        }
      } finally {
        setIsDeleting(false)
      }
    },
    [queryClient, isDeleting],
  )

  return {
    viewTask,
    deleteTask,
    isDeleting,
  }
}

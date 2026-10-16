import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createTaskService, type DownscalingTask } from '../service'

interface UseTaskLoaderOptions {
  taskId: string
  pollIfRunning?: boolean
}

interface UseTaskLoaderResult {
  task: DownscalingTask | null
  loading: boolean
  error: string | null
}

export function useTaskLoader({
  taskId,
  pollIfRunning = false,
}: UseTaskLoaderOptions): UseTaskLoaderResult {
  const queryClient = useQueryClient()
  const [task, setTask] = useState<DownscalingTask | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const taskService = createTaskService({ queryClient })

    const loadTask = async () => {
      try {
        await taskService.initialize()
        const result = await taskService.get(taskId)

        if (!mounted) return

        if (!result.ok) {
          setError(result.error)
          setLoading(false)
          return
        }

        setTask(result.task)

        // If polling enabled and task is still running, schedule next check
        if (pollIfRunning && result.task.status === 'Running') {
          const completionTime = Date.parse(result.task.completionAt)
          const now = Date.now()
          const remainingTime = completionTime - now

          if (remainingTime > 0) {
            setTimeout(
              () => {
                if (mounted) loadTask()
              },
              Math.min(remainingTime + 100, 1000),
            )
          } else {
            // Should be complete now, reload
            setTimeout(() => {
              if (mounted) loadTask()
            }, 100)
          }
        }

        setLoading(false)
      } catch (err) {
        if (!mounted) return
        setError(err instanceof Error ? err.message : '加载任务失败')
        setLoading(false)
      }
    }

    loadTask()

    return () => {
      mounted = false
      taskService.close()
    }
  }, [taskId, queryClient, pollIfRunning])

  return { task, loading, error }
}

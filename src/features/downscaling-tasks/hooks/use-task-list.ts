import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createTaskService, type DownscalingTask } from '../service'
import type { TaskRecordIssue } from '../service'

export type TaskListState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'success'; tasks: DownscalingTask[]; issues: TaskRecordIssue[] }

export function useTaskList() {
  const queryClient = useQueryClient()
  const [state, setState] = useState<TaskListState>({ status: 'loading' })

  useEffect(() => {
    let mounted = true
    const taskService = createTaskService({ queryClient })

    const loadTasks = async () => {
      try {
        await taskService.initialize()

        if (!mounted) return

        const result = await taskService.list()

        if (!mounted) return

        setState({
          status: 'success',
          tasks: result.tasks,
          issues: result.issues,
        })
      } catch (error) {
        if (!mounted) return
        setState({
          status: 'error',
          error: error instanceof Error ? error.message : '加载任务列表失败',
        })
      }
    }

    loadTasks()

    return () => {
      mounted = false
      taskService.close()
    }
  }, [queryClient])

  return state
}

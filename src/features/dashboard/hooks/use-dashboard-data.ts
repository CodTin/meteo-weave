import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createTaskService, type DownscalingTask } from '@/features/downscaling-tasks/service'
import type { TaskRecordIssue } from '@/features/downscaling-tasks/service'

export type DashboardStats = {
  total: number
  running: number
  completed: number
}

export type DashboardState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | {
      status: 'success'
      stats: DashboardStats
      recentTasks: DownscalingTask[]
      exampleTask: DownscalingTask | null
      issues: TaskRecordIssue[]
    }

export function useDashboardData() {
  const queryClient = useQueryClient()
  const [state, setState] = useState<DashboardState>({ status: 'loading' })

  useEffect(() => {
    let mounted = true
    const taskService = createTaskService({ queryClient })

    const loadDashboardData = async () => {
      try {
        await taskService.initialize()

        if (!mounted) return

        const result = await taskService.list()

        if (!mounted) return

        // Calculate statistics
        const total = result.tasks.length
        const running = result.tasks.filter((task) => task.status === 'Running').length
        const completed = result.tasks.filter((task) => task.status === 'Completed').length

        // Sort by createdAt descending and take first 5
        const sortedTasks = [...result.tasks].sort((a, b) => {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })
        const recentTasks = sortedTasks.slice(0, 5)

        // Find first completed catalog task for example
        const exampleTask =
          result.tasks.find((task) => task.status === 'Completed' && task.catalog) || null

        setState({
          status: 'success',
          stats: { total, running, completed },
          recentTasks,
          exampleTask,
          issues: result.issues,
        })
      } catch (error) {
        if (!mounted) return
        setState({
          status: 'error',
          error: error instanceof Error ? error.message : '加载仪表盘数据失败',
        })
      }
    }

    loadDashboardData()

    return () => {
      mounted = false
      taskService.close()
    }
  }, [queryClient])

  return state
}

import { useEffect, useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createTaskService, type DownscalingTask } from '../service'
import type { TaskRecordIssue } from '../service'

export type TaskListState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'success'; tasks: DownscalingTask[]; issues: TaskRecordIssue[] }

export type TaskFilters = {
  nameSearch: string
  variable?: string
  status?: DownscalingTask['status']
  method?: 'deterministic' | 'probabilistic'
}

export type SortConfig = {
  field: 'name' | 'createdAt' | 'status'
  direction: 'asc' | 'desc'
}

export function useTaskList() {
  const queryClient = useQueryClient()
  const [state, setState] = useState<TaskListState>({ status: 'loading' })
  const [filters, setFilters] = useState<TaskFilters>({ nameSearch: '' })
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: 'createdAt',
    direction: 'desc',
  })
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 20

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

  const filteredAndSortedTasks = useMemo(() => {
    if (state.status !== 'success') return []

    let result = state.tasks

    // Apply name search (trim and case-insensitive)
    const trimmedSearch = filters.nameSearch.trim()
    if (trimmedSearch !== '') {
      result = result.filter((task) =>
        task.name.toLowerCase().includes(trimmedSearch.toLowerCase()),
      )
    }

    // Apply variable filter
    if (filters.variable) {
      result = result.filter((task) => task.configuration.variable === filters.variable)
    }

    // Apply status filter
    if (filters.status) {
      result = result.filter((task) => task.status === filters.status)
    }

    // Apply method filter (use resolved method, not requested method)
    if (filters.method) {
      result = result.filter((task) => task.configuration.resolvedMethod === filters.method)
    }

    // Apply sorting
    const sorted = [...result].sort((a, b) => {
      let comparison = 0

      switch (sortConfig.field) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          break
        case 'status': {
          const statusOrder = { Running: 0, Completed: 1, Failed: 2 }
          comparison = statusOrder[a.status] - statusOrder[b.status]
          break
        }
      }

      // Apply direction
      if (sortConfig.direction === 'desc') {
        comparison = -comparison
      }

      // Stable sort: use id as secondary sort key
      if (comparison === 0) {
        comparison = a.id.localeCompare(b.id)
      }

      return comparison
    })

    return sorted
  }, [state, filters, sortConfig])

  const totalPages = Math.ceil(filteredAndSortedTasks.length / pageSize)

  // Correct page if out of bounds (derived, not in effect to avoid setState during render)
  const correctedPage = currentPage > totalPages && totalPages > 0 ? totalPages : currentPage

  const paginatedTasks = filteredAndSortedTasks.slice(
    (correctedPage - 1) * pageSize,
    correctedPage * pageSize,
  )

  const updateFilters = (newFilters: Partial<TaskFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }))
    setCurrentPage(1) // Reset to page 1 when filters change
  }

  const clearFilters = () => {
    setFilters({ nameSearch: '' })
    setCurrentPage(1)
  }

  const updateSort = (field: SortConfig['field']) => {
    setSortConfig((prev) => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  return {
    state,
    tasks: paginatedTasks,
    allTasks: state.status === 'success' ? state.tasks : [],
    filteredCount: filteredAndSortedTasks.length,
    totalCount: state.status === 'success' ? state.tasks.length : 0,
    issues: state.status === 'success' ? state.issues : [],
    filters,
    updateFilters,
    clearFilters,
    sortConfig,
    updateSort,
    currentPage: correctedPage,
    setCurrentPage,
    totalPages,
    pageSize,
  }
}

import { useEffect, useState, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
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
  timeRangeStart?: string
  timeRangeEnd?: string
}

export type SortConfig = {
  field: 'name' | 'createdAt' | 'status'
  direction: 'asc' | 'desc'
}

export function useTaskList() {
  const queryClient = useQueryClient()
  const { account } = useRouteContext({ from: '/_workspace' })
  const [taskService, setTaskService] = useState<ReturnType<typeof createTaskService> | null>(null)
  const [initializationError, setInitializationError] = useState<string | null>(null)
  const [filters, setFilters] = useState<TaskFilters>({ nameSearch: '' })
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: 'createdAt',
    direction: 'desc',
  })
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 20

  useEffect(() => {
    let mounted = true
    const service = createTaskService({ queryClient })
    service.initialize().then(
      () => {
        if (mounted) setTaskService(service)
      },
      (error: unknown) => {
        if (mounted)
          setInitializationError(error instanceof Error ? error.message : '加载任务列表失败')
      },
    )
    return () => {
      mounted = false
      service.close()
    }
  }, [queryClient])

  // Observe the public list call so the existing task-action invalidation reloads it.
  // The service is created only after hydration; SSR never opens browser storage.
  const listQuery = useQuery({
    queryKey: ['downscaling-tasks', 'management', account.id],
    enabled: taskService !== null,
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      if (!taskService) throw new Error('任务列表尚未初始化')
      return taskService.list()
    },
  })

  const state = useMemo<TaskListState>(() => {
    if (initializationError) return { status: 'error', error: initializationError }
    if (listQuery.status === 'error')
      return { status: 'error', error: listQuery.error.message || '加载任务列表失败' }
    if (!taskService || listQuery.status === 'pending') return { status: 'loading' }
    return { status: 'success', tasks: listQuery.data.tasks, issues: listQuery.data.issues }
  }, [initializationError, taskService, listQuery.status, listQuery.error, listQuery.data])

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

    // Apply time range overlap filter (only for historical mode tasks)
    if (filters.timeRangeStart && filters.timeRangeEnd) {
      const filterStart = filters.timeRangeStart
      const filterEnd = filters.timeRangeEnd
      result = result.filter((task) => {
        const timeRange = task.configuration.timeRange
        if (timeRange.mode !== 'historical') return false
        // Two ranges overlap if: start1 <= end2 AND start2 <= end1
        return timeRange.start <= filterEnd && filterStart <= timeRange.end
      })
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

  // Track previous filtered count to detect deletions
  const prevFilteredCountRef = useRef(filteredAndSortedTasks.length)

  useEffect(() => {
    const prevCount = prevFilteredCountRef.current
    const currentCount = filteredAndSortedTasks.length

    // If the list shrunk and current page is now out of bounds, correct it
    if (currentCount < prevCount && currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages)
    }

    prevFilteredCountRef.current = currentCount
  }, [filteredAndSortedTasks.length, currentPage, totalPages])

  const paginatedTasks = filteredAndSortedTasks.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
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
    currentPage,
    setCurrentPage,
    totalPages,
    pageSize,
  }
}

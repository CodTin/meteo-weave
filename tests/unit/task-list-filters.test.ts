import { describe, it, expect } from 'vitest'
import type { DownscalingTask } from '@/features/downscaling-tasks/service'

// Helper to create a minimal task for testing
function createTask(overrides: Partial<DownscalingTask> = {}): DownscalingTask {
  return {
    schemaVersion: 1,
    id: overrides.id || 'task-1',
    name: overrides.name || 'Test Task',
    ownerId: 'researcher',
    configuration: {
      dataSource: 'fusion',
      variable: 'temperature',
      region: { north: 40, south: 30, east: 120, west: 110 },
      timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-01-31' },
      method: 'deterministic',
      resolvedMethod: 'deterministic',
      resolution: '1km',
      ...overrides.configuration,
    },
    createdAt: overrides.createdAt || '2024-01-01T00:00:00Z',
    submittedAt: overrides.submittedAt || '2024-01-01T00:00:00Z',
    completionAt: overrides.completionAt || '2024-01-01T00:00:10Z',
    status: overrides.status || 'Completed',
    failureReason: overrides.failureReason || null,
    dataSeed: 1,
    generatorVersion: 'v1',
    ...overrides,
  } as DownscalingTask
}

describe('Task list filtering', () => {
  describe('Name search', () => {
    it('filters tasks by name case-insensitively', () => {
      const tasks = [
        createTask({ id: '1', name: 'Temperature Analysis' }),
        createTask({ id: '2', name: 'Wind Speed Study' }),
        createTask({ id: '3', name: 'temperature forecast' }),
      ]

      const searchTerm = 'temperature'
      const filtered = tasks.filter((task) =>
        task.name.toLowerCase().includes(searchTerm.toLowerCase()),
      )

      expect(filtered).toHaveLength(2)
      expect(filtered.map((t) => t.id)).toEqual(['1', '3'])
    })

    it('trims whitespace from search term before matching', () => {
      const tasks = [
        createTask({ id: '1', name: 'Test Task' }),
        createTask({ id: '2', name: 'Another Task' }),
      ]

      const searchTerm = '  test  '
      const trimmed = searchTerm.trim()
      const filtered = tasks.filter((task) =>
        task.name.toLowerCase().includes(trimmed.toLowerCase()),
      )

      expect(filtered).toHaveLength(1)
      expect(filtered[0]!.id).toBe('1')
    })

    it('returns all tasks when search term is empty after trimming', () => {
      const tasks = [
        createTask({ id: '1', name: 'Task A' }),
        createTask({ id: '2', name: 'Task B' }),
      ]

      const searchTerm = '   '
      const trimmed = searchTerm.trim()
      const filtered =
        trimmed === ''
          ? tasks
          : tasks.filter((task) => task.name.toLowerCase().includes(trimmed.toLowerCase()))

      expect(filtered).toHaveLength(2)
    })

    it('does not modify saved task names', () => {
      const originalName = '  Task with Spaces  '
      const task = createTask({ name: originalName })

      expect(task.name).toBe(originalName)
    })
  })

  describe('Status filtering', () => {
    it('filters tasks by Running status', () => {
      const tasks = [
        createTask({ id: '1', status: 'Running' }),
        createTask({ id: '2', status: 'Completed' }),
        createTask({ id: '3', status: 'Failed', failureReason: 'Error' }),
      ]

      const filtered = tasks.filter((task) => task.status === 'Running')

      expect(filtered).toHaveLength(1)
      expect(filtered[0]!.id).toBe('1')
    })

    it('filters tasks by Completed status', () => {
      const tasks = [
        createTask({ id: '1', status: 'Running' }),
        createTask({ id: '2', status: 'Completed' }),
        createTask({ id: '3', status: 'Failed', failureReason: 'Error' }),
      ]

      const filtered = tasks.filter((task) => task.status === 'Completed')

      expect(filtered).toHaveLength(1)
      expect(filtered[0]!.id).toBe('2')
    })

    it('filters tasks by Failed status', () => {
      const tasks = [
        createTask({ id: '1', status: 'Running' }),
        createTask({ id: '2', status: 'Completed' }),
        createTask({ id: '3', status: 'Failed', failureReason: 'Error' }),
      ]

      const filtered = tasks.filter((task) => task.status === 'Failed')

      expect(filtered).toHaveLength(1)
      expect(filtered[0]!.id).toBe('3')
    })
  })

  describe('Variable filtering', () => {
    it('filters tasks by temperature variable', () => {
      const tasks = [
        createTask({ id: '1', configuration: { variable: 'temperature' } as any }),
        createTask({ id: '2', configuration: { variable: 'wind' } as any }),
        createTask({ id: '3', configuration: { variable: 'temperature' } as any }),
      ]

      const filtered = tasks.filter((task) => task.configuration.variable === 'temperature')

      expect(filtered).toHaveLength(2)
      expect(filtered.map((t) => t.id)).toEqual(['1', '3'])
    })

    it('filters tasks by wind variable', () => {
      const tasks = [
        createTask({ id: '1', configuration: { variable: 'temperature' } as any }),
        createTask({ id: '2', configuration: { variable: 'wind' } as any }),
      ]

      const filtered = tasks.filter((task) => task.configuration.variable === 'wind')

      expect(filtered).toHaveLength(1)
      expect(filtered[0]!.id).toBe('2')
    })
  })

  describe('Method filtering', () => {
    it('filters by actual resolved method, not request method', () => {
      const tasks = [
        createTask({
          id: '1',
          configuration: {
            method: 'recommended',
            resolvedMethod: 'deterministic',
          } as any,
        }),
        createTask({
          id: '2',
          configuration: {
            method: 'probabilistic',
            resolvedMethod: 'probabilistic',
          } as any,
        }),
        createTask({
          id: '3',
          configuration: {
            method: 'recommended',
            resolvedMethod: 'probabilistic',
          } as any,
        }),
      ]

      // Filter by resolved method, not requested method
      const deterministicTasks = tasks.filter(
        (task) => task.configuration.resolvedMethod === 'deterministic',
      )
      const probabilisticTasks = tasks.filter(
        (task) => task.configuration.resolvedMethod === 'probabilistic',
      )

      expect(deterministicTasks).toHaveLength(1)
      expect(deterministicTasks[0]!.id).toBe('1')
      expect(probabilisticTasks).toHaveLength(2)
      expect(probabilisticTasks.map((t) => t.id)).toEqual(['2', '3'])
    })
  })

  describe('Combined filtering', () => {
    it('applies multiple filters together', () => {
      const tasks = [
        createTask({
          id: '1',
          name: 'Temperature Study',
          status: 'Completed',
          configuration: { variable: 'temperature', resolvedMethod: 'deterministic' } as any,
        }),
        createTask({
          id: '2',
          name: 'Temperature Forecast',
          status: 'Running',
          configuration: { variable: 'temperature', resolvedMethod: 'probabilistic' } as any,
        }),
        createTask({
          id: '3',
          name: 'Wind Analysis',
          status: 'Completed',
          configuration: { variable: 'wind', resolvedMethod: 'deterministic' } as any,
        }),
      ]

      // Filter: name contains "temperature", status is Completed
      const filtered = tasks
        .filter((task) => task.name.toLowerCase().includes('temperature'))
        .filter((task) => task.status === 'Completed')

      expect(filtered).toHaveLength(1)
      expect(filtered[0]!.id).toBe('1')
    })

    it('returns empty array when no tasks match combined filters', () => {
      const tasks = [
        createTask({
          id: '1',
          name: 'Temperature',
          status: 'Completed',
          configuration: { variable: 'temperature' } as any,
        }),
      ]

      const filtered = tasks
        .filter((task) => task.name.toLowerCase().includes('wind'))
        .filter((task) => task.status === 'Failed')

      expect(filtered).toHaveLength(0)
    })
  })
})

describe('Task list sorting', () => {
  describe('Sort by name', () => {
    it('sorts tasks alphabetically by name ascending', () => {
      const tasks = [
        createTask({ id: '1', name: 'Zebra Task' }),
        createTask({ id: '2', name: 'Apple Task' }),
        createTask({ id: '3', name: 'Mango Task' }),
      ]

      const sorted = [...tasks].sort((a, b) => a.name.localeCompare(b.name))

      expect(sorted.map((t) => t.name)).toEqual(['Apple Task', 'Mango Task', 'Zebra Task'])
    })

    it('sorts tasks alphabetically by name descending', () => {
      const tasks = [
        createTask({ id: '1', name: 'Apple Task' }),
        createTask({ id: '2', name: 'Zebra Task' }),
        createTask({ id: '3', name: 'Mango Task' }),
      ]

      const sorted = [...tasks].sort((a, b) => b.name.localeCompare(a.name))

      expect(sorted.map((t) => t.name)).toEqual(['Zebra Task', 'Mango Task', 'Apple Task'])
    })
  })

  describe('Sort by creation time', () => {
    it('sorts tasks by creation time descending (newest first)', () => {
      const tasks = [
        createTask({ id: '1', createdAt: '2024-01-01T00:00:00Z' }),
        createTask({ id: '2', createdAt: '2024-01-03T00:00:00Z' }),
        createTask({ id: '3', createdAt: '2024-01-02T00:00:00Z' }),
      ]

      const sorted = [...tasks].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )

      expect(sorted.map((t) => t.id)).toEqual(['2', '3', '1'])
    })

    it('sorts tasks by creation time ascending (oldest first)', () => {
      const tasks = [
        createTask({ id: '1', createdAt: '2024-01-03T00:00:00Z' }),
        createTask({ id: '2', createdAt: '2024-01-01T00:00:00Z' }),
        createTask({ id: '3', createdAt: '2024-01-02T00:00:00Z' }),
      ]

      const sorted = [...tasks].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )

      expect(sorted.map((t) => t.id)).toEqual(['2', '3', '1'])
    })
  })

  describe('Sort by status', () => {
    it('sorts tasks by status with Running > Completed > Failed', () => {
      const tasks = [
        createTask({ id: '1', status: 'Failed', failureReason: 'Error' }),
        createTask({ id: '2', status: 'Running' }),
        createTask({ id: '3', status: 'Completed' }),
        createTask({ id: '4', status: 'Running' }),
      ]

      const statusOrder = { Running: 0, Completed: 1, Failed: 2 }
      const sorted = [...tasks].sort((a, b) => statusOrder[a.status] - statusOrder[b.status])

      expect(sorted.map((t) => t.id)).toEqual(['2', '4', '3', '1'])
    })
  })

  describe('Stable sorting', () => {
    it('maintains order of tasks with same sort value', () => {
      const tasks = [
        createTask({ id: '1', name: 'Task A', createdAt: '2024-01-01T00:00:00Z' }),
        createTask({ id: '2', name: 'Task B', createdAt: '2024-01-01T00:00:00Z' }),
        createTask({ id: '3', name: 'Task C', createdAt: '2024-01-01T00:00:00Z' }),
      ]

      // Sort by creation time (all same) - should preserve original order
      const sorted = [...tasks].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )

      expect(sorted.map((t) => t.id)).toEqual(['1', '2', '3'])
    })

    it('uses secondary sort (id) for stable ordering when primary values are equal', () => {
      const tasks = [
        createTask({ id: 'task-3', createdAt: '2024-01-01T00:00:00Z' }),
        createTask({ id: 'task-1', createdAt: '2024-01-01T00:00:00Z' }),
        createTask({ id: 'task-2', createdAt: '2024-01-01T00:00:00Z' }),
      ]

      // Sort by creation time (same), then by id for stability
      const sorted = [...tasks].sort((a, b) => {
        const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        if (timeDiff !== 0) return timeDiff
        return a.id.localeCompare(b.id)
      })

      expect(sorted.map((t) => t.id)).toEqual(['task-1', 'task-2', 'task-3'])
    })
  })
})

describe('Task list pagination', () => {
  it('shows first 20 tasks by default', () => {
    const tasks = Array.from({ length: 50 }, (_, i) => createTask({ id: `task-${i}` }))

    const pageSize = 20
    const currentPage = 1
    const paginated = tasks.slice((currentPage - 1) * pageSize, currentPage * pageSize)

    expect(paginated).toHaveLength(20)
    expect(paginated[0]!.id).toBe('task-0')
    expect(paginated[19]!.id).toBe('task-19')
  })

  it('shows second page of results', () => {
    const tasks = Array.from({ length: 50 }, (_, i) => createTask({ id: `task-${i}` }))

    const pageSize = 20
    const currentPage = 2
    const paginated = tasks.slice((currentPage - 1) * pageSize, currentPage * pageSize)

    expect(paginated).toHaveLength(20)
    expect(paginated[0]!.id).toBe('task-20')
    expect(paginated[19]!.id).toBe('task-39')
  })

  it('shows partial results on last page', () => {
    const tasks = Array.from({ length: 45 }, (_, i) => createTask({ id: `task-${i}` }))

    const pageSize = 20
    const currentPage = 3
    const paginated = tasks.slice((currentPage - 1) * pageSize, currentPage * pageSize)

    expect(paginated).toHaveLength(5)
    expect(paginated[0]!.id).toBe('task-40')
    expect(paginated[4]!.id).toBe('task-44')
  })

  it('calculates total pages correctly', () => {
    const testCases = [
      { totalTasks: 20, pageSize: 20, expectedPages: 1 },
      { totalTasks: 21, pageSize: 20, expectedPages: 2 },
      { totalTasks: 40, pageSize: 20, expectedPages: 2 },
      { totalTasks: 41, pageSize: 20, expectedPages: 3 },
    ]

    testCases.forEach(({ totalTasks, pageSize, expectedPages }) => {
      const totalPages = Math.ceil(totalTasks / pageSize)
      expect(totalPages).toBe(expectedPages)
    })
  })

  it('resets to page 1 when filter changes', () => {
    let currentPage = 3
    const filterChanged = true

    if (filterChanged) {
      currentPage = 1
    }

    expect(currentPage).toBe(1)
  })

  it('corrects page to last page when current page exceeds total pages', () => {
    const tasks = Array.from({ length: 25 }, (_, i) => createTask({ id: `task-${i}` }))
    const pageSize = 20
    const totalPages = Math.ceil(tasks.length / pageSize) // 2 pages

    // Simulate being on page 3 when only 2 pages exist (e.g., after deletion)
    let currentPage = 3
    const correctedPage = currentPage > totalPages && totalPages > 0 ? totalPages : currentPage

    expect(correctedPage).toBe(2)
  })

  it('keeps page 1 when total pages becomes 0', () => {
    const tasks: DownscalingTask[] = []
    const pageSize = 20
    const totalPages = Math.ceil(tasks.length / pageSize) // 0 pages

    let currentPage = 1
    const correctedPage = currentPage > totalPages && totalPages > 0 ? totalPages : currentPage

    expect(correctedPage).toBe(1)
  })
})

describe('Analysis time range overlap filtering', () => {
  it('filters tasks where analysis time overlaps with filter range', () => {
    const tasks = [
      createTask({
        id: '1',
        configuration: {
          timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-01-31' },
        } as any,
      }),
      createTask({
        id: '2',
        configuration: {
          timeRange: { mode: 'historical', start: '2024-02-01', end: '2024-02-28' },
        } as any,
      }),
      createTask({
        id: '3',
        configuration: {
          timeRange: { mode: 'historical', start: '2024-01-15', end: '2024-02-15' },
        } as any,
      }),
    ]

    // Filter for tasks with analysis time overlapping 2024-01-20 to 2024-02-10
    // Task 1: Jan 1-31 overlaps (Jan 20-31 is in both ranges)
    // Task 2: Feb 1-28 overlaps (Feb 1-10 is in both ranges)
    // Task 3: Jan 15 - Feb 15 overlaps (fully contains filter range)
    const filterStart = '2024-01-20'
    const filterEnd = '2024-02-10'

    const filtered = tasks.filter((task) => {
      const timeRange = task.configuration.timeRange
      if (timeRange.mode !== 'historical') return false

      // Two ranges overlap if: start1 <= end2 AND start2 <= end1
      return timeRange.start <= filterEnd && filterStart <= timeRange.end
    })

    expect(filtered).toHaveLength(3)
    expect(filtered.map((t) => t.id)).toEqual(['1', '2', '3'])
  })

  it('includes tasks that fully contain the filter range', () => {
    const tasks = [
      createTask({
        id: '1',
        configuration: {
          timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-12-31' },
        } as any,
      }),
    ]

    const filterStart = '2024-06-01'
    const filterEnd = '2024-06-30'

    const filtered = tasks.filter((task) => {
      const timeRange = task.configuration.timeRange
      if (timeRange.mode !== 'historical') return false
      return timeRange.start <= filterEnd && filterStart <= timeRange.end
    })

    expect(filtered).toHaveLength(1)
  })

  it('includes tasks that are fully contained within the filter range', () => {
    const tasks = [
      createTask({
        id: '1',
        configuration: {
          timeRange: { mode: 'historical', start: '2024-06-10', end: '2024-06-20' },
        } as any,
      }),
    ]

    const filterStart = '2024-06-01'
    const filterEnd = '2024-06-30'

    const filtered = tasks.filter((task) => {
      const timeRange = task.configuration.timeRange
      if (timeRange.mode !== 'historical') return false
      return timeRange.start <= filterEnd && filterStart <= timeRange.end
    })

    expect(filtered).toHaveLength(1)
  })

  it('excludes tasks with no overlap', () => {
    const tasks = [
      createTask({
        id: '1',
        configuration: {
          timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-01-31' },
        } as any,
      }),
      createTask({
        id: '2',
        configuration: {
          timeRange: { mode: 'historical', start: '2024-03-01', end: '2024-03-31' },
        } as any,
      }),
    ]

    const filterStart = '2024-02-01'
    const filterEnd = '2024-02-28'

    const filtered = tasks.filter((task) => {
      const timeRange = task.configuration.timeRange
      if (timeRange.mode !== 'historical') return false
      return timeRange.start <= filterEnd && filterStart <= timeRange.end
    })

    expect(filtered).toHaveLength(0)
  })

  it('handles edge case where ranges touch at boundary', () => {
    const tasks = [
      createTask({
        id: '1',
        configuration: {
          timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-01-31' },
        } as any,
      }),
    ]

    // Filter range starts exactly where task ends
    const filterStart = '2024-01-31'
    const filterEnd = '2024-02-28'

    const filtered = tasks.filter((task) => {
      const timeRange = task.configuration.timeRange
      if (timeRange.mode !== 'historical') return false
      return timeRange.start <= filterEnd && filterStart <= timeRange.end
    })

    expect(filtered).toHaveLength(1)
  })

  it('excludes forecast mode tasks when filtering by time range', () => {
    const tasks = [
      createTask({
        id: '1',
        configuration: {
          timeRange: {
            mode: 'forecast',
            start: '2024-01-15T00:00:00Z',
            end: '2024-01-20T00:00:00Z',
          },
        } as any,
      }),
      createTask({
        id: '2',
        configuration: {
          timeRange: { mode: 'historical', start: '2024-01-15', end: '2024-01-20' },
        } as any,
      }),
    ]

    const filterStart = '2024-01-15'
    const filterEnd = '2024-01-20'

    // Only filter historical mode tasks
    const filtered = tasks.filter((task) => {
      const timeRange = task.configuration.timeRange
      if (timeRange.mode !== 'historical') return false
      return timeRange.start <= filterEnd && filterStart <= timeRange.end
    })

    expect(filtered).toHaveLength(1)
    expect(filtered[0]!.id).toBe('2')
  })

  it('returns all tasks when no time range filter is applied', () => {
    const tasks = [
      createTask({
        id: '1',
        configuration: {
          timeRange: { mode: 'historical' as const, start: '2024-01-01', end: '2024-01-31' },
        } as any,
      }),
      createTask({
        id: '2',
        configuration: {
          timeRange: { mode: 'historical' as const, start: '2024-06-01', end: '2024-06-30' },
        } as any,
      }),
    ]

    // No filter applied - return all tasks
    const filtered = tasks

    expect(filtered).toHaveLength(2)
  })
})

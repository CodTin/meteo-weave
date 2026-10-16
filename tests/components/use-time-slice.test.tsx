import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTimeSlice } from '@/features/result-analysis/hooks/use-time-slice'

describe('useTimeSlice', () => {
  const mockTimeRange = {
    start: '2024-01-01T00:00:00.000Z',
    end: '2024-01-01T03:00:00.000Z',
  }

  it('generates hourly time slices from time range', () => {
    const { result } = renderHook(() =>
      useTimeSlice({
        taskId: 'task-1',
        timeRange: mockTimeRange,
        granularity: 'hourly',
      }),
    )

    expect(result.current.timeSlices).toHaveLength(4) // 00:00, 01:00, 02:00, 03:00
    expect(result.current.timeSlices[0]).toEqual({
      value: '2024-01-01T00:00:00.000Z',
      label: '2024-01-01 00:00',
      displayTime: '2024-01-01 00:00 UTC',
    })
  })

  it('generates daily time slices when granularity is daily', () => {
    const { result } = renderHook(() =>
      useTimeSlice({
        taskId: 'task-1',
        timeRange: {
          start: '2024-01-01T00:00:00.000Z',
          end: '2024-01-03T00:00:00.000Z',
        },
        granularity: 'daily',
      }),
    )

    expect(result.current.timeSlices).toHaveLength(3) // Jan 1, Jan 2, Jan 3
  })

  it('initializes with first time slice by default', () => {
    const { result } = renderHook(() =>
      useTimeSlice({
        taskId: 'task-1',
        timeRange: mockTimeRange,
      }),
    )

    expect(result.current.currentTime).toBe('2024-01-01T00:00:00.000Z')
  })

  it('initializes with provided initial time if valid', () => {
    const { result } = renderHook(() =>
      useTimeSlice({
        taskId: 'task-1',
        timeRange: mockTimeRange,
        initialTime: '2024-01-01T02:00:00.000Z',
      }),
    )

    expect(result.current.currentTime).toBe('2024-01-01T02:00:00.000Z')
  })

  it('falls back to first time slice if initial time is out of range', () => {
    const { result } = renderHook(() =>
      useTimeSlice({
        taskId: 'task-1',
        timeRange: mockTimeRange,
        initialTime: '2024-12-31T00:00:00.000Z',
      }),
    )

    expect(result.current.currentTime).toBe('2024-01-01T00:00:00.000Z')
  })

  it('updates current time when setTime is called with valid time', () => {
    const { result } = renderHook(() =>
      useTimeSlice({
        taskId: 'task-1',
        timeRange: mockTimeRange,
      }),
    )

    act(() => {
      result.current.setTime('2024-01-01T02:00:00.000Z')
    })

    expect(result.current.currentTime).toBe('2024-01-01T02:00:00.000Z')
  })

  it('ignores setTime call with invalid time', () => {
    const { result } = renderHook(() =>
      useTimeSlice({
        taskId: 'task-1',
        timeRange: mockTimeRange,
      }),
    )

    const initialTime = result.current.currentTime

    act(() => {
      result.current.setTime('2024-12-31T00:00:00.000Z')
    })

    expect(result.current.currentTime).toBe(initialTime)
  })

  it('generates new request ID when time changes', () => {
    const { result } = renderHook(() =>
      useTimeSlice({
        taskId: 'task-1',
        timeRange: mockTimeRange,
      }),
    )

    const initialRequestId = result.current.requestId

    act(() => {
      result.current.setTime('2024-01-01T01:00:00.000Z')
    })

    expect(result.current.requestId).not.toBe(initialRequestId)
    expect(result.current.requestId).toContain('task-1')
    expect(result.current.requestId).toContain('2024-01-01T01:00:00.000Z')
  })

  it('generates new request ID when taskId changes', () => {
    const { result, rerender } = renderHook(
      ({ taskId }) =>
        useTimeSlice({
          taskId,
          timeRange: mockTimeRange,
        }),
      { initialProps: { taskId: 'task-1' } },
    )

    const initialRequestId = result.current.requestId

    rerender({ taskId: 'task-2' })

    expect(result.current.requestId).not.toBe(initialRequestId)
    expect(result.current.requestId).toContain('task-2')
  })

  it('regenerates time slices when time range changes', () => {
    const { result, rerender } = renderHook(
      ({ timeRange }) =>
        useTimeSlice({
          taskId: 'task-1',
          timeRange,
        }),
      { initialProps: { timeRange: mockTimeRange } },
    )

    expect(result.current.timeSlices).toHaveLength(4)

    rerender({
      timeRange: {
        start: '2024-01-01T00:00:00.000Z',
        end: '2024-01-01T05:00:00.000Z',
      },
    })

    expect(result.current.timeSlices).toHaveLength(6)
  })
})

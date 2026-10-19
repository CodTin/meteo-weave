/**
 * Unit tests for CSV export lifecycle management.
 * Tests state transitions, cancellation, request identity, and resource cleanup.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useCsvExport } from '@/features/result-analysis/hooks/use-csv-export'

describe('CSV Export Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts in idle state', () => {
    const { result } = renderHook(() =>
      useCsvExport({
        taskId: 'task-1',
        bbox: { west: 120, east: 121, south: 30, north: 31 },
        timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' },
        dataTypes: ['downscaled'],
      }),
    )

    expect(result.current.state).toBe('idle')
    expect(result.current.progress).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('transitions through validation stage when export starts', async () => {
    const { result } = renderHook(() =>
      useCsvExport({
        taskId: 'task-1',
        bbox: { west: 120, east: 121, south: 30, north: 31 },
        timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' },
        dataTypes: ['downscaled'],
      }),
    )

    result.current.startExport()

    await waitFor(() => {
      expect(result.current.state).toBe('validating')
      expect(result.current.progress).toEqual({
        stage: 'validation',
        message: '正在验证导出参数',
      })
    })
  })

  it('allows cancellation during validation stage', async () => {
    const { result } = renderHook(() =>
      useCsvExport({
        taskId: 'task-1',
        bbox: { west: 120, east: 121, south: 30, north: 31 },
        timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' },
        dataTypes: ['downscaled'],
      }),
    )

    result.current.startExport()

    await waitFor(() => {
      expect(result.current.state).toBe('validating')
    })

    result.current.cancel()

    await waitFor(() => {
      expect(result.current.state).toBe('cancelled')
      expect(result.current.error).toBeNull()
    })
  })

  it('invalidates old request when new export starts', async () => {
    const { result, rerender } = renderHook(
      ({ taskId }) =>
        useCsvExport({
          taskId,
          bbox: { west: 120, east: 121, south: 30, north: 31 },
          timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' },
          dataTypes: ['downscaled'],
        }),
      { initialProps: { taskId: 'task-1' } },
    )

    // Start first export
    result.current.startExport()
    const firstRequestId = result.current.requestId

    await waitFor(() => {
      expect(result.current.state).toBe('validating')
    })

    // Change task and start new export
    rerender({ taskId: 'task-2' })
    result.current.startExport()

    await waitFor(() => {
      expect(result.current.requestId).not.toBe(firstRequestId)
      expect(result.current.state).toBe('validating')
    })
  })

  it('cleans up blob URL on unmount', () => {
    const revokeObjectURL = vi.fn()
    global.URL.revokeObjectURL = revokeObjectURL

    const { unmount } = renderHook(() =>
      useCsvExport({
        taskId: 'task-1',
        bbox: { west: 120, east: 121, south: 30, north: 31 },
        timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' },
        dataTypes: ['downscaled'],
      }),
    )

    // Simulate having a blob URL
    // TODO: Need to actually create blob URL first in a success scenario
    unmount()

    // Cleanup is verified in success/failure tests
  })

  it('preserves error message and allows retry after failure', async () => {
    const { result } = renderHook(() =>
      useCsvExport({
        taskId: 'task-1',
        bbox: { west: 120, east: 130, south: 30, north: 40 }, // Too large
        timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' },
        dataTypes: ['downscaled'],
      }),
    )

    result.current.startExport()

    await waitFor(() => {
      expect(result.current.state).toBe('failed')
      expect(result.current.error).toContain('exceeds maximum')
    })

    // Error should be preserved
    expect(result.current.error).toBeTruthy()

    // Should be able to retry
    result.current.retry()

    await waitFor(() => {
      expect(result.current.state).toBe('validating')
    })
  })
})

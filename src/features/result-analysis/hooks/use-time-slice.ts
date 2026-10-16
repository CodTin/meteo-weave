import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import type { TimeSlice } from '../components/time-slice-selector'

interface UseTimeSliceOptions {
  taskId: string
  timeRange: {
    start: string
    end: string
  }
  initialTime?: string
  granularity?: 'hourly' | 'daily'
}

interface UseTimeSliceReturn {
  currentTime: string
  timeSlices: TimeSlice[]
  setTime: (time: string) => void
  requestId: string
}

/**
 * Hook to manage time slice state for result analysis.
 * Ensures consistent time across all four maps and handles race conditions.
 */
export function useTimeSlice({
  taskId,
  timeRange,
  initialTime,
  granularity = 'hourly',
}: UseTimeSliceOptions): UseTimeSliceReturn {
  // Generate time slices based on task time range and granularity
  const timeSlices = useMemo(() => {
    const slices: TimeSlice[] = []
    const start = new Date(timeRange.start).getTime()
    const end = new Date(timeRange.end).getTime()
    const step = granularity === 'hourly' ? 3600000 : 86400000 // 1 hour or 1 day in ms

    for (let time = start; time <= end; time += step) {
      const isoString = new Date(time).toISOString()
      slices.push({
        value: isoString,
        label: isoString.slice(0, 16).replace('T', ' '),
        displayTime: `${isoString.slice(0, 16).replace('T', ' ')} UTC`,
      })
    }

    return slices
  }, [timeRange.start, timeRange.end, granularity])

  // Initialize current time
  const [currentTime, setCurrentTimeState] = useState(() => {
    if (initialTime) {
      // Validate initial time is within range
      const time = new Date(initialTime).getTime()
      const start = new Date(timeRange.start).getTime()
      const end = new Date(timeRange.end).getTime()
      if (time >= start && time <= end) {
        return initialTime
      }
    }
    return timeSlices[0]?.value || timeRange.start
  })

  // Request ID to track the current active request and invalidate stale responses
  const requestIdRef = useRef(0)
  const [requestId, setRequestId] = useState('0')

  // Update request ID when taskId or currentTime changes
  useEffect(() => {
    requestIdRef.current += 1
    setRequestId(`${taskId}-${currentTime}-${requestIdRef.current}`)
  }, [taskId, currentTime])

  // Handle time change with race condition protection
  const setTime = useCallback((time: string) => {
    // Validate time is in available slices
    const isValid = timeSlices.some((slice) => slice.value === time)
    if (!isValid) {
      console.warn(`Time ${time} is not in available time slices`)
      return
    }

    setCurrentTimeState(time)
  }, [timeSlices])

  return {
    currentTime,
    timeSlices,
    setTime,
    requestId,
  }
}

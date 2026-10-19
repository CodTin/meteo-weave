/**
 * Hook for real-time export estimation with debounced updates.
 */

import { useState, useEffect, useRef } from 'react'
import { createServerFn } from '@tanstack/react-start'
import type { ExportEstimationRequest } from '@/server/services/csv-export.server'

export interface EstimationResult {
  recordCount: number
  approximateSize: number
}

export interface UseExportEstimationResult {
  estimation: EstimationResult | null
  isEstimating: boolean
  error: string | null
}

// Server function for estimation
const estimateExportFn = createServerFn({ method: 'POST' })
  .validator((data: ExportEstimationRequest) => data)
  .handler(async ({ data }) => {
    const { estimateExportMetrics } = await import('@/server/services/csv-export.server')
    return estimateExportMetrics(data)
  })

/**
 * Generate a request identity key to prevent stale estimates.
 */
function generateRequestKey(request: ExportEstimationRequest): string {
  return JSON.stringify({
    taskId: request.taskId,
    bbox: request.bbox,
    timeRange: request.timeRange,
    dataTypes: request.dataTypes.slice().sort(),
    format: request.format || 'csv',
    variable: request.variable,
  })
}

/**
 * Hook for real-time export estimation with automatic updates on config changes.
 */
export function useExportEstimation(
  request: ExportEstimationRequest,
  debounceMs = 300,
): UseExportEstimationResult {
  const [estimation, setEstimation] = useState<EstimationResult | null>(null)
  const [isEstimating, setIsEstimating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentRequestKeyRef = useRef<string | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Clear any pending estimation
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // Generate request key for this config
    const requestKey = generateRequestKey(request)

    // Skip if no data types selected
    if (request.dataTypes.length === 0) {
      setEstimation(null)
      setError(null)
      setIsEstimating(false)
      return
    }

    // Debounce the estimation
    setIsEstimating(true)
    timeoutRef.current = setTimeout(async () => {
      currentRequestKeyRef.current = requestKey

      try {
        const result = await estimateExportFn({ data: request })

        // Only update if this request is still current
        if (currentRequestKeyRef.current === requestKey) {
          if (!result.ok) {
            setError(result.message)
            setEstimation(null)
          } else {
            setEstimation({
              recordCount: result.recordCount,
              approximateSize: result.approximateSize,
            })
            setError(null)
          }
          setIsEstimating(false)
        }
      } catch (err) {
        if (currentRequestKeyRef.current === requestKey) {
          setError(err instanceof Error ? err.message : '估算失败')
          setEstimation(null)
          setIsEstimating(false)
        }
      }
    }, debounceMs)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [
    request.taskId,
    request.bbox.west,
    request.bbox.east,
    request.bbox.south,
    request.bbox.north,
    request.timeRange.start,
    request.timeRange.end,
    JSON.stringify(request.dataTypes),
    request.format,
    request.variable,
    debounceMs,
  ])

  return {
    estimation,
    isEstimating,
    error,
  }
}

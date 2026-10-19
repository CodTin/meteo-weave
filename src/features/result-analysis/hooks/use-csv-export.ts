/**
 * Hook for managing CSV export lifecycle with cancellation and progress tracking.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { createServerFn } from '@tanstack/react-start'

export type ExportState =
  | 'idle'
  | 'validating'
  | 'generating'
  | 'complete'
  | 'download-initiated'
  | 'cancelled'
  | 'failed'

export type ExportStage = 'validation' | 'reading' | 'encoding' | 'complete'

export interface ExportProgress {
  stage: ExportStage
  message: string
  percent?: number
}

export interface ExportRequest {
  taskId: string
  bbox: {
    west: number
    east: number
    south: number
    north: number
  }
  timeRange: {
    start: string
    end: string
  }
  dataTypes: string[]
  format?: 'csv' | 'geojson'
}

export interface UseCsvExportResult {
  state: ExportState
  progress: ExportProgress | null
  error: string | null
  requestId: string | null
  startExport: () => void
  cancel: () => void
  retry: () => void
  downloadUrl: string | null
  filename: string | null
}

// Server function for CSV/GeoJSON generation
const generateExportFn = createServerFn({ method: 'POST' })
  .validator((data: ExportRequest) => data)
  .handler(async ({ data }) => {
    if (data.format === 'geojson') {
      const { generateGeoJsonExport } = await import('@/server/services/csv-export.server')
      return generateGeoJsonExport(data)
    } else {
      const { generateCsvExport } = await import('@/server/services/csv-export.server')
      return generateCsvExport(data)
    }
  })

/**
 * Generate a unique request ID based on request parameters.
 */
function generateRequestId(request: ExportRequest): string {
  const params = JSON.stringify({
    taskId: request.taskId,
    bbox: request.bbox,
    timeRange: request.timeRange,
    dataTypes: request.dataTypes.slice().sort(),
    format: request.format || 'csv',
  })
  return `${Date.now()}-${params.slice(0, 50)}`
}

/**
 * Hook for managing CSV export with cancellation, progress tracking, and resource cleanup.
 */
export function useCsvExport(request: ExportRequest): UseCsvExportResult {
  const [state, setState] = useState<ExportState>('idle')
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [filename, setFilename] = useState<string | null>(null)

  const cancelledRef = useRef(false)
  const currentRequestRef = useRef<string | null>(null)

  // Cleanup blob URLs on unmount or when downloadUrl changes
  useEffect(() => {
    return () => {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl)
      }
    }
  }, [downloadUrl])

  const startExport = useCallback(async () => {
    // Generate new request ID
    const newRequestId = generateRequestId(request)
    setRequestId(newRequestId)
    currentRequestRef.current = newRequestId

    // Reset state
    setState('validating')
    setProgress({
      stage: 'validation',
      message: '正在验证导出参数',
    })
    setError(null)
    cancelledRef.current = false

    // Cleanup previous blob URL if any
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl)
      setDownloadUrl(null)
      setFilename(null)
    }

    try {
      // Validation stage (client-side quick checks)
      await new Promise((resolve) => setTimeout(resolve, 100))

      if (cancelledRef.current) {
        setState('cancelled')
        setProgress(null)
        return
      }

      // Check bbox size constraints
      const widthKm = calculateBboxWidthKm(request.bbox)
      const heightKm = calculateBboxHeightKm(request.bbox)

      if (widthKm > 100) {
        throw new Error(`Bounding box width (${widthKm.toFixed(1)}km) exceeds maximum of 100km`)
      }

      if (heightKm > 100) {
        throw new Error(`Bounding box height (${heightKm.toFixed(1)}km) exceeds maximum of 100km`)
      }

      // Check duration constraints
      const startMs = Date.parse(request.timeRange.start)
      const endMs = Date.parse(request.timeRange.end)
      const durationHours = (endMs - startMs) / (1000 * 60 * 60)
      const maxHours = 30 * 24

      if (durationHours > maxHours) {
        throw new Error(
          `Duration (${(durationHours / 24).toFixed(1)} days) exceeds maximum of 30 days`,
        )
      }

      if (cancelledRef.current) {
        setState('cancelled')
        setProgress(null)
        return
      }

      // Generation stage - call server function
      setState('generating')
      const formatLabel = request.format === 'geojson' ? 'GeoJSON' : 'CSV'
      setProgress({
        stage: 'reading',
        message: `正在生成 ${formatLabel} 文件`,
        percent: 50,
      })

      const result = await generateExportFn({ data: request })

      if (cancelledRef.current) {
        setState('cancelled')
        setProgress(null)
        return
      }

      if (!result.ok) {
        throw new Error(result.message)
      }

      // Create blob URL for download with appropriate content type
      const contentType =
        request.format === 'geojson'
          ? 'application/geo+json;charset=utf-8;'
          : 'text/csv;charset=utf-8;'
      const content = 'geojson' in result ? result.geojson : result.csv
      const blob = new Blob([content], { type: contentType })
      const url = URL.createObjectURL(blob)

      setDownloadUrl(url)
      setFilename(result.filename)
      setState('complete')
      setProgress({
        stage: 'complete',
        message: '生成完成',
        percent: 100,
      })
    } catch (err) {
      if (cancelledRef.current) {
        setState('cancelled')
        setProgress(null)
        return
      }

      setState('failed')
      setError(err instanceof Error ? err.message : '导出失败')
      setProgress(null)
    }
  }, [request, downloadUrl])

  const cancel = useCallback(() => {
    cancelledRef.current = true
    setState('cancelled')
    setProgress(null)
  }, [])

  const retry = useCallback(() => {
    startExport()
  }, [startExport])

  return {
    state,
    progress,
    error,
    requestId,
    startExport,
    cancel,
    retry,
    downloadUrl,
    filename,
  }
}

/**
 * Calculate bounding box width in kilometers.
 */
function calculateBboxWidthKm(bbox: ExportRequest['bbox']): number {
  const { west, east, south, north } = bbox
  const R = 6371 // Earth radius in km

  const northDistance =
    R * Math.abs(east - west) * (Math.PI / 180) * Math.cos((north * Math.PI) / 180)
  const southDistance =
    R * Math.abs(east - west) * (Math.PI / 180) * Math.cos((south * Math.PI) / 180)

  return Math.max(northDistance, southDistance)
}

/**
 * Calculate bounding box height in kilometers.
 */
function calculateBboxHeightKm(bbox: ExportRequest['bbox']): number {
  const { south, north } = bbox
  const R = 6371 // Earth radius in km
  return R * Math.abs(north - south) * (Math.PI / 180)
}

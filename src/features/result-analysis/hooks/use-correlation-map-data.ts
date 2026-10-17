import { useState, useMemo } from 'react'
import type { Variable } from '../service/color-scales'
import {
  calculateCorrelationMap,
  type CorrelationMapData,
  type CorrelationMapCalculationResult,
} from '../service/correlation-map'

export type PredictionType = 'original' | 'downscaled'

export type CorrelationMapOptions = {
  predictionType: PredictionType
}

type UseCorrelationMapDataProps = {
  taskId: string
  variable: Variable
  timeWindow: {
    start: string
    end: string
  }
  region: {
    west: number
    east: number
    south: number
    north: number
  }
  requestId?: string
}

/**
 * Hook for managing correlation map data and calculations
 *
 * This hook fetches the necessary time-series grid data and calculates
 * per-point temporal correlation based on the selected prediction type.
 */
export function useCorrelationMapData({
  taskId: _taskId,
  variable: _variable,
  timeWindow,
  region,
  requestId: _requestId,
}: UseCorrelationMapDataProps) {
  const [options, setOptions] = useState<CorrelationMapOptions>({
    predictionType: 'downscaled',
  })

  // Mock data for demonstration
  // In production, this would fetch from the public result API with time series
  const gridData = useMemo<CorrelationMapData | null>(() => {
    // Mock: Generate synthetic time-series grid data for demonstration
    const rows = 10
    const cols = 10
    const cellSizeKm = 1
    const timePoints = 5

    const mask: boolean[][] = []
    const timeDimension = []

    // Generate mask (most points valid, some missing)
    for (let i = 0; i < rows; i++) {
      const maskRow: boolean[] = []
      for (let j = 0; j < cols; j++) {
        // Create some missing points in corners
        const isMissing = (i === 0 && j === 0) || (i === rows - 1 && j === cols - 1)
        maskRow.push(!isMissing)
      }
      mask.push(maskRow)
    }

    // Generate time series with varying correlation patterns
    for (let t = 0; t < timePoints; t++) {
      const original: number[][] = []
      const downscaled: number[][] = []
      const reference: number[][] = []

      for (let i = 0; i < rows; i++) {
        const origRow: number[] = []
        const downRow: number[] = []
        const refRow: number[] = []

        for (let j = 0; j < cols; j++) {
          // Base spatial pattern
          const spatialBase =
            15 + Math.sin((i * Math.PI) / rows) * 5 + Math.cos((j * Math.PI) / cols) * 3

          // Temporal variation (deterministic)
          const temporalVar = t * 2 + Math.sin(t * 0.5) * 3

          // Reference varies in time and space
          const refVal = spatialBase + temporalVar

          // Original has positive bias and good correlation
          const origVal = refVal + 2 + Math.sin((i + j + t) * 0.3) * 0.8

          // Downscaled has better correlation with reference
          const downVal = refVal + Math.cos((i + j + t) * 0.4) * 0.5

          // Create some zero-variance points (constant over time)
          if (i === 1 && j === 1) {
            // This point will have zero variance in prediction
            origRow.push(20)
            downRow.push(20)
            refRow.push(refVal)
          } else if (i === 2 && j === 2) {
            // This point will have zero variance in reference
            origRow.push(origVal)
            downRow.push(downVal)
            refRow.push(15)
          } else if (i === 3 && j === 3 && t < 2) {
            // This point will have insufficient samples (missing first 3 time points)
            origRow.push(NaN)
            downRow.push(NaN)
            refRow.push(NaN)
          } else {
            origRow.push(origVal)
            downRow.push(downVal)
            refRow.push(refVal)
          }
        }

        original.push(origRow)
        downscaled.push(downRow)
        reference.push(refRow)
      }

      timeDimension.push({ original, downscaled, reference })
    }

    return {
      original: [], // Not used for correlation map (uses timeDimension)
      downscaled: [],
      reference: [],
      mask,
      gridInfo: {
        rows,
        cols,
        cellSizeKm,
        extent: {
          minLat: region.south,
          maxLat: region.north,
          minLon: region.west,
          maxLon: region.east,
        },
      },
      timeDimension,
    }
  }, [region])

  // Calculate correlation map based on current options
  const correlationMapResult = useMemo<CorrelationMapCalculationResult | null>(() => {
    if (!gridData) return null

    const windowDescription = `${new Date(timeWindow.start).toLocaleDateString('zh-CN')} - ${new Date(timeWindow.end).toLocaleDateString('zh-CN')}`

    return calculateCorrelationMap(gridData, {
      predictionType: options.predictionType,
      windowDescription,
    })
  }, [gridData, options, timeWindow])

  return {
    options,
    setOptions,
    correlationMapResult,
    loading: false, // Mock: always ready
    error: null,
  }
}

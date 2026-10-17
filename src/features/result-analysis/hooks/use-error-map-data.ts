import { useState, useMemo } from 'react'
import type { Variable } from '../service/color-scales'
import {
  calculateErrorMap,
  calculateImprovementMap,
  type ErrorMapData,
  type ErrorMapCalculationResult,
} from '../service/error-maps'

export type ErrorMapMode = 'signed' | 'absolute' | 'improvement'
export type PredictionType = 'original' | 'downscaled'

export type ErrorMapOptions = {
  mode: ErrorMapMode
  predictionType: PredictionType
}

type UseErrorMapDataProps = {
  taskId: string
  variable: Variable
  timeSlice: string
  region: {
    west: number
    east: number
    south: number
    north: number
  }
  requestId?: string
}

/**
 * Hook for managing error map data and calculations
 *
 * This hook fetches the necessary grid data (original, downscaled, reference)
 * and calculates error maps based on the selected mode.
 */
export function useErrorMapData({
  taskId: _taskId,
  variable,
  timeSlice: _timeSlice,
  region,
  requestId: _requestId,
}: UseErrorMapDataProps) {
  const [options, setOptions] = useState<ErrorMapOptions>({
    mode: 'signed',
    predictionType: 'downscaled',
  })

  // Mock data for demonstration
  // In production, this would fetch from the public result API
  const gridData = useMemo<ErrorMapData | null>(() => {
    // Mock: Generate synthetic grid data for demonstration
    const rows = 10
    const cols = 10
    const cellSizeKm = 1

    const original: number[][] = []
    const downscaled: number[][] = []
    const reference: number[][] = []
    const mask: boolean[][] = []

    // Generate mock data with known patterns (deterministic for stability)
    for (let i = 0; i < rows; i++) {
      const origRow: number[] = []
      const downRow: number[] = []
      const refRow: number[] = []
      const maskRow: boolean[] = []

      for (let j = 0; j < cols; j++) {
        // Reference: base temperature with spatial variation
        const refVal = 15 + Math.sin((i * Math.PI) / rows) * 5 + Math.cos((j * Math.PI) / cols) * 3

        // Original: reference + consistent positive bias (deterministic)
        const origVal = refVal + 2 + Math.sin((i + j) * 0.5) * 0.5

        // Downscaled: closer to reference with some remaining error (deterministic)
        const downVal = refVal + (Math.cos((i + j) * 0.7) - 0.5) * 1.5

        origRow.push(origVal)
        downRow.push(downVal)
        refRow.push(refVal)
        maskRow.push(true) // All valid for demo
      }

      original.push(origRow)
      downscaled.push(downRow)
      reference.push(refRow)
      mask.push(maskRow)
    }

    return {
      original,
      downscaled,
      reference,
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
    }
  }, [region])

  // Calculate error map based on current options
  const errorMapResult = useMemo<ErrorMapCalculationResult | null>(() => {
    if (!gridData) return null

    const { mode, predictionType } = options

    if (mode === 'improvement') {
      return calculateImprovementMap(gridData)
    }

    // Get variable unit
    const unit = getVariableUnit(variable)

    return calculateErrorMap(gridData, {
      errorType: mode,
      predictionType,
      unit,
    })
  }, [gridData, options, variable])

  return {
    options,
    setOptions,
    errorMapResult,
    loading: false, // Mock: always ready
    error: null,
  }
}

function getVariableUnit(variable: Variable): string {
  switch (variable) {
    case 'temperature':
      return '°C'
    case 'pressure':
      return 'hPa'
    case 'precipitation':
      return 'mm'
    case 'wind':
      return 'm/s'
    default:
      return ''
  }
}

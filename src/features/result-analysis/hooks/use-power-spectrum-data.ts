import { useState, useEffect } from 'react'
import {
  calculatePowerSpectrum,
  type GridData,
  type PowerSpectrumResult,
} from '../service/spatial-summary'

type PowerSpectrumDataOptions = {
  taskId: string
  variable: string
  timeSlice: string
  region: {
    west: number
    east: number
    south: number
    north: number
  }
  requestId?: string
}

type PowerSpectrumData = {
  original: PowerSpectrumResult
  downscaled: PowerSpectrumResult
}

export function usePowerSpectrumData({
  taskId,
  variable,
  timeSlice,
  region,
  requestId,
}: PowerSpectrumDataOptions) {
  const [data, setData] = useState<PowerSpectrumData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchData() {
      setLoading(true)
      setError(null)

      try {
        // TODO: Replace with actual API call to fetch grid data for the task
        // For now, use mock data to demonstrate the structure

        // Simulate API delay
        await new Promise((resolve) => setTimeout(resolve, 100))

        if (cancelled) return

        // Mock grid data - in production, this comes from the task result API
        const mockGridData = generateMockGridData()

        // Calculate spectra for both original and downscaled
        const originalSpectrum = calculatePowerSpectrum(mockGridData.original)
        const downscaledSpectrum = calculatePowerSpectrum(mockGridData.downscaled)

        setData({
          original: originalSpectrum,
          downscaled: downscaledSpectrum,
        })
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载功率谱数据失败')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      cancelled = true
    }
  }, [taskId, variable, timeSlice, region.west, region.east, region.south, region.north, requestId])

  return { data, loading, error }
}

// Mock data generator - replace with actual API in production
function generateMockGridData(): { original: GridData; downscaled: GridData } {
  const size = 16
  const cellSizeKm = 10

  // Create a simple spatial pattern
  const originalField = Array(size)
    .fill(null)
    .map((_, i) =>
      Array(size)
        .fill(null)
        .map((_, j) => {
          // Coarse-scale pattern (large wavelength)
          const x = i * cellSizeKm
          const y = j * cellSizeKm
          return (
            50 + 30 * Math.sin((2 * Math.PI * x) / 100) + 20 * Math.cos((2 * Math.PI * y) / 120)
          )
        }),
    )

  const downscaledField = Array(size)
    .fill(null)
    .map((_, i) =>
      Array(size)
        .fill(null)
        .map((_, j) => {
          // Finer-scale pattern (smaller wavelength added)
          const x = i * cellSizeKm
          const y = j * cellSizeKm
          return (
            50 +
            30 * Math.sin((2 * Math.PI * x) / 100) +
            20 * Math.cos((2 * Math.PI * y) / 120) +
            10 * Math.sin((2 * Math.PI * x) / 40) // Additional fine-scale detail
          )
        }),
    )

  const mask = Array(size)
    .fill(null)
    .map(() => Array(size).fill(true))

  return {
    original: {
      predicted: originalField,
      reference: Array(size)
        .fill(null)
        .map(() => Array(size).fill(0)),
      mask,
      gridInfo: {
        rows: size,
        cols: size,
        cellSizeKm,
      },
    },
    downscaled: {
      predicted: downscaledField,
      reference: Array(size)
        .fill(null)
        .map(() => Array(size).fill(0)),
      mask,
      gridInfo: {
        rows: size,
        cols: size,
        cellSizeKm,
      },
    },
  }
}

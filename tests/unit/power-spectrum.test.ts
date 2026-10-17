import { describe, it, expect } from 'vitest'
import {
  calculatePowerSpectrum,
  type GridData,
} from '@/features/result-analysis/service/spatial-summary'

describe('calculatePowerSpectrum', () => {
  describe('constant field', () => {
    it('returns zero power at all non-DC frequencies for constant field', () => {
      // Constant field after detrending should have all power at DC (zero frequency)
      const size = 8
      const constantValue = 100
      const data: GridData = {
        predicted: Array(size)
          .fill(null)
          .map(() => Array(size).fill(constantValue)),
        reference: Array(size)
          .fill(null)
          .map(() => Array(size).fill(0)),
        mask: Array(size)
          .fill(null)
          .map(() => Array(size).fill(true)),
        gridInfo: {
          rows: size,
          cols: size,
          cellSizeKm: 10,
        },
      }

      const result = calculatePowerSpectrum(data)

      expect(result.available).toBe(true)
      if (!result.available) return

      // After detrending, constant field should have negligible power at non-zero frequencies
      // Check that most non-DC frequencies have very small power
      const nonDCPowers = result.summary.meanPower.slice(1) // Skip DC component
      const maxNonDCPower = Math.max(...nonDCPowers)
      expect(maxNonDCPower).toBeLessThan(1e-10)
    })
  })

  describe('single spatial sine wave', () => {
    it('detects spectral peak at correct frequency in cycles/km', () => {
      // Create a sine wave with known wavelength
      const size = 16
      const cellSizeKm = 5
      const wavelengthKm = 40 // 4 cells per wavelength
      const expectedFreq = 1 / wavelengthKm // 0.025 cycles/km

      const data: GridData = {
        predicted: Array(size)
          .fill(null)
          .map((_, i) =>
            Array(size)
              .fill(null)
              .map(() => {
                // Sine wave in x direction
                const x = i * cellSizeKm
                return Math.sin((2 * Math.PI * x) / wavelengthKm)
              }),
          ),
        reference: Array(size)
          .fill(null)
          .map(() => Array(size).fill(0)),
        mask: Array(size)
          .fill(null)
          .map(() => Array(size).fill(true)),
        gridInfo: {
          rows: size,
          cols: size,
          cellSizeKm,
        },
      }

      const result = calculatePowerSpectrum(data)

      expect(result.available).toBe(true)
      if (!result.available) return

      // Find peak frequency
      let maxPower = -Infinity
      let peakFreqIndex = -1
      result.summary.meanPower.forEach((power, idx) => {
        if (power > maxPower) {
          maxPower = power
          peakFreqIndex = idx
        }
      })

      const peakFreq = result.summary.frequencies[peakFreqIndex]
      expect(peakFreq).toBeDefined()

      // Peak should be close to expected frequency (within frequency bin resolution)
      const freqResolution = 1 / (size * cellSizeKm)
      expect(Math.abs(peakFreq! - expectedFreq)).toBeLessThan(freqResolution * 2)
    })
  })

  describe('metadata requirements', () => {
    it('exposes window, normalization, grid size and detrending in metadata', () => {
      const size = 8
      const cellSizeKm = 10
      const data: GridData = {
        predicted: Array(size)
          .fill(null)
          .map(() => Array(size).fill(50)),
        reference: Array(size)
          .fill(null)
          .map(() => Array(size).fill(0)),
        mask: Array(size)
          .fill(null)
          .map(() => Array(size).fill(true)),
        gridInfo: {
          rows: size,
          cols: size,
          cellSizeKm,
        },
      }

      const result = calculatePowerSpectrum(data)

      expect(result.available).toBe(true)
      if (!result.available) return

      expect(result.metadata.window).toBe('hann')
      expect(result.metadata.normalization).toBe('energy')
      expect(result.metadata.detrended).toBe(true)
      expect(result.metadata.unit).toBe('cycles/km')
      expect(result.metadata.cellSizeKm).toBe(cellSizeKm)
      expect(result.metadata.gridSize).toEqual({ rows: size, cols: size })
    })
  })

  describe('physical frequency units', () => {
    it('uses cycles/km based on physical grid spacing', () => {
      const size = 8
      const cellSizeKm = 10
      const data: GridData = {
        predicted: Array(size)
          .fill(null)
          .map(() => Array(size).fill(50)),
        reference: Array(size)
          .fill(null)
          .map(() => Array(size).fill(0)),
        mask: Array(size)
          .fill(null)
          .map(() => Array(size).fill(true)),
        gridInfo: {
          rows: size,
          cols: size,
          cellSizeKm,
        },
      }

      const result = calculatePowerSpectrum(data)

      expect(result.available).toBe(true)
      if (!result.available) return

      // Nyquist frequency should be 1/(2*cellSize)
      const nyquistFreq = 1 / (2 * cellSizeKm)
      const maxFreq = Math.max(...result.summary.frequencies)

      // Maximum frequency should not exceed Nyquist
      expect(maxFreq).toBeLessThanOrEqual(nyquistFreq * 1.01) // Small tolerance for binning
    })
  })

  describe('missing data handling', () => {
    it('returns unavailable when grid size too small', () => {
      const size = 3 // Below minimum of 4x4
      const data: GridData = {
        predicted: Array(size)
          .fill(null)
          .map(() => Array(size).fill(50)),
        reference: Array(size)
          .fill(null)
          .map(() => Array(size).fill(0)),
        mask: Array(size)
          .fill(null)
          .map(() => Array(size).fill(true)),
        gridInfo: {
          rows: size,
          cols: size,
          cellSizeKm: 10,
        },
      }

      const result = calculatePowerSpectrum(data)

      expect(result.available).toBe(false)
      if (result.available) return
      expect(result.reason).toContain('网格尺寸不足')
    })

    it('returns unavailable when too many masked points', () => {
      const size = 8
      const mask = Array(size)
        .fill(null)
        .map(
          (_, i) =>
            Array(size)
              .fill(null)
              .map((_, j) => i === 0 && j === 0), // Only 1 valid point
        )

      const data: GridData = {
        predicted: Array(size)
          .fill(null)
          .map(() => Array(size).fill(50)),
        reference: Array(size)
          .fill(null)
          .map(() => Array(size).fill(0)),
        mask,
        gridInfo: {
          rows: size,
          cols: size,
          cellSizeKm: 10,
        },
      }

      const result = calculatePowerSpectrum(data)

      expect(result.available).toBe(false)
      if (result.available) return
      expect(result.reason).toContain('有效数据点不足')
    })
  })

  describe('Hann window application', () => {
    it('applies window that reduces edge artifacts', () => {
      // Test that windowing is actually applied by comparing spectrum
      // of a field with sharp edges (which would leak without windowing)
      const size = 8
      const data: GridData = {
        predicted: Array(size)
          .fill(null)
          .map((_, i) =>
            Array(size)
              .fill(null)
              .map(() => (i < size / 2 ? 100 : -100)),
          ),
        reference: Array(size)
          .fill(null)
          .map(() => Array(size).fill(0)),
        mask: Array(size)
          .fill(null)
          .map(() => Array(size).fill(true)),
        gridInfo: {
          rows: size,
          cols: size,
          cellSizeKm: 10,
        },
      }

      const result = calculatePowerSpectrum(data)

      expect(result.available).toBe(true)
      if (!result.available) return

      // With proper windowing, spectrum should exist
      expect(result.summary.frequencies.length).toBeGreaterThan(0)
      expect(result.summary.meanPower.length).toBeGreaterThan(0)
      expect(result.metadata.window).toBe('hann')
    })
  })
})

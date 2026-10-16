import { describe, test, expect } from 'vitest'
import {
  calculateSpatialCorrelation,
  calculatePowerSpectrum,
  type GridData,
} from '@/features/result-analysis/service/spatial-summary'

describe('calculateSpatialCorrelation', () => {
  describe('基本相关性计算', () => {
    test('计算完美正相关（r = 1）', () => {
      const gridData: GridData = {
        predicted: [
          [1, 2, 3],
          [4, 5, 6],
        ],
        reference: [
          [1, 2, 3],
          [4, 5, 6],
        ],
        mask: [
          [true, true, true],
          [true, true, true],
        ],
        gridInfo: {
          rows: 2,
          cols: 3,
          cellSizeKm: 1,
        },
      }

      const result = calculateSpatialCorrelation(gridData)

      expect(result.available).toBe(true)
      if (result.available) {
        expect(result.summary.meanCorrelation).toBeCloseTo(1.0, 5)
        expect(result.summary.validPoints).toBe(6)
        expect(result.summary.totalPoints).toBe(6)
      }
    })

    test('计算完美负相关（r = -1）', () => {
      const gridData: GridData = {
        predicted: [
          [1, 2, 3],
          [4, 5, 6],
        ],
        reference: [
          [6, 5, 4],
          [3, 2, 1],
        ],
        mask: [
          [true, true, true],
          [true, true, true],
        ],
        gridInfo: {
          rows: 2,
          cols: 3,
          cellSizeKm: 1,
        },
      }

      const result = calculateSpatialCorrelation(gridData)

      expect(result.available).toBe(true)
      if (result.available) {
        expect(result.summary.meanCorrelation).toBeCloseTo(-1.0, 5)
        expect(result.summary.validPoints).toBe(6)
      }
    })

    test('计算零相关', () => {
      // 在时间窗口内：预测序列 [1,2,3], 参考序列 [2,2,2]（常数，零方差）
      // 或使用正交的序列模式
      const gridData: GridData = {
        predicted: [
          [1, 2],
          [3, 4],
        ],
        reference: [
          [2, 2],
          [2, 2],
        ],
        mask: [
          [true, true],
          [true, true],
        ],
        gridInfo: {
          rows: 2,
          cols: 2,
          cellSizeKm: 1,
        },
        timeDimension: [
          {
            predicted: [
              [1, 2],
              [3, 4],
            ],
            reference: [
              [2, 2],
              [2, 2],
            ],
          },
        ],
      }

      const result = calculateSpatialCorrelation(gridData)

      // 参考方差为零时应标记为不可用
      expect(result.available).toBe(false)
      if (!result.available) {
        expect(result.reason).toContain('方差为零')
      }
    })
  })

  describe('不可用场景', () => {
    test('有效时间点不足3个', () => {
      const gridData: GridData = {
        predicted: [[1, 2]],
        reference: [[1, 2]],
        mask: [[true, true]],
        gridInfo: {
          rows: 1,
          cols: 2,
          cellSizeKm: 1,
        },
        timeDimension: [
          {
            predicted: [[1, 2]],
            reference: [[1, 2]],
          },
          {
            predicted: [[2, 3]],
            reference: [[2, 3]],
          },
        ],
      }

      const result = calculateSpatialCorrelation(gridData)

      expect(result.available).toBe(false)
      if (!result.available) {
        expect(result.reason).toContain('有效时间点不足')
      }
    })

    test('预测方差为零', () => {
      const gridData: GridData = {
        predicted: [
          [5, 5],
          [5, 5],
        ],
        reference: [
          [1, 2],
          [3, 4],
        ],
        mask: [
          [true, true],
          [true, true],
        ],
        gridInfo: {
          rows: 2,
          cols: 2,
          cellSizeKm: 1,
        },
        timeDimension: [
          {
            predicted: [
              [5, 5],
              [5, 5],
            ],
            reference: [
              [1, 2],
              [3, 4],
            ],
          },
          {
            predicted: [
              [5, 5],
              [5, 5],
            ],
            reference: [
              [2, 3],
              [4, 5],
            ],
          },
          {
            predicted: [
              [5, 5],
              [5, 5],
            ],
            reference: [
              [3, 4],
              [5, 6],
            ],
          },
        ],
      }

      const result = calculateSpatialCorrelation(gridData)

      expect(result.available).toBe(false)
      if (!result.available) {
        expect(result.reason).toContain('方差为零')
      }
    })

    test('无有效网格点', () => {
      const gridData: GridData = {
        predicted: [[1, 2]],
        reference: [[1, 2]],
        mask: [[false, false]],
        gridInfo: {
          rows: 1,
          cols: 2,
          cellSizeKm: 1,
        },
      }

      const result = calculateSpatialCorrelation(gridData)

      expect(result.available).toBe(false)
      if (!result.available) {
        expect(result.reason).toContain('无有效网格点')
      }
    })
  })

  describe('Mask 和有效性处理', () => {
    test('正确应用 mask 排除无效点', () => {
      const gridData: GridData = {
        predicted: [
          [1, 2, 3],
          [4, 5, 6],
        ],
        reference: [
          [1, 2, 3],
          [4, 5, 6],
        ],
        mask: [
          [true, false, true],
          [true, true, false],
        ],
        gridInfo: {
          rows: 2,
          cols: 3,
          cellSizeKm: 1,
        },
      }

      const result = calculateSpatialCorrelation(gridData)

      expect(result.available).toBe(true)
      if (result.available) {
        expect(result.summary.validPoints).toBe(4) // 只有4个 true
        expect(result.summary.totalPoints).toBe(6)
      }
    })
  })
})

describe('calculatePowerSpectrum', () => {
  describe('基本功率谱计算', () => {
    test('常数场的功率谱（零频率集中）', () => {
      const gridData: GridData = {
        predicted: [
          [5, 5, 5, 5],
          [5, 5, 5, 5],
          [5, 5, 5, 5],
          [5, 5, 5, 5],
        ],
        reference: [
          [5, 5, 5, 5],
          [5, 5, 5, 5],
          [5, 5, 5, 5],
          [5, 5, 5, 5],
        ],
        mask: [
          [true, true, true, true],
          [true, true, true, true],
          [true, true, true, true],
          [true, true, true, true],
        ],
        gridInfo: {
          rows: 4,
          cols: 4,
          cellSizeKm: 1,
        },
      }

      const result = calculatePowerSpectrum(gridData)

      expect(result.available).toBe(true)
      if (result.available) {
        expect(result.summary.frequencies).toBeDefined()
        expect(result.summary.frequencies.length).toBeGreaterThan(0)
        expect(result.summary.frequencies[0]).toBeCloseTo(0, 5) // 最低频率接近0
        expect(result.metadata.unit).toBe('cycles/km')
        expect(result.metadata.normalization).toBe('energy')
        expect(result.metadata.window).toBe('hann')
      }
    })

    test('空间正弦场检测频率峰值', () => {
      // 创建一个简单的正弦波场：wavelength = 4 cells
      const size = 8
      const wavelength = 4
      const predicted: number[][] = []
      const reference: number[][] = []
      const mask: boolean[][] = []

      for (let i = 0; i < size; i++) {
        const predRow: number[] = []
        const refRow: number[] = []
        const maskRow: boolean[] = []
        for (let j = 0; j < size; j++) {
          const value = Math.sin((2 * Math.PI * j) / wavelength)
          predRow.push(value)
          refRow.push(value)
          maskRow.push(true)
        }
        predicted.push(predRow)
        reference.push(refRow)
        mask.push(maskRow)
      }

      const gridData: GridData = {
        predicted,
        reference,
        mask,
        gridInfo: {
          rows: size,
          cols: size,
          cellSizeKm: 1,
        },
      }

      const result = calculatePowerSpectrum(gridData)

      expect(result.available).toBe(true)
      if (result.available) {
        // 应该能检测到对应波长的频率峰值
        const expectedFreq = 1 / wavelength // cycles/km
        const freqs = result.summary.frequencies
        const powers = result.summary.meanPower

        // 找到最大功率对应的频率
        let maxPower = -Infinity
        let maxFreqIndex = 0
        for (let i = 1; i < powers.length; i++) {
          // 跳过DC分量
          if (powers[i]! > maxPower) {
            maxPower = powers[i]!
            maxFreqIndex = i
          }
        }

        expect(freqs[maxFreqIndex]).toBeCloseTo(expectedFreq, 1)
      }
    })
  })

  describe('频率单位与元数据', () => {
    test('正确计算 cycles/km 频率', () => {
      const gridData: GridData = {
        predicted: [
          [1, 2, 3, 4],
          [2, 3, 4, 5],
          [3, 4, 5, 6],
          [4, 5, 6, 7],
        ],
        reference: [
          [1, 2, 3, 4],
          [2, 3, 4, 5],
          [3, 4, 5, 6],
          [4, 5, 6, 7],
        ],
        mask: [
          [true, true, true, true],
          [true, true, true, true],
          [true, true, true, true],
          [true, true, true, true],
        ],
        gridInfo: {
          rows: 4,
          cols: 4,
          cellSizeKm: 2.5, // 2.5 km per cell
        },
      }

      const result = calculatePowerSpectrum(gridData)

      expect(result.available).toBe(true)
      if (result.available) {
        expect(result.metadata.cellSizeKm).toBe(2.5)
        expect(result.metadata.unit).toBe('cycles/km')

        // Nyquist frequency = 1 / (2 * cellSize) cycles/km
        const nyquist = 1 / (2 * 2.5)
        const maxFreq = Math.max(...result.summary.frequencies)
        expect(maxFreq).toBeLessThanOrEqual(nyquist)
      }
    })

    test('公开采样间距和窗口约定', () => {
      const gridData: GridData = {
        predicted: [
          [1, 2, 3, 4],
          [2, 3, 4, 5],
          [3, 4, 5, 6],
          [4, 5, 6, 7],
        ],
        reference: [
          [1, 2, 3, 4],
          [2, 3, 4, 5],
          [3, 4, 5, 6],
          [4, 5, 6, 7],
        ],
        mask: [
          [true, true, true, true],
          [true, true, true, true],
          [true, true, true, true],
          [true, true, true, true],
        ],
        gridInfo: {
          rows: 4,
          cols: 4,
          cellSizeKm: 3,
        },
      }

      const result = calculatePowerSpectrum(gridData)

      expect(result.available).toBe(true)
      if (result.available) {
        expect(result.metadata.cellSizeKm).toBe(3)
        expect(result.metadata.window).toBe('hann')
        expect(result.metadata.normalization).toBe('energy')
        expect(result.metadata.gridSize).toEqual({ rows: 4, cols: 4 })
      }
    })
  })

  describe('不可用场景', () => {
    test('网格尺寸不足（小于4x4）', () => {
      const gridData: GridData = {
        predicted: [
          [1, 2],
          [3, 4],
        ],
        reference: [
          [1, 2],
          [3, 4],
        ],
        mask: [
          [true, true],
          [true, true],
        ],
        gridInfo: {
          rows: 2,
          cols: 2,
          cellSizeKm: 1,
        },
      }

      const result = calculatePowerSpectrum(gridData)

      expect(result.available).toBe(false)
      if (!result.available) {
        expect(result.reason).toContain('网格尺寸不足')
      }
    })

    test('有效数据点不足', () => {
      const gridData: GridData = {
        predicted: [
          [1, 2, 3, 4],
          [5, 6, 7, 8],
          [9, 10, 11, 12],
          [13, 14, 15, 16],
        ],
        reference: [
          [1, 2, 3, 4],
          [5, 6, 7, 8],
          [9, 10, 11, 12],
          [13, 14, 15, 16],
        ],
        mask: [
          [true, false, false, false],
          [false, false, false, false],
          [false, false, false, false],
          [false, false, false, false],
        ],
        gridInfo: {
          rows: 4,
          cols: 4,
          cellSizeKm: 1,
        },
      }

      const result = calculatePowerSpectrum(gridData)

      expect(result.available).toBe(false)
      if (!result.available) {
        expect(result.reason).toContain('有效数据点不足')
      }
    })
  })

  describe('去均值和 Hann 窗处理', () => {
    test('应用 Hann 窗后能量归一化', () => {
      const gridData: GridData = {
        predicted: [
          [1, 2, 3, 4],
          [2, 3, 4, 5],
          [3, 4, 5, 6],
          [4, 5, 6, 7],
        ],
        reference: [
          [1, 2, 3, 4],
          [2, 3, 4, 5],
          [3, 4, 5, 6],
          [4, 5, 6, 7],
        ],
        mask: [
          [true, true, true, true],
          [true, true, true, true],
          [true, true, true, true],
          [true, true, true, true],
        ],
        gridInfo: {
          rows: 4,
          cols: 4,
          cellSizeKm: 1,
        },
      }

      const result = calculatePowerSpectrum(gridData)

      expect(result.available).toBe(true)
      if (result.available) {
        // 能量归一化后，功率值应该是有限的正数
        expect(result.summary.meanPower.every((p) => Number.isFinite(p) && p >= 0)).toBe(true)
        expect(result.metadata.detrended).toBe(true)
      }
    })
  })
})

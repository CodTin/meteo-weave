import { describe, it, expect } from 'vitest'
import {
  validateCoordinate,
  isWithinRegion,
} from '@/features/result-analysis/service/time-series-data'

describe('validateCoordinate', () => {
  it('accepts valid coordinate within bounds', () => {
    const result = validateCoordinate({ latitude: 30.5, longitude: 120.5 })
    expect(result.valid).toBe(true)
    expect(result.coordinate).toEqual({ latitude: 30.5, longitude: 120.5 })
  })

  it('rejects non-numeric latitude', () => {
    const result = validateCoordinate({ latitude: 'abc' as any, longitude: 120 })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('纬度必须是数值')
  })

  it('rejects non-numeric longitude', () => {
    const result = validateCoordinate({ latitude: 30, longitude: 'xyz' as any })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('经度必须是数值')
  })

  it('rejects non-finite latitude', () => {
    const result = validateCoordinate({ latitude: NaN, longitude: 120 })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('纬度必须是有限数值')
  })

  it('rejects non-finite longitude', () => {
    const result = validateCoordinate({ latitude: 30, longitude: Infinity })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('经度必须是有限数值')
  })

  it('rejects latitude above 90', () => {
    const result = validateCoordinate({ latitude: 91, longitude: 120 })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('纬度范围必须在 -90 到 90 之间')
  })

  it('rejects latitude below -90', () => {
    const result = validateCoordinate({ latitude: -91, longitude: 120 })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('纬度范围必须在 -90 到 90 之间')
  })

  it('rejects longitude above 180', () => {
    const result = validateCoordinate({ latitude: 30, longitude: 181 })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('经度范围必须在 -180 到 180 之间')
  })

  it('rejects longitude below -180', () => {
    const result = validateCoordinate({ latitude: 30, longitude: -181 })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('经度范围必须在 -180 到 180 之间')
  })

  it('accepts boundary values', () => {
    expect(validateCoordinate({ latitude: 90, longitude: 180 }).valid).toBe(true)
    expect(validateCoordinate({ latitude: -90, longitude: -180 }).valid).toBe(true)
    expect(validateCoordinate({ latitude: 0, longitude: 0 }).valid).toBe(true)
  })
})

describe('isWithinRegion', () => {
  const region = {
    north: 40,
    south: 30,
    east: 130,
    west: 110,
  }

  it('accepts coordinate within region', () => {
    expect(isWithinRegion({ latitude: 35, longitude: 120 }, region)).toBe(true)
  })

  it('accepts coordinate on boundaries', () => {
    expect(isWithinRegion({ latitude: 40, longitude: 130 }, region)).toBe(true)
    expect(isWithinRegion({ latitude: 30, longitude: 110 }, region)).toBe(true)
  })

  it('rejects coordinate above north boundary', () => {
    expect(isWithinRegion({ latitude: 40.1, longitude: 120 }, region)).toBe(false)
  })

  it('rejects coordinate below south boundary', () => {
    expect(isWithinRegion({ latitude: 29.9, longitude: 120 }, region)).toBe(false)
  })

  it('rejects coordinate beyond east boundary', () => {
    expect(isWithinRegion({ latitude: 35, longitude: 130.1 }, region)).toBe(false)
  })

  it('rejects coordinate before west boundary', () => {
    expect(isWithinRegion({ latitude: 35, longitude: 109.9 }, region)).toBe(false)
  })
})

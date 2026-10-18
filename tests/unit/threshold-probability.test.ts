import { expect, it, describe } from 'vitest'
import { validateThreshold, meetsThreshold } from '@/features/result-analysis/types/threshold'
import { evaluateThresholdProbability } from '@/features/result-analysis/service/threshold-probability'
import type { ThresholdDefinition } from '@/features/result-analysis/types/threshold'
import type { ResultReply, WindValue } from '@/features/downscaling-tasks/service/contracts'

describe('threshold validation', () => {
  it('rejects deterministic results', () => {
    const threshold: ThresholdDefinition = {
      variable: 'temperature',
      quantity: 'T2M',
      value: 25,
      direction: 'greater-than',
      unit: '°C',
      interval: 'instantaneous',
    }

    const result: ResultReply = {
      ok: true,
      taskId: 'test-task',
      layer: 'downscaled',
      displayTimezone: 'UTC',
      temporalStatistic: 'instantaneous',
      variable: 'temperature',
      quantity: 'T2M',
      unit: '°C',
      values: [],
      provenance: {
        label: 'Synthetic Demo',
        description: 'Test',
        dataSource: 'ecmwf',
        generatorVersion: 'v1',
      },
      grid: {
        nominalSpacingKm: 1,
        interpolation: 'bilinear',
        crs: 'EPSG:4326',
        sampling: 'requested-points',
      },
    }

    const validation = validateThreshold(threshold, result)
    expect(validation.valid).toBe(false)
    expect(validation.code).toBe('NOT_PROBABILISTIC')
  })

  it('rejects variable mismatch', () => {
    const threshold: ThresholdDefinition = {
      variable: 'temperature',
      quantity: 'T2M',
      value: 25,
      direction: 'greater-than',
      unit: '°C',
      interval: 'instantaneous',
    }

    const result: ResultReply = {
      ok: true,
      taskId: 'test-task',
      layer: 'downscaled',
      displayTimezone: 'UTC',
      temporalStatistic: 'instantaneous',
      variable: 'pressure',
      quantity: 'MSL',
      unit: 'hPa',
      values: [],
      ensemble: {
        kind: 'members',
        missingPolicy: 'exclude-unavailable-per-location-time',
        allMemberIds: ['member-01', 'member-02'],
        memberIds: ['member-01', 'member-02'],
        unavailable: [],
      },
      provenance: {
        label: 'Synthetic Demo',
        description: 'Test',
        dataSource: 'ecmwf',
        generatorVersion: 'v1',
      },
      grid: {
        nominalSpacingKm: 1,
        interpolation: 'bilinear',
        crs: 'EPSG:4326',
        sampling: 'requested-points',
      },
    }

    const validation = validateThreshold(threshold, result)
    expect(validation.valid).toBe(false)
    expect(validation.code).toBe('VARIABLE_MISMATCH')
  })

  it('rejects unit mismatch', () => {
    const threshold: ThresholdDefinition = {
      variable: 'temperature',
      quantity: 'T2M',
      value: 25,
      direction: 'greater-than',
      unit: 'K',
      interval: 'instantaneous',
    }

    const result: ResultReply = {
      ok: true,
      taskId: 'test-task',
      layer: 'downscaled',
      displayTimezone: 'UTC',
      temporalStatistic: 'instantaneous',
      variable: 'temperature',
      quantity: 'T2M',
      unit: '°C',
      values: [],
      ensemble: {
        kind: 'members',
        missingPolicy: 'exclude-unavailable-per-location-time',
        allMemberIds: ['member-01', 'member-02'],
        memberIds: ['member-01', 'member-02'],
        unavailable: [],
      },
      provenance: {
        label: 'Synthetic Demo',
        description: 'Test',
        dataSource: 'ecmwf',
        generatorVersion: 'v1',
      },
      grid: {
        nominalSpacingKm: 1,
        interpolation: 'bilinear',
        crs: 'EPSG:4326',
        sampling: 'requested-points',
      },
    }

    const validation = validateThreshold(threshold, result)
    expect(validation.valid).toBe(false)
    expect(validation.code).toBe('UNIT_MISMATCH')
  })

  it('rejects instantaneous threshold on daily data', () => {
    const threshold: ThresholdDefinition = {
      variable: 'temperature',
      quantity: 'T2M',
      value: 25,
      direction: 'greater-than',
      unit: '°C',
      interval: 'instantaneous',
    }

    const result: ResultReply = {
      ok: true,
      taskId: 'test-task',
      layer: 'downscaled',
      displayTimezone: 'UTC',
      temporalStatistic: 'daily-mean',
      variable: 'temperature',
      quantity: 'T2M',
      unit: '°C',
      values: [],
      ensemble: {
        kind: 'members',
        missingPolicy: 'exclude-unavailable-per-location-time',
        allMemberIds: ['member-01', 'member-02'],
        memberIds: ['member-01', 'member-02'],
        unavailable: [],
      },
      provenance: {
        label: 'Synthetic Demo',
        description: 'Test',
        dataSource: 'ecmwf',
        generatorVersion: 'v1',
      },
      grid: {
        nominalSpacingKm: 1,
        interpolation: 'bilinear',
        crs: 'EPSG:4326',
        sampling: 'requested-points',
      },
    }

    const validation = validateThreshold(threshold, result)
    expect(validation.valid).toBe(false)
    expect(validation.code).toBe('INTERVAL_MISMATCH')
  })

  it('accepts valid threshold for temperature', () => {
    const threshold: ThresholdDefinition = {
      variable: 'temperature',
      quantity: 'T2M',
      value: 25,
      direction: 'greater-than',
      unit: '°C',
      interval: 'instantaneous',
    }

    const result: ResultReply = {
      ok: true,
      taskId: 'test-task',
      layer: 'downscaled',
      displayTimezone: 'UTC',
      temporalStatistic: 'instantaneous',
      variable: 'temperature',
      quantity: 'T2M',
      unit: '°C',
      values: [],
      ensemble: {
        kind: 'members',
        missingPolicy: 'exclude-unavailable-per-location-time',
        allMemberIds: ['member-01', 'member-02'],
        memberIds: ['member-01', 'member-02'],
        unavailable: [],
      },
      provenance: {
        label: 'Synthetic Demo',
        description: 'Test',
        dataSource: 'ecmwf',
        generatorVersion: 'v1',
      },
      grid: {
        nominalSpacingKm: 1,
        interpolation: 'bilinear',
        crs: 'EPSG:4326',
        sampling: 'requested-points',
      },
    }

    const validation = validateThreshold(threshold, result)
    expect(validation.valid).toBe(true)
    expect(validation.error).toBeUndefined()
  })
})

describe('threshold comparison', () => {
  it('correctly evaluates greater-than with strict inequality', () => {
    const threshold: ThresholdDefinition = {
      variable: 'temperature',
      quantity: 'T2M',
      value: 25,
      direction: 'greater-than',
      unit: '°C',
      interval: 'instantaneous',
    }

    expect(meetsThreshold(26, threshold)).toBe(true)
    expect(meetsThreshold(25, threshold)).toBe(false) // equal does not meet
    expect(meetsThreshold(24, threshold)).toBe(false)
  })

  it('correctly evaluates less-than with strict inequality', () => {
    const threshold: ThresholdDefinition = {
      variable: 'temperature',
      quantity: 'T2M',
      value: 0,
      direction: 'less-than',
      unit: '°C',
      interval: 'instantaneous',
    }

    expect(meetsThreshold(-1, threshold)).toBe(true)
    expect(meetsThreshold(0, threshold)).toBe(false) // equal does not meet
    expect(meetsThreshold(1, threshold)).toBe(false)
  })

  it('handles 0% and 100% probabilities correctly', () => {
    const threshold: ThresholdDefinition = {
      variable: 'temperature',
      quantity: 'T2M',
      value: 30,
      direction: 'greater-than',
      unit: '°C',
      interval: 'instantaneous',
    }

    // All members below threshold
    expect(meetsThreshold(20, threshold)).toBe(false)
    expect(meetsThreshold(25, threshold)).toBe(false)

    // All members above threshold
    expect(meetsThreshold(35, threshold)).toBe(true)
    expect(meetsThreshold(40, threshold)).toBe(true)
  })

  it('rejects non-finite values', () => {
    const threshold: ThresholdDefinition = {
      variable: 'temperature',
      quantity: 'T2M',
      value: 25,
      direction: 'greater-than',
      unit: '°C',
      interval: 'instantaneous',
    }

    expect(meetsThreshold(NaN, threshold)).toBe(false)
    expect(meetsThreshold(Infinity, threshold)).toBe(false)
    expect(meetsThreshold(-Infinity, threshold)).toBe(false)
  })
})

describe('threshold probability evaluation', () => {
  it('calculates empirical probability for temperature', () => {
    const threshold: ThresholdDefinition = {
      variable: 'temperature',
      quantity: 'T2M',
      value: 25,
      direction: 'greater-than',
      unit: '°C',
      interval: 'instantaneous',
    }

    const result: ResultReply = {
      ok: true,
      taskId: 'test-task',
      layer: 'downscaled',
      displayTimezone: 'UTC',
      temporalStatistic: 'instantaneous',
      variable: 'temperature',
      quantity: 'T2M',
      unit: '°C',
      values: [
        {
          longitude: 0,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 26,
          memberId: 'member-01',
        },
        {
          longitude: 0,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 24,
          memberId: 'member-02',
        },
        {
          longitude: 0,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 27,
          memberId: 'member-03',
        },
        {
          longitude: 0,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 23,
          memberId: 'member-04',
        },
      ],
      ensemble: {
        kind: 'members',
        missingPolicy: 'exclude-unavailable-per-location-time',
        allMemberIds: ['member-01', 'member-02', 'member-03', 'member-04', 'member-05'],
        memberIds: ['member-01', 'member-02', 'member-03', 'member-04'],
        unavailable: [
          {
            longitude: 0,
            latitude: 0,
            time: '2024-01-01T00:00:00Z',
            memberId: 'member-05',
            code: 'MISSING_MEMBER',
            error: 'Test unavailable',
          },
        ],
      },
      provenance: {
        label: 'Synthetic Demo',
        description: 'Test',
        dataSource: 'ecmwf',
        generatorVersion: 'v1',
      },
      grid: {
        nominalSpacingKm: 1,
        interpolation: 'bilinear',
        crs: 'EPSG:4326',
        sampling: 'requested-points',
      },
    }

    const probabilities = evaluateThresholdProbability(threshold, result)
    expect(probabilities).toHaveLength(1)
    expect(probabilities[0]).toMatchObject({
      longitude: 0,
      latitude: 0,
      time: '2024-01-01T00:00:00Z',
      exceedingMembers: 2, // member-01 (26) and member-03 (27)
      validMembers: 4,
      probability: 0.5,
      unavailableMemberIds: ['member-05'],
    })
  })

  it('handles 0% probability correctly', () => {
    const threshold: ThresholdDefinition = {
      variable: 'temperature',
      quantity: 'T2M',
      value: 30,
      direction: 'greater-than',
      unit: '°C',
      interval: 'instantaneous',
    }

    const result: ResultReply = {
      ok: true,
      taskId: 'test-task',
      layer: 'downscaled',
      displayTimezone: 'UTC',
      temporalStatistic: 'instantaneous',
      variable: 'temperature',
      quantity: 'T2M',
      unit: '°C',
      values: [
        {
          longitude: 0,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 20,
          memberId: 'member-01',
        },
        {
          longitude: 0,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 25,
          memberId: 'member-02',
        },
      ],
      ensemble: {
        kind: 'members',
        missingPolicy: 'exclude-unavailable-per-location-time',
        allMemberIds: ['member-01', 'member-02'],
        memberIds: ['member-01', 'member-02'],
        unavailable: [],
      },
      provenance: {
        label: 'Synthetic Demo',
        description: 'Test',
        dataSource: 'ecmwf',
        generatorVersion: 'v1',
      },
      grid: {
        nominalSpacingKm: 1,
        interpolation: 'bilinear',
        crs: 'EPSG:4326',
        sampling: 'requested-points',
      },
    }

    const probabilities = evaluateThresholdProbability(threshold, result)
    expect(probabilities[0]).toMatchObject({
      exceedingMembers: 0,
      validMembers: 2,
      probability: 0,
    })
  })

  it('handles 100% probability correctly', () => {
    const threshold: ThresholdDefinition = {
      variable: 'temperature',
      quantity: 'T2M',
      value: 10,
      direction: 'greater-than',
      unit: '°C',
      interval: 'instantaneous',
    }

    const result: ResultReply = {
      ok: true,
      taskId: 'test-task',
      layer: 'downscaled',
      displayTimezone: 'UTC',
      temporalStatistic: 'instantaneous',
      variable: 'temperature',
      quantity: 'T2M',
      unit: '°C',
      values: [
        {
          longitude: 0,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 20,
          memberId: 'member-01',
        },
        {
          longitude: 0,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 25,
          memberId: 'member-02',
        },
      ],
      ensemble: {
        kind: 'members',
        missingPolicy: 'exclude-unavailable-per-location-time',
        allMemberIds: ['member-01', 'member-02'],
        memberIds: ['member-01', 'member-02'],
        unavailable: [],
      },
      provenance: {
        label: 'Synthetic Demo',
        description: 'Test',
        dataSource: 'ecmwf',
        generatorVersion: 'v1',
      },
      grid: {
        nominalSpacingKm: 1,
        interpolation: 'bilinear',
        crs: 'EPSG:4326',
        sampling: 'requested-points',
      },
    }

    const probabilities = evaluateThresholdProbability(threshold, result)
    expect(probabilities[0]).toMatchObject({
      exceedingMembers: 2,
      validMembers: 2,
      probability: 1,
    })
  })

  it('returns null probability when no valid members', () => {
    const threshold: ThresholdDefinition = {
      variable: 'temperature',
      quantity: 'T2M',
      value: 25,
      direction: 'greater-than',
      unit: '°C',
      interval: 'instantaneous',
    }

    const result: ResultReply = {
      ok: true,
      taskId: 'test-task',
      layer: 'downscaled',
      displayTimezone: 'UTC',
      temporalStatistic: 'instantaneous',
      variable: 'temperature',
      quantity: 'T2M',
      unit: '°C',
      values: [],
      ensemble: {
        kind: 'members',
        missingPolicy: 'exclude-unavailable-per-location-time',
        allMemberIds: ['member-01', 'member-02'],
        memberIds: ['member-01', 'member-02'],
        unavailable: [
          {
            longitude: 0,
            latitude: 0,
            time: '2024-01-01T00:00:00Z',
            memberId: 'member-01',
            code: 'MISSING_MEMBER',
            error: 'Test',
          },
          {
            longitude: 0,
            latitude: 0,
            time: '2024-01-01T00:00:00Z',
            memberId: 'member-02',
            code: 'MISSING_MEMBER',
            error: 'Test',
          },
        ],
      },
      provenance: {
        label: 'Synthetic Demo',
        description: 'Test',
        dataSource: 'ecmwf',
        generatorVersion: 'v1',
      },
      grid: {
        nominalSpacingKm: 1,
        interpolation: 'bilinear',
        crs: 'EPSG:4326',
        sampling: 'requested-points',
      },
    }

    const probabilities = evaluateThresholdProbability(threshold, result)
    expect(probabilities[0]).toMatchObject({
      exceedingMembers: 0,
      validMembers: 0,
      probability: null,
      unavailableMemberIds: ['member-01', 'member-02'],
    })
  })

  it('evaluates wind speed thresholds correctly', () => {
    const threshold: ThresholdDefinition = {
      variable: 'wind',
      quantity: 'U10/V10-speed',
      value: 10,
      direction: 'greater-than',
      unit: 'm/s',
      interval: 'instantaneous',
    }

    const result: ResultReply = {
      ok: true,
      taskId: 'test-task',
      layer: 'downscaled',
      displayTimezone: 'UTC',
      temporalStatistic: 'instantaneous',
      variable: 'wind',
      quantity: 'U10/V10',
      unit: 'm/s',
      directionUnit: 'degrees',
      directionConvention: 'meteorological-from',
      values: [
        {
          longitude: 0,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 12,
          u10: 8,
          v10: 8,
          speed: 12,
          fromDirection: 180,
          directionStatus: 'available',
          memberId: 'member-01',
        },
        {
          longitude: 0,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 8,
          u10: 6,
          v10: 6,
          speed: 8,
          fromDirection: 180,
          directionStatus: 'available',
          memberId: 'member-02',
        },
      ] as WindValue[],
      ensemble: {
        kind: 'members',
        missingPolicy: 'exclude-unavailable-per-location-time',
        allMemberIds: ['member-01', 'member-02'],
        memberIds: ['member-01', 'member-02'],
        unavailable: [],
      },
      provenance: {
        label: 'Synthetic Demo',
        description: 'Test',
        dataSource: 'ecmwf',
        generatorVersion: 'v1',
      },
      grid: {
        nominalSpacingKm: 1,
        interpolation: 'bilinear',
        crs: 'EPSG:4326',
        sampling: 'requested-points',
      },
    }

    const probabilities = evaluateThresholdProbability(threshold, result)
    expect(probabilities[0]).toMatchObject({
      exceedingMembers: 1, // only member-01 with speed 12
      validMembers: 2,
      probability: 0.5,
    })
  })
})

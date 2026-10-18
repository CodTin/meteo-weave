import { expect, it, describe } from 'vitest'
import { evaluateThresholdProbability } from '@/features/result-analysis/service/threshold-probability'
import type { ThresholdDefinition } from '@/features/result-analysis/types/threshold'
import type { ResultReply } from '@/features/downscaling-tasks/service/contracts'

describe('precipitation accumulation threshold probability', () => {
  it('calculates probability from complete accumulation intervals', () => {
    const threshold: ThresholdDefinition = {
      variable: 'precipitation',
      quantity: 'TP',
      value: 50,
      direction: 'greater-than',
      unit: 'mm',
      interval: 'accumulation',
    }

    const result: ResultReply = {
      ok: true,
      taskId: 'test-task',
      layer: 'downscaled',
      displayTimezone: 'UTC',
      temporalStatistic: 'accumulation',
      variable: 'precipitation',
      quantity: 'TP',
      unit: 'mm',
      values: [
        {
          longitude: 0,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 60,
          memberId: 'member-01',
          accumulation: {
            start: '2024-01-01T00:00:00Z',
            end: '2024-01-02T00:00:00Z',
            requestedStart: '2024-01-01T00:00:00Z',
            requestedEnd: '2024-01-02T00:00:00Z',
            bounds: '[start,end)',
            sampledHours: 24,
            expectedHours: 24,
            complete: true,
          },
        },
        {
          longitude: 0,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 45,
          memberId: 'member-02',
          accumulation: {
            start: '2024-01-01T00:00:00Z',
            end: '2024-01-02T00:00:00Z',
            requestedStart: '2024-01-01T00:00:00Z',
            requestedEnd: '2024-01-02T00:00:00Z',
            bounds: '[start,end)',
            sampledHours: 24,
            expectedHours: 24,
            complete: true,
          },
        },
        {
          longitude: 0,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 55,
          memberId: 'member-03',
          accumulation: {
            start: '2024-01-01T00:00:00Z',
            end: '2024-01-02T00:00:00Z',
            requestedStart: '2024-01-01T00:00:00Z',
            requestedEnd: '2024-01-02T00:00:00Z',
            bounds: '[start,end)',
            sampledHours: 24,
            expectedHours: 24,
            complete: true,
          },
        },
      ],
      ensemble: {
        kind: 'members',
        missingPolicy: 'exclude-unavailable-per-location-time',
        allMemberIds: ['member-01', 'member-02', 'member-03'],
        memberIds: ['member-01', 'member-02', 'member-03'],
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
    expect(probabilities).toHaveLength(1)
    expect(probabilities[0]).toMatchObject({
      longitude: 0,
      latitude: 0,
      time: '2024-01-01T00:00:00Z',
      exceedingMembers: 2, // member-01 (60) and member-03 (55)
      validMembers: 3,
      probability: 2 / 3,
      unavailableMemberIds: [],
    })
  })

  it('excludes members with incomplete accumulation intervals', () => {
    const threshold: ThresholdDefinition = {
      variable: 'precipitation',
      quantity: 'TP',
      value: 50,
      direction: 'greater-than',
      unit: 'mm',
      interval: 'accumulation',
    }

    const result: ResultReply = {
      ok: true,
      taskId: 'test-task',
      layer: 'downscaled',
      displayTimezone: 'UTC',
      temporalStatistic: 'accumulation',
      variable: 'precipitation',
      quantity: 'TP',
      unit: 'mm',
      values: [
        {
          longitude: 0,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 60,
          memberId: 'member-01',
          accumulation: {
            start: '2024-01-01T00:00:00Z',
            end: '2024-01-02T00:00:00Z',
            requestedStart: '2024-01-01T00:00:00Z',
            requestedEnd: '2024-01-02T00:00:00Z',
            bounds: '[start,end)',
            sampledHours: 24,
            expectedHours: 24,
            complete: true,
          },
        },
        {
          longitude: 0,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 40,
          memberId: 'member-02',
          accumulation: {
            start: '2024-01-01T00:00:00Z',
            end: '2024-01-01T23:00:00Z',
            requestedStart: '2024-01-01T00:00:00Z',
            requestedEnd: '2024-01-02T00:00:00Z',
            bounds: '[start,end)',
            sampledHours: 23,
            expectedHours: 24,
            complete: false,
          },
        },
        {
          longitude: 0,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 55,
          memberId: 'member-03',
          accumulation: {
            start: '2024-01-01T00:00:00Z',
            end: '2024-01-02T00:00:00Z',
            requestedStart: '2024-01-01T00:00:00Z',
            requestedEnd: '2024-01-02T00:00:00Z',
            bounds: '[start,end)',
            sampledHours: 24,
            expectedHours: 24,
            complete: true,
          },
        },
      ],
      ensemble: {
        kind: 'members',
        missingPolicy: 'exclude-unavailable-per-location-time',
        allMemberIds: ['member-01', 'member-02', 'member-03'],
        memberIds: ['member-01', 'member-02', 'member-03'],
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
    expect(probabilities).toHaveLength(1)
    expect(probabilities[0]).toMatchObject({
      exceedingMembers: 2,
      validMembers: 2, // member-02 excluded due to incomplete accumulation
      probability: 1, // 2 out of 2 valid members exceed threshold
      incompleteMemberIds: ['member-02'],
    })
  })

  it('handles zero precipitation correctly', () => {
    const threshold: ThresholdDefinition = {
      variable: 'precipitation',
      quantity: 'TP',
      value: 10,
      direction: 'greater-than',
      unit: 'mm',
      interval: 'accumulation',
    }

    const result: ResultReply = {
      ok: true,
      taskId: 'test-task',
      layer: 'downscaled',
      displayTimezone: 'UTC',
      temporalStatistic: 'accumulation',
      variable: 'precipitation',
      quantity: 'TP',
      unit: 'mm',
      values: [
        {
          longitude: 0,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 0,
          memberId: 'member-01',
          accumulation: {
            start: '2024-01-01T00:00:00Z',
            end: '2024-01-02T00:00:00Z',
            requestedStart: '2024-01-01T00:00:00Z',
            requestedEnd: '2024-01-02T00:00:00Z',
            bounds: '[start,end)',
            sampledHours: 24,
            expectedHours: 24,
            complete: true,
          },
        },
        {
          longitude: 0,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 15,
          memberId: 'member-02',
          accumulation: {
            start: '2024-01-01T00:00:00Z',
            end: '2024-01-02T00:00:00Z',
            requestedStart: '2024-01-01T00:00:00Z',
            requestedEnd: '2024-01-02T00:00:00Z',
            bounds: '[start,end)',
            sampledHours: 24,
            expectedHours: 24,
            complete: true,
          },
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
      exceedingMembers: 1,
      validMembers: 2,
      probability: 0.5,
    })
  })

  it('returns null probability when no members have complete intervals', () => {
    const threshold: ThresholdDefinition = {
      variable: 'precipitation',
      quantity: 'TP',
      value: 50,
      direction: 'greater-than',
      unit: 'mm',
      interval: 'accumulation',
    }

    const result: ResultReply = {
      ok: true,
      taskId: 'test-task',
      layer: 'downscaled',
      displayTimezone: 'UTC',
      temporalStatistic: 'accumulation',
      variable: 'precipitation',
      quantity: 'TP',
      unit: 'mm',
      values: [
        {
          longitude: 0,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 60,
          memberId: 'member-01',
          accumulation: {
            start: '2024-01-01T00:00:00Z',
            end: '2024-01-01T23:00:00Z',
            requestedStart: '2024-01-01T00:00:00Z',
            requestedEnd: '2024-01-02T00:00:00Z',
            bounds: '[start,end)',
            sampledHours: 23,
            expectedHours: 24,
            complete: false,
          },
        },
        {
          longitude: 0,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 55,
          memberId: 'member-02',
          accumulation: {
            start: '2024-01-01T01:00:00Z',
            end: '2024-01-02T00:00:00Z',
            requestedStart: '2024-01-01T00:00:00Z',
            requestedEnd: '2024-01-02T00:00:00Z',
            bounds: '[start,end)',
            sampledHours: 23,
            expectedHours: 24,
            complete: false,
          },
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
      validMembers: 0,
      probability: null,
      incompleteMemberIds: ['member-01', 'member-02'],
    })
  })

  it('validates accumulation interval consistency across members', () => {
    const threshold: ThresholdDefinition = {
      variable: 'precipitation',
      quantity: 'TP',
      value: 50,
      direction: 'greater-than',
      unit: 'mm',
      interval: 'accumulation',
    }

    // Members with different requested intervals should not be compared
    const result: ResultReply = {
      ok: true,
      taskId: 'test-task',
      layer: 'downscaled',
      displayTimezone: 'UTC',
      temporalStatistic: 'accumulation',
      variable: 'precipitation',
      quantity: 'TP',
      unit: 'mm',
      values: [
        {
          longitude: 0,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 60,
          memberId: 'member-01',
          accumulation: {
            start: '2024-01-01T00:00:00Z',
            end: '2024-01-02T00:00:00Z',
            requestedStart: '2024-01-01T00:00:00Z',
            requestedEnd: '2024-01-02T00:00:00Z',
            bounds: '[start,end)',
            sampledHours: 24,
            expectedHours: 24,
            complete: true,
          },
        },
        {
          longitude: 0,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 30,
          memberId: 'member-02',
          accumulation: {
            start: '2024-01-01T00:00:00Z',
            end: '2024-01-01T12:00:00Z',
            requestedStart: '2024-01-01T00:00:00Z',
            requestedEnd: '2024-01-01T12:00:00Z',
            bounds: '[start,end)',
            sampledHours: 12,
            expectedHours: 12,
            complete: true,
          },
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
      exceedingMembers: 1,
      validMembers: 1, // only member-01 with matching interval
      probability: 1,
      mismatchedIntervalMemberIds: ['member-02'],
    })
  })
})

import { expect, it, describe } from 'vitest'
import { evaluateImpactArea } from '@/features/result-analysis/service/threshold-probability'
import type { ThresholdDefinition } from '@/features/result-analysis/types/threshold'
import type { ResultReply } from '@/features/downscaling-tasks/service/contracts'

describe('impact area calculation', () => {
  it('calculates grid point proportions per member', () => {
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
        // Member 01: 3 out of 4 points exceed threshold
        {
          longitude: 0,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 26,
          memberId: 'member-01',
        },
        {
          longitude: 1,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 27,
          memberId: 'member-01',
        },
        {
          longitude: 0,
          latitude: 1,
          time: '2024-01-01T00:00:00Z',
          value: 24,
          memberId: 'member-01',
        },
        {
          longitude: 1,
          latitude: 1,
          time: '2024-01-01T00:00:00Z',
          value: 28,
          memberId: 'member-01',
        },
        // Member 02: 1 out of 4 points exceed threshold
        {
          longitude: 0,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 23,
          memberId: 'member-02',
        },
        {
          longitude: 1,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 26,
          memberId: 'member-02',
        },
        {
          longitude: 0,
          latitude: 1,
          time: '2024-01-01T00:00:00Z',
          value: 22,
          memberId: 'member-02',
        },
        {
          longitude: 1,
          latitude: 1,
          time: '2024-01-01T00:00:00Z',
          value: 24,
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
        sampling: 'logical-grid',
        coordinateOrder: 'longitude-latitude',
        order: 'time-row-column',
        logicalGrid: {
          origin: { longitude: 0, latitude: 0 },
          spacingDegrees: { longitude: 1, latitude: 1 },
          dimensions: { columns: 2, rows: 2 },
          extent: { west: 0, south: 0, east: 1, north: 1 },
          edgePolicy: 'clipped-last-cell',
        },
        window: { firstColumn: 0, lastColumn: 1, firstRow: 0, lastRow: 1 },
        stride: { columns: 1, rows: 1 },
        sampled: { columns: 2, rows: 2 },
        availablePoints: 4,
        returnedPoints: 4,
      },
    }

    const impactArea = evaluateImpactArea(threshold, result, false)
    expect(impactArea).not.toBeNull()
    expect(impactArea!.members).toHaveLength(2)

    const member01 = impactArea!.members.find((m) => m.memberId === 'member-01')
    expect(member01).toMatchObject({
      memberId: 'member-01',
      exceedingPoints: 3,
      validPoints: 4,
      proportion: 0.75,
    })

    const member02 = impactArea!.members.find((m) => m.memberId === 'member-02')
    expect(member02).toMatchObject({
      memberId: 'member-02',
      exceedingPoints: 1,
      validPoints: 4,
      proportion: 0.25,
    })

    expect(impactArea!.meanProportion).toBe(0.5)
    expect(impactArea!.minProportion).toBe(0.25)
    expect(impactArea!.maxProportion).toBe(0.75)
    expect(impactArea!.validMembers).toBe(2)
    expect(impactArea!.totalGridPoints).toBe(4)
  })

  it('returns null for point-based queries', () => {
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
      ],
      ensemble: {
        kind: 'members',
        missingPolicy: 'exclude-unavailable-per-location-time',
        allMemberIds: ['member-01'],
        memberIds: ['member-01'],
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

    const impactArea = evaluateImpactArea(threshold, result, false)
    expect(impactArea).toBeNull()
  })

  it('handles missing members correctly in impact area', () => {
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
        // Only member-01 has values
        {
          longitude: 0,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 26,
          memberId: 'member-01',
        },
        {
          longitude: 1,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 27,
          memberId: 'member-01',
        },
      ],
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
            memberId: 'member-02',
            code: 'MISSING_MEMBER',
            error: 'Test',
          },
          {
            longitude: 1,
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
        sampling: 'logical-grid',
        coordinateOrder: 'longitude-latitude',
        order: 'time-row-column',
        logicalGrid: {
          origin: { longitude: 0, latitude: 0 },
          spacingDegrees: { longitude: 1, latitude: 1 },
          dimensions: { columns: 2, rows: 1 },
          extent: { west: 0, south: 0, east: 1, north: 0 },
          edgePolicy: 'clipped-last-cell',
        },
        window: { firstColumn: 0, lastColumn: 1, firstRow: 0, lastRow: 0 },
        stride: { columns: 1, rows: 1 },
        sampled: { columns: 2, rows: 1 },
        availablePoints: 2,
        returnedPoints: 2,
      },
    }

    const impactArea = evaluateImpactArea(threshold, result, false)
    expect(impactArea).not.toBeNull()
    expect(impactArea!.members).toHaveLength(1)
    expect(impactArea!.validMembers).toBe(1)
  })

  it('includes preview notice in coverage note', () => {
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
      ],
      ensemble: {
        kind: 'members',
        missingPolicy: 'exclude-unavailable-per-location-time',
        allMemberIds: ['member-01'],
        memberIds: ['member-01'],
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
        sampling: 'decimated-grid',
        coordinateOrder: 'longitude-latitude',
        order: 'time-row-column',
        logicalGrid: {
          origin: { longitude: 0, latitude: 0 },
          spacingDegrees: { longitude: 1, latitude: 1 },
          dimensions: { columns: 1, rows: 1 },
          extent: { west: 0, south: 0, east: 0, north: 0 },
          edgePolicy: 'clipped-last-cell',
        },
        window: { firstColumn: 0, lastColumn: 0, firstRow: 0, lastRow: 0 },
        stride: { columns: 1, rows: 1 },
        sampled: { columns: 1, rows: 1 },
        availablePoints: 1,
        returnedPoints: 1,
      },
    }

    const impactArea = evaluateImpactArea(threshold, result, true)
    expect(impactArea).not.toBeNull()
    expect(impactArea!.coverageNote).toContain('预览采样网格')
    expect(impactArea!.coverageNote).toContain('不代表全域精细覆盖')
  })

  it('handles 0% and 100% impact correctly', () => {
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
        // Member 01: 0% impact (all below threshold)
        {
          longitude: 0,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 20,
          memberId: 'member-01',
        },
        {
          longitude: 1,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 25,
          memberId: 'member-01',
        },
        // Member 02: 100% impact (all above threshold)
        {
          longitude: 0,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 35,
          memberId: 'member-02',
        },
        {
          longitude: 1,
          latitude: 0,
          time: '2024-01-01T00:00:00Z',
          value: 40,
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
        sampling: 'logical-grid',
        coordinateOrder: 'longitude-latitude',
        order: 'time-row-column',
        logicalGrid: {
          origin: { longitude: 0, latitude: 0 },
          spacingDegrees: { longitude: 1, latitude: 1 },
          dimensions: { columns: 2, rows: 1 },
          extent: { west: 0, south: 0, east: 1, north: 0 },
          edgePolicy: 'clipped-last-cell',
        },
        window: { firstColumn: 0, lastColumn: 1, firstRow: 0, lastRow: 0 },
        stride: { columns: 1, rows: 1 },
        sampled: { columns: 2, rows: 1 },
        availablePoints: 2,
        returnedPoints: 2,
      },
    }

    const impactArea = evaluateImpactArea(threshold, result, false)
    expect(impactArea).not.toBeNull()

    const member01 = impactArea!.members.find((m) => m.memberId === 'member-01')
    expect(member01!.proportion).toBe(0)

    const member02 = impactArea!.members.find((m) => m.memberId === 'member-02')
    expect(member02!.proportion).toBe(1)

    expect(impactArea!.minProportion).toBe(0)
    expect(impactArea!.maxProportion).toBe(1)
  })
})

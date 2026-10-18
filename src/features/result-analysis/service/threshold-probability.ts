/**
 * Threshold probability evaluation for ensemble forecasts.
 * Calculates empirical threshold-exceedance probabilities and impact areas.
 */

import type {
  ThresholdDefinition,
  ThresholdProbability,
  MemberImpactArea,
  ImpactAreaSummary,
} from '../types/threshold'
import type {
  ResultReply,
  WindValue,
  ResultValue,
} from '@/features/downscaling-tasks/service/contracts'
import { meetsThreshold } from '../types/threshold'

/**
 * Extract the comparable value from a result value based on the threshold quantity.
 */
function extractComparableValue(
  value: ResultValue | WindValue,
  threshold: ThresholdDefinition,
): number {
  if (threshold.variable === 'wind' && threshold.quantity === 'U10/V10-speed') {
    return (value as WindValue).speed
  }
  return value.value
}

/**
 * Evaluate threshold probability at each point/time in the result.
 */
export function evaluateThresholdProbability(
  threshold: ThresholdDefinition,
  result: ResultReply,
): ThresholdProbability[] {
  if (!result.ok || !result.ensemble || result.ensemble.kind !== 'members') {
    return []
  }

  // Group values by location and time
  const groups = new Map<string, ResultValue[]>()
  for (const value of result.values) {
    if (!value.memberId) continue
    const key = `${value.longitude},${value.latitude},${value.time}`
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(value)
  }

  // Also track all location/time combinations from unavailable members
  const allLocationTimes = new Set<string>()
  for (const unavailable of result.ensemble.unavailable) {
    const key = `${unavailable.longitude},${unavailable.latitude},${unavailable.time}`
    allLocationTimes.add(key)
  }
  for (const key of groups.keys()) {
    allLocationTimes.add(key)
  }

  // Evaluate probability for each location/time
  const probabilities: ThresholdProbability[] = []
  for (const key of allLocationTimes) {
    const [longitudeStr, latitudeStr, time] = key.split(',')
    if (!longitudeStr || !latitudeStr || !time) continue

    const locationTime = {
      longitude: parseFloat(longitudeStr),
      latitude: parseFloat(latitudeStr),
      time,
    }

    const values = groups.get(key) || []

    // Find unavailable members at this location/time
    const unavailableMemberIds = result.ensemble.unavailable
      .filter(
        (u) =>
          u.longitude === locationTime.longitude &&
          u.latitude === locationTime.latitude &&
          u.time === locationTime.time,
      )
      .map((u) => u.memberId)

    // For precipitation accumulation, filter members based on interval completeness
    let validValues = values
    const incompleteMemberIds: string[] = []
    const mismatchedIntervalMemberIds: string[] = []

    if (
      threshold.variable === 'precipitation' &&
      threshold.interval === 'accumulation' &&
      result.variable === 'precipitation'
    ) {
      // Type narrowing: precipitation results have accumulation property
      type PrecipValue = ResultValue & {
        accumulation: {
          start: string
          end: string
          requestedStart: string
          requestedEnd: string
          bounds: '[start,end)'
          sampledHours: number
          expectedHours: number
          complete: boolean
        }
      }

      // Find the canonical requested interval from complete members
      let canonicalInterval: { requestedStart: string; requestedEnd: string } | null = null
      for (const value of values) {
        if ('accumulation' in value && value.accumulation) {
          const precipValue = value as PrecipValue
          const acc = precipValue.accumulation
          if (acc.complete) {
            canonicalInterval = {
              requestedStart: acc.requestedStart,
              requestedEnd: acc.requestedEnd,
            }
            break
          }
        }
      }

      validValues = values.filter((value) => {
        if (!('accumulation' in value) || !value.accumulation) {
          return false
        }

        const precipValue = value as PrecipValue
        const acc = precipValue.accumulation

        // Exclude incomplete intervals
        if (!acc.complete) {
          if (value.memberId) incompleteMemberIds.push(value.memberId)
          return false
        }

        // Exclude mismatched intervals
        if (
          canonicalInterval &&
          (acc.requestedStart !== canonicalInterval.requestedStart ||
            acc.requestedEnd !== canonicalInterval.requestedEnd)
        ) {
          if (value.memberId) mismatchedIntervalMemberIds.push(value.memberId)
          return false
        }

        return true
      })
    }

    // Count members meeting threshold
    let exceedingMembers = 0
    for (const value of validValues) {
      const comparableValue = extractComparableValue(value, threshold)
      if (meetsThreshold(comparableValue, threshold)) {
        exceedingMembers++
      }
    }

    const validMembers = validValues.length
    const probability = validMembers > 0 ? exceedingMembers / validMembers : null

    const prob: ThresholdProbability = {
      ...locationTime,
      exceedingMembers,
      validMembers,
      probability,
      unavailableMemberIds,
    }

    if (incompleteMemberIds.length > 0) {
      prob.incompleteMemberIds = incompleteMemberIds
    }
    if (mismatchedIntervalMemberIds.length > 0) {
      prob.mismatchedIntervalMemberIds = mismatchedIntervalMemberIds
    }

    probabilities.push(prob)
  }

  return probabilities
}

/**
 * Calculate impact area (grid point proportion) for each member.
 * This represents the fraction of grid points where the meteorological condition is met.
 */
export function evaluateImpactArea(
  threshold: ThresholdDefinition,
  result: ResultReply,
  isPreview: boolean,
): ImpactAreaSummary | null {
  if (!result.ok || !result.ensemble || result.ensemble.kind !== 'members') {
    return null
  }

  // Only calculate impact area for grid-based queries
  if (result.grid.sampling === 'requested-points') {
    return null
  }

  // Group values by member and time
  const memberGroups = new Map<string, Map<string, ResultValue[]>>()
  for (const value of result.values) {
    if (!value.memberId) continue

    if (!memberGroups.has(value.memberId)) {
      memberGroups.set(value.memberId, new Map())
    }
    const timeGroups = memberGroups.get(value.memberId)!

    if (!timeGroups.has(value.time)) {
      timeGroups.set(value.time, [])
    }
    timeGroups.get(value.time)!.push(value)
  }

  // Calculate impact area for each member (averaged across times)
  const memberImpacts: MemberImpactArea[] = []
  for (const [memberId, timeGroups] of memberGroups) {
    let totalExceeding = 0
    let totalValid = 0

    for (const values of timeGroups.values()) {
      for (const value of values) {
        const comparableValue = extractComparableValue(value, threshold)
        if (Number.isFinite(comparableValue)) {
          totalValid++
          if (meetsThreshold(comparableValue, threshold)) {
            totalExceeding++
          }
        }
      }
    }

    if (totalValid > 0) {
      memberImpacts.push({
        memberId,
        exceedingPoints: totalExceeding,
        validPoints: totalValid,
        proportion: totalExceeding / totalValid,
      })
    }
  }

  if (memberImpacts.length === 0) {
    return null
  }

  // Calculate ensemble statistics
  const proportions = memberImpacts.map((m) => m.proportion)
  const meanProportion = proportions.reduce((sum, p) => sum + p, 0) / proportions.length
  const minProportion = Math.min(...proportions)
  const maxProportion = Math.max(...proportions)

  // Get grid information
  const totalGridPoints =
    result.grid.sampling === 'logical-grid' || result.grid.sampling === 'decimated-grid'
      ? result.grid.returnedPoints
      : 0

  const coverageNote = isPreview
    ? '基于预览采样网格，不代表全域精细覆盖。格点比例为采样网格中满足气象条件的比例，不直接等同真实面积、人口暴露或经济损失。'
    : '基于任务定义的逻辑网格。格点比例为网格中满足气象条件的比例，不直接等同真实面积、人口暴露或经济损失。'

  return {
    members: memberImpacts,
    meanProportion,
    minProportion,
    maxProportion,
    validMembers: memberImpacts.length,
    totalGridPoints,
    coverageNote,
  }
}

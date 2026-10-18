/**
 * CRPS (Continuous Ranked Probability Score) calculation for ensemble forecasts.
 *
 * Uses empirical ECDF definition:
 * CRPS = (1/K) * Σ|member_i - observation| - (1/(2K²)) * Σ Σ|member_i - member_j|
 *
 * Where K is the number of valid ensemble members at each station-time sample.
 */

export type CRPSMetrics = {
  crps: number
  n: number
  averageMembers: number
}

export type CRPSResult =
  | { available: true; metrics: CRPSMetrics }
  | { available: false; reason: string }

/**
 * Calculate CRPS for a single station-time sample with ensemble members.
 *
 * @param members Array of valid ensemble member values (K members)
 * @param observation The observation value
 * @returns CRPS score for this sample, or NaN if invalid
 */
function calculateSampleCRPS(members: number[], observation: number): number {
  if (members.length === 0) return NaN
  if (!Number.isFinite(observation)) return NaN
  if (!members.every(Number.isFinite)) return NaN

  const K = members.length

  // First term: mean absolute error of members vs observation
  let sumAbsError = 0
  for (let i = 0; i < K; i++) {
    sumAbsError += Math.abs(members[i]! - observation)
  }
  const meanAbsError = sumAbsError / K

  // Second term: half of mean absolute difference between all member pairs
  let sumMemberDiff = 0
  for (let i = 0; i < K; i++) {
    for (let j = 0; j < K; j++) {
      sumMemberDiff += Math.abs(members[i]! - members[j]!)
    }
  }
  const meanMemberDiff = sumMemberDiff / (2 * K * K)

  return meanAbsError - meanMemberDiff
}

/**
 * Calculate ensemble CRPS from station-time samples.
 *
 * Each sample must have:
 * - stationId: unique station identifier
 * - time: ISO timestamp
 * - observed: observation value
 * - members: array of valid ensemble member values
 *
 * Samples are deduplicated by (stationId, time) to ensure independent observations.
 * CRPS is aggregated across all valid samples with equal weight per sample.
 */
export function calculateEnsembleCRPS(
  samples: Array<{
    stationId: string
    time: string
    observed: number
    members: number[]
  }>,
): CRPSResult {
  if (samples.length === 0) {
    return { available: false, reason: 'No samples provided' }
  }

  // Deduplicate by (stationId, time) - keep first occurrence
  const uniqueKey = (s: { stationId: string; time: string }) => `${s.stationId}:${s.time}`
  const seen = new Set<string>()
  const dedupedSamples = samples.filter((s) => {
    const key = uniqueKey(s)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Calculate CRPS for each valid sample
  const validScores: Array<{ crps: number; memberCount: number }> = []

  for (const sample of dedupedSamples) {
    // Skip samples with no members or invalid observation
    if (sample.members.length === 0) continue
    if (!Number.isFinite(sample.observed)) continue

    const sampleCRPS = calculateSampleCRPS(sample.members, sample.observed)
    if (Number.isFinite(sampleCRPS)) {
      validScores.push({ crps: sampleCRPS, memberCount: sample.members.length })
    }
  }

  if (validScores.length === 0) {
    return { available: false, reason: 'No valid samples for CRPS calculation' }
  }

  // Aggregate CRPS: equal weight per station-time sample
  const totalCRPS = validScores.reduce((sum, score) => sum + score.crps, 0)
  const averageCRPS = totalCRPS / validScores.length

  // Calculate average member count across valid samples
  const totalMembers = validScores.reduce((sum, score) => sum + score.memberCount, 0)
  const averageMembers = totalMembers / validScores.length

  return {
    available: true,
    metrics: {
      crps: averageCRPS,
      n: validScores.length,
      averageMembers,
    },
  }
}

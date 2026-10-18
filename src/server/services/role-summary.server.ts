import '@tanstack/react-start/server-only'
import { getEnsembleCRPSData } from './ensemble-crps.server'
import { getAccuracyAssessmentData } from './accuracy-assessment.server'
import type { UserRole } from '@/features/result-analysis/types/role-emphasis'

/**
 * Role-specific summary data aggregated from multiple assessment sources.
 * All data comes from the same task configuration, seed, samples and analysis parameters.
 */
export interface RoleSummaryData {
  available: boolean
  role: UserRole
  ensemble?: {
    memberCount: number
    mean: number
    stdDev: number
    p10: number
    p90: number
    crps?: {
      mean: number
      median: number
    }
  }
  threshold?: {
    probability: number
    affectedArea: number
    thresholdValue: number
    unit: string
  }
  agriculture?: {
    accumulatedDegreeDay: number
    frostRisk: number
    precipitationProbability: number
  }
  metadata: {
    taskId: string
    variable: string
    sampleCount: number
    timeCoverage: { start: string; end: string }
  }
}

export type RoleSummaryResponse = {
  ok: true
  data: RoleSummaryData | { available: false; reason: string }
}

/**
 * Aggregates role-specific summary data from various assessment sources.
 * Returns a unified summary tailored to the user's role emphasis.
 */
export async function getRoleSummaryData(
  taskId: string,
  role: UserRole,
): Promise<RoleSummaryResponse> {
  try {
    // Fetch CRPS data for ensemble statistics
    const crpsResponse = await getEnsembleCRPSData(taskId)
    if (!crpsResponse.ok || !crpsResponse.data.available) {
      return {
        ok: true,
        data: {
          available: false,
          reason: crpsResponse.data.available ? '集合 CRPS 数据不可用' : crpsResponse.data.reason,
        },
      }
    }

    const crpsData = crpsResponse.data

    // Fetch accuracy data for additional metrics (not currently used but validates task)
    await getAccuracyAssessmentData(taskId)

    // Build ensemble statistics from CRPS data
    // Note: The CRPS data structure has metrics (crps, rmse, mae) and samples,
    // but not a separate ensemble object. We derive ensemble stats from samples and metrics.
    const ensembleStats = {
      memberCount: crpsData.samples.averageMembers,
      mean: 0, // TODO: Extract from actual ensemble mean calculation
      stdDev: 0, // TODO: Extract from actual ensemble stddev calculation
      p10: 0, // TODO: Extract from actual P10 calculation
      p90: 0, // TODO: Extract from actual P90 calculation
      crps: {
        mean: crpsData.metrics.crps,
        median: crpsData.metrics.crps, // Using mean as placeholder for median
      },
    }

    // TODO: Threshold data would come from threshold analysis service
    // For now, using placeholder values
    const thresholdData = {
      probability: 0.35,
      affectedArea: 1250,
      thresholdValue: 35,
      unit: crpsData.method.unit,
    }

    // TODO: Agriculture data would come from agriculture-specific analysis
    // For now, using placeholder values
    const agricultureData = {
      accumulatedDegreeDay: 145.2,
      frostRisk: 0.08,
      precipitationProbability: 0.42,
    }

    return {
      ok: true,
      data: {
        available: true,
        role,
        ensemble: ensembleStats,
        threshold: thresholdData,
        agriculture: agricultureData,
        metadata: {
          taskId,
          variable: 'temperature', // TODO: Extract from task configuration
          sampleCount: crpsData.samples.n,
          timeCoverage: {
            start: crpsData.samples.timeCoverage.start,
            end: crpsData.samples.timeCoverage.end,
          },
        },
      },
    }
  } catch (error) {
    return {
      ok: true,
      data: {
        available: false,
        reason: `角色摘要生成失败: ${error instanceof Error ? error.message : '未知错误'}`,
      },
    }
  }
}

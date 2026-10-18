import '@tanstack/react-start/server-only'
import { calculateEnsembleCRPS } from '@/features/result-analysis/service/ensemble-crps'
import { getVariableUnit } from '@/features/result-analysis/service/variable-accuracy'
import {
  initializeAndValidateTask,
  wrapValidationFailure,
  wrapSampleQueryFailure,
  extractComparableValue,
  extractStationMetadata,
  buildAssessmentSamplingInfo,
  wrapAssessmentError,
  prepareAssessmentSamples,
  type AlignedSamples,
  type StationMetadata,
} from '@/server/services/shared/assessment-service-helpers'
import type { ResultValue } from '@/features/downscaling-tasks/service/contracts'

type EnsembleCRPSData =
  | {
      available: true
      metrics: {
        crps: number
        rmse: number
        mae: number
      }
      samples: {
        n: number
        stationCount: number
        timeCoverage: { start: string; end: string; actualTimes: number }
        averageMembers: number
      }
      stations: StationMetadata[]
      sampling: {
        budget: { maxPoints: number; maxTimes: number }
        actual: { points: number; times: number }
        plan: string
      }
      method: {
        matching: string
        unit: string
        dataSource: 'Synthetic Demo'
        crpsDefinition: string
      }
    }
  | {
      available: false
      reason: string
    }

type EnsembleCRPSResponse = {
  ok: true
  data: EnsembleCRPSData
}

/**
 * Query ensemble member data at observation stations
 */
async function queryEnsembleMembers(
  service: ReturnType<typeof import('@/features/downscaling-tasks/service').createTaskService>,
  taskId: string,
  region: { west: number; south: number; east: number; north: number },
  times: string[],
  maxPoints: number,
  allMemberIds: string[],
  _variable: string,
): Promise<{ ok: true; memberData: Map<string, ResultValue[]> } | { ok: false; reason: string }> {
  const memberData = new Map<string, ResultValue[]>()

  for (const memberId of allMemberIds) {
    const memberResult = await service.result(taskId, {
      layer: 'downscaled',
      kind: 'preview',
      window: region,
      times,
      maxPoints,
      ensemble: { kind: 'members', memberIds: [memberId] },
    })

    if (!memberResult.ok) {
      return { ok: false, reason: `无法获取集合成员 ${memberId} 数据` }
    }

    // Filter to only observations with station data
    const stationValues = memberResult.values.filter(
      (v): v is ResultValue & { observation: NonNullable<ResultValue['observation']> } =>
        Boolean(v.observation && v.observation.mode === 'stations'),
    )

    memberData.set(memberId, stationValues)
  }

  return { ok: true, memberData }
}

/**
 * Aligns ensemble member samples with observations by (stationId, time)
 */
function alignEnsembleWithObservations(
  memberData: Map<string, ResultValue[]>,
  alignedSamples: AlignedSamples['samples'],
  variable: string,
): Array<{
  stationId: string
  time: string
  observed: number
  members: number[]
  location?: { lon: number; lat: number }
  elevation?: number
}> {
  const sampleKey = (stationId: string, time: string) => `${stationId}:${time}`

  // Build a lookup from (stationId, time) to observation
  const observationMap = new Map<
    string,
    {
      observed: number
      location?: { lon: number; lat: number }
      elevation?: number
    }
  >()

  for (const sample of alignedSamples) {
    const key = sampleKey(sample.stationId, sample.time)
    observationMap.set(key, {
      observed: sample.observed,
      location: sample.location,
      elevation: sample.elevation,
    })
  }

  // Collect members for each (stationId, time)
  const membersByKey = new Map<
    string,
    {
      stationId: string
      time: string
      members: number[]
      location?: { lon: number; lat: number }
      elevation?: number
    }
  >()

  for (const [_memberId, values] of memberData.entries()) {
    for (const value of values) {
      if (!value.observation || value.observation.mode !== 'stations') continue

      const stationId = value.observation.station.id
      const time = value.time
      const key = sampleKey(stationId, time)

      // Only include if we have an observation for this (stationId, time)
      const obs = observationMap.get(key)
      if (!obs) continue

      if (!membersByKey.has(key)) {
        membersByKey.set(key, {
          stationId,
          time,
          members: [],
          location: obs.location,
          elevation: obs.elevation,
        })
      }

      const memberValue = extractComparableValue(value, variable)
      if (Number.isFinite(memberValue)) {
        membersByKey.get(key)!.members.push(memberValue)
      }
    }
  }

  // Combine with observations
  const ensembleSamples: Array<{
    stationId: string
    time: string
    observed: number
    members: number[]
    location?: { lon: number; lat: number }
    elevation?: number
  }> = []

  for (const [key, memberSample] of membersByKey.entries()) {
    const obs = observationMap.get(key)
    if (obs && Number.isFinite(obs.observed)) {
      ensembleSamples.push({
        ...memberSample,
        observed: obs.observed,
      })
    }
  }

  return ensembleSamples
}

export async function getEnsembleCRPSData(taskId: string): Promise<EnsembleCRPSResponse> {
  // Initialize service and validate task
  const taskValidation = await initializeAndValidateTask(taskId)
  const validationFailure = wrapValidationFailure(taskValidation)
  if (validationFailure) return validationFailure

  if (!taskValidation.ok) throw new Error('Unreachable')
  const { task, service } = taskValidation

  try {
    // Check if task is probabilistic
    if (task.configuration.resolvedMethod !== 'probabilistic') {
      return {
        ok: true,
        data: {
          available: false,
          reason: '确定性任务未提供集合，无法计算 CRPS',
        },
      }
    }

    // Get ensemble member count
    const ensembleMembers = task.configuration.advanced.ensembleMembers
    if (!ensembleMembers || ensembleMembers < 1) {
      return {
        ok: true,
        data: {
          available: false,
          reason: '集合成员数无效，无法计算 CRPS',
        },
      }
    }

    const allMemberIds = Array.from(
      { length: ensembleMembers },
      (_, index) => `member-${String(index + 1).padStart(2, '0')}`,
    )

    // Use same sampling budget as station accuracy assessment (ticket #72)
    const { sampleResult, times, plan, maxTimes, maxPoints } = await prepareAssessmentSamples(
      task,
      service,
      taskId,
      '没有共同有效样本用于 CRPS 评估',
    )

    const sampleFailure = wrapSampleQueryFailure(sampleResult)
    if (sampleFailure) return sampleFailure

    if (!sampleResult.ok) throw new Error('Unreachable')
    const { samples: alignedSamples, timeCoverage } = sampleResult

    // Calculate baseline RMSE and MAE from deterministic downscaled
    let sumSquaredError = 0
    let sumAbsoluteError = 0
    for (const sample of alignedSamples) {
      const error = sample.downscaled - sample.observed
      sumSquaredError += error * error
      sumAbsoluteError += Math.abs(error)
    }
    const rmse = Math.sqrt(sumSquaredError / alignedSamples.length)
    const mae = sumAbsoluteError / alignedSamples.length

    // Query ensemble member data at observation stations
    const memberResult = await queryEnsembleMembers(
      service,
      taskId,
      task.configuration.region,
      times,
      maxPoints,
      allMemberIds,
      task.configuration.variable,
    )

    if (!memberResult.ok) {
      return {
        ok: true,
        data: {
          available: false,
          reason: memberResult.reason,
        },
      }
    }

    // Align ensemble members with observations
    const ensembleSamples = alignEnsembleWithObservations(
      memberResult.memberData,
      alignedSamples,
      task.configuration.variable,
    )

    if (ensembleSamples.length === 0) {
      return {
        ok: true,
        data: {
          available: false,
          reason: '没有共同有效样本用于 CRPS 评估',
        },
      }
    }

    // Calculate CRPS
    const crpsResult = calculateEnsembleCRPS(ensembleSamples)

    if (!crpsResult.available) {
      return {
        ok: true,
        data: {
          available: false,
          reason: crpsResult.reason,
        },
      }
    }

    // Extract station metadata
    const stations = extractStationMetadata(ensembleSamples)
    const samplingInfo = buildAssessmentSamplingInfo(
      ensembleSamples,
      timeCoverage,
      times,
      maxPoints,
      maxTimes,
      plan,
    )

    return {
      ok: true,
      data: {
        available: true,
        metrics: {
          crps: crpsResult.metrics.crps,
          rmse,
          mae,
        },
        samples: {
          n: crpsResult.metrics.n,
          ...samplingInfo,
          averageMembers: crpsResult.metrics.averageMembers,
        },
        stations,
        sampling: samplingInfo.sampling,
        method: {
          matching: '台站坐标 25km 内取样',
          unit: getVariableUnit(task.configuration.variable),
          dataSource: 'Synthetic Demo',
          crpsDefinition:
            '经验 ECDF 定义：CRPS = 成员对观测的平均绝对误差 − 所有有序成员对平均绝对差的一半。每站时样本使用实际有效成员 K，缺测按公开规则排除。',
        },
      },
    }
  } catch (error) {
    return wrapAssessmentError(error, 'CRPS')
  }
}

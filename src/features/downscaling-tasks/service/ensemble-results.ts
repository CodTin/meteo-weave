import { windDiagnostics } from './wind-diagnostics'
import {
  unavailable,
  type DownscalingTask,
  type EnsembleSelection,
  type EnsembleMetadata,
  type EnsembleUnavailable,
  type EnsembleSample,
  type ResultPoint,
  type ResultReply,
  type ResultMetadata,
  type ResultValue,
  type Unavailable,
} from './contracts'
import { pressureAt, windAt, precipitationAt } from './variable-fields'
import { temperatureAt } from './temperature-field'
import { temperatureDay } from './temperature-aggregation'
import { coveredHours } from './temporal-summary'

type Selection = Pick<EnsembleMetadata, 'kind' | 'allMemberIds' | 'memberIds'>
type Query = { points: ResultPoint[]; times: string[]; temporalResolution?: 'hourly' | 'daily' }

/** Task-local identities follow persisted admitted count, never request order or a fresh RNG. */
export function selectEnsemble(
  task: DownscalingTask,
  requested?: EnsembleSelection,
): Selection | Unavailable | null {
  if (task.configuration.resolvedMethod !== 'probabilistic') {
    return requested
      ? unavailable('NOT_PROBABILISTIC', 'Deterministic tasks have no ensemble members.')
      : null
  }
  const allMemberIds = Array.from(
    { length: task.configuration.advanced.ensembleMembers },
    (_, index) => `member-${String(index + 1).padStart(2, '0')}`,
  )
  if (requested?.memberIds?.some((id) => !allMemberIds.includes(id)))
    return unavailable(
      'UNAVAILABLE_MEMBER',
      'The requested member does not belong to the saved ensemble.',
    )
  return {
    kind: requested?.kind ?? 'mean',
    allMemberIds,
    memberIds: allMemberIds.filter(
      (id) => !requested?.memberIds || requested.memberIds.includes(id),
    ),
  }
}

function isUnavailable(value: { value: number } | Unavailable): value is Unavailable {
  return 'ok' in value
}

function collect<T extends { value: number }>(
  task: DownscalingTask,
  query: Query,
  selection: Selection,
  evaluate: (memberTask: DownscalingTask, point: ResultPoint, time: string) => T | Unavailable,
) {
  const groups = []
  const failures: EnsembleUnavailable[] = []
  for (const rawTime of query.times) {
    const time = new Date(rawTime).toISOString()
    for (const point of query.points) {
      const values: Array<T & ResultValue & { memberId: string }> = []
      for (const memberId of selection.memberIds) {
        const ordinal = selection.allMemberIds.indexOf(memberId) + 1
        // V3's fixed unsigned seed mixing; only the downscaled sample uses this derived seed.
        const memberTask = {
          ...task,
          dataSeed: Math.imul(task.dataSeed ^ ordinal, 0x9e3779b1) >>> 0,
        }
        const daily =
          query.temporalResolution === 'daily' ||
          (task.configuration.variable === 'precipitation' &&
            query.temporalResolution !== 'hourly' &&
            task.configuration.timeRange.mode === 'historical')
        // A v3 temporal outage, not zero data: every fifth member lacks its 06UTC sample.
        // A daily diagnostic/accumulation requiring that hour is unavailable as a whole.
        const missing =
          ordinal % 5 === 0 &&
          coveredHours(task, Date.parse(time), daily ? 24 : 1).some(
            (hour) => new Date(hour).getUTCHours() === 6,
          )
        const result = missing
          ? unavailable(
              'MISSING_MEMBER',
              'This Synthetic Demo member lacks a required 06UTC sample; it is unavailable, not zero.',
            )
          : evaluate(memberTask, point, time)
        if (isUnavailable(result))
          failures.push({ ...point, time, memberId, code: result.code, error: result.error })
        else if (!Number.isFinite(result.value))
          failures.push({
            ...point,
            time,
            memberId,
            code: 'GENERATION_FAILED',
            error: 'The member field could not be reconstructed.',
          })
        else values.push({ ...point, time, ...result, memberId })
      }
      groups.push({ point, time, values })
    }
  }
  return { values: groups.flatMap((group) => group.values), groups, failures }
}

type MeanValue = ResultValue & { ensembleMean: NonNullable<ResultValue['ensembleMean']> }
const average = (values: number[]) =>
  Math.round(
    values.reduce((total, value) => total + Math.round(value * 10_000), 0) / values.length,
  ) / 10_000

function means<T extends ResultValue, R extends ResultValue>(
  groups: Array<{ point: ResultPoint; time: string; values: T[] }>,
  selection: Selection,
  project: (values: T[], scalar: MeanValue) => R,
): R[] | Unavailable {
  const rows: R[] = []
  for (const group of groups) {
    if (!group.values.length)
      return unavailable(
        'MISSING_ENSEMBLE',
        'No available members at a requested point/time; an empty ensemble is not zero.',
      )
    const validMemberIds = group.values.map((value) => value.memberId!)
    rows.push(
      project(group.values, {
        ...group.point,
        time: group.time,
        value: average(group.values.map((value) => value.value)),
        ensembleMean: {
          sampleCount: group.values.length,
          validMemberIds,
          unavailableMemberIds: selection.memberIds.filter((id) => !validMemberIds.includes(id)),
        },
      }),
    )
  }
  return rows
}

export function queryEnsemble(
  task: DownscalingTask,
  query: Query,
  selection: Selection,
  metadata: ResultMetadata,
): ResultReply {
  const modelMetadata = {
    ...metadata,
    provenance: {
      ...metadata.provenance,
      description:
        'Versioned Synthetic Demo members reconstructed from pinned temperature-v1/variables-v2 fields and stable member seeds. Not a trained model or actual provider run. Original/reference data are shared, not member-randomized.',
    },
  }
  const ensemble = (result: {
    failures: EnsembleUnavailable[]
    values: EnsembleSample[]
  }): EnsembleMetadata => ({
    ...selection,
    unavailable: result.failures,
    missingPolicy: 'exclude-unavailable-per-location-time',
    ...(selection.kind === 'mean'
      ? {
          samples: result.values,
          meanDefinition:
            'Arithmetic available-member scalars and diagnostics: daily.minimum is the mean of member daily minima, not the minimum of the mean field. Wind averages U10/V10 before deriving speed/direction; meanMemberSpeed is the arithmetic mean of member speeds.',
        }
      : {}),
  })
  if (task.configuration.variable === 'wind') {
    const result = collect(task, query, selection, (member, point, time) =>
      windAt(member, 'downscaled', point, time),
    )
    const values =
      selection.kind === 'mean'
        ? means(result.groups, selection, (members, scalar) => {
            const u10 = average(members.map((value) => value.u10))
            const v10 = average(members.map((value) => value.v10))
            return {
              ...scalar,
              ...windDiagnostics(u10, v10),
              ensembleMean: { ...scalar.ensembleMean, meanMemberSpeed: scalar.value },
            }
          })
        : result.values
    if (!Array.isArray(values)) return values
    return {
      ...modelMetadata,
      variable: 'wind',
      quantity: 'U10/V10',
      unit: 'm/s',
      directionUnit: 'degrees',
      directionConvention: 'meteorological-from',
      ensemble: ensemble(result),
      values,
    }
  }
  if (task.configuration.variable === 'precipitation') {
    const duration =
      query.temporalResolution === 'daily'
        ? 24
        : query.temporalResolution === 'hourly'
          ? 1
          : undefined
    const result = collect(task, query, selection, (member, point, time) =>
      precipitationAt(member, 'downscaled', point, time, duration),
    )
    const values =
      selection.kind === 'mean'
        ? means(result.groups, selection, (members, scalar) => ({
            ...scalar,
            accumulation: {
              ...members[0]!.accumulation,
              complete: members.every((value) => value.accumulation.complete),
            },
          }))
        : result.values
    if (!Array.isArray(values)) return values
    return {
      ...modelMetadata,
      variable: 'precipitation',
      quantity: 'TP',
      unit: 'mm',
      temporalStatistic: 'accumulation',
      ensemble: ensemble(result),
      values,
    }
  }
  if (task.configuration.variable === 'temperature' && query.temporalResolution === 'daily') {
    const result = collect(task, query, selection, (member, point, time) =>
      temperatureDay(member, 'downscaled', point, time),
    )
    const values =
      selection.kind === 'mean'
        ? means(result.groups, selection, (members, scalar) => ({
            ...scalar,
            daily: {
              ...members[0]!.daily,
              mean: scalar.value,
              minimum: average(members.map((value) => value.daily.minimum)),
              completeDay: members.every((value) => value.daily.completeDay),
            },
          }))
        : result.values
    if (!Array.isArray(values)) return values
    return {
      ...modelMetadata,
      variable: 'temperature',
      quantity: 'T2M',
      unit: '°C',
      temporalStatistic: 'daily-mean',
      ensemble: ensemble(result),
      values,
    }
  }
  if (task.configuration.variable === 'temperature') {
    const result = collect(task, query, selection, (member, point, time) => ({
      value: temperatureAt(member, 'downscaled', point.longitude, point.latitude, time),
    }))
    const values =
      selection.kind === 'mean'
        ? means(result.groups, selection, (_members, scalar) => scalar)
        : result.values
    if (!Array.isArray(values)) return values
    return {
      ...modelMetadata,
      variable: 'temperature',
      quantity: 'T2M',
      unit: '°C',
      temporalStatistic: 'instantaneous',
      ensemble: ensemble(result),
      values,
    }
  }
  const result = collect(task, query, selection, (member, point, time) => ({
    value: pressureAt(member, 'downscaled', point, time),
  }))
  const values =
    selection.kind === 'mean'
      ? means(result.groups, selection, (_members, scalar) => scalar)
      : result.values
  if (!Array.isArray(values)) return values
  return {
    ...modelMetadata,
    variable: 'pressure',
    quantity: 'MSL',
    unit: 'hPa',
    ensemble: ensemble(result),
    values,
  }
}

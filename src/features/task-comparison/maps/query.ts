import { RESULT_QUERY_LIMITS } from '@/features/downscaling-tasks/service'
import { sameTaskMetadata } from '@/features/downscaling-tasks/service/record-validation'
import { getAbsoluteColorScale } from '@/features/result-analysis/service/color-scales'
import {
  computeSharedScale,
  intervalsMatch,
} from '@/features/result-analysis/service/comparison-data'
import type {
  ComparisonMapLegend,
  ComparisonMapPreview,
  ComparisonMapPreviewsReply,
  ComparisonMapService,
  ComparisonMapResult,
  ComparisonMapTasks,
} from './types'

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

function nativeTimes(task: ComparisonMapTasks['a']) {
  const { timeRange } = task.configuration
  return {
    start: Date.parse(timeRange.start),
    end: Date.parse(timeRange.end),
    step: timeRange.mode === 'historical' ? DAY_MS : HOUR_MS,
  }
}

/** Daily and hourly native lattices are nested; no enumeration of a long task window. */
function commonNativeTime(tasks: ComparisonMapTasks): string | null {
  const a = nativeTimes(tasks.a)
  const b = nativeTimes(tasks.b)
  const coarser = a.step >= b.step ? a : b
  const lower = Math.max(a.start, b.start)
  const upper = Math.min(a.end, b.end)
  const time = coarser.start + Math.ceil((lower - coarser.start) / coarser.step) * coarser.step
  return time <= upper && (time - a.start) % a.step === 0 && (time - b.start) % b.step === 0
    ? new Date(time).toISOString()
    : null
}

function completeAccumulations(result: ComparisonMapResult): boolean {
  if (result.variable !== 'precipitation') return true
  return (
    result.values.length > 0 &&
    result.values.every(
      ({ accumulation }) =>
        accumulation.complete &&
        accumulation.sampledHours === accumulation.expectedHours &&
        accumulation.start === accumulation.requestedStart &&
        accumulation.end === accumulation.requestedEnd,
    )
  )
}

function sameAccumulations(a: ComparisonMapResult, b: ComparisonMapResult): boolean {
  if (a.variable !== 'precipitation' || b.variable !== 'precipitation') return true
  const first = a.values[0]?.accumulation
  return (
    first !== undefined &&
    [...a.values, ...b.values].every(({ accumulation }) => intervalsMatch(first, accumulation))
  )
}

/** Compare exposed task identity/configuration, not private store/cache representation. */
async function validatePair(service: ComparisonMapService, tasks: ComparisonMapTasks) {
  const expected = [tasks.a, tasks.b]
  const replies = await Promise.all(expected.map((task) => service.get(task.id)))
  for (const [index, reply] of replies.entries()) {
    if (!reply.ok) return reply
    if (reply.task.status !== 'Completed') {
      return {
        ok: false as const,
        code: 'INVALID_STATUS',
        error: '只有已完成任务可以显示对比地图。',
      }
    }
    if (!sameTaskMetadata(reply.task, expected[index]!)) {
      return {
        ok: false as const,
        code: 'TASK_CHANGED',
        error: '任务身份或配置已改变，请重新选择任务。',
      }
    }
  }
  return null
}

/** One bounded native field per task, keeping input A/B order and each task's own coverage. */
export async function queryComparisonMapPreviews(
  service: ComparisonMapService,
  tasks: ComparisonMapTasks,
  selectedTime?: string,
): Promise<ComparisonMapPreviewsReply> {
  if (tasks.a.id === tasks.b.id || tasks.a.ownerId !== tasks.b.ownerId) {
    return { ok: false, code: 'INVALID_PAIR', error: '请选择当前账号下两个不同的已完成任务。' }
  }
  const initialFailure = await validatePair(service, tasks)
  if (initialFailure) return initialFailure
  const selected = selectedTime === undefined ? null : Date.parse(selectedTime)
  if (selected !== null && !Number.isFinite(selected)) {
    return { ok: false, code: 'INVALID_TIME', error: '请选择有效的 ISO 时间片。' }
  }
  const commonTime = selected === null ? commonNativeTime(tasks) : new Date(selected).toISOString()
  const previews = await Promise.all(
    [tasks.a, tasks.b].map(async (task): Promise<ComparisonMapPreview> => {
      const window = { ...task.configuration.region }
      const time = commonTime ?? new Date(task.configuration.timeRange.start).toISOString()
      const probabilistic = task.configuration.resolvedMethod === 'probabilistic'
      const memberCount = probabilistic ? (task.configuration.advanced?.ensembleMembers ?? 10) : 0
      const maxPoints = Math.min(
        RESULT_QUERY_LIMITS.points,
        RESULT_QUERY_LIMITS.gridPoints,
        Math.floor(RESULT_QUERY_LIMITS.values / (memberCount + 1)),
      )
      const result = await service.result(task.id, {
        kind: 'preview',
        layer: 'downscaled',
        window,
        times: [time],
        maxPoints,
        ...(probabilistic ? { ensemble: { kind: 'mean' as const } } : {}),
      })
      if (!result.ok) return { ...result, task, window, time }
      if (
        result.taskId !== task.id ||
        result.layer !== 'downscaled' ||
        result.variable !== task.configuration.variable ||
        result.values.length > maxPoints ||
        result.values.some(
          (point) =>
            Date.parse(point.time) !== Date.parse(time) ||
            !Number.isFinite(point.longitude) ||
            !Number.isFinite(point.latitude) ||
            point.longitude < window.west ||
            point.longitude > window.east ||
            point.latitude < window.south ||
            point.latitude > window.north,
        )
      ) {
        return {
          ok: false,
          code: 'INVALID_RESULT',
          error: '结果任务、空间样本或时间片与有界请求不一致，不能显示为共同时间片。',
          task,
          window,
          time,
        }
      }
      const points = result.values.map(({ longitude, latitude, time, value }) => ({
        longitude,
        latitude,
        time,
        value: Number.isFinite(value) ? value : null,
      }))
      const legend: ComparisonMapLegend | null = points.some((point) => point.value !== null)
        ? {
            ...getAbsoluteColorScale(result.variable),
            ...computeSharedScale([points.map((point) => point.value)]),
            unit: result.unit,
          }
        : null
      const valid = points.filter((point) => point.value !== null).length
      const omitted =
        result.grid.sampling === 'requested-points'
          ? 0
          : Math.max(0, result.grid.returnedPoints - points.length)
      return {
        ok: true,
        task,
        window,
        time,
        result,
        points,
        legend,
        sampleCounts: { valid, missing: points.length - valid, omitted },
      }
    }),
  )
  // A may disappear after its own field has completed while B is still being read.
  const finalFailure = await validatePair(service, tasks)
  if (finalFailure) return finalFailure
  const a = previews[0]!
  const b = previews[1]!
  const shared =
    a.ok &&
    b.ok &&
    a.time === b.time &&
    a.result.variable === b.result.variable &&
    a.result.quantity === b.result.quantity &&
    a.result.unit === b.result.unit &&
    a.result.temporalStatistic === b.result.temporalStatistic &&
    completeAccumulations(a.result) &&
    completeAccumulations(b.result) &&
    sameAccumulations(a.result, b.result) &&
    a.legend !== null &&
    b.legend !== null
  if (shared && a.ok && b.ok) {
    const legend = {
      ...getAbsoluteColorScale(a.result.variable),
      ...computeSharedScale([
        a.points.map((point) => point.value),
        b.points.map((point) => point.value),
      ]),
      unit: a.result.unit,
    }
    a.legend = legend
    b.legend = legend
  }
  return {
    ok: true,
    previews: [a, b],
    commonTime: shared ? a.time : null,
    scale: {
      kind: shared ? 'shared' : 'independent',
      explanation: shared
        ? '同一变量、单位、统计口径与时间片，共享绝对色阶；各自保留原生空间范围。'
        : !a.ok || !b.ok
          ? `结果时间片不可用：${[a, b].flatMap((preview) => (preview.ok ? [] : [preview.error])).join('；')} 使用独立图例，不能直接数值对比。`
          : a.time !== b.time
            ? '不存在共同原生时间片；保留各自时间与独立图例，不能直接数值对比。'
            : a.result.variable !== b.result.variable ||
                a.result.quantity !== b.result.quantity ||
                a.result.unit !== b.result.unit
              ? `变量或单位不同：A ${a.result.quantity} (${a.result.unit})，B ${b.result.quantity} (${b.result.unit})；使用独立图例，不能直接数值对比。`
              : !completeAccumulations(a.result) || !completeAccumulations(b.result)
                ? '降水累计区间不完整；只有完整且相同的累计区间才能共享色阶，当前使用独立图例。'
                : !sameAccumulations(a.result, b.result)
                  ? '降水累计区间不同；保留各自完整累计区间与独立图例，不能直接数值对比。'
                  : '统计口径或有效样本不兼容，使用独立图例，不能直接数值对比。',
    },
  }
}

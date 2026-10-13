import type { DownscalingTask } from './contracts'

/** Dates cover complete UTC days; forecast instants cover their explicit hourly samples. */
export function coveredHours(task: DownscalingTask, start: number, duration: 1 | 24) {
  const range = task.configuration.timeRange
  const first = Date.parse(range.start)
  const last = Date.parse(range.end) + (range.mode === 'historical' ? 23 * 3_600_000 : 0)
  const hours: number[] = []
  for (let hour = 0; hour < duration; hour++) {
    const instant = start + hour * 3_600_000
    if (instant >= first && instant <= last) hours.push(instant)
  }
  return hours
}

/** Hourly public temperature samples are four-decimal quanta, across model and reference fields. */
export function dailyTemperatureSummary(start: number, values: readonly number[]) {
  if (!values.length || values.some((value) => !Number.isFinite(value))) return undefined
  let sumQuanta = 0
  let minimum = Infinity
  for (const value of values) {
    sumQuanta += Math.round(value * 10_000)
    minimum = Math.min(minimum, value)
  }
  const mean = Math.round(sumQuanta / values.length) / 10_000
  return {
    value: mean,
    daily: {
      mean,
      minimum,
      sampledHours: values.length,
      expectedHours: 24,
      completeDay: values.length === 24,
      start: new Date(start).toISOString(),
      end: new Date(start + 86_400_000).toISOString(),
      bounds: '[start,end)' as const,
    },
  }
}

/** Actual coverage of a nonempty set of covered hourly intervals, not cumulative counters. */
export function accumulationCoverage(start: number, duration: 1 | 24, hours: readonly number[]) {
  return {
    start: new Date(hours[0]!).toISOString(),
    end: new Date(hours.at(-1)! + 3_600_000).toISOString(),
    requestedStart: new Date(start).toISOString(),
    requestedEnd: new Date(start + duration * 3_600_000).toISOString(),
    bounds: '[start,end)' as const,
    sampledHours: hours.length,
    expectedHours: duration,
    complete: hours.length === duration,
  }
}

import { unavailable, type DownscalingTask, type ResultPoint, type ResultQuery } from './contracts'
import { temperatureAt } from './temperature-field'

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

/** At most 24 scalar evaluations; no time-space cube, and no minimum inferred from a mean. */
export function temperatureDay(
  task: DownscalingTask,
  layer: ResultQuery['layer'],
  point: ResultPoint,
  time: string,
) {
  const start = Date.parse(time)
  const hours = coveredHours(task, start, 24)
  if (!hours.length)
    return unavailable('MISSING_DATA', 'No hourly temperature samples cover this UTC day.')
  let sumQuanta = 0
  let minimum = Infinity
  for (const hour of hours) {
    const value = temperatureAt(
      task,
      layer,
      point.longitude,
      point.latitude,
      new Date(hour).toISOString(),
    )
    if (!Number.isFinite(value))
      return unavailable(
        'MISSING_DATA',
        'A required hourly temperature sample is unavailable; a complete day cannot be reconstructed.',
      )
    // The public v1 field is rounded to four decimals. Integer quanta avoid tie-rounding drift.
    sumQuanta += Math.round(value * 10_000)
    minimum = Math.min(minimum, value)
  }
  const mean = Math.round(sumQuanta / hours.length) / 10_000
  return {
    value: mean,
    daily: {
      mean,
      minimum,
      sampledHours: hours.length,
      expectedHours: 24,
      completeDay: hours.length === 24,
      start: new Date(start).toISOString(),
      end: new Date(start + 86_400_000).toISOString(),
      bounds: '[start,end)' as const,
    },
  }
}

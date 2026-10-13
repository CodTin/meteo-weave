import { coveredHours, dailyTemperatureSummary } from './temporal-summary'
import { unavailable, type DownscalingTask, type ResultPoint, type ResultQuery } from './contracts'
import { temperatureAt } from './temperature-field'

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
  const values = hours.map((hour) =>
    temperatureAt(task, layer, point.longitude, point.latitude, new Date(hour).toISOString()),
  )
  return (
    dailyTemperatureSummary(start, values) ??
    unavailable(
      'MISSING_DATA',
      'A required hourly temperature sample is unavailable; a complete day cannot be reconstructed.',
    )
  )
}

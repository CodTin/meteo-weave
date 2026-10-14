import { windDiagnostics } from './wind-diagnostics'
import { unavailable, type DownscalingTask, type ResultPoint, type ResultQuery } from './contracts'
import { taskGrid } from './result-grid'
import { coveredHours, accumulationCoverage } from './temporal-summary'

const round = (value: number) => Math.round(value * 10_000) / 10_000

/** Exact emitted nodes need only themselves, even when inverse division rounds below an integer.
 * Compare coordinates, not an epsilon: nearby interior points still require both neighbors.
 * Keep the v2 interpolation arithmetic unchanged for non-native coordinates.
 */
function interpolationAxis(point: number, origin: number, end: number, spacing: number) {
  const index = (point - origin) / spacing
  const nearest = Math.min(end, origin + Math.round(index) * spacing)
  if (point === nearest || point === end) return [point, point, 0] as const
  const lower = origin + Math.floor(index) * spacing
  const upper = Math.min(end, lower + spacing)
  const fraction = upper === lower ? 0 : Math.max(0, Math.min(1, (point - lower) / (upper - lower)))
  return [lower, upper, fraction] as const
}

/** V2 components are sampled before deriving a vector magnitude or direction. */
function sample(
  task: DownscalingTask,
  layer: ResultQuery['layer'],
  point: ResultPoint,
  field: (longitude: number, latitude: number) => number,
): number
function sample(
  task: DownscalingTask,
  layer: ResultQuery['layer'],
  point: ResultPoint,
  field: (longitude: number, latitude: number) => number | null,
): number | null
function sample(
  task: DownscalingTask,
  layer: ResultQuery['layer'],
  point: ResultPoint,
  field: (longitude: number, latitude: number) => number | null,
) {
  const grid = taskGrid(task, layer)
  const { west, east, south, north } = grid.extent
  const dx = grid.spacingDegrees.longitude
  const dy = grid.spacingDegrees.latitude
  const [x0, x1, x] = interpolationAxis(point.longitude, west, east, dx)
  const [y0, y1, y] = interpolationAxis(point.latitude, south, north, dy)
  let value = 0
  for (const [lon, lat, weight] of [
    [x0, y0, (1 - x) * (1 - y)],
    [x1, y0, x * (1 - y)],
    [x0, y1, (1 - x) * y],
    [x1, y1, x * y],
  ] as const) {
    if (weight === 0) continue
    const node = field(lon, lat)
    if (node === null) return null
    value += node * weight
  }
  return round(value)
}

export function windAt(
  task: DownscalingTask,
  layer: ResultQuery['layer'],
  point: ResultPoint,
  time: string,
) {
  const hour = new Date(time).getUTCHours()
  const days = (Date.parse(time) - Date.parse('2024-01-01T00:00:00Z')) / 86_400_000
  const source = { fusion: 0, ecmwf: 0.5, gfs: -0.5 }[task.configuration.dataSource]
  const detail = (lon: number, lat: number) =>
    layer === 'original' ? 0 : 0.4 * Math.sin((lon * Math.PI) / 30) * Math.cos((lat * Math.PI) / 45)
  const u10 = sample(task, layer, point, (lon, lat) =>
    hour === 12 && lon >= 20 && lon <= 25 && lat >= 65 && lat <= 70
      ? null
      : (task.dataSeed % 11) -
        6 +
        lon / 10 +
        2 * Math.sin((hour * Math.PI) / 12) +
        Math.sin((days * 2 * Math.PI) / 365.25) +
        source +
        detail(lon, lat),
  )
  const v10 = sample(
    task,
    layer,
    point,
    (lon, lat) =>
      (task.dataSeed % 13) +
      1 +
      lat / 10 +
      Math.sin((hour * Math.PI) / 6) +
      0.5 * Math.sin((days * Math.PI) / 7) -
      source -
      detail(lon, lat),
  )
  if (u10 === null)
    return unavailable(
      'MISSING_COMPONENT',
      'A required U10 grid node is missing in this v2 Synthetic Demo patch; wind is unavailable, not zero.',
    )
  if (!Number.isFinite(u10) || !Number.isFinite(v10))
    return unavailable('GENERATION_FAILED', 'The wind components could not be reconstructed.')
  return windDiagnostics(u10, v10)
}

/** Synthetic sea-level pressure in hPa, not converted/relabelled SP. */
export function pressureAt(
  task: DownscalingTask,
  layer: ResultQuery['layer'],
  point: ResultPoint,
  time: string,
) {
  const days = (Date.parse(time) - Date.parse('2024-01-01T00:00:00Z')) / 86_400_000
  const source = { fusion: 0, ecmwf: 0.7, gfs: -0.9 }[task.configuration.dataSource]
  return sample(
    task,
    layer,
    point,
    (lon, lat) =>
      1013.25 +
      5 * Math.sin((days * 2 * Math.PI) / 365.25) -
      lat * 0.1 +
      lon * 0.05 +
      (task.dataSeed % 13) -
      3 +
      source +
      (layer === 'original'
        ? 0
        : 0.8 * Math.sin((lon * Math.PI) / 30) * Math.cos((lat * Math.PI) / 45)),
  )
}

/** Each value is an independent [start,end) bucket, never a running forecast counter. */
export function precipitationAt(
  task: DownscalingTask,
  layer: ResultQuery['layer'],
  point: ResultPoint,
  time: string,
  duration: 1 | 24 = task.configuration.timeRange.mode === 'historical' ? 24 : 1,
) {
  const start = Date.parse(time)
  const hours = coveredHours(task, start, duration)
  if (!hours.length)
    return unavailable('MISSING_DATA', 'No precipitation intervals cover this request.')
  let value = 0
  for (const instant of hours) {
    const hour = new Date(instant).getUTCHours()
    const day = Math.floor((instant - Date.parse('2024-01-01T00:00:00Z')) / 86_400_000)
    const pulse = Math.max(0, 3 - Math.abs(hour - (4 + (task.dataSeed % 7))))
    const storm = Math.max(0, Math.cos((day * Math.PI) / 8))
    const source = { fusion: 1, ecmwf: 1.1, gfs: 0.9 }[task.configuration.dataSource]
    const interval = sample(task, layer, point, (lon, lat) =>
      hour === 4 && lon >= 20 && lon <= 25 && lat >= 65 && lat <= 70
        ? null
        : pulse *
          storm *
          source *
          Math.max(0, Math.cos((lat * Math.PI) / 180)) *
          (1 + 0.2 * Math.sin((lon * Math.PI) / 30)) *
          (layer === 'original'
            ? 1
            : 1 + 0.15 * Math.sin((lon * Math.PI) / 10) * Math.cos((lat * Math.PI) / 20)),
    )
    if (interval === null)
      return unavailable(
        'MISSING_DATA',
        'A required precipitation grid node/interval is missing in this v2 Synthetic Demo patch; missing rain is not zero.',
      )
    if (!Number.isFinite(interval))
      return unavailable(
        'GENERATION_FAILED',
        'The precipitation interval could not be reconstructed.',
      )
    value += interval
  }
  return {
    value: round(value),
    accumulation: accumulationCoverage(start, duration, hours),
  }
}

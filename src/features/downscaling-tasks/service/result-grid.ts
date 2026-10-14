import { previewSampling } from './preview-sampling'
import {
  RESULT_QUERY_LIMITS,
  unavailable,
  type DownscalingTask,
  type LogicalGrid,
  type ResultPoint,
  type ResultQuery,
  type ResultWindow,
  type Unavailable,
  type WindowSampling,
} from './contracts'

/** The v1 lattice geometry; the last cell is clipped, not extrapolated past coverage. */
export function taskGrid(task: DownscalingTask, layer: ResultQuery['layer']): LogicalGrid {
  const { region, resolution } = task.configuration
  const spacingKm = layer === 'original' ? 10 : Number.parseInt(resolution)
  const longitudeKm =
    111.32 * Math.max(0.01, Math.cos(((region.south + region.north) * Math.PI) / 360))
  const dx = spacingKm / longitudeKm
  const dy = spacingKm / 111.32
  function length(lower: number, upper: number, spacing: number) {
    const last = Math.ceil((upper - lower) / spacing)
    // Avoid a duplicate terminal node when floating-point division rounds just above an integer.
    return last > 1 && lower + (last - 1) * spacing >= upper ? last : last + 1
  }
  return {
    origin: { longitude: region.west, latitude: region.south },
    spacingDegrees: { longitude: dx, latitude: dy },
    dimensions: {
      columns: length(region.west, region.east, dx),
      rows: length(region.south, region.north, dy),
    },
    extent: region,
    edgePolicy: 'clipped-last-cell',
  }
}

/** Locate inclusive window nodes without constructing either axis or the full grid. */
function axisWindow(
  count: number,
  coordinate: (index: number) => number,
  low: number,
  high: number,
) {
  function firstWhere(predicate: (value: number) => boolean) {
    let left = 0
    let right = count
    while (left < right) {
      const middle = Math.floor((left + right) / 2)
      if (predicate(coordinate(middle))) right = middle
      else left = middle + 1
    }
    return left
  }
  return {
    first: firstWhere((value) => value >= low),
    last: firstWhere((value) => value > high) - 1,
  }
}

export function windowPoints(
  task: DownscalingTask,
  layer: ResultQuery['layer'],
  window: ResultWindow,
  timeCount: number,
  previewBudget?: number,
): { points: ResultPoint[]; grid: WindowSampling } | Unavailable {
  const grid = taskGrid(task, layer)
  const longitude = (index: number) =>
    Math.min(grid.extent.east, grid.origin.longitude + index * grid.spacingDegrees.longitude)
  const latitude = (index: number) =>
    Math.min(grid.extent.north, grid.origin.latitude + index * grid.spacingDegrees.latitude)
  const x = axisWindow(grid.dimensions.columns, longitude, window.west, window.east)
  const y = axisWindow(grid.dimensions.rows, latitude, window.south, window.north)
  const columns = x.last - x.first + 1
  const rows = y.last - y.first + 1
  const count = columns * rows
  if (!count)
    return unavailable(
      'EMPTY_WINDOW',
      'The window contains no logical grid nodes; enlarge the window or request a point.',
    )
  const budget = Math.min(
    previewBudget ?? RESULT_QUERY_LIMITS.gridPoints,
    Math.floor(RESULT_QUERY_LIMITS.values / timeCount),
  )
  if (previewBudget === undefined && count > budget) {
    return unavailable(
      'QUERY_LIMIT_EXCEEDED',
      'Use smaller windows or time slices: at most 256 grid points and 256 total values. Target resolution is never reduced.',
    )
  }
  // Determine the sampling arithmetically, before allocating even an axis. Exact windows
  // retain every node; only an explicitly requested preview may decimate the target grid.
  const plan = previewSampling(columns, rows, budget)
  const points = plan.indices.map(({ column, row }) => ({
    longitude: longitude(x.first + column),
    latitude: latitude(y.first + row),
  }))
  const returnedPoints = points.length
  return {
    points,
    grid: {
      sampling: returnedPoints === count ? 'logical-grid' : 'decimated-grid',
      coordinateOrder: 'longitude-latitude',
      order: 'time-row-column',
      logicalGrid: grid,
      window: { firstColumn: x.first, lastColumn: x.last, firstRow: y.first, lastRow: y.last },
      stride: plan.stride,
      sampled: plan.sampled,
      availablePoints: count,
      returnedPoints,
    },
  }
}

import {
  OBSERVATION_REFERENCE,
  unavailable,
  type DownscalingTask,
  type ObservationStation,
  RESULT_QUERY_LIMITS,
  type ResultPoint,
  type ResultWindow,
  type WindowSampling,
  type Unavailable,
} from './contracts'

export function observationReference(task: DownscalingTask) {
  return {
    referenceSeed: task.referenceSeed ?? OBSERVATION_REFERENCE.referenceSeed,
    referenceVersion: task.referenceVersion ?? OBSERVATION_REFERENCE.referenceVersion,
  }
}

/** Fixed one-degree reference lattice, independent of task/window boundaries. */
export function stationAt(longitude: number, latitude: number): ObservationStation {
  return { id: `synthetic-station-v1:${longitude}:${latitude}`, longitude, latitude }
}

export function distanceKm(a: ResultPoint, b: ResultPoint) {
  const radians = Math.PI / 180
  const h =
    Math.sin(((b.latitude - a.latitude) * radians) / 2) ** 2 +
    Math.cos(a.latitude * radians) *
      Math.cos(b.latitude * radians) *
      Math.sin(((b.longitude - a.longitude) * radians) / 2) ** 2
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, h)))
}

export function nearestStation(
  point: ResultPoint,
  valid: (station: ObservationStation) => boolean,
) {
  let nearest: { station: ObservationStation; distanceKm: number } | undefined
  // Longitude neighbours suffice on the fixed latitude rows, including near the poles.
  for (
    let latitude = Math.max(-89, Math.floor(point.latitude) - 1);
    latitude <= Math.min(89, Math.ceil(point.latitude) + 1);
    latitude++
  ) {
    for (
      let longitude = Math.max(-180, Math.floor(point.longitude));
      longitude <= Math.min(180, Math.ceil(point.longitude));
      longitude++
    ) {
      const station = stationAt(longitude, latitude)
      const distance = distanceKm(point, station)
      if (distance <= 25 && valid(station) && (!nearest || distance < nearest.distanceKm))
        nearest = { station, distanceKm: distance }
    }
  }
  return nearest && nearest.distanceKm <= 25
    ? nearest
    : unavailable(
        'NO_OBSERVATION',
        'No reference station within 25 km; no extrapolated match is returned.',
      )
}

/** Only positive-weight support participates: a missing neighbour never poisons an exact node. */
export function interpolationStations(point: ResultPoint) {
  if (
    point.longitude < -180 ||
    point.longitude > 180 ||
    point.latitude < -89 ||
    point.latitude > 89
  )
    return unavailable(
      'NO_OBSERVATION',
      'Point is outside the reference station lattice; values are not extrapolated.',
    )
  const west = Math.floor(point.longitude)
  const east = Math.ceil(point.longitude)
  const south = Math.floor(point.latitude)
  const north = Math.ceil(point.latitude)
  const x = point.longitude - west
  const y = point.latitude - south
  return [
    { station: stationAt(west, south), weight: (1 - x) * (1 - y) },
    { station: stationAt(east, south), weight: x * (1 - y) },
    { station: stationAt(west, north), weight: (1 - x) * y },
    { station: stationAt(east, north), weight: x * y },
  ].filter(({ weight }) => weight > 0)
}

/** Select only the requested station window. Counts/strides are computed before allocation. */
export function stationWindow(
  window: ResultWindow,
  timeCount: number,
  previewBudget?: number,
): { points: ResultPoint[]; grid: WindowSampling } | Unavailable {
  const firstColumn = Math.max(-180, Math.ceil(window.west)) + 180
  const lastColumn = Math.min(180, Math.floor(window.east)) + 180
  const firstRow = Math.max(-89, Math.ceil(window.south)) + 89
  const lastRow = Math.min(89, Math.floor(window.north)) + 89
  const columns = Math.max(0, lastColumn - firstColumn + 1)
  const rows = Math.max(0, lastRow - firstRow + 1)
  const count = columns * rows
  if (!count) return unavailable('NO_OBSERVATION', 'This window contains no reference stations.')
  const budget = Math.min(
    previewBudget ?? RESULT_QUERY_LIMITS.gridPoints,
    RESULT_QUERY_LIMITS.gridPoints,
    Math.floor(RESULT_QUERY_LIMITS.values / timeCount),
  )
  if (previewBudget === undefined && count > budget)
    return unavailable(
      'QUERY_LIMIT_EXCEEDED',
      'Use a smaller station window or fewer times, or an explicitly decimated preview.',
    )
  const targetColumns =
    count <= budget
      ? columns
      : Math.min(columns, Math.max(1, Math.floor(Math.sqrt((budget * columns) / rows))), budget)
  const targetRows = count <= budget ? rows : Math.min(rows, Math.floor(budget / targetColumns))
  function sample(size: number, target: number) {
    const stride = target === 1 ? size : Math.max(1, Math.ceil((size - 1) / (target - 1)))
    return { stride, count: target === 1 ? 1 : Math.ceil((size - 1) / stride) + 1 }
  }
  const x = sample(columns, targetColumns)
  const y = sample(rows, targetRows)
  const points: ResultPoint[] = []
  for (let row = 0; row < y.count; row++) {
    for (let column = 0; column < x.count; column++) {
      points.push({
        longitude: Math.min(lastColumn, firstColumn + column * x.stride) - 180,
        latitude: Math.min(lastRow, firstRow + row * y.stride) - 89,
      })
    }
  }
  return {
    points,
    grid: {
      sampling: points.length === count ? 'logical-grid' : 'decimated-grid',
      coordinateOrder: 'longitude-latitude',
      order: 'time-row-column',
      logicalGrid: {
        origin: { longitude: -180, latitude: -89 },
        spacingDegrees: { longitude: 1, latitude: 1 },
        dimensions: { columns: 361, rows: 179 },
        extent: { west: -180, east: 180, south: -89, north: 89 },
        edgePolicy: 'clipped-last-cell',
      },
      window: { firstColumn, lastColumn, firstRow, lastRow },
      stride: { columns: x.stride, rows: y.stride },
      sampled: { columns: x.count, rows: y.count },
      availablePoints: count,
      returnedPoints: points.length,
    },
  }
}

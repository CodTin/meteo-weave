import {
  OBSERVATION_REFERENCE,
  unavailable,
  type DownscalingTask,
  type ResultQuery,
  type ResultPoint,
  type ResultMetadata,
  type ResultReply,
  type ObservationSupport,
  type Unavailable,
  type ResultValue,
  type ObservationStation,
} from './contracts'
import {
  stationAvailable,
  stationTemperature,
  stationPressure,
  stationRain,
  weightedStations,
  observationWind,
} from './observation-values'
import { coveredHours, dailyTemperatureSummary, accumulationCoverage } from './temporal-summary'
import {
  observationReference,
  nearestStation,
  stationAt,
  interpolationStations,
} from './observation-reference'

export function queryObservations(
  task: DownscalingTask,
  requested: Pick<ResultQuery, 'kind' | 'observationMode' | 'temporalResolution'>,
  query: { points: ResultPoint[]; times: string[] },
  metadata: ResultMetadata,
): ResultReply {
  const reference = observationReference(task)
  if (reference.referenceVersion !== OBSERVATION_REFERENCE.referenceVersion)
    return unavailable(
      'INCOMPATIBLE_REFERENCE',
      'The saved observation reference version is unavailable; it will not be replaced.',
    )
  const observationMetadata: ResultMetadata = {
    ...metadata,
    reference: {
      ...reference,
      kind: 'synthetic-stations',
      spacingDegrees: { longitude: 1, latitude: 1 },
      extent: { west: -180, east: 180, south: -89, north: 89 },
      maximumMatchDistanceKm: 25,
      distanceMetric: 'great-circle',
      earthRadiusKm: 6371.0088,
      interpolation: 'bilinear-station-values',
      missingPolicy: 'required-support-unavailable',
    },
    provenance: {
      ...metadata.provenance,
      description:
        'Synthetic Demo reference stations and bilinear interpolation of their values. Per-sample support identifies the contributing stations and weights. The task dataSource/generatorVersion describe model configuration only; observations use the separate saved reference identity. Not real station observations, HR labels, or model validation.',
    },
    grid: {
      ...metadata.grid,
      nominalSpacingKm:
        requested.observationMode === 'stations' ? null : metadata.grid.nominalSpacingKm,
      interpolation: requested.observationMode === 'stations' ? 'nearest-station' : 'bilinear',
    },
  }
  function withPlan(reply: Unavailable): ResultReply {
    const { ok: _ok, ...planned } = observationMetadata
    return { ...reply, planned }
  }
  const { variable, timeRange } = task.configuration
  function supports(station: ObservationStation, time: string) {
    const duration =
      requested.temporalResolution === 'daily' ||
      (variable === 'precipitation' &&
        requested.temporalResolution !== 'hourly' &&
        timeRange.mode === 'historical')
        ? 24
        : 1
    return coveredHours(task, Date.parse(time), duration).every((hour) =>
      stationAvailable(variable, station, new Date(hour).toISOString()),
    )
  }
  function missing() {
    return unavailable(
      variable === 'wind' ? 'MISSING_COMPONENT' : 'MISSING_DATA',
      'A required reference station sample is missing; no zero fill, reweighting or extrapolation is applied.',
    )
  }
  function samples<T extends { value: number }>(
    evaluate: (support: ObservationSupport, time: string) => T | Unavailable,
  ): Array<ResultValue & T> | Unavailable {
    const values = []
    for (const rawTime of query.times) {
      const time = new Date(rawTime).toISOString()
      for (const point of query.points) {
        let observation: ObservationSupport
        if (requested.observationMode === 'stations') {
          const matched =
            requested.kind === 'points' || requested.kind === 'time-series'
              ? nearestStation(point, (station) => supports(station, time))
              : { station: stationAt(point.longitude, point.latitude), distanceKm: 0 }
          if ('ok' in matched) return matched
          if (!supports(matched.station, time)) return missing()
          observation = { mode: 'stations', ...matched }
        } else {
          const stations = interpolationStations(point)
          if ('ok' in stations) return stations
          if (stations.some(({ station }) => !supports(station, time))) return missing()
          observation = { mode: 'interpolated', stations }
        }
        const value = evaluate(observation, time)
        if ('ok' in value) return value
        values.push({ ...point, time, ...value, observation })
      }
    }
    return values
  }
  if (task.configuration.variable === 'wind') {
    const values = samples((support, time) => observationWind(reference, support, time))
    if ('ok' in values) return withPlan(values)
    return {
      ...observationMetadata,
      variable: 'wind',
      quantity: 'U10/V10',
      unit: 'm/s',
      directionUnit: 'degrees',
      directionConvention: 'meteorological-from',
      values,
    }
  }
  if (task.configuration.variable === 'pressure') {
    const values = samples((support, time) => ({
      value: weightedStations(support, (station) => stationPressure(reference, station, time)),
    }))
    if ('ok' in values) return withPlan(values)
    return { ...observationMetadata, variable: 'pressure', quantity: 'MSL', unit: 'hPa', values }
  }
  if (task.configuration.variable === 'precipitation') {
    const duration =
      requested.temporalResolution === 'daily'
        ? 24
        : requested.temporalResolution === 'hourly'
          ? 1
          : task.configuration.timeRange.mode === 'historical'
            ? 24
            : 1
    const values = samples((support, time) => {
      const start = Date.parse(time)
      const hours = coveredHours(task, start, duration)
      if (!hours.length)
        return unavailable(
          'MISSING_DATA',
          'No reference rainfall intervals cover the requested time.',
        )
      let sumQuanta = 0
      for (const hour of hours) {
        sumQuanta += Math.round(
          weightedStations(support, (station) =>
            stationRain(reference, station, new Date(hour).toISOString()),
          ) * 10_000,
        )
      }
      return {
        value: sumQuanta / 10_000,
        accumulation: accumulationCoverage(start, duration, hours),
      }
    })
    if ('ok' in values) return withPlan(values)
    return {
      ...observationMetadata,
      variable: 'precipitation',
      quantity: 'TP',
      unit: 'mm',
      temporalStatistic: 'accumulation',
      values,
    }
  }
  if (requested.temporalResolution === 'daily') {
    const values = samples((support, time) => {
      const start = Date.parse(time)
      const hours = coveredHours(task, start, 24)
      if (!hours.length)
        return unavailable('MISSING_DATA', 'No hourly reference temperatures cover this UTC day.')
      const values = hours.map((hour) =>
        weightedStations(support, (station) =>
          stationTemperature(reference, station, new Date(hour).toISOString()),
        ),
      )
      return (
        dailyTemperatureSummary(start, values) ??
        unavailable(
          'MISSING_DATA',
          'A required hourly reference temperature is unavailable; a complete day cannot be reconstructed.',
        )
      )
    })
    if ('ok' in values) return withPlan(values)
    return {
      ...observationMetadata,
      variable: 'temperature',
      quantity: 'T2M',
      unit: '°C',
      temporalStatistic: 'daily-mean',
      values,
    }
  }
  const values = samples((support, time) => ({
    value: weightedStations(support, (station) => stationTemperature(reference, station, time)),
  }))
  if ('ok' in values) return values
  return {
    ...observationMetadata,
    variable: 'temperature',
    quantity: 'T2M',
    unit: '°C',
    temporalStatistic: 'instantaneous',
    values,
  }
}

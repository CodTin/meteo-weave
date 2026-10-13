import { windDiagnostics } from './wind-diagnostics'
import type { ObservationReference, ObservationStation, ObservationSupport } from './contracts'

export const roundObservation = (value: number) => Math.round(value * 10_000) / 10_000

/** V1 reference samples never receive the task seed, source, method, region or target grid. */
export function stationTemperature(
  reference: ObservationReference,
  station: ObservationStation,
  time: string,
) {
  const { longitude, latitude } = station
  const hours = (Date.parse(time) - Date.parse('2024-01-01T00:00:00Z')) / 3_600_000
  return roundObservation(
    20 -
      Math.abs(latitude) * 0.4 +
      2 * Math.sin((longitude * Math.PI) / 2) +
      4 * Math.sin((hours * Math.PI) / 12) +
      3 * Math.sin((Math.floor(hours / 24) * 2 * Math.PI) / 365.25) +
      (reference.referenceSeed - 1729) / 0xffff_ffff,
  )
}

export function weightedStations(
  support: ObservationSupport,
  valueAt: (station: ObservationStation) => number,
) {
  const stations =
    support.mode === 'stations' ? [{ station: support.station, weight: 1 }] : support.stations
  return roundObservation(
    stations.reduce((sum, { station, weight }) => sum + weight * valueAt(station), 0),
  )
}

export function observationWind(
  reference: ObservationReference,
  support: ObservationSupport,
  time: string,
) {
  const hours = (Date.parse(time) - Date.parse('2024-01-01T00:00:00Z')) / 3_600_000
  const phase = (reference.referenceSeed - 1729) / 0xffff_ffff
  const u10 = weightedStations(support, ({ longitude }) =>
    roundObservation(
      3 * Math.cos((longitude * Math.PI) / 2) +
        Math.sin((hours * Math.PI) / 12) +
        Math.sin((hours * 2 * Math.PI) / (24 * 365.25)) +
        phase,
    ),
  )
  const v10 = weightedStations(support, ({ latitude }) =>
    roundObservation(
      4 * Math.cos((latitude * Math.PI) / 2) + 2 * Math.sin((hours * Math.PI) / 12) + phase,
    ),
  )
  return windDiagnostics(u10, v10)
}

export function stationPressure(
  reference: ObservationReference,
  station: ObservationStation,
  time: string,
) {
  const days = (Date.parse(time) - Date.parse('2024-01-01T00:00:00Z')) / 86_400_000
  return roundObservation(
    1013.25 +
      2 * Math.sin((station.longitude * Math.PI) / 2) -
      0.1 * Math.abs(station.latitude) +
      5 * Math.sin((days * 2 * Math.PI) / 365.25) +
      (reference.referenceSeed - 1729) / 0xffff_ffff,
  )
}

/** Hourly increments, not cumulative counters; six wet hours per UTC day in this v1 demo. */
export function stationRain(
  reference: ObservationReference,
  station: ObservationStation,
  time: string,
) {
  const hour = new Date(time).getUTCHours()
  if (hour < 6 || hour >= 12) return 0
  return roundObservation(
    2 *
      Math.max(0, Math.cos((station.latitude * Math.PI) / 2)) *
      (1 + Math.sin((station.longitude * Math.PI) / 2) ** 2) *
      (1 + (reference.referenceSeed - 1729) / 0xffff_ffff),
  )
}

/** Fixed v1 reference outages, including missing U10 (not a calm or scalar zero). */
export function stationAvailable(
  variable: 'temperature' | 'wind' | 'pressure' | 'precipitation',
  station: ObservationStation,
  time: string,
) {
  const gapHour = { temperature: 6, wind: 12, pressure: 8, precipitation: 4 }[variable]
  return !(
    station.longitude >= 20 &&
    station.longitude <= 25 &&
    station.latitude >= 65 &&
    station.latitude <= 70 &&
    new Date(time).getUTCHours() === gapHour
  )
}

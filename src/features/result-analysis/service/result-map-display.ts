import type {
  ResultMapData,
  ResultMapDisplaySettings,
  ResultMapKind,
  ResultMapSample,
} from '../types/result-map'
import { computeDivergingScale, computeSharedScale } from './comparison-data'
import { getAbsoluteColorScale, getDifferenceColorScale } from './color-scales'

export const resultMapTitles: Record<ResultMapKind, string> = {
  original: 'Original Data',
  downscaled: 'Downscaled Data',
  observation: 'Observation Data',
  difference: 'Difference (Downscaled - Original)',
}

export function resultMapDisplaySettings(
  data: ResultMapData,
): Record<ResultMapKind, ResultMapDisplaySettings> {
  const absolute = getAbsoluteColorScale(data.variable)
  const difference = getDifferenceColorScale()
  const bounds = computeSharedScale(
    ['original', 'downscaled', 'observation'].map((kind) =>
      data.layers[kind as ResultMapKind].samples.map((sample) => sample.value),
    ),
  )
  if (data.variable === 'wind' || data.variable === 'precipitation') bounds.min = 0
  if (bounds.max <= bounds.min) bounds.max = bounds.min + 1
  const settings = { ...bounds, ...absolute, unit: data.unit }
  const spread = data.layers.downscaled.ensemble?.kind === 'stddev'
  const spreadValues = data.layers.downscaled.samples.map((sample) => sample.value ?? 0)
  return {
    original: settings,
    observation: settings,
    downscaled: spread ? { ...settings, min: 0, max: Math.max(1, ...spreadValues) } : settings,
    difference: {
      ...computeDivergingScale(data.layers.difference.samples.map((sample) => sample.value)),
      ...difference,
      unit: data.unit,
    },
  }
}

export function resultSampleColor(value: number | null, display: ResultMapDisplaySettings) {
  if (value === null || !Number.isFinite(value)) return '#64748b'
  const fraction = Math.max(0, Math.min(1, (value - display.min) / (display.max - display.min)))
  return (
    display.colors[
      Math.min(display.colors.length - 1, Math.floor(fraction * display.colors.length))
    ] ?? '#64748b'
  )
}

export function resultSampleLabel(sample: ResultMapSample, unit: string) {
  const station =
    sample.observation?.mode === 'stations' ? `${sample.observation.station.id} · ` : ''
  const value =
    sample.value === null
      ? `missing (${sample.unavailable?.code ?? 'unavailable'})`
      : `${sample.value} ${unit}`
  const wind =
    sample.directionStatus === 'calm'
      ? ' · calm, no direction'
      : sample.fromDirection !== undefined && sample.fromDirection !== null
        ? ` · from ${sample.fromDirection}° · U10 ${sample.u10}, V10 ${sample.v10}`
        : ''
  return `${station}longitude ${sample.longitude}, latitude ${sample.latitude} · ${sample.time} · ${value}${wind}`
}

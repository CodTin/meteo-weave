import type {
  ResultMapColorStop,
  ResultMapData,
  ResultMapDisplaySettings,
  ResultMapKind,
  ResultMapSample,
} from '../types/result-map'
import { getAbsoluteColorScale, getDifferenceColorScale, type Variable } from './color-scales'
import { validateResultMapRange, type ResultMapRangeInput } from './result-map-display-validation'

export const resultMapTitles: Record<ResultMapKind, string> = {
  original: 'Original Data',
  downscaled: 'Downscaled Data',
  observation: 'Observation Data',
  difference: 'Difference (Downscaled - Original)',
}

/** Immutable project standards, never replaced by a custom draft. */
export function resultMapStandardPalette(variable: Variable, kind: ResultMapKind = 'original') {
  const palette =
    kind === 'difference' ? getDifferenceColorScale() : getAbsoluteColorScale(variable)
  Object.freeze(palette.colors)
  return Object.freeze(palette)
}

const absoluteKinds = ['original', 'downscaled', 'observation'] as const
const quantities = { temperature: 'T2M', pressure: 'MSL', precipitation: 'TP', wind: 'U10/V10' }

function layerContext(data: ResultMapData, kind: ResultMapKind) {
  const explicit = data.layers[kind].displayContext
  const variable = explicit?.variable ?? data.variable
  return {
    variable,
    unit: explicit?.unit ?? data.unit,
    quantity: explicit?.quantity ?? quantities[variable],
    temporalStatistic:
      explicit?.temporalStatistic ??
      (variable === 'precipitation' ? 'accumulation' : 'instantaneous'),
  }
}

function accumulationContext(samples: ResultMapSample[]) {
  const intervals = samples
    .filter((sample) => sample.accumulation)
    .map((sample) => {
      const interval = sample.accumulation!
      return JSON.stringify([
        interval.start,
        interval.end,
        interval.requestedStart,
        interval.requestedEnd,
        interval.bounds,
        interval.sampledHours,
        interval.expectedHours,
        interval.complete,
      ])
    })
  return [...new Set(intervals)].sort().join('|')
}

function compatibleLevels(data: ResultMapData, left: ResultMapKind, right: ResultMapKind) {
  const a = layerContext(data, left)
  const b = layerContext(data, right)
  return (
    a.variable === b.variable &&
    a.unit === b.unit &&
    a.quantity === b.quantity &&
    a.temporalStatistic === b.temporalStatistic &&
    accumulationContext(data.layers[left].samples) ===
      accumulationContext(data.layers[right].samples) &&
    data.layers[left].ensemble?.kind !== 'stddev' &&
    data.layers[right].ensemble?.kind !== 'stddev'
  )
}

function sampleCounts(samples: ResultMapSample[]) {
  return {
    finiteCount: samples.filter((sample) => sample.value !== null && Number.isFinite(sample.value))
      .length,
    missingCount: samples.filter((sample) => sample.value === null).length,
    nonfiniteCount: samples.filter(
      (sample) => sample.value !== null && !Number.isFinite(sample.value),
    ).length,
  }
}

function finiteDomain(samples: ResultMapSample[]) {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const sample of samples) {
    if (sample.value !== null && Number.isFinite(sample.value)) {
      min = Math.min(min, sample.value)
      max = Math.max(max, sample.value)
    }
  }
  if (!Number.isFinite(min)) return { min: 0, max: 0, domain: 'empty' as const }
  return {
    min,
    max,
    dataMin: min,
    dataMax: max,
    domain: min === max ? ('constant' as const) : ('range' as const),
  }
}

export function resultMapDisplaySettings(
  data: ResultMapData,
): Record<ResultMapKind, ResultMapDisplaySettings> {
  const absolute = (kind: (typeof absoluteKinds)[number]): ResultMapDisplaySettings => {
    const context = layerContext(data, kind)
    const spread = data.layers[kind].ensemble?.kind === 'stddev'
    const peers = spread
      ? [kind]
      : absoluteKinds.filter((peer) => compatibleLevels(data, kind, peer))
    const peerSamples = peers.flatMap((peer) => data.layers[peer].samples)
    const bounds = finiteDomain(peerSamples)
    return {
      ...bounds,
      ...resultMapStandardPalette(context.variable),
      unit: context.unit,
      mode: 'automatic',
      kind: 'absolute',
      nonnegative: spread || context.variable === 'wind' || context.variable === 'precipitation',
      rangeGroup: `${context.variable}:${context.unit}:${context.quantity}:${context.temporalStatistic}:${spread ? 'spread' : peers.length > 1 ? 'levels' : kind}`,
      groupLabel: spread
        ? 'Downscaled spread range'
        : peers.length > 1
          ? 'Absolute maps range'
          : `${resultMapTitles[kind]} range`,
      basis:
        bounds.domain === 'empty'
          ? 'No finite values in current comparable layers; no numeric scale. Missing/nonfinite slots remain visible.'
          : spread
            ? 'Independent finite range: Standard Deviation (ensemble spread), not comparable to forecast levels.'
            : peers.length > 1
              ? `Current-frame finite union of ${peers.map((peer) => resultMapTitles[peer]).join(', ')}; compatible variable, unit, quantity and statistic; missing/nonfinite slots excluded and counted.`
              : 'Independent finite range: incompatible variable, unit, quantity, statistic or accumulation coverage; camera synchronization does not imply a shared range.',
      ...sampleCounts(data.layers[kind].samples),
    }
  }
  const difference = finiteDomain(data.layers.difference.samples)
  const magnitude = Math.max(Math.abs(difference.min), Math.abs(difference.max))
  return {
    original: absolute('original'),
    downscaled: absolute('downscaled'),
    observation: absolute('observation'),
    difference: {
      ...difference,
      ...(magnitude > 0 ? { min: -magnitude, max: magnitude } : {}),
      ...resultMapStandardPalette(data.variable, 'difference'),
      unit: data.unit,
      mode: 'automatic',
      kind: 'difference',
      rangeGroup: `${data.variable}:${data.unit}:difference`,
      groupLabel: 'Difference range',
      symmetricZero: true,
      basis:
        difference.domain !== 'empty'
          ? 'Symmetric zero-centered Difference range from finite current-frame differences.'
          : 'No finite values; no numeric scale for Difference.',
      ...sampleCounts(data.layers.difference.samples),
    },
  }
}

/** UI text only: never use the formatted string to normalize or alter a sample. */
export function formatResultMapBound(value: number) {
  if (!Number.isFinite(value)) return 'unavailable'
  const magnitude = Math.abs(value)
  return magnitude > 0 && (magnitude < 1e-6 || magnitude >= 1e9)
    ? String(Number(value.toPrecision(6)))
    : String(Number(value.toFixed(6)))
}

/** The same sign-preserving palette segment is used by scalar coloring and the legend. */
export function resultMapRangeColors(display: ResultMapDisplaySettings) {
  const stops = resultMapRangeStops(display)
  if (stops) return stops.map((stop) => stop.color)
  if (display.kind !== 'difference') return display.colors
  const middle = Math.floor(display.colors.length / 2)
  if (display.min >= 0 && display.max > 0)
    return display.colors.slice(middle + (display.min > 0 ? 1 : 0))
  if (display.max <= 0 && display.min < 0)
    return display.colors.slice(0, middle + (display.max === 0 ? 1 : 0))
  return display.colors
}

/** Effective display-domain stops: one rule shared by scalar interpolation and the legend. */
export function resultMapRangeStops(
  display: ResultMapDisplaySettings,
): readonly ResultMapColorStop[] | undefined {
  const stops = display.colorStops
  if (!stops || display.kind !== 'difference' || display.min === display.max) return stops
  const crossesZero = display.min < 0 && display.max > 0
  const start = display.min >= 0 ? 0.5 + (0.5 * display.min) / display.max : 0
  const end = display.max <= 0 ? 0.5 * (1 - display.max / display.min) : 1
  const positions = [
    start,
    ...stops
      .filter((stop) => stop.position > start && stop.position < end)
      .map((stop) => stop.position),
    end,
  ]
  const effective: ResultMapColorStop[] = []
  const zero = normalizedRangePosition(0, display)
  function append(position: number) {
    effective.push({
      position: crossesZero
        ? position <= 0.5
          ? 2 * position * zero
          : zero + (2 * position - 1) * (1 - zero)
        : (position - start) / (end - start),
      color: interpolateStopColor(position, stops!),
    })
  }
  for (const [index, position] of positions.entries()) {
    if (index > 0 && positions[index - 1]! < 0.5 && position > 0.5) append(0.5)
    append(position)
  }
  return effective
}

function normalizedRangePosition(value: number, display: ResultMapDisplaySettings) {
  const scale = Math.max(Math.abs(display.min), Math.abs(display.max))
  return (value / scale - display.min / scale) / (display.max / scale - display.min / scale)
}

function interpolateStopColor(position: number, stops: readonly ResultMapColorStop[]) {
  const upper = stops.findIndex((stop) => stop.position >= position)
  if (upper <= 0) return stops[upper === 0 ? 0 : stops.length - 1]!.color
  const left = stops[upper - 1]!
  const right = stops[upper]!
  const fraction = (position - left.position) / (right.position - left.position)
  return (
    '#' +
    [1, 3, 5]
      .map((offset) => {
        const from = Number.parseInt(left.color.slice(offset, offset + 2), 16)
        const to = Number.parseInt(right.color.slice(offset, offset + 2), 16)
        return Math.round(from + (to - from) * fraction)
          .toString(16)
          .padStart(2, '0')
      })
      .join('')
  )
}

export function resultSampleColor(value: number | null, display: ResultMapDisplaySettings) {
  if (value === null || !Number.isFinite(value)) return '#64748b'
  if (display.domain === 'empty') return '#64748b'
  if (display.min === display.max && display.colorStops)
    return interpolateStopColor(0.5, display.colorStops)
  if (display.min === display.max)
    return display.colors[Math.floor(display.colors.length / 2)] ?? '#64748b'
  const clipped = Math.max(display.min, Math.min(display.max, value))
  const scale = Math.max(Math.abs(display.min), Math.abs(display.max))
  const colors = resultMapRangeColors(display)
  const fraction =
    display.kind === 'difference' && display.min < 0 && display.max > 0
      ? clipped === 0
        ? 0.5
        : clipped < 0
          ? (0.5 * (clipped - display.min)) / -display.min
          : 0.5 + (0.5 * clipped) / display.max
      : (clipped / scale - display.min / scale) / (display.max / scale - display.min / scale)
  if (display.colorStops)
    return interpolateStopColor(
      normalizedRangePosition(clipped, display),
      resultMapRangeStops(display)!,
    )
  return colors[Math.min(colors.length - 1, Math.floor(fraction * colors.length))] ?? '#64748b'
}

export function resultSampleLabel(sample: ResultMapSample, unit: string) {
  const station =
    sample.observation?.mode === 'stations' ? `${sample.observation.station.id} · ` : ''
  const value =
    sample.value === null || !Number.isFinite(sample.value)
      ? `missing (${sample.value !== null ? 'nonfinite' : (sample.unavailable?.code ?? 'unavailable')})`
      : `${sample.value} ${unit}`
  const wind =
    sample.directionStatus === 'calm'
      ? ' · calm, no direction'
      : sample.fromDirection !== undefined && sample.fromDirection !== null
        ? ` · from ${sample.fromDirection}° · U10 ${sample.u10}, V10 ${sample.v10}`
        : ''
  return `${station}longitude ${sample.longitude}, latitude ${sample.latitude} · ${sample.time} · ${value}${wind}`
}

/** A rejected edit returns no replacement; callers retain the last accepted mapping. */
export function applyResultMapRange(display: ResultMapDisplaySettings, input: ResultMapRangeInput) {
  const result = validateResultMapRange(input, {
    nonnegative: display.nonnegative,
    difference: display.kind === 'difference',
  })
  if (!result.ok) return result
  return {
    ok: true as const,
    display: { ...display, ...result.range, mode: 'manual' as const, domain: 'range' as const },
  }
}

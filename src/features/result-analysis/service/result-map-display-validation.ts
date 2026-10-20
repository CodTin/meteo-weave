import type { ResultMapColorStop } from '../types/result-map'

/** Public presentation validation. Never accepts or rewrites scientific values. */
export type ResultMapRangeInput = {
  min: number | string
  max: number | string
  symmetricZero?: boolean
}
export type ResultMapRange = { min: number; max: number; symmetricZero: boolean }
export type ResultMapRangeValidation =
  | { ok: true; range: ResultMapRange }
  | { ok: false; error: string }

export function validateResultMapRange(
  input: ResultMapRangeInput,
  constraints: { nonnegative?: boolean; difference?: boolean } = {},
): ResultMapRangeValidation {
  const min =
    typeof input.min === 'string' && input.min.trim() === '' ? Number.NaN : Number(input.min)
  const max =
    typeof input.max === 'string' && input.max.trim() === '' ? Number.NaN : Number(input.max)
  if (!Number.isFinite(min) || !Number.isFinite(max))
    return { ok: false, error: '请输入有限数值 / Minimum and maximum must be finite numbers.' }
  if (min >= max)
    return { ok: false, error: '下限必须小于上限 / Minimum must be less than maximum.' }
  if (constraints.nonnegative && min < 0)
    return {
      ok: false,
      error: '绝对值下限不能为负 / Wind, precipitation and spread require a nonnegative minimum.',
    }
  const symmetricZero = constraints.difference === true && input.symmetricZero === true
  const magnitude = Math.max(Math.abs(min), Math.abs(max))
  return {
    ok: true,
    range: {
      min: symmetricZero ? -magnitude : min,
      max: symmetricZero ? magnitude : max,
      symmetricZero,
    },
  }
}

export type ResultMapPaletteInput = readonly { position: number | string; color: string }[]
export type ResultMapPaletteValidation =
  | { ok: true; stops: readonly ResultMapColorStop[] }
  | { ok: false; error: string }

export function validateResultMapPalette(input: ResultMapPaletteInput): ResultMapPaletteValidation {
  if (input.length < 3 || input.length > 5)
    return { ok: false, error: '需要 3–5 个停靠点 / Use 3–5 color stops.' }
  const stops = input.map((stop) => ({
    position:
      typeof stop.position === 'string' && stop.position.trim() === ''
        ? Number.NaN
        : Number(stop.position),
    color: stop.color,
  }))
  if (
    stops.some((stop) => !Number.isFinite(stop.position) || stop.position < 0 || stop.position > 1)
  )
    return {
      ok: false,
      error: '位置须为 0–1 有限数值 / Positions must be finite numbers between 0 and 1.',
    }
  if (stops[0]!.position !== 0 || stops[stops.length - 1]!.position !== 1)
    return { ok: false, error: '须覆盖两端 / First and last positions must be exactly 0 and 1.' }
  if (stops.some((stop, index) => index > 0 && stop.position <= stops[index - 1]!.position))
    return {
      ok: false,
      error: '位置须严格递增 / Positions must be strictly increasing; no duplicates or reordering.',
    }
  const badColor = stops.findIndex((stop) => !/^#[0-9a-fA-F]{6}$/.test(stop.color))
  if (badColor >= 0)
    return {
      ok: false,
      error: `停靠点 ${badColor + 1} / Stop ${badColor + 1}: use #RRGGBB (six hexadecimal digits, no alpha).`,
    }
  return { ok: true, stops: Object.freeze(stops.map((stop) => Object.freeze(stop))) }
}

import { resultMapStandardPalette } from './result-map-display'
import type { Variable } from './color-scales'
import type { ResultMapDisplaySettings, ResultMapKind } from '../types/result-map'
import {
  validateResultMapPalette,
  type ResultMapPaletteInput,
} from './result-map-display-validation'

/** Palette acceptance changes presentation only, never the data or numeric range. */
export function applyResultMapPalette(
  display: ResultMapDisplaySettings,
  input: ResultMapPaletteInput,
) {
  const result = validateResultMapPalette(input)
  if (!result.ok) return result
  return {
    ok: true as const,
    display: {
      ...display,
      colors: result.stops.map((stop) => stop.color),
      colorStops: result.stops,
      description: 'Custom palette',
    },
  }
}

/** Restore the exact project standard, independently of editable-stop count or range mode. */
export function restoreResultMapPalette(
  display: ResultMapDisplaySettings,
  variable: Variable,
  kind: ResultMapKind = display.kind === 'difference' ? 'difference' : 'original',
): ResultMapDisplaySettings {
  const standard = resultMapStandardPalette(variable, kind)
  return {
    ...display,
    colors: standard.colors,
    description: standard.description,
    colorStops: undefined,
  }
}

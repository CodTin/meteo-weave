import { useMemo, useState } from 'react'
import type { ResultMapData, ResultMapKind } from '../types/result-map'
import { applyResultMapRange, resultMapDisplaySettings } from '../service/result-map-display'
import type { ResultMapRange, ResultMapRangeInput } from '../service/result-map-display-validation'

/** The task-keyed composition owns these UI preferences; frame changes only update automatic data. */
export function useResultMapDisplay(data: ResultMapData) {
  const automatic = useMemo(() => resultMapDisplaySettings(data), [data])
  const [ranges, setRanges] = useState<Record<string, ResultMapRange>>({})
  const display = { ...automatic }
  for (const kind of ['original', 'downscaled', 'observation', 'difference'] as const) {
    const range = ranges[automatic[kind].rangeGroup!]
    if (range) {
      const applied = applyResultMapRange(automatic[kind], range)
      if (applied.ok) display[kind] = applied.display
    }
  }
  function applyRange(kind: ResultMapKind, input: ResultMapRangeInput) {
    const applied = applyResultMapRange(automatic[kind], input)
    if (!applied.ok) return applied
    setRanges((current) => ({
      ...current,
      [automatic[kind].rangeGroup!]: {
        min: applied.display.min,
        max: applied.display.max,
        symmetricZero: applied.display.symmetricZero === true,
      },
    }))
    return { ok: true as const }
  }
  function restoreAutomatic(kind: ResultMapKind) {
    setRanges((current) => {
      const next = { ...current }
      delete next[automatic[kind].rangeGroup!]
      return next
    })
  }
  return { display, applyRange, restoreAutomatic }
}

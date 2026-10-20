import { useMemo } from 'react'
import type { ResultMapData } from '../types/result-map'
import { resultMapDisplaySettings } from '../service/result-map-display'

/** Display state is independent of camera and scientific request ownership. */
export function useResultMapDisplay(data: ResultMapData) {
  return useMemo(() => resultMapDisplaySettings(data), [data])
}

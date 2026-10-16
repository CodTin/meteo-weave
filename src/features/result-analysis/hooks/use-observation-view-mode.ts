import { useState } from 'react'
import type { ObservationViewMode } from '../types/observation-view-mode'
import { toggleObservationViewMode } from '../types/observation-view-mode'

/**
 * Hook for managing observation view mode state in result analysis.
 * Starts with 'interpolated' as the default view.
 */
export function useObservationViewMode() {
  const [mode, setMode] = useState<ObservationViewMode>('interpolated')

  const toggle = () => {
    setMode((current) => toggleObservationViewMode(current))
  }

  return { mode, toggle, setMode }
}

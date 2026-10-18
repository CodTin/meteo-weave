import { useState, useCallback } from 'react'

export type EnsembleView = 'mean' | 'stddev' | string // string for member IDs like 'member-01'

export function useEnsembleSelection(defaultView: EnsembleView = 'mean') {
  const [view, setView] = useState<EnsembleView>(defaultView)

  const selectView = useCallback((newView: EnsembleView) => {
    setView(newView)
  }, [])

  return {
    view,
    selectView,
  }
}

import { useLayoutEffect, useRef, useState } from 'react'
import type { ResultMapKind } from '../types/result-map'
import type { ResultMapComparisonLayout, ResultMapLayout } from '../types/result-map-layout'

/** View shape only. Camera, point, frame and display owners stay above the changing surfaces. */
export function useResultMapLayout() {
  const [layout, setLayout] = useState<ResultMapLayout>({ mode: '2×2' })
  const returnButton = useRef<HTMLButtonElement | null>(null)
  const expandButtons = useRef<Partial<Record<ResultMapKind, HTMLButtonElement | null>>>({})
  const returnFocus = useRef<ResultMapKind | null>(null)
  useLayoutEffect(() => {
    if (layout.mode === 'single') returnButton.current?.focus()
    else if (returnFocus.current) {
      expandButtons.current[returnFocus.current]?.focus()
      returnFocus.current = null
    }
  }, [layout])
  return {
    layout,
    returnButton,
    expandButtons,
    selectComparison: (mode: ResultMapComparisonLayout) => setLayout({ mode }),
    expand: (kind: ResultMapKind) => {
      if (layout.mode === 'single') return
      returnFocus.current = kind
      setLayout({ mode: 'single', kind, returnTo: layout.mode })
    },
    returnToComparison: () => {
      if (layout.mode === 'single') setLayout({ mode: layout.returnTo })
    },
  }
}

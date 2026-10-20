import { createContext, useContext, useState, type ReactNode } from 'react'
import type { DownscalingTask, ResultPoint } from '@/features/downscaling-tasks/service/contracts'
import type { ResultMapSelection, ResultMapSource } from '../service/result-map-data'
import { useResultMapPointQuery } from '../hooks/use-result-map-point-query'
import type { ResultMapPointQueryState } from '../types/result-map-point'

interface ResultMapPointContextValue {
  point: ResultPoint | null
  selectedPoint: ResultPoint | null
  selectPoint: (point: ResultPoint) => void
  clearPoint: () => void
  hoverPoint: (point: ResultPoint, mapId: string) => void
  clearHover: (mapId: string) => void
  query: ResultMapPointQueryState
  retry: () => void
}
const ResultMapPointContext = createContext<ResultMapPointContextValue | null>(null)

/** Selected coordinates survive same-task context changes; transient hover and old values do not. */
export function ResultMapPointProvider({
  source,
  task,
  selection,
  children,
}: {
  source: ResultMapSource
  task: DownscalingTask
  selection: ResultMapSelection
  children: ReactNode
}) {
  const [selectedPoint, setSelectedPoint] = useState<ResultPoint | null>(null)
  const key = JSON.stringify([task, selection])
  const [hover, setHover] = useState<{
    point: ResultPoint
    mapId: string
    key: string
    source: ResultMapSource
  } | null>(null)
  const point = hover?.key === key && hover.source === source ? hover.point : selectedPoint
  const { state: query, retry } = useResultMapPointQuery(source, task, selection, point)
  return (
    <ResultMapPointContext
      value={{
        point,
        selectedPoint,
        selectPoint: (next) => {
          setHover(null)
          setSelectedPoint(next)
        },
        clearPoint: () => {
          setHover(null)
          setSelectedPoint(null)
        },
        hoverPoint: (next, mapId) =>
          setHover((previous) =>
            previous?.key === key &&
            previous.source === source &&
            previous.mapId === mapId &&
            previous.point.longitude === next.longitude &&
            previous.point.latitude === next.latitude
              ? previous
              : { point: next, mapId, key, source },
          ),
        clearHover: (mapId) =>
          setHover((previous) => (previous?.mapId === mapId ? null : previous)),
        query,
        retry,
      }}
    >
      {children}
    </ResultMapPointContext>
  )
}

export function useResultMapPointContext() {
  return useContext(ResultMapPointContext)
}

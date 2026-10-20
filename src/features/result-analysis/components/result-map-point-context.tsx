import { createContext, useContext, useState, type ReactNode } from 'react'
import type { DownscalingTask, ResultPoint } from '@/features/downscaling-tasks/service/contracts'
import type { ResultMapSelection, ResultMapSource } from '../service/result-map-data'
import { useResultMapPointQuery } from '../hooks/use-result-map-point-query'
import type { ResultMapPointQueryState } from '../types/result-map-point'

interface ResultMapPointContextValue {
  task: DownscalingTask
  selection: ResultMapSelection
  pinnedPoint: ResultPoint | null
  pinnedQuery: ResultMapPointQueryState
  pinPoint: (point: ResultPoint) => void
  clearPinnedPoint: () => void
  retryPinned: () => void
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
  const taskKey = `${task.ownerId}:${task.id}`
  const [pin, setPin] = useState<{
    point: ResultPoint
    taskKey: string
    source: ResultMapSource
  } | null>(null)
  const pinnedPoint = pin?.taskKey === taskKey && pin.source === source ? pin.point : null
  const key = JSON.stringify([task, selection])
  const [hover, setHover] = useState<{
    point: ResultPoint
    mapId: string
    key: string
    source: ResultMapSource
  } | null>(null)
  const point = hover?.key === key && hover.source === source ? hover.point : selectedPoint
  const samePinnedPoint =
    !!point &&
    !!pinnedPoint &&
    point.longitude === pinnedPoint.longitude &&
    point.latitude === pinnedPoint.latitude
  // The fixed lane never follows hover. Share it when both identities are the same;
  // only differing transient coordinates use the second bounded #99 lane.
  const pinned = useResultMapPointQuery(source, task, selection, pinnedPoint)
  const transient = useResultMapPointQuery(source, task, selection, samePinnedPoint ? null : point)
  const { state: query, retry } = samePinnedPoint ? pinned : transient
  return (
    <ResultMapPointContext
      value={{
        task,
        selection,
        pinnedPoint,
        pinnedQuery: pinned.state,
        retryPinned: pinned.retry,
        pinPoint: (next) => {
          if (!Number.isFinite(next.longitude) || !Number.isFinite(next.latitude)) return
          setHover(null)
          setSelectedPoint(next)
          setPin({ point: next, taskKey, source })
        },
        clearPinnedPoint: () => setPin(null),
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

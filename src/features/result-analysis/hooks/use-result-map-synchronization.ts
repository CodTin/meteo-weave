import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ResultMapViewport } from '../types/result-map'
import type { ResultMapCameraMember } from '../types/result-map-camera-group'

const sameViewport = (left: ResultMapViewport, right: ResultMapViewport) =>
  left.longitude === right.longitude && left.latitude === right.latitude && left.zoom === right.zoom

type CameraState = {
  membership: string
  synchronized: boolean
  activeMapId: string | undefined
  viewports: Record<string, ResultMapViewport>
}

function reconcileMembers(
  current: CameraState,
  maps: readonly ResultMapCameraMember[],
  membership: string,
): CameraState {
  const activeMapId = maps.some((map) => map.mapId === current.activeMapId)
    ? current.activeMapId
    : maps[0]?.mapId
  const shared =
    (activeMapId ? current.viewports[activeMapId] : undefined) ?? maps[0]?.initialViewport
  return {
    ...current,
    membership,
    activeMapId,
    viewports: Object.fromEntries(
      maps.map((map) => [
        map.mapId,
        current.viewports[map.mapId] ?? {
          ...(current.synchronized ? (shared ?? map.initialViewport) : map.initialViewport),
        },
      ]),
    ),
  }
}

/** One camera owner for any number of controlled maps. No listeners, animation or scientific data. */
export function useResultMapSynchronization(maps: readonly ResultMapCameraMember[]) {
  const membership = JSON.stringify(maps.map((map) => map.mapId))
  const [snapshot, setState] = useState<CameraState>(() =>
    reconcileMembers(
      {
        membership,
        synchronized: true,
        activeMapId: undefined,
        viewports: {},
      },
      maps,
      membership,
    ),
  )
  // Reconcile before children render; changing frames/labels never resets accepted cameras.
  let state = snapshot
  if (snapshot.membership !== membership) {
    state = reconcileMembers(snapshot, maps, membership)
    setState(state)
  }
  const generation = useMemo(() => Symbol(membership), [membership])
  const lifetime = useRef<symbol | null>(null)
  useEffect(() => {
    lifetime.current = generation
    return () => {
      lifetime.current = null
    }
  }, [generation])
  const onViewportChange = useCallback(
    (viewport: ResultMapViewport, sourceMapId: string) => {
      if (
        lifetime.current !== generation ||
        ![viewport.longitude, viewport.latitude, viewport.zoom].every(Number.isFinite)
      )
        return
      setState((current) => {
        const sourceViewport = current.viewports[sourceMapId]
        if (
          lifetime.current !== generation ||
          current.membership !== membership ||
          !sourceViewport ||
          sameViewport(sourceViewport, viewport)
        )
          return current
        const accepted = { ...viewport }
        return {
          ...current,
          activeMapId: sourceMapId,
          viewports: current.synchronized
            ? Object.fromEntries(Object.keys(current.viewports).map((mapId) => [mapId, accepted]))
            : { ...current.viewports, [sourceMapId]: accepted },
        }
      })
    },
    [generation, membership],
  )
  const onActiveMapChange = useCallback(
    (sourceMapId: string) => {
      if (lifetime.current !== generation) return
      setState((current) =>
        lifetime.current !== generation ||
        current.membership !== membership ||
        !current.viewports[sourceMapId] ||
        current.activeMapId === sourceMapId
          ? current
          : { ...current, activeMapId: sourceMapId },
      )
    },
    [generation, membership],
  )
  const setSynchronized = useCallback(
    (synchronized: boolean) => {
      if (lifetime.current !== generation) return
      setState((current) => {
        if (
          lifetime.current !== generation ||
          current.membership !== membership ||
          current.synchronized === synchronized
        )
          return current
        const viewport = current.activeMapId && current.viewports[current.activeMapId]
        return {
          ...current,
          synchronized,
          viewports:
            synchronized && viewport
              ? Object.fromEntries(Object.keys(current.viewports).map((mapId) => [mapId, viewport]))
              : current.viewports,
        }
      })
    },
    [generation, membership],
  )
  return { ...state, onViewportChange, onActiveMapChange, setSynchronized }
}

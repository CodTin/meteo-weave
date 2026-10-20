import { useCallback, useId, type ReactNode } from 'react'
import { useResultMapSynchronization } from '../hooks/use-result-map-synchronization'
import type {
  ResultMapCameraControl,
  ResultMapCameraMember,
} from '../types/result-map-camera-group'

interface ResultMapCameraGroupProps {
  maps: readonly ResultMapCameraMember[]
  children: (camera: ResultMapCameraControl) => ReactNode
}

/** Reusable controlled camera composition, independent of map products and display scales. */
export function ResultMapCameraGroup({ maps, children }: ResultMapCameraGroupProps) {
  const camera = useResultMapSynchronization(maps)
  const summaryId = useId()
  const activeMap = maps.find((map) => map.mapId === camera.activeMapId)
  const viewport = activeMap && camera.viewports[activeMap.mapId]
  return (
    <div className="space-y-3">
      <fieldset className="min-w-0 space-y-2 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">Map camera synchronization</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={camera.synchronized}
            onChange={(event) => camera.setSynchronized(event.currentTarget.checked)}
            aria-describedby={summaryId}
          />
          Synchronize map cameras
        </label>
        <p id={summaryId} className="text-xs text-muted-foreground">
          {camera.synchronized
            ? 'Synchronization on · Pan and zoom align all participating maps.'
            : 'Synchronization off · Each map keeps its own camera.'}{' '}
          Re-enable to align from the active map. Variables, units and color scales stay
          independent.
        </p>
        <output
          aria-label="Active map camera"
          className="block break-words text-xs"
          aria-live="polite"
        >
          Active map: {activeMap?.label ?? 'None'}
          {viewport && (
            <>
              {' '}
              · longitude {viewport.longitude.toFixed(4)} · latitude {viewport.latitude.toFixed(4)}{' '}
              · zoom {viewport.zoom.toFixed(2)}
            </>
          )}
        </output>
      </fieldset>
      {children(camera)}
    </div>
  )
}

/** Local input adapter: React delegates wheel passively, so cancellable zoom stays on this node. */
export function ResultMapCameraInput({
  camera,
  mapId,
  children,
}: {
  camera: ResultMapCameraControl
  mapId: string
  children: ReactNode
}) {
  const viewport = camera.viewports[mapId]
  const { onViewportChange, onActiveMapChange } = camera
  const attachWheel = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return
      const wheel = (event: WheelEvent) => {
        const surface = event.target instanceof Element ? event.target.closest('svg') : null
        if (!surface || !node.contains(surface) || !viewport || event.deltaY === 0) return
        if (!event.ctrlKey && surface !== surface.ownerDocument.activeElement) return
        if (node.closest('[inert], [hidden], [aria-hidden="true"]')) return
        event.preventDefault()
        // Do not also reach the renderer's passive synthetic wheel handler.
        event.stopPropagation()
        onActiveMapChange(mapId)
        onViewportChange(
          {
            ...viewport,
            zoom: Math.max(0, Math.min(22, viewport.zoom + (event.deltaY > 0 ? -0.25 : 0.25))),
          },
          mapId,
        )
      }
      node.addEventListener('wheel', wheel, { passive: false })
      return () => node.removeEventListener('wheel', wheel)
    },
    [mapId, viewport, onViewportChange, onActiveMapChange],
  )
  return (
    <div
      ref={attachWheel}
      className="min-w-0"
      onFocusCapture={() => onActiveMapChange(mapId)}
      onPointerDownCapture={() => onActiveMapChange(mapId)}
    >
      {children}
    </div>
  )
}

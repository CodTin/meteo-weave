import type { ResultMapViewport } from './result-map'

/** Camera membership only; variables, units and display scales stay with each map. */
export type ResultMapCameraMember = {
  mapId: string
  label: string
  initialViewport: ResultMapViewport
}

export type ResultMapCameraControl = {
  viewports: Record<string, ResultMapViewport>
  onActiveMapChange: (sourceMapId: string) => void
  onViewportChange: (viewport: ResultMapViewport, sourceMapId: string) => void
}

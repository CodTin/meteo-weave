import { useEffect, useRef, type RefObject } from 'react'
import type { MapRef } from 'react-map-gl/mapbox'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import DrawRectangle from './draw-rectangle-mode'
import { rectangleBounds } from './geometry'
import type { BoundingBox } from './validation'

type RectangleDrawOptions = {
  mapRef: RefObject<MapRef | null>
  isLoaded: boolean
  drawingMode: boolean
  onRectangleDrawn?: (bbox: BoundingBox) => void
  onDrawingModeChange?: (enabled: boolean) => void
}

/** Both region-selection maps own one rectangle control and remove its listener on teardown. */
export function useRectangleDraw({
  mapRef,
  isLoaded,
  drawingMode,
  onRectangleDrawn,
  onDrawingModeChange,
}: RectangleDrawOptions) {
  const drawRef = useRef<MapboxDraw | null>(null)
  useEffect(() => {
    if (!isLoaded || !mapRef.current) return
    const map = mapRef.current.getMap()
    const draw = new MapboxDraw({
      displayControlsDefault: false,
      modes: { ...MapboxDraw.modes, draw_rectangle: DrawRectangle },
    })
    const onCreate = (event: { features?: GeoJSON.Feature[] }) => {
      const feature = event.features?.[0]
      const box = feature ? rectangleBounds(feature) : null
      if (!box) return
      draw.deleteAll()
      onDrawingModeChange?.(false)
      onRectangleDrawn?.(box)
    }
    map.addControl(draw, 'top-right')
    map.on('draw.create', onCreate)
    drawRef.current = draw
    return () => {
      drawRef.current = null
      map.off('draw.create', onCreate)
      if (map.hasControl(draw)) map.removeControl(draw)
    }
  }, [isLoaded, mapRef, onRectangleDrawn, onDrawingModeChange])

  useEffect(() => {
    const draw = drawRef.current
    if (!draw || !isLoaded) return
    draw.changeMode(drawingMode ? 'draw_rectangle' : 'simple_select')
    if (!drawingMode) draw.deleteAll()
  }, [drawingMode, isLoaded, onRectangleDrawn, onDrawingModeChange])
}

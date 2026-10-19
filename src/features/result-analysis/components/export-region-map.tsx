import { useEffect, useRef, useState } from 'react'
import Map, { Layer, Source } from 'react-map-gl/mapbox'
import type { MapRef } from 'react-map-gl/mapbox'
import { Button } from '@/components/ui/button'
import { bboxPolygon } from '@/features/spatial-region/geometry'
import { RegionMapPlaceholder } from '@/features/spatial-region/region-map-placeholder'
import { useRectangleDraw } from '@/features/spatial-region/use-rectangle-draw'
import 'mapbox-gl/dist/mapbox-gl.css'

import type { BBox } from '@/features/result-analysis/types/export'

interface ExportRegionMapProps {
  taskBounds: BBox
  exportBounds: BBox
  onBoundsChange: (bounds: BBox) => void
  mapboxToken?: string
}

export function ExportRegionMap({
  taskBounds,
  exportBounds,
  onBoundsChange,
  mapboxToken,
}: ExportRegionMapProps) {
  const [mapError, setMapError] = useState<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const mapRef = useRef<MapRef>(null)
  const [drawingMode, setDrawingMode] = useState(false)
  useRectangleDraw({
    mapRef,
    isLoaded,
    drawingMode,
    onRectangleDrawn: onBoundsChange,
    onDrawingModeChange: setDrawingMode,
  })

  // Calculate map center
  const viewState = {
    longitude: (taskBounds.west + taskBounds.east) / 2,
    latitude: (taskBounds.south + taskBounds.north) / 2,
    zoom: 8,
  }

  // Fit bounds on mount
  useEffect(() => {
    if (taskBounds && mapRef.current && isLoaded) {
      const map = mapRef.current.getMap()
      map.fitBounds(
        [
          [taskBounds.west, taskBounds.south],
          [taskBounds.east, taskBounds.north],
        ],
        {
          padding: 40,
          duration: 1000,
        },
      )
    }
  }, [taskBounds, isLoaded])

  const taskBoundsGeoJSON = bboxPolygon(taskBounds)
  const exportBoundsGeoJSON = bboxPolygon(exportBounds)
  if (!mapboxToken || mapError) return <RegionMapPlaceholder error={mapError} />

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        onClick={() => setDrawingMode((previous) => !previous)}
        aria-pressed={drawingMode}
      >
        {drawingMode ? '取消绘制导出区域' : '绘制导出区域'}
      </Button>
      {drawingMode && <p className="text-sm">在地图上拖动鼠标绘制矩形区域</p>}
      <div className="h-[400px] w-full rounded-lg overflow-hidden border">
        <Map
          ref={mapRef}
          {...viewState}
          mapboxAccessToken={mapboxToken}
          mapStyle="mapbox://styles/mapbox/outdoors-v12"
          onError={(e: { error?: { message?: string } }) => {
            setMapError(e.error?.message || '未知错误')
          }}
          onLoad={() => setIsLoaded(true)}
          attributionControl={true}
          style={{ width: '100%', height: '100%' }}
        >
          {/* Task bounds - gray outline */}
          <Source id="task-bounds" type="geojson" data={taskBoundsGeoJSON}>
            <Layer
              id="task-bounds-outline"
              type="line"
              paint={{
                'line-color': '#9ca3af',
                'line-width': 2,
                'line-dasharray': [2, 2],
              }}
            />
          </Source>

          {/* Export bounds - blue fill and outline */}
          <Source id="export-bounds" type="geojson" data={exportBoundsGeoJSON}>
            <Layer
              id="export-bounds-fill"
              type="fill"
              paint={{
                'fill-color': '#3b82f6',
                'fill-opacity': 0.2,
              }}
            />
            <Layer
              id="export-bounds-outline"
              type="line"
              paint={{
                'line-color': '#3b82f6',
                'line-width': 2,
              }}
            />
          </Source>
        </Map>
      </div>
    </div>
  )
}

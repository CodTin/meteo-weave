import { useEffect, useRef, useState } from 'react'
import Map, { Layer, Source } from 'react-map-gl/mapbox'
import type { MapRef } from 'react-map-gl/mapbox'
import type { BoundingBox } from './validation'
import { bboxPolygon } from './geometry'
import { RegionMapPlaceholder } from './region-map-placeholder'
import { useRectangleDraw } from './use-rectangle-draw'
import 'mapbox-gl/dist/mapbox-gl.css'

interface TerrainMapProps {
  bbox: BoundingBox | null
  mapboxToken?: string
  onRectangleDrawn?: (bbox: BoundingBox) => void
  drawingMode?: boolean
  onDrawingModeChange?: (enabled: boolean) => void
}

export function TerrainMap({
  bbox,
  mapboxToken,
  onRectangleDrawn,
  drawingMode = false,
  onDrawingModeChange,
}: TerrainMapProps) {
  const [mapError, setMapError] = useState<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const mapRef = useRef<MapRef>(null)
  useRectangleDraw({
    mapRef,
    isLoaded,
    drawingMode,
    onRectangleDrawn,
    onDrawingModeChange,
  })

  // Calculate map center and bounds from bbox
  const viewState = bbox
    ? {
        longitude: (bbox.west + bbox.east) / 2,
        latitude: (bbox.south + bbox.north) / 2,
        zoom: 8,
      }
    : {
        longitude: 0,
        latitude: 0,
        zoom: 1,
      }

  useEffect(() => {
    if (bbox && mapRef.current && isLoaded) {
      // Fit bounds to show the bbox
      const map = mapRef.current.getMap()
      map.fitBounds(
        [
          [bbox.west, bbox.south],
          [bbox.east, bbox.north],
        ],
        {
          padding: 40,
          duration: 1000,
        },
      )
    }
  }, [bbox, isLoaded])

  const rectangleGeoJSON = bbox ? bboxPolygon(bbox) : null
  if (!mapboxToken || mapError) return <RegionMapPlaceholder error={mapError} />

  return (
    <div className="h-[400px] w-full rounded-lg overflow-hidden border">
      <Map
        ref={mapRef}
        {...viewState}
        mapboxAccessToken={mapboxToken}
        mapStyle="mapbox://styles/mapbox/outdoors-v12"
        onError={(e: { error?: { message?: string } }) => {
          console.error('Map error:', e)
          setMapError(e.error?.message || '未知错误')
        }}
        onLoad={() => setIsLoaded(true)}
        attributionControl={true}
        style={{ width: '100%', height: '100%' }}
      >
        {rectangleGeoJSON && (
          <Source id="bbox-rectangle" type="geojson" data={rectangleGeoJSON}>
            <Layer
              id="bbox-fill"
              type="fill"
              paint={{
                'fill-color': '#3b82f6',
                'fill-opacity': 0.2,
              }}
            />
            <Layer
              id="bbox-outline"
              type="line"
              paint={{
                'line-color': '#3b82f6',
                'line-width': 2,
              }}
            />
          </Source>
        )}
      </Map>
    </div>
  )
}

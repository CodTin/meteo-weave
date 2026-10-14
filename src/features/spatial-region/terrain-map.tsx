import { useEffect, useRef, useState } from 'react'
import Map, { Layer, Source } from 'react-map-gl/mapbox'
import type { MapRef } from 'react-map-gl/mapbox'
import type { BoundingBox } from './validation'
import 'mapbox-gl/dist/mapbox-gl.css'

interface TerrainMapProps {
  bbox: BoundingBox | null
  mapboxToken?: string
}

export function TerrainMap({ bbox, mapboxToken }: TerrainMapProps) {
  const [mapError, setMapError] = useState<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const mapRef = useRef<MapRef>(null)

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

  // Create GeoJSON for the bbox rectangle
  const rectangleGeoJSON = bbox
    ? {
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [
            [
              [bbox.west, bbox.south],
              [bbox.east, bbox.south],
              [bbox.east, bbox.north],
              [bbox.west, bbox.north],
              [bbox.west, bbox.south],
            ],
          ],
        },
        properties: {},
      }
    : null

  if (!mapboxToken) {
    return (
      <div className="rounded-lg border bg-muted/30 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          地图不可用：未配置 Mapbox 公共访问令牌。您仍可通过坐标输入完成区域选择。
        </p>
      </div>
    )
  }

  if (mapError) {
    return (
      <div className="rounded-lg border bg-muted/30 p-6 text-center">
        <p className="text-sm text-muted-foreground">地图加载失败：{mapError}</p>
        <p className="text-sm text-muted-foreground">您仍可通过坐标输入完成区域选择。</p>
      </div>
    )
  }

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

import { useEffect, useRef, useState } from 'react'
import Map, { Layer, Source } from 'react-map-gl/mapbox'
import type { MapRef } from 'react-map-gl/mapbox'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import DrawRectangle from '@/features/spatial-region/draw-rectangle-mode'
import 'mapbox-gl/dist/mapbox-gl.css'

interface BBox {
  west: number
  east: number
  south: number
  north: number
}

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
  const drawRef = useRef<MapboxDraw | null>(null)
  const prevExportBoundsRef = useRef<BBox>(exportBounds)

  // Calculate map center
  const viewState = {
    longitude: (taskBounds.west + taskBounds.east) / 2,
    latitude: (taskBounds.south + taskBounds.north) / 2,
    zoom: 8,
  }

  // Initialize MapboxDraw
  useEffect(() => {
    if (!isLoaded || !mapRef.current) return

    const map = mapRef.current.getMap()

    if (!drawRef.current) {
      const draw = new MapboxDraw({
        displayControlsDefault: false,
        modes: {
          ...MapboxDraw.modes,
          draw_rectangle: DrawRectangle,
        },
        controls: {
          polygon: false,
          trash: false,
        },
      })

      map.addControl(draw, 'top-right')
      drawRef.current = draw

      // Handle rectangle creation
      map.on('draw.create', (e: any) => {
        if (e.features && e.features.length > 0) {
          const feature = e.features[0]
          const coords = feature.geometry.coordinates[0]

          const lngs = coords.map((c: number[]) => c[0])
          const lats = coords.map((c: number[]) => c[1])

          const drawnBbox: BBox = {
            west: Math.min(...lngs),
            east: Math.max(...lngs),
            south: Math.min(...lats),
            north: Math.max(...lats),
          }

          draw.deleteAll()
          onBoundsChange(drawnBbox)
        }
      })
    }

    return () => {
      if (drawRef.current && map) {
        try {
          map.removeControl(drawRef.current)
          drawRef.current = null
        } catch {
          // Control might already be removed
        }
      }
    }
  }, [isLoaded, onBoundsChange])

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

  // Update drawing when export bounds change from form input
  useEffect(() => {
    // Only update if bounds actually changed (to avoid infinite loops)
    const prev = prevExportBoundsRef.current
    if (
      prev.west === exportBounds.west &&
      prev.east === exportBounds.east &&
      prev.south === exportBounds.south &&
      prev.north === exportBounds.north
    ) {
      return
    }
    prevExportBoundsRef.current = exportBounds
  }, [exportBounds])

  // Create GeoJSON for task bounds (gray)
  const taskBoundsGeoJSON = {
    type: 'Feature' as const,
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [taskBounds.west, taskBounds.south],
          [taskBounds.east, taskBounds.south],
          [taskBounds.east, taskBounds.north],
          [taskBounds.west, taskBounds.north],
          [taskBounds.west, taskBounds.south],
        ],
      ],
    },
    properties: {},
  }

  // Create GeoJSON for export bounds (blue)
  const exportBoundsGeoJSON = {
    type: 'Feature' as const,
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [exportBounds.west, exportBounds.south],
          [exportBounds.east, exportBounds.south],
          [exportBounds.east, exportBounds.north],
          [exportBounds.west, exportBounds.north],
          [exportBounds.west, exportBounds.south],
        ],
      ],
    },
    properties: {},
  }

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
  )
}

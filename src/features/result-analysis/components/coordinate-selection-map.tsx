import { useEffect, useRef, useState } from 'react'
import Map, { Marker } from 'react-map-gl/mapbox'
import type { MapRef, MapLayerMouseEvent } from 'react-map-gl/mapbox'
import { MapPin } from 'lucide-react'
import type { Coordinate, Region } from '../service/time-series-data'
import 'mapbox-gl/dist/mapbox-gl.css'

interface CoordinateSelectionMapProps {
  region: Region
  selectedCoordinate: Coordinate | null
  onCoordinateSelect: (coordinate: Coordinate) => void
  onOutOfBounds: () => void
  mapboxToken?: string
}

export function CoordinateSelectionMap({
  region,
  selectedCoordinate,
  onCoordinateSelect,
  onOutOfBounds,
  mapboxToken,
}: CoordinateSelectionMapProps) {
  const [mapError, setMapError] = useState<string | null>(null)
  const mapRef = useRef<MapRef>(null)

  // Calculate map center from region
  const viewState = {
    longitude: (region.west + region.east) / 2,
    latitude: (region.south + region.north) / 2,
    zoom: 6,
  }

  const handleMapClick = (event: MapLayerMouseEvent) => {
    const { lng, lat } = event.lngLat

    // Check if clicked coordinate is within region
    if (lat >= region.south && lat <= region.north && lng >= region.west && lng <= region.east) {
      onCoordinateSelect({
        latitude: lat,
        longitude: lng,
      })
    } else {
      onOutOfBounds()
    }
  }

  // Fit map to region bounds on mount
  useEffect(() => {
    if (mapRef.current) {
      const map = mapRef.current.getMap()
      map.fitBounds(
        [
          [region.west, region.south],
          [region.east, region.north],
        ],
        {
          padding: 40,
          duration: 0,
        },
      )
    }
  }, [region])

  if (!mapboxToken) {
    return (
      <div className="flex h-[300px] w-full items-center justify-center rounded-lg border bg-muted/30">
        <p className="text-sm text-muted-foreground">地图功能需要 Mapbox Token</p>
      </div>
    )
  }

  if (mapError) {
    return (
      <div className="flex h-[300px] w-full items-center justify-center rounded-lg border bg-muted/30">
        <p className="text-sm text-muted-foreground">地图加载失败: {mapError}</p>
      </div>
    )
  }

  return (
    <div className="h-[300px] w-full overflow-hidden rounded-lg border">
      <Map
        ref={mapRef}
        initialViewState={viewState}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={mapboxToken}
        onClick={handleMapClick}
        onError={(e) => setMapError(e.error?.message || '未知错误')}
        cursor="crosshair"
        attributionControl={false}
      >
        {/* Region boundary */}
        <div
          style={{
            position: 'absolute',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />

        {/* Selected coordinate marker */}
        {selectedCoordinate && (
          <Marker
            longitude={selectedCoordinate.longitude}
            latitude={selectedCoordinate.latitude}
            anchor="bottom"
          >
            <div className="flex flex-col items-center">
              <MapPin className="size-8 fill-destructive text-destructive drop-shadow-lg" />
            </div>
          </Marker>
        )}
      </Map>
    </div>
  )
}

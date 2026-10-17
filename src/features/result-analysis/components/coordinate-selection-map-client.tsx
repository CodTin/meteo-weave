import { lazy, Suspense } from 'react'
import type { Coordinate, Region } from '../service/time-series-data'

const CoordinateSelectionMap = lazy(() =>
  import('./coordinate-selection-map').then((mod) => ({ default: mod.CoordinateSelectionMap })),
)

interface CoordinateSelectionMapClientProps {
  region: Region
  selectedCoordinate: Coordinate | null
  onCoordinateSelect: (coordinate: Coordinate) => void
  onOutOfBounds: () => void
}

export function CoordinateSelectionMapClient({
  region,
  selectedCoordinate,
  onCoordinateSelect,
  onOutOfBounds,
}: CoordinateSelectionMapClientProps) {
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN

  return (
    <Suspense
      fallback={
        <div className="flex h-[300px] w-full items-center justify-center rounded-lg border bg-muted/30">
          <p className="text-sm text-muted-foreground">地图加载中...</p>
        </div>
      }
    >
      <CoordinateSelectionMap
        region={region}
        selectedCoordinate={selectedCoordinate}
        onCoordinateSelect={onCoordinateSelect}
        onOutOfBounds={onOutOfBounds}
        mapboxToken={mapboxToken}
      />
    </Suspense>
  )
}

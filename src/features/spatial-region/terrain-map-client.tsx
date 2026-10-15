import { lazy, Suspense } from 'react'
import type { BoundingBox } from './validation'

const TerrainMap = lazy(() => import('./terrain-map').then((mod) => ({ default: mod.TerrainMap })))

interface TerrainMapClientProps {
  bbox: BoundingBox | null
  onRectangleDrawn?: (bbox: BoundingBox) => void
  drawingMode?: boolean
  onDrawingModeChange?: (enabled: boolean) => void
}

export function TerrainMapClient({
  bbox,
  onRectangleDrawn,
  drawingMode,
  onDrawingModeChange,
}: TerrainMapClientProps) {
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN

  return (
    <Suspense
      fallback={
        <div className="h-[400px] w-full rounded-lg border bg-muted/30 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">地图加载中...</p>
        </div>
      }
    >
      <TerrainMap
        bbox={bbox}
        mapboxToken={mapboxToken}
        onRectangleDrawn={onRectangleDrawn}
        drawingMode={drawingMode}
        onDrawingModeChange={onDrawingModeChange}
      />
    </Suspense>
  )
}

import { useState, useEffect } from 'react'
import type { BoundingBox } from './validation'

interface MapContainerProps {
  bbox: BoundingBox | null
}

export function MapContainer({ bbox }: MapContainerProps) {
  const [isClient, setIsClient] = useState(false)
  const [MapComponent, setMapComponent] = useState<any>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps -- client-side mount detection
    setIsClient(true)

    // Dynamically import the map component only on the client
    import('./terrain-map-client')
      .then((mod) => setMapComponent(() => mod.TerrainMapClient))
      .catch((err) => console.error('Failed to load map:', err))
  }, [])

  if (!isClient || !MapComponent) {
    return (
      <div className="h-[400px] w-full rounded-lg border bg-muted/30 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">地图加载中...</p>
      </div>
    )
  }

  return <MapComponent bbox={bbox} />
}

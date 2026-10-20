import type { ResultMapData, ResultMapDisplaySettings, ResultMapKind } from '../types/result-map'
import { resultMapViewport } from '../service/result-map-geometry'
import { resultMapTitles } from '../service/result-map-display'
import { ControlledResultMap } from './controlled-result-map'
import { ResultMapCard } from './result-map-card'
import { ResultMapCameraGroup, ResultMapCameraInput } from './result-map-camera-group'

interface ResultMapGridProps {
  data: ResultMapData
  display: Record<ResultMapKind, ResultMapDisplaySettings>
  onRetry: () => void
}

const kinds = ['original', 'downscaled', 'observation', 'difference'] as const

/** Shared camera policy; each product keeps its own scientific data and display settings. */
export function ResultMapGrid({ data, display, onRetry }: ResultMapGridProps) {
  const initialViewport = resultMapViewport(data.region)
  const maps = kinds.map((kind) => ({
    kind,
    mapId: `result-${encodeURIComponent(data.taskId)}-${kind}`,
    label: resultMapTitles[kind],
    initialViewport,
  }))
  return (
    <ResultMapCameraGroup maps={maps}>
      {(camera) => (
        <div
          className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2"
          aria-label="Result comparison maps"
        >
          {maps.map(({ kind, mapId }) => (
            <ResultMapCameraInput key={kind} camera={camera} mapId={mapId}>
              <ResultMapCard
                data={data.layers[kind]}
                context={data}
                display={display[kind]}
                onRetry={onRetry}
              >
                <ControlledResultMap
                  mapId={mapId}
                  data={data.layers[kind]}
                  region={data.region}
                  display={display[kind]}
                  viewport={camera.viewports[mapId]!}
                  onViewportChange={camera.onViewportChange}
                />
              </ResultMapCard>
            </ResultMapCameraInput>
          ))}
        </div>
      )}
    </ResultMapCameraGroup>
  )
}

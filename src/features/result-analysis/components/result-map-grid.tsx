import type { ResultMapData, ResultMapDisplaySettings, ResultMapKind } from '../types/result-map'
import { useResultMapLayout } from '../hooks/use-result-map-layout'
import { ResultMapLayoutControls } from './result-map-layout-controls'
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
  const layout = useResultMapLayout()
  const initialViewport = resultMapViewport(data.region)
  const maps = kinds.map((kind) => ({
    kind,
    mapId: `result-${encodeURIComponent(data.taskId)}-${kind}`,
    label: resultMapTitles[kind],
    initialViewport,
  }))
  return (
    <div className="@container min-w-0 space-y-3">
      <ResultMapLayoutControls
        layout={layout.layout}
        onSelect={layout.selectComparison}
        onReturn={layout.returnToComparison}
        returnButton={layout.returnButton}
      />
      <ResultMapCameraGroup maps={maps}>
        {(camera) => (
          <div
            className={`grid min-w-0 grid-cols-1 gap-4 ${
              layout.layout.mode === '2×2'
                ? '@min-[680px]:grid-cols-2'
                : layout.layout.mode === '1×4'
                  ? '@min-[1024px]:grid-cols-4'
                  : ''
            }`}
            aria-label="Result comparison maps"
          >
            {maps
              .filter(({ kind }) => layout.layout.mode !== 'single' || layout.layout.kind === kind)
              .map(({ kind, mapId }) => (
                <ResultMapCameraInput key={kind} camera={camera} mapId={mapId}>
                  <ResultMapCard
                    data={data.layers[kind]}
                    context={data}
                    display={display[kind]}
                    onRetry={onRetry}
                    onExpand={
                      layout.layout.mode === 'single' ? undefined : () => layout.expand(kind)
                    }
                    expandButton={(node) => {
                      layout.expandButtons.current[kind] = node
                    }}
                    compact={layout.layout.mode === '1×4'}
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
    </div>
  )
}

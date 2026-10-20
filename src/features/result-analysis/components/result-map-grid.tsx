import { useState } from 'react'
import type {
  ResultMapData,
  ResultMapDisplaySettings,
  ResultMapKind,
  ResultMapViewport,
} from '../types/result-map'
import { resultMapViewport } from '../service/result-map-geometry'
import { ControlledResultMap } from './controlled-result-map'
import { ResultMapCard } from './result-map-card'

interface ResultMapGridProps {
  data: ResultMapData
  display: Record<ResultMapKind, ResultMapDisplaySettings>
  onRetry: () => void
}

/** Per-map camera ownership. Synchronization/layout policy belongs to subsequent tickets. */
export function ResultMapGrid({ data, display, onRetry }: ResultMapGridProps) {
  const [viewports, setViewports] = useState<Record<ResultMapKind, ResultMapViewport>>(() => {
    const initial = resultMapViewport(data.region)
    return { original: initial, downscaled: initial, observation: initial, difference: initial }
  })
  return (
    <div
      className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2"
      aria-label="Result comparison maps"
    >
      {(['original', 'downscaled', 'observation', 'difference'] as const).map((kind) => (
        <ResultMapCard
          key={kind}
          data={data.layers[kind]}
          context={data}
          display={display[kind]}
          onRetry={onRetry}
        >
          <ControlledResultMap
            mapId={`result-${encodeURIComponent(data.taskId)}-${kind}`}
            data={data.layers[kind]}
            region={data.region}
            display={display[kind]}
            viewport={viewports[kind]}
            onViewportChange={(viewport) =>
              setViewports((current) => ({ ...current, [kind]: viewport }))
            }
          />
        </ResultMapCard>
      ))}
    </div>
  )
}

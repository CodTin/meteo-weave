import { Button } from '@/components/ui/button'
import { useResultMapCamera } from '../hooks/use-result-map-camera'
import type { ResultWindow } from '@/features/downscaling-tasks/service/contracts'
import type {
  ResultMapDisplaySettings,
  ResultMapLayer,
  ResultMapViewport,
} from '../types/result-map'
import { resultMapTitles } from '../service/result-map-display'
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  projectResultPoint,
  resultPointAtClientPosition,
} from '../service/result-map-geometry'
import { ResultMapCrosshair } from './result-map-crosshair'
import { useResultMapPointContext } from './result-map-point-context'
import { ResultMapMarks } from './result-map-marks'

interface ControlledResultMapProps {
  mapId: string
  viewport: ResultMapViewport
  onViewportChange: (viewport: ResultMapViewport, sourceMapId: string) => void
  data: ResultMapLayer
  region: ResultWindow
  display: ResultMapDisplaySettings
}

/** Controlled geographic display; camera and presentation cannot mutate scientific data. */
export function ControlledResultMap({
  mapId,
  viewport,
  onViewportChange,
  data,
  region,
  display,
}: ControlledResultMapProps) {
  const pointContext = useResultMapPointContext()
  const point = pointContext?.point ?? null
  const pointPixel = point ? projectResultPoint(point, viewport) : null
  const pointVisible =
    pointPixel &&
    Number.isFinite(pointPixel.x) &&
    Number.isFinite(pointPixel.y) &&
    pointPixel.x >= 0 &&
    pointPixel.x <= MAP_WIDTH &&
    pointPixel.y >= 0 &&
    pointPixel.y <= MAP_HEIGHT
  const title = resultMapTitles[data.kind]
  const patternId = `${mapId}-missing`
  const { zoom, pan, ...cameraEvents } = useResultMapCamera(viewport, (next) =>
    onViewportChange(next, mapId),
  )
  return (
    <section id={mapId} aria-label={`${title} map`} className="space-y-2">
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="block w-full cursor-grab touch-none rounded-md border bg-slate-950 focus:outline-2 focus:outline-primary"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- This geographic surface implements keyboard pan and zoom.
        tabIndex={0}
        {...cameraEvents}
        onPointerDown={(event) => {
          pointContext?.clearHover(mapId)
          cameraEvents.onPointerDown(event)
        }}
        onPointerMove={(event) => {
          cameraEvents.onPointerMove(event)
          if (event.buttons || event.currentTarget.hasPointerCapture(event.pointerId)) {
            pointContext?.clearHover(mapId)
            return
          }
          const next = resultPointAtClientPosition(
            event.currentTarget,
            { x: event.clientX, y: event.clientY },
            viewport,
          )
          if (next) pointContext?.hoverPoint(next, mapId)
          else pointContext?.clearHover(mapId)
        }}
        onPointerLeave={() => pointContext?.clearHover(mapId)}
        onPointerCancel={() => {
          cameraEvents.onPointerCancel()
          pointContext?.clearHover(mapId)
        }}
        onWheel={(event) => {
          if (event.ctrlKey || event.currentTarget === document.activeElement) {
            event.preventDefault()
            zoom(event.deltaY > 0 ? -0.25 : 0.25)
          }
        }}
        // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- SVG geographic layers cannot be replaced with an HTML fieldset.
        role="group"
        aria-label={`${title} geographic samples`}
      >
        <defs>
          <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="#475569" />
            <path d="M0 6 L6 0" stroke="#cbd5e1" strokeWidth="1" />
          </pattern>
        </defs>
        <ResultMapMarks
          data={data}
          region={region}
          viewport={viewport}
          display={display}
          missingPatternId={patternId}
        />
        {[0, 1, 2, 3, 4].map((index) => {
          const longitude = region.west + ((region.east - region.west) * index) / 4
          const latitude = region.south + ((region.north - region.south) * index) / 4
          const point = projectResultPoint({ longitude, latitude }, viewport)
          return (
            <g key={index} fill="#e2e8f0" fontSize="11">
              <path
                d={`M${point.x} 20 V${MAP_HEIGHT - 22} M34 ${point.y} H${MAP_WIDTH - 8}`}
                stroke="#cbd5e1"
                strokeOpacity="0.2"
              />
              <text x={point.x} y={MAP_HEIGHT - 7} textAnchor="middle">
                {longitude.toFixed(2)}°
              </text>
              <text x="4" y={point.y - 3}>
                {latitude.toFixed(2)}°
              </text>
            </g>
          )
        })}
        <ResultMapCrosshair point={point} viewport={viewport} />
      </svg>
      {point && (
        <output
          aria-label={`${title} point position`}
          className="block break-all font-mono text-xs"
        >
          longitude {String(point.longitude)} · latitude {String(point.latitude)} ·{' '}
          {pointVisible
            ? 'visible in this viewport'
            : 'outside this viewport; marker hidden; camera unchanged'}
        </output>
      )}
      <div className="flex flex-wrap gap-1" aria-label={`${title} camera controls`}>
        <Button
          size="sm"
          variant="outline"
          aria-label={`Zoom in ${title}`}
          onClick={() => zoom(0.5)}
        >
          +
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-label={`Zoom out ${title}`}
          onClick={() => zoom(-0.5)}
        >
          −
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-label={`Pan west ${title}`}
          onClick={() => pan(40, 0)}
        >
          ←
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-label={`Pan east ${title}`}
          onClick={() => pan(-40, 0)}
        >
          →
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-label={`Pan north ${title}`}
          onClick={() => pan(0, 40)}
        >
          ↑
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-label={`Pan south ${title}`}
          onClick={() => pan(0, -40)}
        >
          ↓
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Drag to pan · Focus map: arrow keys / + / − or wheel to zoom
      </p>
      <p className="text-xs text-muted-foreground">
        EPSG:4326 · Longitude / latitude projection · N ↑ · No terrain basemap
      </p>
      <output className="block font-mono text-xs" aria-label={`${title} viewport`}>
        longitude {viewport.longitude.toFixed(4)} · latitude {viewport.latitude.toFixed(4)} · zoom{' '}
        {viewport.zoom.toFixed(2)}
      </output>
    </section>
  )
}

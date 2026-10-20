import type { ResultWindow } from '@/features/downscaling-tasks/service/contracts'
import type {
  ResultMapDisplaySettings,
  ResultMapLayer,
  ResultMapViewport,
} from '../types/result-map'
import { nativeSampleBounds, projectResultPoint } from '../service/result-map-geometry'
import { resultSampleColor, resultSampleLabel } from '../service/result-map-display'

interface ResultMapMarksProps {
  data: ResultMapLayer
  region: ResultWindow
  viewport: ResultMapViewport
  display: ResultMapDisplaySettings
  missingPatternId: string
}

export function ResultMapMarks({
  data,
  region,
  viewport,
  display,
  missingPatternId,
}: ResultMapMarksProps) {
  const stationMode = data.kind === 'observation' && data.grid?.interpolation === 'nearest-station'
  const grid =
    data.grid && data.grid.sampling !== 'requested-points' ? data.grid.logicalGrid : undefined
  const northwest = projectResultPoint({ longitude: region.west, latitude: region.north }, viewport)
  const southeast = projectResultPoint({ longitude: region.east, latitude: region.south }, viewport)
  return (
    <>
      <rect
        x={northwest.x}
        y={northwest.y}
        width={southeast.x - northwest.x}
        height={southeast.y - northwest.y}
        fill="#172539"
        stroke="#94a3b8"
        strokeWidth="1"
      />
      {data.samples.map((sample) => {
        const point = projectResultPoint(sample, viewport)
        const label = resultSampleLabel(sample, display.unit)
        const fill =
          sample.value === null
            ? `url(#${missingPatternId})`
            : resultSampleColor(sample.value, display)
        const bounds = grid && !stationMode ? nativeSampleBounds(sample, grid) : undefined
        const topLeft =
          bounds && projectResultPoint({ longitude: bounds.west, latitude: bounds.north }, viewport)
        const bottomRight =
          bounds && projectResultPoint({ longitude: bounds.east, latitude: bounds.south }, viewport)
        const arrow =
          data.kind !== 'difference' &&
          data.ensemble?.kind !== 'stddev' &&
          sample.value !== null &&
          sample.directionStatus === 'available' &&
          sample.fromDirection !== null &&
          sample.fromDirection !== undefined
        return (
          <g
            key={`${sample.longitude},${sample.latitude},${sample.time},${sample.memberId ?? ''}`}
            // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- SVG sample geometry cannot be replaced by an HTML img.
            role="img"
            aria-label={label}
          >
            <title>{label}</title>
            {topLeft && bottomRight ? (
              <rect
                x={topLeft.x}
                y={topLeft.y}
                width={Math.max(0.5, bottomRight.x - topLeft.x)}
                height={Math.max(0.5, bottomRight.y - topLeft.y)}
                fill={fill}
                stroke="#172539"
                strokeWidth="0.35"
              />
            ) : (
              <circle
                cx={point.x}
                cy={point.y}
                r="5"
                fill={fill}
                stroke="#f8fafc"
                strokeWidth="1"
              />
            )}
            {grid && data.grid?.sampling === 'decimated-grid' && !stationMode && (
              <circle cx={point.x} cy={point.y} r="2" fill={fill} />
            )}
            {arrow && (
              <path
                d="M0 6 L0 -6 M-3 -2 L0 -6 L3 -2"
                transform={`translate(${point.x} ${point.y}) rotate(${(sample.fromDirection! + 180) % 360})`}
                fill="none"
                stroke="#f8fafc"
                strokeWidth="1.4"
              />
            )}
          </g>
        )
      })}
    </>
  )
}

import type { ResultPoint } from '@/features/downscaling-tasks/service/contracts'
import type { ResultMapViewport } from '../types/result-map'
import { MAP_HEIGHT, MAP_WIDTH, projectResultPoint } from '../service/result-map-geometry'

export function ResultMapCrosshair({
  point,
  viewport,
}: {
  point: ResultPoint | null
  viewport: ResultMapViewport
}) {
  if (!point || !Number.isFinite(point.longitude) || !Number.isFinite(point.latitude)) return null
  const pixel = projectResultPoint(point, viewport)
  if (pixel.x < 0 || pixel.x > MAP_WIDTH || pixel.y < 0 || pixel.y > MAP_HEIGHT) return null
  return (
    <g
      // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- An SVG geographic marker cannot be replaced with an HTML image.
      role="img"
      aria-label={`Shared crosshair · longitude ${point.longitude} · latitude ${point.latitude}`}
      transform={`translate(${pixel.x} ${pixel.y})`}
      pointerEvents="none"
    >
      <path d="M-11 0 H11 M0 -11 V11" stroke="#020617" strokeWidth="4" />
      <path d="M-11 0 H11 M0 -11 V11" stroke="#fef08a" strokeWidth="2" />
      <circle r="4" fill="none" stroke="#fef08a" strokeWidth="2" />
    </g>
  )
}

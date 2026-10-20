import type {
  LogicalGrid,
  ResultPoint,
  ResultWindow,
} from '@/features/downscaling-tasks/service/contracts'
import type { ResultMapViewport } from '../types/result-map'

export const MAP_WIDTH = 480
export const MAP_HEIGHT = 320
const degreesPerPixel = (zoom: number) => 360 / (256 * 2 ** zoom)

/** Plate carrée: longitude east/right, latitude north/up; no external tiles or engine auth. */
export function projectResultPoint(point: ResultPoint, viewport: ResultMapViewport) {
  const scale = degreesPerPixel(viewport.zoom)
  return {
    x: MAP_WIDTH / 2 + (point.longitude - viewport.longitude) / scale,
    y: MAP_HEIGHT / 2 - (point.latitude - viewport.latitude) / scale,
  }
}

export function resultMapViewport(region: ResultWindow): ResultMapViewport {
  const span = Math.max(
    (region.east - region.west) / (MAP_WIDTH - 64),
    (region.north - region.south) / (MAP_HEIGHT - 64),
    0.000001,
  )
  return {
    longitude: (region.west + region.east) / 2,
    latitude: (region.south + region.north) / 2,
    zoom: Math.log2(360 / (256 * span)),
  }
}

export function panResultViewport(viewport: ResultMapViewport, dx: number, dy: number) {
  const scale = degreesPerPixel(viewport.zoom)
  return {
    ...viewport,
    longitude: Math.max(-180, Math.min(180, viewport.longitude - dx * scale)),
    latitude: Math.max(-90, Math.min(90, viewport.latitude + dy * scale)),
  }
}

/** Native node-centered footprint; decimation never enlarges a node to fill unsampled gaps. */
export function nativeSampleBounds(point: ResultPoint, grid: LogicalGrid): ResultWindow {
  function edges(
    value: number,
    origin: number,
    spacing: number,
    count: number,
    low: number,
    high: number,
  ) {
    const index =
      value === high ? count - 1 : Math.min(count - 1, Math.round((value - origin) / spacing))
    const previous = Math.min(high, origin + Math.max(0, index - 1) * spacing)
    const next = Math.min(high, origin + Math.min(count - 1, index + 1) * spacing)
    return {
      low: index === 0 ? low : (previous + value) / 2,
      high: index === count - 1 ? high : (next + value) / 2,
    }
  }
  const x = edges(
    point.longitude,
    grid.origin.longitude,
    grid.spacingDegrees.longitude,
    grid.dimensions.columns,
    grid.extent.west,
    grid.extent.east,
  )
  const y = edges(
    point.latitude,
    grid.origin.latitude,
    grid.spacingDegrees.latitude,
    grid.dimensions.rows,
    grid.extent.south,
    grid.extent.north,
  )
  return { west: x.low, east: x.high, south: y.low, north: y.high }
}

/** Current responsive SVG bounds, xMidYMid meet letterboxing and viewBox, never captured size. */
export function resultPointAtClientPosition(
  svg: SVGSVGElement,
  client: { x: number; y: number },
  viewport: ResultMapViewport,
): ResultPoint | null {
  const box = svg.getBoundingClientRect()
  const style = getComputedStyle(svg)
  const left = parseFloat(style.borderLeftWidth) || 0
  const right = parseFloat(style.borderRightWidth) || 0
  const top = parseFloat(style.borderTopWidth) || 0
  const bottom = parseFloat(style.borderBottomWidth) || 0
  const width = box.width - left - right
  const height = box.height - top - bottom
  const viewBox = svg.viewBox.baseVal
  if (width <= 0 || height <= 0 || viewBox.width <= 0 || viewBox.height <= 0) return null
  const scale = Math.min(width / viewBox.width, height / viewBox.height)
  const x = (client.x - box.left - left - (width - viewBox.width * scale) / 2) / scale + viewBox.x
  const y = (client.y - box.top - top - (height - viewBox.height * scale) / 2) / scale + viewBox.y
  if (
    x < viewBox.x ||
    x > viewBox.x + viewBox.width ||
    y < viewBox.y ||
    y > viewBox.y + viewBox.height
  )
    return null
  const degrees = degreesPerPixel(viewport.zoom)
  return {
    longitude: viewport.longitude + (x - MAP_WIDTH / 2) * degrees,
    latitude: viewport.latitude - (y - MAP_HEIGHT / 2) * degrees,
  }
}

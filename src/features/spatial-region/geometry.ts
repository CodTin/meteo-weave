import { z } from 'zod'
import type { BoundingBox } from './validation'

export const bboxSchema = z
  .strictObject({
    west: z.number().min(-180).max(180),
    east: z.number().min(-180).max(180),
    south: z.number().min(-90).max(90),
    north: z.number().min(-90).max(90),
  })
  .refine((box) => box.east > box.west && box.north > box.south)

/** Export admission measures parallel width at the widest boundary, not a display-map distance. */
export function calculateBboxWidthKm(bbox: BoundingBox): number {
  const radians = Math.PI / 180
  return (
    6371 *
    radians *
    (bbox.east - bbox.west) *
    Math.max(Math.cos(bbox.north * radians), Math.cos(bbox.south * radians))
  )
}

export function calculateBboxHeightKm(bbox: BoundingBox): number {
  return 6371 * (Math.PI / 180) * (bbox.north - bbox.south)
}

export function isBboxWithinBounds(box: BoundingBox, bounds: BoundingBox): boolean {
  return (
    box.west >= bounds.west &&
    box.east <= bounds.east &&
    box.south >= bounds.south &&
    box.north <= bounds.north
  )
}

export function bboxPolygon(box: BoundingBox): GeoJSON.Feature<GeoJSON.Polygon> {
  const { west, east, south, north } = box
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
      ],
    },
    properties: {},
  }
}

export function rectangleBounds(feature: GeoJSON.Feature): BoundingBox | null {
  if (feature.geometry?.type !== 'Polygon') return null
  const ring = feature.geometry.coordinates[0]
  if (
    !ring?.length ||
    !ring.every(
      (position) =>
        position.length >= 2 && Number.isFinite(position[0]) && Number.isFinite(position[1]),
    )
  )
    return null
  const box = {
    west: Math.min(...ring.map((position) => position[0]!)),
    east: Math.max(...ring.map((position) => position[0]!)),
    south: Math.min(...ring.map((position) => position[1]!)),
    north: Math.max(...ring.map((position) => position[1]!)),
  }
  return box
}

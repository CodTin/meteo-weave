import { distance } from '@turf/turf'

export interface BoundingBox {
  west: number
  south: number
  east: number
  north: number
}

export interface ValidationErrors {
  [key: string]: string | undefined
  west?: string
  south?: string
  east?: string
  north?: string
}

export type ValidationResult =
  | { valid: true; bbox: BoundingBox }
  | { valid: false; errors: ValidationErrors }

export function validateBoundingBox(bbox: BoundingBox): ValidationResult {
  const errors: ValidationErrors = {}

  // Check for finite numbers
  if (!Number.isFinite(bbox.west)) {
    errors.west = '西经必须是有效数值'
  }
  if (!Number.isFinite(bbox.east)) {
    errors.east = '东经必须是有效数值'
  }
  if (!Number.isFinite(bbox.south)) {
    errors.south = '南纬必须是有效数值'
  }
  if (!Number.isFinite(bbox.north)) {
    errors.north = '北纬必须是有效数值'
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors }
  }

  // Check longitude bounds [-180, 180]
  if (bbox.west < -180 || bbox.west > 180) {
    errors.west = '西经必须在 -180 到 180 之间'
  }
  if (bbox.east < -180 || bbox.east > 180) {
    errors.east = '东经必须在 -180 到 180 之间'
  }

  // Check latitude bounds [-90, 90]
  if (bbox.south < -90 || bbox.south > 90) {
    errors.south = '南纬必须在 -90 到 90 之间'
  }
  if (bbox.north < -90 || bbox.north > 90) {
    errors.north = '北纬必须在 -90 到 90 之间'
  }

  // Check west < east (no dateline crossing)
  if (bbox.west >= bbox.east) {
    const message = '不支持跨日期变更线区域，西经必须小于东经'
    errors.west = message
    errors.east = message
  }

  // Check south < north
  if (bbox.south >= bbox.north) {
    errors.south = '南纬必须小于北纬'
    errors.north = '北纬必须大于南纬'
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors }
  }

  return { valid: true, bbox }
}

export interface RegionDimensions {
  widthKm: number
  heightKm: number
}

export function calculateRegionDimensions(bbox: BoundingBox): RegionDimensions {
  // Calculate width at the center latitude
  const centerLat = (bbox.north + bbox.south) / 2
  const westPoint: [number, number] = [bbox.west, centerLat]
  const eastPoint: [number, number] = [bbox.east, centerLat]
  const widthKm = distance(westPoint, eastPoint, { units: 'kilometers' })

  // Calculate height at the center longitude
  const centerLon = (bbox.west + bbox.east) / 2
  const southPoint: [number, number] = [centerLon, bbox.south]
  const northPoint: [number, number] = [centerLon, bbox.north]
  const heightKm = distance(southPoint, northPoint, { units: 'kilometers' })

  return { widthKm, heightKm }
}

import type { DownscalingTask, ResultQuery } from './contracts'

/** Pure v1 field, sampled on the declared lattice. No grid-sized allocation. */
export function temperatureAt(
  task: DownscalingTask,
  layer: ResultQuery['layer'],
  longitude: number,
  latitude: number,
  time: string,
) {
  const { region, resolution, dataSource } = task.configuration
  const spacingKm = layer === 'original' ? 10 : Number.parseInt(resolution)
  const longitudeKm =
    111.32 * Math.max(0.01, Math.cos(((region.south + region.north) * Math.PI) / 360))
  const dx = spacingKm / longitudeKm
  const dy = spacingKm / 111.32
  const x0 = region.west + Math.floor((longitude - region.west) / dx) * dx
  const y0 = region.south + Math.floor((latitude - region.south) / dy) * dy
  const x1 = Math.min(region.east, x0 + dx)
  const y1 = Math.min(region.north, y0 + dy)
  const x = x1 === x0 ? 0 : (longitude - x0) / (x1 - x0)
  const y = y1 === y0 ? 0 : (latitude - y0) / (y1 - y0)
  const days = Date.parse(time) / 86_400_000
  const phase = (task.dataSeed / 0xffff_ffff) * Math.PI * 2
  const sourceBias = { ecmwf: 0.8, gfs: -0.6, fusion: 0.2 }[dataSource]
  function field(lon: number, lat: number) {
    const broad =
      18 -
      0.35 * (lat - 30) +
      6 * Math.sin((days * 2 * Math.PI) / 365.25) +
      3 * Math.cos(days * 2 * Math.PI + (lon * Math.PI) / 180) +
      Math.sin(lon * 0.7 + lat * 0.4 + phase) +
      sourceBias
    return layer === 'original'
      ? broad
      : broad +
          1.8 * Math.sin(lon * 13 + phase) * Math.cos(lat * 11) +
          0.3 * Math.sin(days * 0.9 + phase)
  }
  const low = field(x0, y0) * (1 - x) + field(x1, y0) * x
  const high = field(x0, y1) * (1 - x) + field(x1, y1) * x
  return Math.round((low * (1 - y) + high * y) * 10_000) / 10_000
}

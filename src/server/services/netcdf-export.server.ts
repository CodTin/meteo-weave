import type { DownscalingTask } from '@/features/downscaling-tasks/service/contracts'
import { encodeNetCDF } from './netcdf-encoding.server'
import { queryTaskResult } from '@/features/downscaling-tasks/service/result-queries'

export interface NetCDFExportRequest {
  taskId: string
  layer: 'downscaled'
  variable?: 'temperature'
}

export interface NetCDFExportResult {
  ok: true
  data: Uint8Array
  filename: string
}

export interface NetCDFExportError {
  ok: false
  error: string
}

/**
 * Generate NetCDF file from task results
 */
export async function exportTaskAsNetCDF(
  task: DownscalingTask,
): Promise<NetCDFExportResult | NetCDFExportError> {
  // Validate task is completed
  if (task.status !== 'Completed') {
    return { ok: false, error: 'Task is not completed' }
  }

  // Validate variable support
  if (task.configuration.variable !== 'temperature') {
    return {
      ok: false,
      error: 'Only temperature variable is currently supported for NetCDF export',
    }
  }

  // Validate method support
  if (task.configuration.resolvedMethod !== 'deterministic') {
    return {
      ok: false,
      error: 'Only deterministic method is currently supported for NetCDF export',
    }
  }

  // Query grid data for the full time range and spatial extent
  const timeRange = task.configuration.timeRange
  const region = task.configuration.region

  // Get time steps
  const startTime = new Date(timeRange.start)
  const endTime = new Date(timeRange.end)
  const times: Date[] = []

  // Generate hourly time steps
  for (let t = startTime.getTime(); t <= endTime.getTime(); t += 3600000) {
    times.push(new Date(t))
  }

  // Query grid data
  const gridQuery = {
    kind: 'grid' as const,
    layer: 'downscaled' as const,
    window: region,
    times: times.map((t) => t.toISOString()),
    temporalResolution: 'hourly' as const,
  }

  const gridResult = queryTaskResult(task, gridQuery)

  if (!gridResult.ok) {
    return { ok: false, error: 'Failed to query grid data' }
  }

  // Extract unique coordinates from result points
  const latSet = new Set<number>()
  const lonSet = new Set<number>()

  for (const value of gridResult.values) {
    latSet.add(value.latitude)
    lonSet.add(value.longitude)
  }

  const latitudes = Array.from(latSet).sort((a, b) => a - b)
  const longitudes = Array.from(lonSet).sort((a, b) => a - b)

  // Build coordinate arrays
  const numTimes = times.length
  const numLats = latitudes.length
  const numLons = longitudes.length

  // Time coordinate in seconds since 1970-01-01 00:00:00
  const timeValues = new Float64Array(times.map((t) => t.getTime() / 1000))

  // Latitude and longitude
  const latValues = new Float32Array(latitudes)
  const lonValues = new Float32Array(longitudes)

  // Create lookup maps for efficient indexing
  const latIndex = new Map(latitudes.map((lat, i) => [lat, i]))
  const lonIndex = new Map(longitudes.map((lon, i) => [lon, i]))
  const timeIndex = new Map(times.map((t, i) => [t.toISOString(), i]))

  // Temperature data - build 3D array from result points
  const tempValues = new Float32Array(numTimes * numLats * numLons)
  tempValues.fill(-9999.0) // Fill with missing value

  // Populate temperature data
  for (const value of gridResult.values) {
    const t = timeIndex.get(value.time)
    const lat = latIndex.get(value.latitude)
    const lon = lonIndex.get(value.longitude)

    if (t !== undefined && lat !== undefined && lon !== undefined) {
      const idx = t * numLats * numLons + lat * numLons + lon
      tempValues[idx] = value.value
    }
  }

  // Build NetCDF encoding
  const encoding: Parameters<typeof encodeNetCDF>[0] = {
    dimensions: [
      { name: 'time', size: numTimes },
      { name: 'latitude', size: numLats },
      { name: 'longitude', size: numLons },
    ],
    variables: [
      {
        name: 'time',
        type: 'double' as const,
        dimensions: ['time'],
        attributes: {
          units: 'seconds since 1970-01-01 00:00:00',
          calendar: 'gregorian',
          long_name: 'Time',
        } as Record<string, string | number>,
        data: timeValues,
      },
      {
        name: 'latitude',
        type: 'float' as const,
        dimensions: ['latitude'],
        attributes: {
          units: 'degrees_north',
          long_name: 'Latitude',
        } as Record<string, string | number>,
        data: latValues,
      },
      {
        name: 'longitude',
        type: 'float' as const,
        dimensions: ['longitude'],
        attributes: {
          units: 'degrees_east',
          long_name: 'Longitude',
        } as Record<string, string | number>,
        data: lonValues,
      },
      {
        name: 'temperature',
        type: 'float' as const,
        dimensions: ['time', 'latitude', 'longitude'],
        attributes: {
          units: 'degrees_celsius',
          long_name: 'Temperature',
          _FillValue: -9999.0,
        } as Record<string, string | number>,
        data: tempValues,
      },
    ],
    globalAttributes: {
      title: 'Downscaled Temperature Data',
      taskId: task.id,
      generatorVersion: task.generatorVersion,
      dataSource: task.configuration.dataSource,
      variable: task.configuration.variable,
      method: task.configuration.resolvedMethod,
      resolution: task.configuration.resolution,
      created: new Date().toISOString(),
      source: 'Synthetic Demo Data',
    },
  }

  // Encode to NetCDF
  const netcdfData = encodeNetCDF(encoding)

  // Generate filename
  const dateStr = startTime.toISOString().split('T')[0]
  const filename = `task-${task.id}-temperature-downscaled-${dateStr}.nc`

  return {
    ok: true,
    data: netcdfData,
    filename,
  }
}

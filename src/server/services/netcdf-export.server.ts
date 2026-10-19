import type { DownscalingTask } from '@/features/downscaling-tasks/service/contracts'
import { encodeNetCDF } from './netcdf-encoding.server'
import { queryTaskResult } from '@/features/downscaling-tasks/service/result-queries'

export interface NetCDFExportRequest {
  taskId: string
  layers: Array<'downscaled' | 'observation'>
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
 * Helper to build a NetCDF result with only downscaled layer and no observations
 */
function buildDownscaledOnlyResult(
  task: DownscalingTask,
  dimensions: Array<{ name: string; size: number }>,
  variables: Parameters<typeof encodeNetCDF>[0]['variables'],
  includedLayers: string[],
  startTime: Date,
  observationNote: string,
): NetCDFExportResult {
  const encoding: Parameters<typeof encodeNetCDF>[0] = {
    dimensions,
    variables,
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
      layers: includedLayers.join(','),
      observation_coverage: observationNote,
    },
  }

  const netcdfData = encodeNetCDF(encoding)
  const dateStr = startTime.toISOString().split('T')[0]
  const filename = `task-${task.id}-temperature-downscaled-${dateStr}.nc`

  return {
    ok: true,
    data: netcdfData,
    filename,
  }
}

/**
 * Generate NetCDF file from task results
 */
export async function exportTaskAsNetCDF(
  task: DownscalingTask,
  request: { layers: Array<'downscaled' | 'observation'> },
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

  // Validate layers
  if (!request.layers.length) {
    return { ok: false, error: 'At least one layer must be specified' }
  }

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

  const dimensions: Array<{ name: string; size: number }> = [{ name: 'time', size: times.length }]
  const variables: Parameters<typeof encodeNetCDF>[0]['variables'] = []

  // Time coordinate in seconds since 1970-01-01 00:00:00
  const timeValues = new Float64Array(times.map((t) => t.getTime() / 1000))
  variables.push({
    name: 'time',
    type: 'double' as const,
    dimensions: ['time'],
    attributes: {
      units: 'seconds since 1970-01-01 00:00:00',
      calendar: 'gregorian',
      long_name: 'Time',
    } as Record<string, string | number>,
    data: timeValues,
  })

  const includedLayers: string[] = []

  // Handle downscaled grid layer
  if (request.layers.includes('downscaled')) {
    const gridQuery = {
      kind: 'grid' as const,
      layer: 'downscaled' as const,
      window: region,
      times: times.map((t) => t.toISOString()),
      temporalResolution: 'hourly' as const,
    }

    const gridResult = queryTaskResult(task, gridQuery)

    if (!gridResult.ok) {
      return { ok: false, error: 'Failed to query downscaled grid data' }
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

    const numLats = latitudes.length
    const numLons = longitudes.length

    // Add grid dimensions
    dimensions.push({ name: 'latitude', size: numLats })
    dimensions.push({ name: 'longitude', size: numLons })

    // Add coordinate variables
    variables.push({
      name: 'latitude',
      type: 'float' as const,
      dimensions: ['latitude'],
      attributes: {
        units: 'degrees_north',
        long_name: 'Latitude',
      } as Record<string, string | number>,
      data: new Float32Array(latitudes),
    })

    variables.push({
      name: 'longitude',
      type: 'float' as const,
      dimensions: ['longitude'],
      attributes: {
        units: 'degrees_east',
        long_name: 'Longitude',
      } as Record<string, string | number>,
      data: new Float32Array(longitudes),
    })

    // Create lookup maps for efficient indexing
    const latIndex = new Map(latitudes.map((lat, i) => [lat, i]))
    const lonIndex = new Map(longitudes.map((lon, i) => [lon, i]))
    const timeIndex = new Map(times.map((t, i) => [t.toISOString(), i]))

    // Temperature data - build 3D array from result points
    const tempValues = new Float32Array(times.length * numLats * numLons)
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

    variables.push({
      name: 'temperature_downscaled',
      type: 'float' as const,
      dimensions: ['time', 'latitude', 'longitude'],
      attributes: {
        units: 'degrees_celsius',
        long_name: 'Downscaled Temperature',
        _FillValue: -9999.0,
        source: 'Synthetic Demo - Downscaled',
      } as Record<string, string | number>,
      data: tempValues,
    })

    includedLayers.push('downscaled')
  }

  // Handle observation station layer
  if (request.layers.includes('observation')) {
    const stationQuery = {
      kind: 'grid' as const,
      layer: 'observation' as const,
      observationMode: 'stations' as const,
      window: region,
      times: times.map((t) => t.toISOString()),
      temporalResolution: 'hourly' as const,
    }

    const stationResult = queryTaskResult(task, stationQuery)

    if (!stationResult.ok) {
      // If there are no stations, include a note but continue if downscaled was requested
      if (request.layers.includes('downscaled')) {
        return buildDownscaledOnlyResult(
          task,
          dimensions,
          variables,
          includedLayers,
          startTime,
          'No observation stations available in region',
        )
      }
      return { ok: false, error: `Failed to query observation data: ${stationResult.error}` }
    }

    // Extract unique stations from observation results
    const stationMap = new Map<string, { id: string; latitude: number; longitude: number }>()

    for (const value of stationResult.values) {
      if (value.observation?.mode === 'stations') {
        const station = value.observation.station
        if (!stationMap.has(station.id)) {
          stationMap.set(station.id, {
            id: station.id,
            latitude: station.latitude,
            longitude: station.longitude,
          })
        }
      }
    }

    const stations = Array.from(stationMap.values())
    const numStations = stations.length

    if (numStations === 0) {
      // No stations found
      if (request.layers.includes('downscaled')) {
        return buildDownscaledOnlyResult(
          task,
          dimensions,
          variables,
          includedLayers,
          startTime,
          'No observation stations in selected region',
        )
      }
      return { ok: false, error: 'No observation stations available in the selected region' }
    }

    // Add station dimension
    dimensions.push({ name: 'station', size: numStations })

    // Add station coordinate variables
    const stationIds: string[] = []
    const stationLats = new Float32Array(numStations)
    const stationLons = new Float32Array(numStations)

    for (let i = 0; i < numStations; i++) {
      stationIds[i] = stations[i]!.id
      stationLats[i] = stations[i]!.latitude
      stationLons[i] = stations[i]!.longitude
    }

    // Store stationId as a packed string
    const maxIdLength = Math.max(...stationIds.map((id) => id.length))
    const stationIdData = new Uint8Array(numStations * maxIdLength)
    for (let i = 0; i < numStations; i++) {
      const id = stationIds[i]!
      for (let j = 0; j < id.length; j++) {
        stationIdData[i * maxIdLength + j] = id.charCodeAt(j)
      }
    }

    dimensions.push({ name: 'stationId_len', size: maxIdLength })

    variables.push({
      name: 'stationId',
      type: 'char' as const,
      dimensions: ['station', 'stationId_len'],
      attributes: {
        long_name: 'Station Identifier',
        description: 'Synthetic Demo reference station ID',
      } as Record<string, string | number>,
      data: stationIdData,
    })

    variables.push({
      name: 'station_latitude',
      type: 'float' as const,
      dimensions: ['station'],
      attributes: {
        units: 'degrees_north',
        long_name: 'Station Latitude',
      } as Record<string, string | number>,
      data: stationLats,
    })

    variables.push({
      name: 'station_longitude',
      type: 'float' as const,
      dimensions: ['station'],
      attributes: {
        units: 'degrees_east',
        long_name: 'Station Longitude',
      } as Record<string, string | number>,
      data: stationLons,
    })

    // Build station index map
    const stationIndex = new Map(stations.map((s, i) => [s.id, i]))
    const timeIndex = new Map(times.map((t, i) => [t.toISOString(), i]))

    // Temperature observation data - build 2D array (time × station)
    const obsValues = new Float32Array(times.length * numStations)
    obsValues.fill(-9999.0) // Fill with missing value

    // Populate observation data
    for (const value of stationResult.values) {
      if (value.observation?.mode === 'stations') {
        const t = timeIndex.get(value.time)
        const s = stationIndex.get(value.observation.station.id)

        if (t !== undefined && s !== undefined) {
          const idx = t * numStations + s
          obsValues[idx] = value.value
        }
      }
    }

    variables.push({
      name: 'temperature_observation',
      type: 'float' as const,
      dimensions: ['time', 'station'],
      attributes: {
        units: 'degrees_celsius',
        long_name: 'Observed Temperature',
        _FillValue: -9999.0,
        source: 'Synthetic Demo - Observation Reference',
      } as Record<string, string | number>,
      data: obsValues,
    })

    includedLayers.push('observation')
  }

  // Build NetCDF encoding
  const encoding: Parameters<typeof encodeNetCDF>[0] = {
    dimensions,
    variables,
    globalAttributes: {
      title:
        includedLayers.length > 1
          ? 'Mixed Grid and Station Temperature Data'
          : includedLayers[0] === 'observation'
            ? 'Station Temperature Observations'
            : 'Downscaled Temperature Data',
      taskId: task.id,
      generatorVersion: task.generatorVersion,
      dataSource: task.configuration.dataSource,
      variable: task.configuration.variable,
      method: task.configuration.resolvedMethod,
      resolution: task.configuration.resolution,
      created: new Date().toISOString(),
      source: 'Synthetic Demo Data',
      layers: includedLayers.join(','),
    },
  }

  // Encode to NetCDF
  const netcdfData = encodeNetCDF(encoding)

  // Generate filename
  const dateStr = startTime.toISOString().split('T')[0]
  const layerStr = includedLayers.join('-')
  const filename = `task-${task.id}-temperature-${layerStr}-${dateStr}.nc`

  return {
    ok: true,
    data: netcdfData,
    filename,
  }
}

import { describe, it, expect } from 'vitest'
import { encodeNetCDF } from '@/server/services/netcdf-encoding.server'
import { readNetCDF } from '../lib/netcdf-reader'

describe('NetCDF CDF-1 Encoding', () => {
  describe('magic bytes and header', () => {
    it('should encode CDF-1 magic bytes', () => {
      const encoding = {
        dimensions: [],
        variables: [],
        globalAttributes: {},
      }

      const result = encodeNetCDF(encoding)

      // CDF-1 magic bytes: 'C', 'D', 'F', 0x01
      expect(result[0]).toBe(0x43) // 'C'
      expect(result[1]).toBe(0x44) // 'D'
      expect(result[2]).toBe(0x46) // 'F'
      expect(result[3]).toBe(0x01) // version 1
    })

    it('should encode numrecs as 0 for non-record variables', () => {
      const encoding = {
        dimensions: [],
        variables: [],
        globalAttributes: {},
      }

      const result = encodeNetCDF(encoding)
      const view = new DataView(result.buffer)

      // After magic (4 bytes), numrecs is a 32-bit integer
      const numrecs = view.getInt32(4, false) // big-endian
      expect(numrecs).toBe(0)
    })
  })

  describe('dimensions', () => {
    it('should encode a single dimension', () => {
      const encoding = {
        dimensions: [{ name: 'time', size: 24 }],
        variables: [],
        globalAttributes: {},
      }

      const result = encodeNetCDF(encoding)
      const view = new DataView(result.buffer)

      // After magic (4) + numrecs (4) = offset 8
      // NC_DIMENSION tag (32-bit)
      const dimTag = view.getInt32(8, false)
      expect(dimTag).toBe(10) // NC_DIMENSION = 10

      // Number of dimensions (32-bit)
      const numDims = view.getInt32(12, false)
      expect(numDims).toBe(1)

      // First dimension name length (32-bit)
      const nameLen = view.getInt32(16, false)
      expect(nameLen).toBe(4) // "time"

      // Dimension name: "time"
      expect(result[20]).toBe(0x74) // 't'
      expect(result[21]).toBe(0x69) // 'i'
      expect(result[22]).toBe(0x6d) // 'm'
      expect(result[23]).toBe(0x65) // 'e'

      // After name + padding, dimension size (32-bit)
      const dimSize = view.getInt32(24, false)
      expect(dimSize).toBe(24)
    })

    it('should encode multiple dimensions', () => {
      const encoding = {
        dimensions: [
          { name: 'time', size: 2 },
          { name: 'latitude', size: 3 },
          { name: 'longitude', size: 4 },
        ],
        variables: [],
        globalAttributes: {},
      }

      const result = encodeNetCDF(encoding)
      const view = new DataView(result.buffer)

      const dimTag = view.getInt32(8, false)
      expect(dimTag).toBe(10) // NC_DIMENSION

      const numDims = view.getInt32(12, false)
      expect(numDims).toBe(3)
    })
  })

  describe('variables', () => {
    it('should encode a simple float variable with data', () => {
      const data = new Float32Array([15.5, 16.0, 14.5])

      const encoding = {
        dimensions: [{ name: 'time', size: 3 }],
        variables: [
          {
            name: 'temperature',
            type: 'float' as const,
            dimensions: ['time'],
            attributes: {
              units: 'degrees_celsius',
              _FillValue: -9999.0,
            },
            data,
          },
        ],
        globalAttributes: {},
      }

      const result = encodeNetCDF(encoding)

      // Verify result is not empty and larger than header
      expect(result.length).toBeGreaterThan(100)

      // Verify data is present - temperature values should be in the data section
      const view = new DataView(result.buffer)
      let foundTemp = false
      // Scan for our temperature values (approximate comparison due to binary encoding)
      for (let i = 0; i < result.length - 4; i++) {
        const value = view.getFloat32(i, false)
        if (Math.abs(value - 15.5) < 0.01) {
          foundTemp = true
          break
        }
      }
      expect(foundTemp).toBe(true)
    })
  })

  describe('complete temperature export', () => {
    it('should encode temperature data with time, lat, lon coordinates', () => {
      const times = new Float64Array([0, 3600, 7200]) // seconds since epoch
      const lats = new Float32Array([30.0, 30.5])
      const lons = new Float32Array([120.0, 120.5])
      const temp = new Float32Array([
        15.5,
        16.0, // time=0
        16.5,
        17.0, // time=3600
        15.0,
        15.5, // time=7200
        16.2,
        16.8,
        17.1,
        17.6,
        15.8,
        16.3,
      ])

      const encoding = {
        dimensions: [
          { name: 'time', size: 3 },
          { name: 'latitude', size: 2 },
          { name: 'longitude', size: 2 },
        ],
        variables: [
          {
            name: 'time',
            type: 'double' as const,
            dimensions: ['time'],
            attributes: {
              units: 'seconds since 1970-01-01 00:00:00',
              calendar: 'gregorian',
            } as Record<string, string | number>,
            data: times,
          },
          {
            name: 'latitude',
            type: 'float' as const,
            dimensions: ['latitude'],
            attributes: {
              units: 'degrees_north',
            } as Record<string, string | number>,
            data: lats,
          },
          {
            name: 'longitude',
            type: 'float' as const,
            dimensions: ['longitude'],
            attributes: {
              units: 'degrees_east',
            } as Record<string, string | number>,
            data: lons,
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
            data: temp,
          },
        ],
        globalAttributes: {
          title: 'Downscaled Temperature Data',
          taskId: 'test-task-001',
        },
      }

      const result = encodeNetCDF(encoding)

      // Verify magic bytes
      expect(result[0]).toBe(0x43) // 'C'
      expect(result[1]).toBe(0x44) // 'D'
      expect(result[2]).toBe(0x46) // 'F'
      expect(result[3]).toBe(0x01) // CDF-1

      // Verify result contains reasonable amount of data
      expect(result.length).toBeGreaterThan(500)
    })
  })

  describe('station dimension encoding', () => {
    it('should encode station dimension separately from grid dimensions', () => {
      const times = new Float64Array([0, 3600])
      const stationIds = new Uint8Array([
        // station-001 (11 chars)
        0x73, 0x74, 0x61, 0x74, 0x69, 0x6f, 0x6e, 0x2d, 0x30, 0x30, 0x31,
        // station-002 (11 chars)
        0x73, 0x74, 0x61, 0x74, 0x69, 0x6f, 0x6e, 0x2d, 0x30, 0x30, 0x32,
      ])
      const stationLats = new Float32Array([30.0, 31.0])
      const stationLons = new Float32Array([120.0, 121.0])
      const obsTemp = new Float32Array([15.5, 16.0, 16.5, 17.0]) // 2 times × 2 stations

      const encoding = {
        dimensions: [
          { name: 'time', size: 2 },
          { name: 'station', size: 2 },
          { name: 'stationId_len', size: 11 },
        ],
        variables: [
          {
            name: 'time',
            type: 'double' as const,
            dimensions: ['time'],
            attributes: {
              units: 'seconds since 1970-01-01 00:00:00',
              calendar: 'gregorian',
            } as Record<string, string | number>,
            data: times,
          },
          {
            name: 'stationId',
            type: 'char' as const,
            dimensions: ['station', 'stationId_len'],
            attributes: {
              long_name: 'Station Identifier',
            } as Record<string, string | number>,
            data: stationIds,
          },
          {
            name: 'station_latitude',
            type: 'float' as const,
            dimensions: ['station'],
            attributes: {
              units: 'degrees_north',
            } as Record<string, string | number>,
            data: stationLats,
          },
          {
            name: 'station_longitude',
            type: 'float' as const,
            dimensions: ['station'],
            attributes: {
              units: 'degrees_east',
            } as Record<string, string | number>,
            data: stationLons,
          },
          {
            name: 'temperature_observation',
            type: 'float' as const,
            dimensions: ['time', 'station'],
            attributes: {
              units: 'degrees_celsius',
              _FillValue: -9999.0,
            } as Record<string, string | number>,
            data: obsTemp,
          },
        ],
        globalAttributes: {
          title: 'Station Temperature Observations',
          source: 'Synthetic Demo',
        },
      }

      const result = encodeNetCDF(encoding)

      // Verify magic bytes
      expect(result[0]).toBe(0x43) // 'C'
      expect(result[1]).toBe(0x44) // 'D'
      expect(result[2]).toBe(0x46) // 'F'
      expect(result[3]).toBe(0x01) // CDF-1

      // Verify result contains data
      expect(result.length).toBeGreaterThan(200)
    })

    it('should encode mixed grid and station data', () => {
      const times = new Float64Array([0, 3600])
      const lats = new Float32Array([30.0])
      const lons = new Float32Array([120.0])
      const gridTemp = new Float32Array([15.0, 16.0]) // 2 times × 1 lat × 1 lon

      const stationIds = new Uint8Array([0x73, 0x74, 0x61]) // "sta"
      const stationLats = new Float32Array([30.5])
      const stationLons = new Float32Array([120.5])
      const obsTemp = new Float32Array([15.5, 16.5]) // 2 times × 1 station

      const encoding = {
        dimensions: [
          { name: 'time', size: 2 },
          { name: 'latitude', size: 1 },
          { name: 'longitude', size: 1 },
          { name: 'station', size: 1 },
          { name: 'stationId_len', size: 3 },
        ],
        variables: [
          {
            name: 'time',
            type: 'double' as const,
            dimensions: ['time'],
            attributes: {
              units: 'seconds since 1970-01-01 00:00:00',
            } as Record<string, string | number>,
            data: times,
          },
          {
            name: 'latitude',
            type: 'float' as const,
            dimensions: ['latitude'],
            attributes: {
              units: 'degrees_north',
            } as Record<string, string | number>,
            data: lats,
          },
          {
            name: 'longitude',
            type: 'float' as const,
            dimensions: ['longitude'],
            attributes: {
              units: 'degrees_east',
            } as Record<string, string | number>,
            data: lons,
          },
          {
            name: 'temperature_downscaled',
            type: 'float' as const,
            dimensions: ['time', 'latitude', 'longitude'],
            attributes: {
              units: 'degrees_celsius',
              source: 'Downscaled',
            } as Record<string, string | number>,
            data: gridTemp,
          },
          {
            name: 'stationId',
            type: 'char' as const,
            dimensions: ['station', 'stationId_len'],
            attributes: {
              long_name: 'Station Identifier',
            } as Record<string, string | number>,
            data: stationIds,
          },
          {
            name: 'station_latitude',
            type: 'float' as const,
            dimensions: ['station'],
            attributes: {
              units: 'degrees_north',
            } as Record<string, string | number>,
            data: stationLats,
          },
          {
            name: 'station_longitude',
            type: 'float' as const,
            dimensions: ['station'],
            attributes: {
              units: 'degrees_east',
            } as Record<string, string | number>,
            data: stationLons,
          },
          {
            name: 'temperature_observation',
            type: 'float' as const,
            dimensions: ['time', 'station'],
            attributes: {
              units: 'degrees_celsius',
              source: 'Observation',
            } as Record<string, string | number>,
            data: obsTemp,
          },
        ],
        globalAttributes: {
          title: 'Mixed Grid and Station Data',
          layers: 'downscaled,observation',
        },
      }

      const result = encodeNetCDF(encoding)

      // Verify magic bytes
      expect(result[0]).toBe(0x43) // 'C'
      expect(result[1]).toBe(0x44) // 'D'
      expect(result[2]).toBe(0x46) // 'F'
      expect(result[3]).toBe(0x01) // CDF-1

      expect(result.length).toBeGreaterThan(300)
    })
  })

  describe('independent reader verification', () => {
    it('should read back encoded dimensions correctly', () => {
      const encoding = {
        dimensions: [
          { name: 'time', size: 24 },
          { name: 'latitude', size: 10 },
          { name: 'longitude', size: 15 },
        ],
        variables: [],
        globalAttributes: {},
      }

      const encoded = encodeNetCDF(encoding)
      const decoded = readNetCDF(encoded)

      expect(decoded.version).toBe(1)
      expect(decoded.dimensions).toHaveLength(3)
      expect(decoded.dimensions[0]).toEqual({ name: 'time', size: 24 })
      expect(decoded.dimensions[1]).toEqual({ name: 'latitude', size: 10 })
      expect(decoded.dimensions[2]).toEqual({ name: 'longitude', size: 15 })
    })

    it('should read back global attributes correctly', () => {
      const encoding = {
        dimensions: [],
        variables: [],
        globalAttributes: {
          title: 'Test Dataset',
          taskId: 'task-123',
          generatorVersion: 'v1.0.0',
        },
      }

      const encoded = encodeNetCDF(encoding)
      const decoded = readNetCDF(encoded)

      expect(decoded.globalAttributes.title).toBe('Test Dataset')
      expect(decoded.globalAttributes.taskId).toBe('task-123')
      expect(decoded.globalAttributes.generatorVersion).toBe('v1.0.0')
    })

    it('should read back temperature variable with all metadata and data', () => {
      const times = new Float64Array([0, 3600, 7200])
      const lats = new Float32Array([30.0, 30.5])
      const lons = new Float32Array([120.0, 120.5])
      // Temperature data: 3 times * 2 lats * 2 lons = 12 values
      const temp = new Float32Array([
        15.5,
        16.0, // time=0, lat=30.0, lon=[120.0, 120.5]
        16.5,
        17.0, // time=0, lat=30.5, lon=[120.0, 120.5]
        17.5,
        18.0, // time=3600, lat=30.0, lon=[120.0, 120.5]
        18.5,
        19.0, // time=3600, lat=30.5, lon=[120.0, 120.5]
        15.0,
        15.5, // time=7200, lat=30.0, lon=[120.0, 120.5]
        16.0,
        16.5, // time=7200, lat=30.5, lon=[120.0, 120.5]
      ])

      const encoding = {
        dimensions: [
          { name: 'time', size: 3 },
          { name: 'latitude', size: 2 },
          { name: 'longitude', size: 2 },
        ],
        variables: [
          {
            name: 'time',
            type: 'double' as const,
            dimensions: ['time'],
            attributes: {
              units: 'seconds since 1970-01-01 00:00:00',
              calendar: 'gregorian',
            } as Record<string, string | number>,
            data: times,
          },
          {
            name: 'latitude',
            type: 'float' as const,
            dimensions: ['latitude'],
            attributes: {
              units: 'degrees_north',
            } as Record<string, string | number>,
            data: lats,
          },
          {
            name: 'longitude',
            type: 'float' as const,
            dimensions: ['longitude'],
            attributes: {
              units: 'degrees_east',
            } as Record<string, string | number>,
            data: lons,
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
            data: temp,
          },
        ],
        globalAttributes: {
          title: 'Downscaled Temperature Data',
        },
      }

      const encoded = encodeNetCDF(encoding)
      const decoded = readNetCDF(encoded)

      // Verify dimensions
      expect(decoded.dimensions).toHaveLength(3)
      expect(decoded.dimensions[0]?.name).toBe('time')
      expect(decoded.dimensions[0]?.size).toBe(3)

      // Verify variables
      expect(decoded.variables).toHaveLength(4)

      // Check time variable
      const timeVar = decoded.variables.find((v) => v.name === 'time')
      expect(timeVar).toBeDefined()
      expect(timeVar?.type).toBe('double')
      expect(timeVar?.dimensions).toEqual(['time'])
      expect(timeVar?.attributes.units).toBe('seconds since 1970-01-01 00:00:00')
      expect(timeVar?.attributes.calendar).toBe('gregorian')
      expect(timeVar?.data).toHaveLength(3)
      expect(timeVar?.data[0]).toBe(0)
      expect(timeVar?.data[1]).toBe(3600)
      expect(timeVar?.data[2]).toBe(7200)

      // Check latitude variable
      const latVar = decoded.variables.find((v) => v.name === 'latitude')
      expect(latVar).toBeDefined()
      expect(latVar?.type).toBe('float')
      expect(latVar?.attributes.units).toBe('degrees_north')
      expect(latVar?.data[0]).toBeCloseTo(30.0, 2)
      expect(latVar?.data[1]).toBeCloseTo(30.5, 2)

      // Check longitude variable
      const lonVar = decoded.variables.find((v) => v.name === 'longitude')
      expect(lonVar).toBeDefined()
      expect(lonVar?.type).toBe('float')
      expect(lonVar?.attributes.units).toBe('degrees_east')
      expect(lonVar?.data[0]).toBeCloseTo(120.0, 2)
      expect(lonVar?.data[1]).toBeCloseTo(120.5, 2)

      // Check temperature variable
      const tempVar = decoded.variables.find((v) => v.name === 'temperature')
      expect(tempVar).toBeDefined()
      expect(tempVar?.type).toBe('float')
      expect(tempVar?.dimensions).toEqual(['time', 'latitude', 'longitude'])
      expect(tempVar?.attributes.units).toBe('degrees_celsius')
      expect(tempVar?.attributes.long_name).toBe('Temperature')
      expect(tempVar?.attributes._FillValue).toBe(-9999.0)
      expect(tempVar?.data).toHaveLength(12)
      expect(tempVar?.data[0]).toBeCloseTo(15.5, 2)
      expect(tempVar?.data[1]).toBeCloseTo(16.0, 2)
      expect(tempVar?.data[2]).toBeCloseTo(16.5, 2)
      expect(tempVar?.data[3]).toBeCloseTo(17.0, 2)
    })

    it('should read back station dimensions and coordinates', () => {
      const times = new Float64Array([0, 3600])
      const stationIds = new Uint8Array([
        // synthetic-station-v1:120:30 (27 UTF-8 bytes)
        ...Array.from('synthetic-station-v1:120:30').map((c) => c.charCodeAt(0)),
        // synthetic-station-v1:121:31 (27 UTF-8 bytes)
        ...Array.from('synthetic-station-v1:121:31').map((c) => c.charCodeAt(0)),
      ])
      const stationLats = new Float32Array([30.0, 31.0])
      const stationLons = new Float32Array([120.0, 121.0])
      const obsTemp = new Float32Array([15.5, 16.0, 16.5, 17.0])

      const encoding = {
        dimensions: [
          { name: 'time', size: 2 },
          { name: 'station', size: 2 },
          { name: 'stationId_len', size: 27 },
        ],
        variables: [
          {
            name: 'time',
            type: 'double' as const,
            dimensions: ['time'],
            attributes: {
              units: 'seconds since 1970-01-01 00:00:00',
              calendar: 'gregorian',
            } as Record<string, string | number>,
            data: times,
          },
          {
            name: 'stationId',
            type: 'char' as const,
            dimensions: ['station', 'stationId_len'],
            attributes: {
              long_name: 'Station Identifier',
            } as Record<string, string | number>,
            data: stationIds,
          },
          {
            name: 'station_latitude',
            type: 'float' as const,
            dimensions: ['station'],
            attributes: {
              units: 'degrees_north',
              long_name: 'Station Latitude',
            } as Record<string, string | number>,
            data: stationLats,
          },
          {
            name: 'station_longitude',
            type: 'float' as const,
            dimensions: ['station'],
            attributes: {
              units: 'degrees_east',
              long_name: 'Station Longitude',
            } as Record<string, string | number>,
            data: stationLons,
          },
          {
            name: 'temperature_observation',
            type: 'float' as const,
            dimensions: ['time', 'station'],
            attributes: {
              units: 'degrees_celsius',
              long_name: 'Observed Temperature',
              _FillValue: -9999.0,
              source: 'Synthetic Demo - Observation Reference',
            } as Record<string, string | number>,
            data: obsTemp,
          },
        ],
        globalAttributes: {
          title: 'Station Temperature Observations',
          source: 'Synthetic Demo',
        },
      }

      const encoded = encodeNetCDF(encoding)
      const decoded = readNetCDF(encoded)

      // Verify dimensions
      expect(decoded.dimensions).toHaveLength(3)
      expect(decoded.dimensions.find((d) => d.name === 'time')?.size).toBe(2)
      expect(decoded.dimensions.find((d) => d.name === 'station')?.size).toBe(2)
      expect(decoded.dimensions.find((d) => d.name === 'stationId_len')?.size).toBe(27)

      // Verify stationId variable
      const stationIdVar = decoded.variables.find((v) => v.name === 'stationId')
      expect(stationIdVar).toBeDefined()
      expect(stationIdVar?.type).toBe('char')
      expect(stationIdVar?.dimensions).toEqual(['station', 'stationId_len'])
      expect(stationIdVar?.attributes.long_name).toBe('Station Identifier')

      // Verify station coordinates
      const latVar = decoded.variables.find((v) => v.name === 'station_latitude')
      expect(latVar).toBeDefined()
      expect(latVar?.type).toBe('float')
      expect(latVar?.dimensions).toEqual(['station'])
      expect(latVar?.attributes.units).toBe('degrees_north')
      expect(latVar?.data[0]).toBeCloseTo(30.0, 2)
      expect(latVar?.data[1]).toBeCloseTo(31.0, 2)

      const lonVar = decoded.variables.find((v) => v.name === 'station_longitude')
      expect(lonVar).toBeDefined()
      expect(lonVar?.type).toBe('float')
      expect(lonVar?.dimensions).toEqual(['station'])
      expect(lonVar?.attributes.units).toBe('degrees_east')
      expect(lonVar?.data[0]).toBeCloseTo(120.0, 2)
      expect(lonVar?.data[1]).toBeCloseTo(121.0, 2)

      // Verify temperature observation variable
      const tempVar = decoded.variables.find((v) => v.name === 'temperature_observation')
      expect(tempVar).toBeDefined()
      expect(tempVar?.type).toBe('float')
      expect(tempVar?.dimensions).toEqual(['time', 'station'])
      expect(tempVar?.attributes.units).toBe('degrees_celsius')
      expect(tempVar?.attributes._FillValue).toBe(-9999.0)
      expect(tempVar?.data).toHaveLength(4) // 2 times × 2 stations
      expect(tempVar?.data[0]).toBeCloseTo(15.5, 2) // time=0, station=0
      expect(tempVar?.data[1]).toBeCloseTo(16.0, 2) // time=0, station=1
      expect(tempVar?.data[2]).toBeCloseTo(16.5, 2) // time=3600, station=0
      expect(tempVar?.data[3]).toBeCloseTo(17.0, 2) // time=3600, station=1
    })

    it('should distinguish grid and station dimensions in mixed export', () => {
      const times = new Float64Array([0])
      const lats = new Float32Array([30.0, 30.5])
      const lons = new Float32Array([120.0, 120.5])
      const gridTemp = new Float32Array([15.0, 16.0, 17.0, 18.0]) // 1 time × 2 lats × 2 lons

      const stationIds = new Uint8Array([0x73, 0x31]) // "s1"
      const stationLats = new Float32Array([30.2])
      const stationLons = new Float32Array([120.2])
      const obsTemp = new Float32Array([15.8]) // 1 time × 1 station

      const encoding = {
        dimensions: [
          { name: 'time', size: 1 },
          { name: 'latitude', size: 2 },
          { name: 'longitude', size: 2 },
          { name: 'station', size: 1 },
          { name: 'stationId_len', size: 2 },
        ],
        variables: [
          {
            name: 'time',
            type: 'double' as const,
            dimensions: ['time'],
            attributes: {
              units: 'seconds since 1970-01-01 00:00:00',
            } as Record<string, string | number>,
            data: times,
          },
          {
            name: 'latitude',
            type: 'float' as const,
            dimensions: ['latitude'],
            attributes: {
              units: 'degrees_north',
              long_name: 'Latitude',
            } as Record<string, string | number>,
            data: lats,
          },
          {
            name: 'longitude',
            type: 'float' as const,
            dimensions: ['longitude'],
            attributes: {
              units: 'degrees_east',
              long_name: 'Longitude',
            } as Record<string, string | number>,
            data: lons,
          },
          {
            name: 'temperature_downscaled',
            type: 'float' as const,
            dimensions: ['time', 'latitude', 'longitude'],
            attributes: {
              units: 'degrees_celsius',
              long_name: 'Downscaled Temperature',
              source: 'Synthetic Demo - Downscaled',
            } as Record<string, string | number>,
            data: gridTemp,
          },
          {
            name: 'stationId',
            type: 'char' as const,
            dimensions: ['station', 'stationId_len'],
            attributes: {
              long_name: 'Station Identifier',
            } as Record<string, string | number>,
            data: stationIds,
          },
          {
            name: 'station_latitude',
            type: 'float' as const,
            dimensions: ['station'],
            attributes: {
              units: 'degrees_north',
              long_name: 'Station Latitude',
            } as Record<string, string | number>,
            data: stationLats,
          },
          {
            name: 'station_longitude',
            type: 'float' as const,
            dimensions: ['station'],
            attributes: {
              units: 'degrees_east',
              long_name: 'Station Longitude',
            } as Record<string, string | number>,
            data: stationLons,
          },
          {
            name: 'temperature_observation',
            type: 'float' as const,
            dimensions: ['time', 'station'],
            attributes: {
              units: 'degrees_celsius',
              long_name: 'Observed Temperature',
              source: 'Synthetic Demo - Observation Reference',
            } as Record<string, string | number>,
            data: obsTemp,
          },
        ],
        globalAttributes: {
          title: 'Mixed Grid and Station Data',
          layers: 'downscaled,observation',
        },
      }

      const encoded = encodeNetCDF(encoding)
      const decoded = readNetCDF(encoded)

      // Verify all dimensions are present and distinct
      expect(decoded.dimensions).toHaveLength(5)
      expect(decoded.dimensions.find((d) => d.name === 'latitude')?.size).toBe(2)
      expect(decoded.dimensions.find((d) => d.name === 'longitude')?.size).toBe(2)
      expect(decoded.dimensions.find((d) => d.name === 'station')?.size).toBe(1)

      // Verify grid temperature uses lat/lon dimensions
      const gridTempVar = decoded.variables.find((v) => v.name === 'temperature_downscaled')
      expect(gridTempVar?.dimensions).toEqual(['time', 'latitude', 'longitude'])
      expect(gridTempVar?.data).toHaveLength(4)

      // Verify observation temperature uses station dimension
      const obsTempVar = decoded.variables.find((v) => v.name === 'temperature_observation')
      expect(obsTempVar?.dimensions).toEqual(['time', 'station'])
      expect(obsTempVar?.data).toHaveLength(1)

      // Verify both have correct source attribution
      expect(gridTempVar?.attributes.source).toContain('Downscaled')
      expect(obsTempVar?.attributes.source).toContain('Observation')

      // Verify global attributes indicate mixed export
      expect(decoded.globalAttributes.layers).toBe('downscaled,observation')
    })
  })
})

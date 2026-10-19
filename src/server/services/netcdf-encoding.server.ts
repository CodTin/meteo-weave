/**
 * NetCDF Classic (CDF-1) binary encoding service
 *
 * Implements NetCDF Classic format writer for temperature downscaled results.
 * CDF-1 is a well-documented binary format that can be written without native dependencies.
 *
 * Format spec: https://www.unidata.ucar.edu/software/netcdf/docs/file_format_specifications.html
 */

export interface NetCDFVariable {
  name: string
  type: 'float' | 'double' | 'char'
  dimensions: string[]
  attributes: Record<string, string | number>
  data: Float32Array | Float64Array | Uint8Array
}

export interface NetCDFDimension {
  name: string
  size: number
}

export interface NetCDFEncoding {
  dimensions: NetCDFDimension[]
  variables: NetCDFVariable[]
  globalAttributes: Record<string, string | number>
}

// NetCDF CDF-1 format constants
const NC_DIMENSION = 10
const NC_VARIABLE = 11
const NC_ATTRIBUTE = 12

// NetCDF data types
const NC_CHAR = 2
const NC_FLOAT = 5
const NC_DOUBLE = 6

/**
 * Helper class to build NetCDF binary with dynamic sizing
 */
class NetCDFWriter {
  private buffers: Uint8Array[] = []
  private offset = 0

  writeBytes(data: Uint8Array): void {
    this.buffers.push(data)
    this.offset += data.length
  }

  writeInt32(value: number): void {
    const buffer = new ArrayBuffer(4)
    new DataView(buffer).setInt32(0, value, false) // big-endian
    this.writeBytes(new Uint8Array(buffer))
  }

  writeFloat32(value: number): void {
    const buffer = new ArrayBuffer(4)
    new DataView(buffer).setFloat32(0, value, false) // big-endian
    this.writeBytes(new Uint8Array(buffer))
  }

  writeFloat64(value: number): void {
    const buffer = new ArrayBuffer(8)
    new DataView(buffer).setFloat64(0, value, false) // big-endian
    this.writeBytes(new Uint8Array(buffer))
  }

  writeString(str: string): void {
    const encoder = new TextEncoder()
    const bytes = encoder.encode(str)
    this.writeInt32(bytes.length)
    this.writeBytes(bytes)
    // Add padding to 4-byte boundary
    const padding = (4 - (bytes.length % 4)) % 4
    if (padding > 0) {
      this.writeBytes(new Uint8Array(padding))
    }
  }

  writeAttributes(attributes: Record<string, string | number>): void {
    const entries = Object.entries(attributes)
    if (entries.length === 0) {
      this.writeInt32(0) // ABSENT
      return
    }

    this.writeInt32(NC_ATTRIBUTE)
    this.writeInt32(entries.length)

    for (const [name, value] of entries) {
      this.writeString(name)

      if (typeof value === 'string') {
        this.writeInt32(NC_CHAR)
        const encoder = new TextEncoder()
        const bytes = encoder.encode(value)
        this.writeInt32(bytes.length)
        this.writeBytes(bytes)
        const padding = (4 - (bytes.length % 4)) % 4
        if (padding > 0) {
          this.writeBytes(new Uint8Array(padding))
        }
      } else {
        // Numeric attribute
        this.writeInt32(NC_DOUBLE)
        this.writeInt32(1) // count
        this.writeFloat64(value)
      }
    }
  }

  getOffset(): number {
    return this.offset
  }

  toUint8Array(): Uint8Array {
    const totalLength = this.buffers.reduce((sum, buf) => sum + buf.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const buf of this.buffers) {
      result.set(buf, offset)
      offset += buf.length
    }
    return result
  }
}

/**
 * Encodes data structure to NetCDF Classic (CDF-1) binary format
 */
export function encodeNetCDF(encoding: NetCDFEncoding): Uint8Array {
  // First pass: write header to calculate data offsets
  const headerWriter = new NetCDFWriter()

  // Write CDF-1 magic bytes
  headerWriter.writeBytes(new Uint8Array([0x43, 0x44, 0x46, 0x01])) // 'C', 'D', 'F', 0x01

  // Write numrecs (number of records, 0 for fixed-size dimensions)
  headerWriter.writeInt32(0)

  // Write dimensions
  if (encoding.dimensions.length === 0) {
    headerWriter.writeInt32(0) // ABSENT tag
  } else {
    headerWriter.writeInt32(NC_DIMENSION)
    headerWriter.writeInt32(encoding.dimensions.length)
    for (const dim of encoding.dimensions) {
      headerWriter.writeString(dim.name)
      headerWriter.writeInt32(dim.size)
    }
  }

  // Write global attributes
  headerWriter.writeAttributes(encoding.globalAttributes)

  // Write variables
  if (encoding.variables.length === 0) {
    headerWriter.writeInt32(0) // ABSENT tag
    return headerWriter.toUint8Array()
  }

  headerWriter.writeInt32(NC_VARIABLE)
  headerWriter.writeInt32(encoding.variables.length)

  // Build dimension name lookup
  const dimMap = new Map(encoding.dimensions.map((d, i) => [d.name, i]))

  // Track where we need to write offsets and calculate data sizes
  const variableInfo: Array<{
    offsetPosition: number
    dataSize: number
    data: Float32Array | Float64Array | Uint8Array
    type: 'float' | 'double' | 'char'
  }> = []

  let cumulativeDataOffset = 0

  for (const variable of encoding.variables) {
    // Variable name
    headerWriter.writeString(variable.name)

    // Number of dimensions
    headerWriter.writeInt32(variable.dimensions.length)

    // Dimension IDs
    for (const dimName of variable.dimensions) {
      const dimId = dimMap.get(dimName)
      if (dimId === undefined) {
        throw new Error(`Dimension ${dimName} not found`)
      }
      headerWriter.writeInt32(dimId)
    }

    // Variable attributes
    headerWriter.writeAttributes(variable.attributes)

    // Variable type
    const ncType =
      variable.type === 'float' ? NC_FLOAT : variable.type === 'double' ? NC_DOUBLE : NC_CHAR
    headerWriter.writeInt32(ncType)

    // Variable size in bytes
    const elementSize = variable.type === 'float' ? 4 : variable.type === 'double' ? 8 : 1
    const varSize = variable.data.length * elementSize
    headerWriter.writeInt32(varSize)

    // Record where the offset will be written
    const offsetPosition = headerWriter.getOffset()
    headerWriter.writeInt32(cumulativeDataOffset) // Write relative offset from data section start

    // Track info for data writing
    variableInfo.push({
      offsetPosition,
      dataSize: varSize,
      data: variable.data,
      type: variable.type,
    })

    cumulativeDataOffset += varSize
    // Add padding to 4-byte boundary
    const padding = (4 - (varSize % 4)) % 4
    cumulativeDataOffset += padding
  }

  // Get the header
  const header = headerWriter.toUint8Array()
  const dataStartOffset = header.length

  // Now write the data section
  const dataWriter = new NetCDFWriter()

  for (const varInfo of variableInfo) {
    if (varInfo.type === 'char') {
      // Write char data as raw bytes
      if (!(varInfo.data instanceof Uint8Array)) {
        throw new Error('Char variable must use Uint8Array')
      }
      dataWriter.writeBytes(varInfo.data)
    } else if (varInfo.type === 'float') {
      for (let j = 0; j < varInfo.data.length; j++) {
        const value = varInfo.data[j]
        if (value === undefined) throw new Error('Data contains undefined values')
        dataWriter.writeFloat32(value)
      }
    } else {
      for (let j = 0; j < varInfo.data.length; j++) {
        const value = varInfo.data[j]
        if (value === undefined) throw new Error('Data contains undefined values')
        dataWriter.writeFloat64(value)
      }
    }

    // Add padding to 4-byte boundary
    const padding = (4 - (varInfo.dataSize % 4)) % 4
    if (padding > 0) {
      dataWriter.writeBytes(new Uint8Array(padding))
    }
  }

  const dataSection = dataWriter.toUint8Array()

  // Combine header and data
  const result = new Uint8Array(header.length + dataSection.length)
  result.set(header)
  result.set(dataSection, header.length)

  // Fix the offsets in the header to be absolute file positions
  const view = new DataView(result.buffer, result.byteOffset, result.byteLength)
  for (const varInfo of variableInfo) {
    const absoluteOffset = view.getInt32(varInfo.offsetPosition, false)
    view.setInt32(varInfo.offsetPosition, dataStartOffset + absoluteOffset, false)
  }

  return result
}

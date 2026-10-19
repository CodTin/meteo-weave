/**
 * Independent NetCDF Classic (CDF-1) reader for verification
 *
 * This reader is intentionally separate from the writer implementation
 * to provide independent verification of encoded files.
 */

export interface NetCDFFile {
  version: number
  dimensions: Array<{ name: string; size: number }>
  globalAttributes: Record<string, string | number>
  variables: Array<{
    name: string
    type: string
    dimensions: string[]
    attributes: Record<string, string | number>
    data: Float32Array | Float64Array
  }>
}

/**
 * Read NetCDF Classic (CDF-1) file
 */
export function readNetCDF(buffer: Uint8Array): NetCDFFile {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  let offset = 0

  // Read magic bytes
  const magic = [
    view.getUint8(offset++),
    view.getUint8(offset++),
    view.getUint8(offset++),
    view.getUint8(offset++),
  ]

  if (magic[0] !== 0x43 || magic[1] !== 0x44 || magic[2] !== 0x46) {
    throw new Error('Not a valid NetCDF file')
  }

  const version = magic[3]
  if (version !== 1) {
    throw new Error(`Unsupported NetCDF version: ${version}`)
  }

  // Read numrecs (unused but required for format)
  offset += 4

  // Read dimensions
  const dimensions = readDimList(view, buffer, offset)
  offset = dimensions.nextOffset

  // Read global attributes
  const globalAttrs = readAttrList(view, buffer, offset)
  offset = globalAttrs.nextOffset

  // Read variables
  const variables = readVarList(view, buffer, offset, dimensions.items)
  offset = variables.nextOffset

  return {
    version,
    dimensions: dimensions.items,
    globalAttributes: globalAttrs.items,
    variables: variables.items,
  }
}

function readDimList(
  view: DataView,
  buffer: Uint8Array,
  offset: number,
): { items: Array<{ name: string; size: number }>; nextOffset: number } {
  const tag = view.getInt32(offset, false)
  offset += 4

  if (tag === 0) {
    return { items: [], nextOffset: offset }
  }

  if (tag !== 10) {
    // NC_DIMENSION
    throw new Error(`Expected NC_DIMENSION tag, got ${tag}`)
  }

  const count = view.getInt32(offset, false)
  offset += 4

  const items: Array<{ name: string; size: number }> = []

  for (let i = 0; i < count; i++) {
    const nameResult = readName(view, buffer, offset)
    offset = nameResult.nextOffset

    const size = view.getInt32(offset, false)
    offset += 4

    items.push({ name: nameResult.name, size })
  }

  return { items, nextOffset: offset }
}

function readAttrList(
  view: DataView,
  buffer: Uint8Array,
  offset: number,
): { items: Record<string, string | number>; nextOffset: number } {
  const tag = view.getInt32(offset, false)
  offset += 4

  if (tag === 0) {
    return { items: {}, nextOffset: offset }
  }

  if (tag !== 12) {
    // NC_ATTRIBUTE
    throw new Error(`Expected NC_ATTRIBUTE tag, got ${tag}`)
  }

  const count = view.getInt32(offset, false)
  offset += 4

  const items: Record<string, string | number> = {}

  for (let i = 0; i < count; i++) {
    const nameResult = readName(view, buffer, offset)
    offset = nameResult.nextOffset

    const attrType = view.getInt32(offset, false)
    offset += 4

    const attrCount = view.getInt32(offset, false)
    offset += 4

    if (attrType === 2) {
      // NC_CHAR - string
      const decoder = new TextDecoder()
      const strBytes = buffer.slice(offset, offset + attrCount)
      items[nameResult.name] = decoder.decode(strBytes)
      offset += attrCount
      const padding = (4 - (attrCount % 4)) % 4
      offset += padding
    } else if (attrType === 6) {
      // NC_DOUBLE
      items[nameResult.name] = view.getFloat64(offset, false)
      offset += 8
    } else if (attrType === 5) {
      // NC_FLOAT
      items[nameResult.name] = view.getFloat32(offset, false)
      offset += 4
    } else {
      throw new Error(`Unsupported attribute type: ${attrType}`)
    }
  }

  return { items, nextOffset: offset }
}

function readVarList(
  view: DataView,
  buffer: Uint8Array,
  offset: number,
  dimensions: Array<{ name: string; size: number }>,
): {
  items: Array<{
    name: string
    type: string
    dimensions: string[]
    attributes: Record<string, string | number>
    data: Float32Array | Float64Array
  }>
  nextOffset: number
} {
  const tag = view.getInt32(offset, false)
  offset += 4

  if (tag === 0) {
    return { items: [], nextOffset: offset }
  }

  if (tag !== 11) {
    // NC_VARIABLE
    throw new Error(`Expected NC_VARIABLE tag, got ${tag}`)
  }

  const count = view.getInt32(offset, false)
  offset += 4

  const items: Array<{
    name: string
    type: string
    dimensions: string[]
    attributes: Record<string, string | number>
    data: Float32Array | Float64Array
  }> = []

  for (let i = 0; i < count; i++) {
    const nameResult = readName(view, buffer, offset)
    offset = nameResult.nextOffset

    const numDims = view.getInt32(offset, false)
    offset += 4

    const dimIds: number[] = []
    for (let j = 0; j < numDims; j++) {
      dimIds.push(view.getInt32(offset, false))
      offset += 4
    }

    const attrs = readAttrList(view, buffer, offset)
    offset = attrs.nextOffset

    const varType = view.getInt32(offset, false)
    offset += 4

    // Skip variable size (not needed for reading)
    offset += 4

    const dataOffset = view.getInt32(offset, false)
    offset += 4

    // Calculate data length
    let dataLength = 1
    for (const dimId of dimIds) {
      const dim = dimensions[dimId]
      if (!dim) {
        throw new Error(`Dimension ${dimId} not found`)
      }
      dataLength *= dim.size
    }

    // Read data from the specified absolute offset in the file
    let data: Float32Array | Float64Array
    let typeName: string

    // Validate the data offset is within buffer bounds
    const elementSize = varType === 5 ? 4 : 8
    const requiredSize = dataOffset + dataLength * elementSize
    if (requiredSize > buffer.length) {
      throw new Error(
        `Data offset ${dataOffset} + size ${dataLength * elementSize} = ${requiredSize} exceeds buffer length ${buffer.length}`,
      )
    }

    if (varType === 5) {
      // NC_FLOAT
      typeName = 'float'
      data = new Float32Array(dataLength)
      for (let j = 0; j < dataLength; j++) {
        data[j] = view.getFloat32(dataOffset + j * 4, false)
      }
    } else if (varType === 6) {
      // NC_DOUBLE
      typeName = 'double'
      data = new Float64Array(dataLength)
      for (let j = 0; j < dataLength; j++) {
        data[j] = view.getFloat64(dataOffset + j * 8, false)
      }
    } else {
      throw new Error(`Unsupported variable type: ${varType}`)
    }

    items.push({
      name: nameResult.name,
      type: typeName,
      dimensions: dimIds.map((id) => {
        const dim = dimensions[id]
        if (!dim) {
          throw new Error(`Dimension ${id} not found`)
        }
        return dim.name
      }),
      attributes: attrs.items,
      data,
    })
  }

  return { items, nextOffset: offset }
}

function readName(
  view: DataView,
  buffer: Uint8Array,
  offset: number,
): { name: string; nextOffset: number } {
  const length = view.getInt32(offset, false)
  offset += 4

  const decoder = new TextDecoder()
  const nameBytes = buffer.slice(offset, offset + length)
  const name = decoder.decode(nameBytes)
  offset += length

  const padding = (4 - (length % 4)) % 4
  offset += padding

  return { name, nextOffset: offset }
}

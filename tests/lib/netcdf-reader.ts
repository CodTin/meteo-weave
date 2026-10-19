import { NetCDFReader, type Attribute } from 'netcdfjs'

export interface NetCDFFile {
  version: number
  dimensions: Array<{ name: string; size: number }>
  globalAttributes: Record<string, string | number>
  variables: Array<{
    name: string
    type: string
    dimensions: string[]
    attributes: Record<string, string | number>
    data: Int32Array | Float32Array | Float64Array | Uint8Array
  }>
}

// netcdfjs/iobuffer expose byte strings (signed bytes may be sign-extended).
function decodeText(value: string): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(
    Uint8Array.from(value, (character) => character.charCodeAt(0) & 0xff),
  )
}

function attributeDictionary(attributes: Attribute[]): Record<string, string | number> {
  return Object.fromEntries(
    attributes.map(({ name, value }) => [
      decodeText(name),
      typeof value === 'string' ? decodeText(value) : value,
    ]),
  )
}

/** Test-only adapter: netcdfjs owns all header and data parsing, not the writer. */
export function readNetCDF(buffer: Uint8Array): NetCDFFile {
  const reader = new NetCDFReader(buffer)
  if (reader.header.version !== 1) throw new Error('Expected NetCDF Classic (CDF-1)')
  if (reader.recordDimension.id !== undefined || reader.recordDimension.length !== 0) {
    throw new Error('Expected a fixed-size NetCDF file')
  }
  const headerBytes = reader.buffer.offset
  const dimensions = (reader.dimensions ?? []).map(({ name, size }) => ({
    name: decodeText(name),
    size,
  }))

  return {
    version: reader.header.version,
    dimensions,
    globalAttributes: attributeDictionary(reader.globalAttributes),
    variables: (reader.variables ?? []).map((variable) => {
      // Bounds from netcdfjs metadata; no parallel binary-header parser.
      if (
        !Number.isSafeInteger(variable.offset) ||
        variable.offset < headerBytes ||
        variable.offset % 4 !== 0 ||
        !Number.isSafeInteger(variable.size) ||
        variable.size < 0 ||
        variable.offset + variable.size > buffer.byteLength
      ) {
        throw new Error(`Invalid NetCDF data bounds for ${variable.name}`)
      }
      const dimensionNames = variable.dimensions.map((id) => {
        const dimension = dimensions[id]
        if (!dimension) throw new Error(`Unresolved NetCDF dimension ${id}`)
        return dimension.name
      })
      const elementCount = variable.dimensions.reduce((count, id) => {
        const dimension = dimensions[id]
        if (!dimension) throw new Error(`Unresolved NetCDF dimension ${id}`)
        return count * dimension.size
      }, 1)
      const width =
        variable.type === 'char'
          ? 1
          : variable.type === 'int' || variable.type === 'float'
            ? 4
            : variable.type === 'double'
              ? 8
              : 0
      if (width === 0 || variable.size !== Math.ceil((elementCount * width) / 4) * 4) {
        throw new Error(`Invalid NetCDF data size for the shape of ${variable.name}`)
      }
      const data = reader.getDataVariable(variable)
      // netcdfjs includes CDF-1 char padding in its returned values.
      const values = data.slice(0, elementCount).map((value) => {
        if (typeof value === 'number') return value
        if (typeof value === 'string') return (value.charCodeAt(0) || 0) & 0xff
        throw new Error('Expected fixed-size scalar NetCDF values')
      })
      return {
        name: decodeText(variable.name),
        type: variable.type,
        dimensions: dimensionNames,
        attributes: attributeDictionary(variable.attributes),
        data:
          variable.type === 'int'
            ? Int32Array.from(values)
            : variable.type === 'float'
              ? Float32Array.from(values)
              : variable.type === 'double'
                ? Float64Array.from(values)
                : Uint8Array.from(values),
      }
    }),
  }
}

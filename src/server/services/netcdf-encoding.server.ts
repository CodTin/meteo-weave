/** Fixed-size NetCDF Classic (CDF-1), without native production dependencies. */
export interface NetCDFVariableDescriptor {
  name: string
  type: 'int' | 'float' | 'double' | 'char'
  dimensions: string[]
  attributes: Record<string, string | number>
}

export interface NetCDFVariable extends NetCDFVariableDescriptor {
  data: Int32Array | Float32Array | Float64Array | Uint8Array
}

export interface NetCDFDimension {
  name: string
  size: number
}

/** The complete file description, without allocating or reading variable data. */
export interface NetCDFSchema {
  dimensions: NetCDFDimension[]
  variables: NetCDFVariableDescriptor[]
  globalAttributes: Record<string, string | number>
}

export interface NetCDFEncoding extends NetCDFSchema {
  variables: NetCDFVariable[]
}

/** Explicit runtime ceiling; no fallback file format or partial output. */
export const NETCDF_MAX_BYTES = 32 * 1024 * 1024

const CDF1_MAX = 2147483647

const NC_DIMENSION = 10
const NC_VARIABLE = 11
const NC_ATTRIBUTE = 12
const NC_CHAR = 2
const NC_INT = 4
const NC_FLOAT = 5
const NC_DOUBLE = 6

interface TextLayout {
  value: string
  bytes: number
}

interface AttributeLayout {
  name: TextLayout
  value: string | number
  type: number
  count: number
  bytes: number
}

interface VariableLayout {
  name: TextLayout
  type: NetCDFVariableDescriptor['type']
  typeCode: number
  width: number
  dimensionIds: number[]
  attributes: AttributeLayout[]
  elements: number
  vsize: number
  begin: number
}

function cdf1(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > CDF1_MAX) {
    throw new Error(`NetCDF ${field} exceeds the conservative CDF-1 integer limit ${CDF1_MAX}`)
  }
  return value
}

function padded(bytes: number): number {
  return cdf1(Math.ceil(cdf1(bytes, 'byte count') / 4) * 4, 'padded byte count/vsize')
}

// TextEncoder's UTF-8 byte count, without allocating a temporary byte buffer.
function text(value: string): TextLayout {
  let bytes = 0
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4
  }
  return { value, bytes: cdf1(bytes, 'UTF-8 byte count') }
}

function netcdfName(value: string): TextLayout {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error('NetCDF name must be nonempty')
  const normalized = value.normalize('NFC')
  let first = true
  for (const character of normalized) {
    const point = character.codePointAt(0) ?? 0
    if (
      point <= 0x1f ||
      point === 0x7f ||
      (point >= 0xd800 && point <= 0xdfff) ||
      character === '/'
    ) {
      throw new Error(`Invalid NetCDF name ${JSON.stringify(value)}`)
    }
    if (first && point < 0x80 && !/[A-Za-z0-9_]/.test(character)) {
      throw new Error(`Invalid first character in NetCDF name ${JSON.stringify(value)}`)
    }
    first = false
  }
  if (normalized.endsWith(' ')) throw new Error(`NetCDF name cannot have trailing space: ${value}`)
  return text(normalized)
}

function declareName(names: Set<string>, name: string, kind: string) {
  if (names.has(name)) throw new Error(`Duplicate NetCDF ${kind} ${name}`)
  names.add(name)
}

function attributes(
  values: Record<string, string | number>,
  variableType?: NetCDFVariableDescriptor['type'],
): AttributeLayout[] {
  const names = new Set<string>()
  const entries = Object.entries(values)
  cdf1(entries.length, 'attribute count')
  return entries.map(([name, value]) => {
    const normalizedName = netcdfName(name)
    declareName(names, normalizedName.value, 'attribute')
    const format =
      normalizedName.value === '_FillValue' && variableType
        ? typeFormat(variableType)
        : { code: NC_DOUBLE, width: 8 }
    if (normalizedName.value === '_FillValue' && variableType) {
      if (variableType === 'char') {
        if (typeof value !== 'string' || text(value).bytes !== 1) {
          throw new Error('_FillValue for char must be a single byte character')
        }
      } else if (typeof value !== 'number') {
        throw new Error(`_FillValue for ${variableType} must be a scalar number`)
      }
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error(`NetCDF attribute ${name} must be finite`)
      if (
        format.code === NC_INT &&
        (!Number.isInteger(value) || value < -2147483648 || value > CDF1_MAX)
      ) {
        throw new Error('_FillValue for int must be a signed int32')
      }
      if (format.code === NC_FLOAT && !Number.isFinite(Math.fround(value))) {
        throw new Error('_FillValue for float must be representable as float32')
      }
    } else if (typeof value !== 'string') {
      throw new Error(`NetCDF attribute ${name} must be a string or number`)
    }
    const bytes = typeof value === 'string' ? text(value).bytes : format.width
    return {
      name: normalizedName,
      value,
      type: typeof value === 'string' ? NC_CHAR : format.code,
      count: typeof value === 'string' ? bytes : 1,
      bytes,
    }
  })
}

function attributesSize(items: AttributeLayout[]): number {
  let size = 8
  for (const item of items) {
    size = cdf1(
      size + 12 + padded(item.name.bytes) + padded(item.bytes),
      'attribute list byte count',
    )
  }
  return size
}

function typeFormat(type: NetCDFVariableDescriptor['type']): { code: number; width: number } {
  switch (type) {
    case 'char':
      return { code: NC_CHAR, width: 1 }
    case 'int':
      return { code: NC_INT, width: 4 }
    case 'float':
      return { code: NC_FLOAT, width: 4 }
    case 'double':
      return { code: NC_DOUBLE, width: 8 }
    default:
      throw new Error(`Unsupported NetCDF variable type ${String(type)}`)
  }
}

function declaredList<T>(values: T[], field: string): T[] {
  if (!Array.isArray(values)) throw new Error(`NetCDF ${field} must be an array`)
  cdf1(values.length, `${field} count`)
  for (let index = 0; index < values.length; index++) {
    if (values[index] == null) throw new Error(`NetCDF ${field} declaration ${index} is missing`)
  }
  return values
}

function layoutNetCDF(schema: NetCDFSchema) {
  declaredList(schema.dimensions, 'dimension')
  declaredList(schema.variables, 'variable')
  const dimensionNames = new Set<string>()
  const dimensions = schema.dimensions.map((dimension) => {
    const name = netcdfName(dimension.name)
    declareName(dimensionNames, name.value, 'dimension')
    if (!Number.isSafeInteger(dimension.size) || dimension.size <= 0) {
      throw new Error(
        `Dimension ${dimension.name} must be a positive safe integer (fixed-size only)`,
      )
    }
    if (dimension.size > CDF1_MAX) {
      throw new Error(
        `Dimension ${dimension.name} exceeds the conservative CDF-1 limit ${CDF1_MAX}`,
      )
    }
    return { name, size: dimension.size }
  })
  const dimensionIds = new Map(dimensions.map((dimension, id) => [dimension.name.value, id]))
  const globalAttributes = attributes(schema.globalAttributes)
  let headerBytes = cdf1(24 + attributesSize(globalAttributes), 'header byte count')
  for (const dimension of dimensions) {
    headerBytes = cdf1(headerBytes + 8 + padded(dimension.name.bytes), 'dimension list byte count')
  }
  const variableNames = new Set<string>()
  const variables: VariableLayout[] = schema.variables.map((variable) => {
    const name = netcdfName(variable.name)
    declareName(variableNames, name.value, 'variable')
    declaredList(variable.dimensions, 'variable dimension')
    const ids = variable.dimensions.map((name) => {
      const id = dimensionIds.get(name.normalize('NFC'))
      if (id === undefined) throw new Error(`Dimension ${name} not found`)
      return id
    })
    const elements = ids.reduce((size, id) => {
      const dimension = dimensions[id]
      if (!dimension) throw new Error(`Dimension ${id} not found`)
      return cdf1(size * dimension.size, `dimension product for ${name.value}`)
    }, 1)
    const format = typeFormat(variable.type)
    const variableAttributes = attributes(variable.attributes, variable.type)
    headerBytes = cdf1(
      headerBytes + 20 + padded(name.bytes) + ids.length * 4 + attributesSize(variableAttributes),
      'header byte count',
    )
    return {
      name,
      type: variable.type,
      typeCode: format.code,
      width: format.width,
      dimensionIds: ids,
      attributes: variableAttributes,
      elements,
      vsize: padded(cdf1(elements * format.width, `data byte count for ${name.value}`)),
      begin: 0,
    }
  })
  let byteLength = headerBytes
  for (const variable of variables) {
    variable.begin = cdf1(byteLength, `begin offset for ${variable.name.value}`)
    byteLength = cdf1(byteLength + variable.vsize, 'file byte count/offset')
  }
  if (byteLength > NETCDF_MAX_BYTES) {
    throw new Error(
      `NetCDF output needs ${byteLength} bytes, exceeding the 32 MiB runtime limit; reduce the export area or time range`,
    )
  }
  return { dimensions, globalAttributes, variables, byteLength }
}

/** Exact CDF-1 header, padding and fixed data bytes; never inspects variable data. */
export function measureNetCDF(schema: NetCDFSchema): number {
  return layoutNetCDF(schema).byteLength
}

/** Encode into one exact-size output buffer using one big-endian DataView. */
export function encodeNetCDF(encoding: NetCDFEncoding): Uint8Array {
  const layout = layoutNetCDF(encoding)
  // Check every variable before allocating or writing any output bytes.
  const dataArrays = layout.variables.map((variable, index) => {
    const data = encoding.variables[index]?.data
    const expected =
      variable.type === 'char'
        ? Uint8Array
        : variable.type === 'int'
          ? Int32Array
          : variable.type === 'float'
            ? Float32Array
            : Float64Array
    if (!(data instanceof expected)) {
      throw new Error(
        `NetCDF variable ${variable.name.value} requires ${expected.name} for type ${variable.type}`,
      )
    }
    if (data.length !== variable.elements) {
      throw new Error(
        `NetCDF variable ${variable.name.value} data length ${data.length} must equal dimension product ${variable.elements}`,
      )
    }
    return data
  })
  const output = new Uint8Array(layout.byteLength)
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength)
  const encoder = new TextEncoder()
  let offset = 0

  function int(value: number) {
    view.setInt32(offset, value, false)
    offset += 4
  }

  function chars(value: string, bytes: number) {
    encoder.encodeInto(value, output.subarray(offset, offset + bytes))
    offset += padded(bytes)
  }

  function name(item: TextLayout) {
    int(item.bytes)
    chars(item.value, item.bytes)
  }

  function writeAttributes(items: AttributeLayout[]) {
    int(items.length ? NC_ATTRIBUTE : 0)
    int(items.length)
    for (const item of items) {
      name(item.name)
      int(item.type)
      int(item.count)
      if (typeof item.value === 'string') {
        chars(item.value, item.bytes)
      } else {
        if (item.type === NC_INT) view.setInt32(offset, item.value, false)
        else if (item.type === NC_FLOAT) view.setFloat32(offset, item.value, false)
        else view.setFloat64(offset, item.value, false)
        offset += padded(item.bytes)
      }
    }
  }

  view.setUint32(offset, 0x43444601, false)
  offset += 4
  int(0) // No record/unlimited dimension.
  int(layout.dimensions.length ? NC_DIMENSION : 0)
  int(layout.dimensions.length)
  for (const dimension of layout.dimensions) {
    name(dimension.name)
    int(dimension.size)
  }
  writeAttributes(layout.globalAttributes)
  int(layout.variables.length ? NC_VARIABLE : 0)
  int(layout.variables.length)
  for (const variable of layout.variables) {
    name(variable.name)
    int(variable.dimensionIds.length)
    for (const id of variable.dimensionIds) int(id)
    writeAttributes(variable.attributes)
    int(variable.typeCode)
    int(variable.vsize)
    int(variable.begin)
  }

  for (const [index, variable] of layout.variables.entries()) {
    const data = dataArrays[index]
    if (!data) throw new Error(`Missing data for ${variable.name.value}`)
    if (variable.type === 'char') {
      if (!(data instanceof Uint8Array)) throw new Error('Char variable must use Uint8Array')
      output.set(data, variable.begin)
      const fill = variable.attributes.find((item) => item.name.value === '_FillValue')?.value
      if (typeof fill === 'string') {
        output.fill(
          fill.charCodeAt(0),
          variable.begin + data.length,
          variable.begin + variable.vsize,
        )
      }
    } else {
      for (let i = 0; i < data.length; i++) {
        const value = data[i]
        if (value === undefined) throw new Error('Data contains undefined values')
        const position = variable.begin + i * variable.width
        if (variable.type === 'int') view.setInt32(position, value, false)
        else if (variable.type === 'float') view.setFloat32(position, value, false)
        else view.setFloat64(position, value, false)
      }
    }
  }
  return output
}

import { NetCDFReader } from 'netcdfjs'
import { describe, expect, it } from 'vitest'
import {
  encodeNetCDF,
  NETCDF_MAX_BYTES,
  measureNetCDF,
  type NetCDFSchema,
  type NetCDFEncoding,
} from '@/server/services/netcdf-encoding.server'
import { readNetCDF } from '../lib/netcdf-reader'

describe('bounded NetCDF Classic layout', () => {
  it('writes the canonical 32-byte file with every absent tag and count', () => {
    const encoded = encodeNetCDF({ dimensions: [], globalAttributes: {}, variables: [] })

    // Unidata's empty.nc example: CDF-1, numrecs, then three ZERO ZERO lists.
    expect(encoded).toEqual(
      Uint8Array.of(
        0x43,
        0x44,
        0x46,
        1,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
      ),
    )
    expect(readNetCDF(encoded)).toEqual({
      version: 1,
      dimensions: [],
      globalAttributes: {},
      variables: [],
    })
  })

  it('measures and writes a fixed char variable with padded vsize and absolute begin', () => {
    const schema: NetCDFSchema = {
      dimensions: [{ name: 'x', size: 3 }],
      globalAttributes: {},
      variables: [{ name: 'c', type: 'char', dimensions: ['x'], attributes: {} }],
    }
    const encoded = encodeNetCDF({
      ...schema,
      variables: schema.variables.map((variable) => ({
        ...variable,
        data: Uint8Array.of(65, 0, 255),
      })),
    })

    // CDL: x=3; char c(x); c='A', '\0', 0xff. Header 80, padded data 4.
    expect(encoded).toEqual(
      Uint8Array.of(
        0x43,
        0x44,
        0x46,
        1,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        10,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        1,
        120,
        0,
        0,
        0,
        0,
        0,
        0,
        3,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        11,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        1,
        99,
        0,
        0,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        2,
        0,
        0,
        0,
        4,
        0,
        0,
        0,
        80,
        65,
        0,
        255,
        0,
      ),
    )
    expect(measureNetCDF(schema)).toBe(84)
    expect(readNetCDF(encoded).variables[0]?.data).toEqual(Uint8Array.of(65, 0, 255))
    expect(measureNetCDF({ dimensions: [], variables: [], globalAttributes: {} })).toBe(32)
  })

  it.each([
    {
      type: 'float',
      data: Float32Array.of(-2.5, -0, 0, -9999),
      bytes: [0xc0, 0x20, 0, 0, 0x80, 0, 0, 0, 0, 0, 0, 0, 0xc6, 0x1c, 0x3c, 0],
    },
    {
      type: 'double',
      data: Float64Array.of(-2.5, -0, 0, -9999),
      bytes: [
        0xc0, 4, 0, 0, 0, 0, 0, 0, 0x80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xc0, 0xc3,
        0x87, 0x80, 0, 0, 0, 0,
      ],
    },
  ] satisfies Array<{
    type: 'float' | 'double'
    data: Float32Array | Float64Array
    bytes: number[]
  }>)(
    'writes big-endian $type science and a scalar _FillValue of the same type',
    ({ type, data, bytes }) => {
      const schema: NetCDFSchema = {
        dimensions: [{ name: 'sample', size: 4 }],
        globalAttributes: { seed: 0 },
        variables: [
          {
            name: 'science',
            type,
            dimensions: ['sample'],
            attributes: { _FillValue: -9999, scale_factor: 1, units: 'K' },
          },
        ],
      }
      const encoded = encodeNetCDF({
        ...schema,
        variables: schema.variables.map((variable) => ({ ...variable, data })),
      })
      const reader = new NetCDFReader(encoded)
      const variable = reader.variables[0]
      expect(variable?.type).toBe(type)
      expect(variable?.attributes).toContainEqual({ name: '_FillValue', type, value: -9999 })
      expect(variable?.attributes).toContainEqual({
        name: 'scale_factor',
        type: 'double',
        value: 1,
      })
      expect(encoded.subarray(variable?.offset)).toEqual(Uint8Array.from(bytes))
      expect(encoded.byteLength).toBe(measureNetCDF(schema))
      expect(readNetCDF(encoded)).toMatchObject({
        dimensions: [{ name: 'sample', size: 4 }],
        globalAttributes: { seed: 0 },
        variables: [
          {
            name: 'science',
            type,
            dimensions: ['sample'],
            attributes: { _FillValue: -9999, scale_factor: 1, units: 'K' },
            data,
          },
        ],
      })
      // Numerical zero must not become fill, and signed zero remains IEEE negative zero.
      expect(Object.is(readNetCDF(encoded).variables[0]?.data[1], -0)).toBe(true)
    },
  )

  it('writes signed int32 data and a typed integer fill attribute without coercion', () => {
    const schema: NetCDFSchema = {
      dimensions: [{ name: 'sample', size: 4 }],
      globalAttributes: {},
      variables: [
        {
          name: 'flags',
          type: 'int',
          dimensions: ['sample'],
          attributes: { _FillValue: -2147483648 },
        },
      ],
    }
    const data = Int32Array.of(-2147483648, -1, 0, 2147483647)
    const encoded = encodeNetCDF({
      ...schema,
      variables: schema.variables.map((variable) => ({ ...variable, data })),
    })
    const reader = new NetCDFReader(encoded)
    expect(reader.variables[0]?.attributes).toContainEqual({
      name: '_FillValue',
      type: 'int',
      value: -2147483648,
    })
    expect(encoded.subarray(reader.variables[0]?.offset)).toEqual(
      Uint8Array.of(0x80, 0, 0, 0, 0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0, 0x7f, 0xff, 0xff, 0xff),
    )
    expect(readNetCDF(encoded).variables[0]).toMatchObject({
      name: 'flags',
      type: 'int',
      dimensions: ['sample'],
      attributes: { _FillValue: -2147483648 },
      data,
    })
    expect(measureNetCDF(schema)).toBe(encoded.byteLength)
  })

  it('counts UTF-8 attribute names and values in bytes, including four-byte characters', () => {
    const schema: NetCDFSchema = {
      dimensions: [],
      variables: [],
      globalAttributes: { 标题: '温度🌡' },
    }
    const encoded = encodeNetCDF({ ...schema, variables: [] })
    // Header-only CDL: :标题 = "温度🌡". Name 6 bytes, value 10 bytes, two pad bytes each.
    expect(encoded).toEqual(
      Uint8Array.of(
        0x43,
        0x44,
        0x46,
        1,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        12,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        6,
        0xe6,
        0xa0,
        0x87,
        0xe9,
        0xa2,
        0x98,
        0,
        0,
        0,
        0,
        0,
        2,
        0,
        0,
        0,
        10,
        0xe6,
        0xb8,
        0xa9,
        0xe5,
        0xba,
        0xa6,
        0xf0,
        0x9f,
        0x8c,
        0xa1,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
      ),
    )
    expect(measureNetCDF(schema)).toBe(64)
    expect(readNetCDF(encoded).globalAttributes).toEqual({ 标题: '温度🌡' })
  })

  it('normalizes Unicode names to NFC without normalizing character data', () => {
    const schema: NetCDFSchema = {
      dimensions: [{ name: 'e\u0301', size: 3 }],
      globalAttributes: { 'e\u0301': 'e\u0301' },
      variables: [{ name: '温度', type: 'char', dimensions: ['é'], attributes: {} }],
    }
    const data = Uint8Array.of(0x65, 0xcc, 0x81)
    const encoded = encodeNetCDF({
      ...schema,
      variables: schema.variables.map((variable) => ({ ...variable, data })),
    })
    expect(encoded.subarray(16, 28)).toEqual(
      Uint8Array.of(0, 0, 0, 2, 0xc3, 0xa9, 0, 0, 0, 0, 0, 3),
    )
    expect(measureNetCDF(schema)).toBe(encoded.byteLength)
    expect(readNetCDF(encoded)).toMatchObject({
      dimensions: [{ name: 'é', size: 3 }],
      globalAttributes: { é: 'e\u0301' },
      variables: [{ name: '温度', type: 'char', dimensions: ['é'], data }],
    })
  })

  it.each([
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    2147483648,
  ])(
    'rejects non-positive, unsafe or unrepresentable fixed dimension %s at both public seams',
    (size) => {
      const schema: NetCDFSchema = {
        dimensions: [{ name: 'x', size }],
        globalAttributes: {},
        variables: [],
      }
      expect(() => measureNetCDF(schema)).toThrow(/dimension.*positive.*integer|dimension.*CDF-1/i)
      expect(() => encodeNetCDF({ ...schema, variables: [] })).toThrow(
        /dimension.*positive.*integer|dimension.*CDF-1/i,
      )
    },
  )

  it.each<{ label: string; schema: NetCDFSchema }>([
    {
      label: 'dimension',
      schema: {
        dimensions: [
          { name: 'x', size: 1 },
          { name: 'x', size: 2 },
        ],
        variables: [],
        globalAttributes: {},
      },
    },
    {
      label: 'normalized dimension',
      schema: {
        dimensions: [
          { name: 'é', size: 1 },
          { name: 'e\u0301', size: 2 },
        ],
        variables: [],
        globalAttributes: {},
      },
    },
    {
      label: 'variable',
      schema: {
        dimensions: [],
        globalAttributes: {},
        variables: [
          { name: 'x', type: 'float', dimensions: [], attributes: {} },
          { name: 'x', type: 'double', dimensions: [], attributes: {} },
        ],
      },
    },
    {
      label: 'normalized attribute',
      schema: {
        dimensions: [],
        variables: [],
        globalAttributes: { é: 'a', 'e\u0301': 'b' },
      },
    },
  ] satisfies Array<{ label: string; schema: NetCDFSchema }>)(
    'rejects duplicate $label declarations instead of silently choosing one',
    ({ schema }) => {
      expect(() => measureNetCDF(schema)).toThrow(/duplicate/i)
      expect(() =>
        encodeNetCDF({
          ...schema,
          variables: schema.variables.map((variable) => ({
            ...variable,
            data: Float32Array.of(0),
          })),
        }),
      ).toThrow(/duplicate/i)
    },
  )

  it('rejects references to undeclared dimensions in measurement and encoding', () => {
    const schema: NetCDFSchema = {
      dimensions: [{ name: 'x', size: 1 }],
      globalAttributes: {},
      variables: [{ name: 'science', type: 'float', dimensions: ['y'], attributes: {} }],
    }
    expect(() => measureNetCDF(schema)).toThrow(/dimension y.*not found/i)
    expect(() =>
      encodeNetCDF({
        ...schema,
        variables: schema.variables.map((variable) => ({ ...variable, data: Float32Array.of(0) })),
      }),
    ).toThrow(/dimension y.*not found/i)
  })

  it.each([
    { sizes: [65536, 65536], type: 'char' },
    { sizes: [2147483647], type: 'char' },
    { sizes: [536870912], type: 'float' },
    { sizes: [268435456], type: 'double' },
  ] satisfies Array<{ sizes: number[]; type: 'char' | 'float' | 'double' }>)(
    'rejects CDF-1 dimension products and padded vsizes before any data access: $sizes $type',
    ({ sizes, type }) => {
      const schema: NetCDFSchema = {
        dimensions: sizes.map((size, id) => ({ name: `d${id}`, size })),
        globalAttributes: {},
        variables: [
          { name: 'science', type, dimensions: sizes.map((_, id) => `d${id}`), attributes: {} },
        ],
      }
      expect(() => measureNetCDF(schema)).toThrow(/CDF-1/i)
      expect(() =>
        encodeNetCDF({
          ...schema,
          variables: schema.variables.map((variable) => ({
            ...variable,
            get data(): Uint8Array {
              throw new Error('Data must not be accessed for an invalid schema')
            },
          })),
        }),
      ).toThrow(/CDF-1/i)
    },
  )

  it('rejects cumulative CDF-1 data begins and file length even when each vsize fits', () => {
    const schema: NetCDFSchema = {
      dimensions: [{ name: 'x', size: 1073741824 }],
      globalAttributes: {},
      variables: [
        { name: 'c', type: 'char', dimensions: ['x'], attributes: {} },
        { name: 'd', type: 'char', dimensions: ['x'], attributes: {} },
      ],
    }
    expect(() => measureNetCDF(schema)).toThrow(/CDF-1/i)
    expect(() =>
      encodeNetCDF({
        ...schema,
        variables: schema.variables.map((variable) => ({
          ...variable,
          get data(): Uint8Array {
            throw new Error('Data must not be accessed for an invalid layout')
          },
        })),
      }),
    ).toThrow(/CDF-1/i)
  })

  it('measures exactly at the 32MiB ceiling without data and rejects the first padded byte above', () => {
    expect(NETCDF_MAX_BYTES).toBe(33554432)
    const schema: NetCDFSchema = {
      dimensions: [{ name: 'x', size: 33554352 }],
      globalAttributes: {},
      variables: [{ name: 'c', type: 'char', dimensions: ['x'], attributes: {} }],
    }
    // The fixed-char worked example has an 80-byte header, independent of dimension length.
    expect(measureNetCDF(schema)).toBe(33554432)
    const oversized = { ...schema, dimensions: [{ name: 'x', size: 33554353 }] }
    expect(() => measureNetCDF(oversized)).toThrow(/32.*MiB.*reduce|reduce.*32.*MiB/i)
    expect(() =>
      encodeNetCDF({
        ...oversized,
        variables: oversized.variables.map((variable) => ({
          ...variable,
          get data(): Uint8Array {
            throw new Error('Data must not be accessed above the runtime limit')
          },
        })),
      }),
    ).toThrow(/32.*MiB.*reduce|reduce.*32.*MiB/i)
  })

  it.each([
    { type: 'float', data: Float64Array.of(0), expected: /Float32Array/i },
    { type: 'double', data: Float32Array.of(0), expected: /Float64Array/i },
    { type: 'char', data: Float32Array.of(0), expected: /Uint8Array/i },
    { type: 'int', data: Uint8Array.of(0), expected: /Int32Array/i },
  ] satisfies Array<{
    type: 'int' | 'float' | 'double' | 'char'
    data: Float32Array | Float64Array | Uint8Array
    expected: RegExp
  }>)(
    'rejects a $type variable with the wrong typed array instead of coercing it',
    ({ type, data, expected }) => {
      const schema: NetCDFSchema = {
        dimensions: [],
        globalAttributes: {},
        variables: [{ name: 'science', type, dimensions: [], attributes: {} }],
      }
      expect(measureNetCDF(schema)).toBeGreaterThan(32)
      expect(() =>
        encodeNetCDF({
          ...schema,
          variables: schema.variables.map((variable) => ({ ...variable, data })),
        }),
      ).toThrow(expected)
    },
  )

  it.each([0, 1, 3, 5])('rejects %s data values for a four-element dimension product', (length) => {
    const schema: NetCDFSchema = {
      dimensions: [
        { name: 'x', size: 2 },
        { name: 'y', size: 2 },
      ],
      globalAttributes: {},
      variables: [{ name: 'science', type: 'float', dimensions: ['x', 'y'], attributes: {} }],
    }
    expect(() =>
      encodeNetCDF({
        ...schema,
        variables: schema.variables.map((variable) => ({
          ...variable,
          data: new Float32Array(length),
        })),
      }),
    ).toThrow(/science.*length.*4/i)
  })

  it.each([
    { type: 'float', value: 'missing' },
    { type: 'float', value: 1e100 },
    { type: 'int', value: 1.5 },
    { type: 'int', value: 2147483648 },
    { type: 'char', value: 0 },
    { type: 'char', value: 'many' },
  ] satisfies Array<{ type: 'float' | 'int' | 'char'; value: string | number }>)(
    'rejects _FillValue $value that cannot be a scalar of declared $type',
    ({ type, value }) => {
      const schema: NetCDFSchema = {
        dimensions: [],
        globalAttributes: {},
        variables: [{ name: 'science', type, dimensions: [], attributes: { _FillValue: value } }],
      }
      expect(() => measureNetCDF(schema)).toThrow(/_FillValue/i)
      expect(() =>
        encodeNetCDF({
          ...schema,
          variables: schema.variables.map((variable) => ({
            ...variable,
            data: Float32Array.of(0),
          })),
        }),
      ).toThrow(/_FillValue/i)
    },
  )

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite numeric metadata %s at both public seams',
    (value) => {
      const schema: NetCDFSchema = {
        dimensions: [],
        variables: [],
        globalAttributes: { seed: value },
      }
      expect(() => measureNetCDF(schema)).toThrow(/seed.*finite/i)
      expect(() => encodeNetCDF({ ...schema, variables: [] })).toThrow(/seed.*finite/i)
    },
  )

  it('rejects unknown declared types rather than defaulting to char or double', () => {
    const variable = {
      name: 'science',
      type: 'float',
      dimensions: [],
      attributes: {},
    } satisfies NetCDFSchema['variables'][number]
    Reflect.set(variable, 'type', 'short')
    const schema: NetCDFSchema = { dimensions: [], variables: [variable], globalAttributes: {} }
    expect(() => measureNetCDF(schema)).toThrow(/unsupported.*type/i)
    expect(() =>
      encodeNetCDF({
        ...schema,
        variables: [{ ...variable, data: Float32Array.of(0) }],
      }),
    ).toThrow(/unsupported.*type/i)
  })

  it.each(['', 'x/y', 'x ', ' x', '.x', 'x\u0000', 'x\u007f', '\ud800'])(
    'rejects invalid CDF-1 name %j without producing ambiguous UTF-8',
    (name) => {
      const schema: NetCDFSchema = {
        dimensions: [{ name, size: 1 }],
        variables: [],
        globalAttributes: {},
      }
      expect(() => measureNetCDF(schema)).toThrow(/name/i)
      expect(() => encodeNetCDF({ ...schema, variables: [] })).toThrow(/name/i)
    },
  )

  it.each(['dimensions', 'variables'] as const)(
    'rejects an unrepresentable %s count before visiting any entries',
    (field) => {
      const schema: NetCDFSchema = { dimensions: [], variables: [], globalAttributes: {} }
      Reflect.set(schema[field], 'length', 2147483648)
      expect(() => measureNetCDF(schema)).toThrow(/count.*CDF-1/i)
      const encoding = { dimensions: schema.dimensions, globalAttributes: {}, variables: [] }
      if (field === 'variables') encoding.variables.length = 2147483648
      expect(() => encodeNetCDF(encoding)).toThrow(/count.*CDF-1/i)
    },
  )

  it('rejects sparse declarations instead of measuring or emitting missing header entries', () => {
    const schema: NetCDFSchema = { dimensions: [], variables: [], globalAttributes: {} }
    schema.dimensions.length = 1
    expect(() => measureNetCDF(schema)).toThrow(/dimension.*missing|sparse.*dimension/i)
    expect(() => encodeNetCDF({ ...schema, variables: [] })).toThrow(
      /dimension.*missing|sparse.*dimension/i,
    )
  })

  it.each([
    { label: 'wrong magic', offset: 0, bytes: [0] },
    { label: 'nonzero absent list count', offset: 12, bytes: [0, 0, 0, 1] },
    { label: 'invalid variable type', offset: 52, bytes: [0, 0, 0, 99] },
    { label: 'begin outside file', offset: 60, bytes: [0, 0, 16, 0] },
    { label: 'begin inside header', offset: 60, bytes: [0, 0, 0, 8] },
  ])('independently rejects corruption: $label', ({ offset, bytes }) => {
    const encoded = encodeNetCDF({
      dimensions: [],
      globalAttributes: {},
      variables: [
        { name: 'f', type: 'float', dimensions: [], attributes: {}, data: Float32Array.of(-2.5) },
      ],
    })
    // Fixed scalar layout: absent dims 8..15; type 52, vsize 56, begin 60, data 64.
    const corrupt = encoded.slice()
    corrupt.set(bytes, offset)
    expect(() => readNetCDF(corrupt)).toThrow()
  })

  it('independently rejects truncated data and a truncated empty header', () => {
    const encoded = encodeNetCDF({
      dimensions: [],
      globalAttributes: {},
      variables: [
        { name: 'f', type: 'double', dimensions: [], attributes: {}, data: Float64Array.of(-2.5) },
      ],
    })
    expect(() => readNetCDF(encoded.subarray(0, encoded.byteLength - 1))).toThrow()
    expect(() => readNetCDF(Uint8Array.of(0x43, 0x44, 0x46, 1))).toThrow()
  })

  it('writes scalar char fill and uses that byte for fixed-variable data padding', () => {
    const schema: NetCDFSchema = {
      dimensions: [{ name: 'x', size: 3 }],
      globalAttributes: {},
      variables: [{ name: 'c', type: 'char', dimensions: ['x'], attributes: { _FillValue: '?' } }],
    }
    const encoded = encodeNetCDF({
      ...schema,
      variables: schema.variables.map((variable) => ({
        ...variable,
        data: Uint8Array.of(65, 0, 255),
      })),
    })
    const reader = new NetCDFReader(encoded)
    expect(reader.variables[0]?.attributes).toContainEqual({
      name: '_FillValue',
      type: 'char',
      value: '?',
    })
    expect(encoded.subarray(reader.variables[0]?.offset)).toEqual(Uint8Array.of(65, 0, 255, 63))
    expect(readNetCDF(encoded).variables[0]?.data).toEqual(Uint8Array.of(65, 0, 255))
    expect(measureNetCDF(schema)).toBe(encoded.byteLength)
  })

  it('independently rejects a vsize that cannot hold the declared fixed shape', () => {
    const encoded = encodeNetCDF({
      dimensions: [{ name: 'x', size: 3 }],
      globalAttributes: {},
      variables: [
        {
          name: 'c',
          type: 'char',
          dimensions: ['x'],
          attributes: {},
          data: Uint8Array.of(1, 2, 3),
        },
      ],
    })
    // The fixed-char worked example has vsize at byte 72 and begin at byte 76.
    encoded.set([0, 0, 0, 0], 72)
    expect(() => readNetCDF(encoded)).toThrow(/size|shape/i)
  })

  it('measures a mixed schema without visiting data and independently preserves missing IEEE bounds', () => {
    const schema: NetCDFSchema = {
      dimensions: [{ name: 'x', size: 3 }],
      globalAttributes: { seed: 0, title: '温度🌡' },
      variables: [
        { name: 'c', type: 'char', dimensions: ['x'], attributes: { long_name: '站点' } },
        { name: 'i', type: 'int', dimensions: [], attributes: { _FillValue: -1 } },
        { name: 'f', type: 'float', dimensions: ['x'], attributes: { _FillValue: -9999 } },
        { name: 'd', type: 'double', dimensions: ['x'], attributes: { missing_note: 'unknown' } },
      ],
    }
    const data = [
      Uint8Array.of(0x41, 0, 0xff),
      Int32Array.of(-1),
      Float32Array.of(-2.5, 0, -9999),
      Float64Array.of(Number.NaN, 0, -2.5),
    ]
    const encoding: NetCDFEncoding = {
      ...schema,
      variables: schema.variables.map((variable, id) => {
        const values = data[id]
        if (!values) throw new Error('Missing test data')
        return { ...variable, data: values }
      }),
    }
    const noData: NetCDFEncoding = {
      ...schema,
      variables: schema.variables.map((variable) => ({
        ...variable,
        get data(): Float32Array {
          throw new Error('Measurement must never access data')
        },
      })),
    }
    // Independently worked schema: header 360 (8+20+56+8+72+64+68+64), data 4+4+12+24, total 404.
    expect(measureNetCDF(schema)).toBe(404)
    expect(measureNetCDF(noData)).toBe(404)
    const encoded = encodeNetCDF(encoding)
    expect(encoded.byteLength).toBe(404)
    const independent = new NetCDFReader(encoded)
    expect(independent.variables.map(({ offset, size }) => ({ offset, size }))).toEqual([
      { offset: 360, size: 4 },
      { offset: 364, size: 4 },
      { offset: 368, size: 12 },
      { offset: 380, size: 24 },
    ])
    expect(independent.getDataVariable('d')).toEqual([Number.NaN, 0, -2.5])
    const decoded = readNetCDF(encoded)
    expect(decoded.globalAttributes).toEqual({ seed: 0, title: '温度🌡' })
    expect(decoded.variables.map((variable) => variable.data)).toEqual(data)
    expect(decoded.variables[3]?.attributes).toEqual({ missing_note: 'unknown' })

    // Input and typed-array slices must use their byte offsets, not surrounding backing storage.
    const envelope = new Uint8Array(412)
    envelope.set(encoded, 4)
    expect(readNetCDF(envelope.subarray(4, 408))).toEqual(decoded)
  })
})

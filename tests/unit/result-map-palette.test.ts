import { describe, expect, it } from 'vitest'
import {
  applyResultMapRange,
  resultMapStandardPalette,
  resultMapRangeColors,
  resultMapDisplaySettings,
  resultSampleColor,
} from '@/features/result-analysis/service/result-map-display'
import {
  applyResultMapPalette,
  restoreResultMapPalette,
} from '@/features/result-analysis/service/result-map-palette'
import {
  validateResultMapPalette,
  type ResultMapPaletteInput,
} from '@/features/result-analysis/service/result-map-display-validation'
import type { ResultMapDisplaySettings } from '@/features/result-analysis/types/result-map'

function displayRange(kind: 'absolute' | 'difference' = 'absolute') {
  const display: ResultMapDisplaySettings = {
    ...resultMapStandardPalette('temperature', kind === 'difference' ? 'difference' : 'original'),
    min: 0,
    max: 100,
    unit: '°C',
    kind,
  }
  const result = applyResultMapRange(display, {
    min: kind === 'difference' ? -100 : 0,
    max: 100,
  })
  if (!result.ok) throw new Error(result.error)
  return result.display
}

it('maps an accepted three-stop palette at its actual nonuniform positions and saturates only colors', () => {
  const result = applyResultMapPalette(displayRange(), [
    { position: 0, color: '#000000' },
    { position: 0.25, color: '#ffffff' },
    { position: 1, color: '#ff0000' },
  ])
  if (!result.ok) throw new Error(result.error)
  expect(
    [-10, 0, 12.5, 25, 62.5, 100, 200].map((value) => resultSampleColor(value, result.display)),
  ).toEqual(['#000000', '#000000', '#808080', '#ffffff', '#ff8080', '#ff0000', '#ff0000'])
})

describe('one public palette validation rule', () => {
  const valid = [
    { position: 0, color: '#000000' },
    { position: 0.25, color: '#ffffff' },
    { position: 1, color: '#ff0000' },
  ]
  const invalid: [string, ResultMapPaletteInput, RegExp][] = [
    ['too few', valid.slice(0, 2), /3.*5.*stops/i],
    [
      'too many',
      [0, 0.1, 0.2, 0.3, 0.4, 1].map((position) => ({ position, color: '#ffffff' })),
      /3.*5.*stops/i,
    ],
    [
      'nonfinite',
      [valid[0]!, { position: Number.NaN, color: '#ffffff' }, valid[2]!],
      /finite.*0.*1/i,
    ],
    [
      'infinite text',
      [valid[0]!, { position: 'Infinity', color: '#ffffff' }, valid[2]!],
      /finite.*0.*1/i,
    ],
    ['empty text', [valid[0]!, { position: ' ', color: '#ffffff' }, valid[2]!], /finite.*0.*1/i],
    ['below zero', [{ position: -0.1, color: '#000000' }, valid[1]!, valid[2]!], /0.*1/i],
    ['above one', [valid[0]!, valid[1]!, { position: 1.1, color: '#ff0000' }], /0.*1/i],
    [
      'missing start',
      [{ position: 0.01, color: '#000000' }, valid[1]!, valid[2]!],
      /exactly.*0.*1/i,
    ],
    ['missing end', [valid[0]!, valid[1]!, { position: 0.99, color: '#ff0000' }], /exactly.*0.*1/i],
    [
      'duplicate',
      [valid[0]!, { position: 0, color: '#ffffff' }, valid[2]!],
      /strictly increasing/i,
    ],
    [
      'reverse',
      [
        valid[0]!,
        { position: 0.75, color: '#ffffff' },
        { position: 0.25, color: '#000000' },
        valid[2]!,
      ],
      /strictly increasing/i,
    ],
    ['named color', [valid[0]!, { position: 0.25, color: 'red' }, valid[2]!], /#RRGGBB/i],
    ['short hex', [valid[0]!, { position: 0.25, color: '#fff' }, valid[2]!], /#RRGGBB/i],
    ['alpha hex', [valid[0]!, { position: 0.25, color: '#ffffffff' }, valid[2]!], /#RRGGBB/i],
    ['illegal hex', [valid[0]!, { position: 0.25, color: '#gg0000' }, valid[2]!], /#RRGGBB/i],
  ]
  it.each(invalid)(
    'rejects %s without changing any part of the last accepted mapping or reordering input',
    (_name, input, error) => {
      const applied = applyResultMapPalette(displayRange(), valid)
      if (!applied.ok) throw new Error(applied.error)
      const previous = structuredClone(applied.display)
      const inputBefore = structuredClone(input)
      const result = applyResultMapPalette(applied.display, input)
      expect(result).toEqual({ ok: false, error: expect.stringMatching(error) })
      expect(validateResultMapPalette(input)).toEqual(result)
      expect(applied.display).toEqual(previous)
      expect(input).toEqual(inputBefore)
      expect(resultSampleColor(25, applied.display)).toBe('#ffffff')
    },
  )
})

const standards = [
  ['temperature', ['#2563eb', '#93c5fd', '#ffffff', '#fca5a5', '#dc2626']],
  ['pressure', ['#9333ea', '#c084fc', '#ffffff', '#fb923c', '#ea580c']],
  ['precipitation', ['#ffffff', '#7dd3fc', '#0ea5e9', '#0369a1', '#0c4a6e']],
  ['wind', ['#ffffff', '#86efac', '#22c55e', '#15803d', '#14532d']],
] as const

it.each(standards)(
  'repeatedly restores the frozen %s project standard without changing the numeric range or other display context',
  (variable, colors) => {
    const original = {
      ...displayRange(),
      ...resultMapStandardPalette(variable),
      min: 10,
      max: 20,
      unit:
        variable === 'wind'
          ? 'm/s'
          : variable === 'pressure'
            ? 'hPa'
            : variable === 'precipitation'
              ? 'mm'
              : '°C',
      basis: 'Current scientific context',
      missingCount: 2,
    }
    let active: ResultMapDisplaySettings = original
    for (const color of ['#ff00ff', '#00ff00', '#112233']) {
      const applied = applyResultMapPalette(active, [
        { position: 0, color },
        { position: 0.5, color: '#ffffff' },
        { position: 1, color: '#000000' },
      ])
      if (!applied.ok) throw new Error(applied.error)
      active = restoreResultMapPalette(applied.display, variable)
      expect(active.colors).toEqual(colors)
      expect(active.description).toBe(original.description)
      expect(resultSampleColor(9, active)).toBe(colors[0])
      expect(resultSampleColor(21, active)).toBe(colors[4])
      expect(active).toMatchObject({
        min: 10,
        max: 20,
        mode: 'manual',
        unit: original.unit,
        basis: original.basis,
        missingCount: 2,
      })
    }
    expect(Object.isFrozen(resultMapStandardPalette(variable).colors)).toBe(true)
  },
)

it('restores all seven Difference standard colors even though seven editable stops are rejected', () => {
  const original = displayRange('difference')
  const standard = ['#0c4a6e', '#0ea5e9', '#e0f2fe', '#ffffff', '#fef2f2', '#f87171', '#991b1b']
  expect(
    applyResultMapPalette(
      original,
      standard.map((color, index) => ({ color, position: index / 6 })),
    ),
  ).toMatchObject({ ok: false })
  for (let cycle = 0; cycle < 3; cycle++) {
    const edited = applyResultMapPalette(original, [
      { position: 0, color: '#ff0000' },
      { position: 0.5, color: '#000000' },
      { position: 1, color: '#0000ff' },
    ])
    if (!edited.ok) throw new Error(edited.error)
    const restored = restoreResultMapPalette(edited.display, 'temperature', 'difference')
    expect(restored.colors).toEqual(standard)
    expect(
      [-100, -70, -40, 0, 40, 70, 100].map((value) => resultSampleColor(value, restored)),
    ).toEqual(standard)
    expect(restored).toMatchObject({
      min: -100,
      max: 100,
      mode: 'manual',
      kind: 'difference',
      symmetricZero: false,
    })
  }
})

it('keeps custom Difference zero color and numeric sign halves consistent for four stops, including one-sided ranges', () => {
  const stops = [
    { position: 0, color: '#ff0000' },
    { position: 0.25, color: '#00ff00' },
    { position: 0.75, color: '#0000ff' },
    { position: 1, color: '#ff00ff' },
  ]
  for (const [min, max, values, expected] of [
    [
      -2,
      8,
      [-20, -2, -1, 0, 4, 8, 20],
      ['#ff0000', '#ff0000', '#00ff00', '#008080', '#0000ff', '#ff00ff', '#ff00ff'],
    ],
    [0, 8, [0, 4, 8], ['#008080', '#0000ff', '#ff00ff']],
    [-2, 0, [-2, -1, 0], ['#ff0000', '#00ff00', '#008080']],
  ] as const) {
    const range = applyResultMapRange(displayRange('difference'), { min, max })
    if (!range.ok) throw new Error(range.error)
    const palette = applyResultMapPalette(range.display, stops)
    if (!palette.ok) throw new Error(palette.error)
    expect(values.map((value) => resultSampleColor(value, palette.display))).toEqual(expected)
    if (min === 0)
      expect(resultMapRangeColors(palette.display)).toEqual(['#008080', '#0000ff', '#ff00ff'])
    if (max === 0)
      expect(resultMapRangeColors(palette.display)).toEqual(['#ff0000', '#00ff00', '#008080'])
    expect(resultSampleColor(null, palette.display)).toBe('#64748b')
    expect(resultSampleColor(Number.NaN, palette.display)).toBe('#64748b')
  }
})

it('leaves exact public task queries, metadata, seed, task configuration and parsed CSV records unchanged after custom coloring and repeated restores', async () => {
  const { queryTaskResult } = await import('@/features/downscaling-tasks/service/result-queries')
  const { readResultMapData } = await import('@/features/result-analysis/service/result-map-data')
  const { generateCsvFromTask } = await import('@/server/services/csv-export.server')
  const { exportTask, exportRequest } = await import('../factories/export-task')
  const Papa = (await import('papaparse')).default
  const task = exportTask()
  const taskBefore = structuredClone(task)
  const query = {
    kind: 'points' as const,
    layer: 'original' as const,
    temporalResolution: 'hourly' as const,
    points: [{ longitude: 120, latitude: 30 }],
    times: ['2024-01-01T00:00:00.000Z'],
  }
  const before = queryTaskResult(task, query)
  if (!before.ok) throw new Error(before.error)
  const csvBefore = await generateCsvFromTask(exportRequest(task), task)
  if (!csvBefore.ok) throw new Error(csvBefore.message)
  const source = {
    result: async (_id: string, input: Parameters<typeof queryTaskResult>[1]) =>
      queryTaskResult(task, input),
  }
  const maps = await readResultMapData(source, task, {
    time: query.times[0]!,
    observationMode: 'stations',
  })
  const mapBefore = structuredClone(maps)
  const range = applyResultMapRange(resultMapDisplaySettings(maps).original, { min: 0, max: 1 })
  if (!range.ok) throw new Error(range.error)
  const edited = applyResultMapPalette(range.display, [
    { position: '0', color: '#ff0000' },
    { position: '0.4', color: '#00ff00' },
    { position: '0.7', color: '#ffffff' },
    { position: '0.9', color: '#000000' },
    { position: '1', color: '#0000ff' },
  ])
  if (!edited.ok) throw new Error(edited.error)
  expect(resultSampleColor(before.values[0]!.value, edited.display)).toBe('#0000ff')
  expect(before.values[0]!.value).toBeGreaterThan(1)
  for (let cycle = 0; cycle < 3; cycle++) {
    const restored = restoreResultMapPalette(edited.display, 'temperature')
    expect(resultSampleColor(before.values[0]!.value, restored)).toBe('#dc2626')
  }
  expect(queryTaskResult(task, query)).toEqual(before)
  expect(
    await readResultMapData(source, task, { time: query.times[0]!, observationMode: 'stations' }),
  ).toEqual(mapBefore)
  expect(maps).toEqual(mapBefore)
  expect(task).toEqual(taskBefore)
  const csvAfter = await generateCsvFromTask(exportRequest(task), task)
  if (!csvAfter.ok) throw new Error(csvAfter.message)
  const parsedBefore = Papa.parse<Record<string, string>>(csvBefore.content, {
    header: true,
    skipEmptyLines: true,
  })
  const parsedAfter = Papa.parse<Record<string, string>>(csvAfter.content, {
    header: true,
    skipEmptyLines: true,
  })
  expect(parsedBefore.errors).toEqual([])
  expect(parsedAfter.errors).toEqual([])
  expect(parsedAfter.data).toHaveLength(54)
  expect(parsedAfter.data).toEqual(parsedBefore.data)
}, 15_000)

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { queryTaskResult } from '@/features/downscaling-tasks/service/result-queries'
import type { ResultQuery } from '@/features/downscaling-tasks/service'
import { readResultMapData } from '@/features/result-analysis/service/result-map-data'
import { ResultMapDisplayGroup } from '@/features/result-analysis/components/result-map-display-group'
import { validateResultMapPalette } from '@/features/result-analysis/service/result-map-display-validation'
import { exportTask } from '../factories/export-task'

async function publicMaps(time = '2024-01-01T00:00:00.000Z', id = 'palette-component') {
  const task = exportTask({
    id,
    variable: 'pressure',
    region: { west: 0, east: 0.12, south: 0, north: 0.08 },
  })
  return readResultMapData(
    { result: async (_id: string, query: ResultQuery) => queryTaskResult(task, query) },
    task,
    { time, observationMode: 'interpolated' },
  )
}

it('applies a validated draft to real samples and legends together, rejects bad colors atomically and restores only palette colors', async () => {
  const data = await publicMaps()
  const science = structuredClone(data)
  const user = userEvent.setup()
  render(<ResultMapDisplayGroup data={data} onRetry={() => {}} />)
  const mark = within(screen.getByRole('region', { name: 'Original Data map' })).getAllByRole(
    'img',
  )[0]!
  const scientificLabel = mark.getAttribute('aria-label')
  const range = within(screen.getByRole('group', { name: 'Absolute maps range' }))
  await user.click(range.getByRole('radio', { name: 'Manual range' }))
  await user.clear(range.getByRole('textbox', { name: 'Minimum (hPa)' }))
  await user.type(range.getByRole('textbox', { name: 'Minimum (hPa)' }), '2000')
  await user.clear(range.getByRole('textbox', { name: 'Maximum (hPa)' }))
  await user.type(range.getByRole('textbox', { name: 'Maximum (hPa)' }), '3000')
  await user.click(range.getByRole('button', { name: 'Apply range' }))
  const palette = within(screen.getByRole('group', { name: 'Absolute maps palette' }))
  await user.click(palette.getByRole('button', { name: 'Edit custom palette' }))
  const draft = [
    { position: '0', color: '#ff00ff' },
    { position: '0.25', color: '#00ff00' },
    { position: '1', color: '#0000ff' },
  ]
  for (const [index, stop] of draft.entries()) {
    for (const [label, value] of [
      [`Position ${index + 1} (0–1)`, stop.position],
      [`Color ${index + 1} (#RRGGBB)`, stop.color],
    ]) {
      const input = palette.getByRole('textbox', { name: label! })
      await user.clear(input)
      await user.type(input, value!)
    }
  }
  expect(mark.querySelector('rect')).toHaveAttribute('fill', '#9333ea')
  await user.click(palette.getByRole('button', { name: 'Apply palette' }))
  expect(mark.querySelector('rect')).toHaveAttribute('fill', '#ff00ff')
  for (const legend of screen.getAllByRole('group', { name: 'Map color legend' }).slice(0, 3)) {
    expect(legend).toHaveTextContent('Custom palette')
    expect(legend).toHaveTextContent('2000 hPa')
    expect(legend).toHaveTextContent('3000 hPa')
    expect(legend.querySelector('stop[offset="0"]')).toHaveAttribute('stop-color', '#ff00ff')
    expect(legend.querySelector('stop[offset="0.25"]')).toHaveAttribute('stop-color', '#00ff00')
    expect(legend).toHaveTextContent('True scientific values are not clipped')
  }
  const invalid = palette.getByRole('textbox', { name: 'Color 2 (#RRGGBB)' })
  await user.clear(invalid)
  await user.type(invalid, 'blue')
  await user.click(palette.getByRole('button', { name: 'Apply palette' }))
  const rejected = validateResultMapPalette([draft[0]!, { ...draft[1]!, color: 'blue' }, draft[2]!])
  if (rejected.ok) throw new Error('Invalid color must be rejected')
  expect(palette.getByRole('alert')).toHaveTextContent(rejected.error)
  expect(invalid).toHaveAttribute('aria-invalid', 'true')
  expect(mark.querySelector('rect')).toHaveAttribute('fill', '#ff00ff')
  await user.click(palette.getByRole('button', { name: 'Restore standard palette' }))
  expect(mark.querySelector('rect')).toHaveAttribute('fill', '#9333ea')
  expect(range.getByRole('radio', { name: 'Manual range' })).toBeChecked()
  expect(screen.getAllByRole('group', { name: 'Map color legend' })[0]).toHaveTextContent(
    '2000 hPa',
  )
  expect(mark).toHaveAttribute('aria-label', scientificLabel!)
  expect(palette.queryByRole('alert')).not.toBeInTheDocument()
  // Range-mode restoration is separate from palette restoration.
  await user.click(palette.getByRole('button', { name: 'Edit custom palette' }))
  await user.clear(palette.getByRole('textbox', { name: 'Color 1 (#RRGGBB)' }))
  await user.type(palette.getByRole('textbox', { name: 'Color 1 (#RRGGBB)' }), '#ff00ff')
  await user.click(palette.getByRole('button', { name: 'Apply palette' }))
  await user.click(range.getByRole('radio', { name: 'Automatic range' }))
  expect(palette.getByText(/Active: Custom palette/)).toBeInTheDocument()
  expect(screen.getAllByRole('group', { name: 'Map color legend' })[0]).toHaveTextContent(
    'Automatic range',
  )
  expect(
    screen
      .getAllByRole('group', { name: 'Map color legend' })[0]!
      .querySelector('stop[offset="0"]'),
  ).toHaveAttribute('stop-color', '#ff00ff')
  expect(data).toEqual(science)
}, 15_000)

it('offers three to five editable stops with explicit endpoint preservation and never silently sorts a reversed draft', async () => {
  const user = userEvent.setup()
  render(<ResultMapDisplayGroup data={await publicMaps()} onRetry={() => {}} />)
  const palette = within(screen.getByRole('group', { name: 'Absolute maps palette' }))
  await user.click(palette.getByRole('button', { name: 'Edit custom palette' }))
  expect(palette.getByRole('textbox', { name: 'Position 1 (0–1)' })).toHaveFocus()
  expect(palette.getAllByRole('textbox')).toHaveLength(6)
  expect(palette.getByRole('button', { name: 'Remove last interior stop' })).toBeDisabled()
  await user.click(palette.getByRole('button', { name: 'Add stop' }))
  expect(palette.getAllByRole('textbox')).toHaveLength(8)
  await user.click(palette.getByRole('button', { name: 'Apply palette' }))
  expect(palette.queryByRole('alert')).not.toBeInTheDocument()
  await user.click(palette.getByRole('button', { name: 'Add stop' }))
  expect(palette.getAllByRole('textbox')).toHaveLength(10)
  expect(palette.getByRole('button', { name: 'Add stop' })).toBeDisabled()
  expect(palette.getByRole('textbox', { name: 'Position 1 (0–1)' })).toHaveValue('0')
  expect(palette.getByRole('textbox', { name: 'Position 5 (0–1)' })).toHaveValue('1')
  await user.click(palette.getByRole('button', { name: 'Apply palette' }))
  expect(palette.queryByRole('alert')).not.toBeInTheDocument()
  const reversed = palette.getByRole('textbox', { name: 'Position 2 (0–1)' })
  await user.clear(reversed)
  await user.type(reversed, '0.9')
  await user.click(palette.getByRole('button', { name: 'Apply palette' }))
  expect(palette.getByRole('alert')).toHaveTextContent('strictly increasing')
  expect(reversed).toHaveValue('0.9')
  expect(palette.getByRole('textbox', { name: 'Position 3 (0–1)' })).toHaveValue('0.75')
  expect(
    screen.getAllByRole('group', { name: 'Map color legend' })[0]!.querySelectorAll('stop'),
  ).toHaveLength(5)
  await user.clear(reversed)
  await user.type(reversed, '0.5')
  await user.click(palette.getByRole('button', { name: 'Remove last interior stop' }))
  await user.click(palette.getByRole('button', { name: 'Remove last interior stop' }))
  expect(palette.getAllByRole('textbox')).toHaveLength(6)
  await user.click(palette.getByRole('button', { name: 'Apply palette' }))
  expect(palette.queryByRole('alert')).not.toBeInTheDocument()
}, 15_000)

it('keeps signed values, zero, missing and nonfinite marks explicit after hue reversal and restores all seven Difference colors independently', async () => {
  const data = await publicMaps()
  const sample = data.layers.difference.samples[0]!
  data.layers.difference.samples = [-2, -1, 0, 4, 8, null, Number.POSITIVE_INFINITY].map(
    (value, index) => ({ ...sample, longitude: 0.01 * index, value }),
  )
  const science = structuredClone(data)
  const user = userEvent.setup()
  render(<ResultMapDisplayGroup data={data} onRetry={() => {}} />)
  const range = within(screen.getByRole('group', { name: 'Difference range' }))
  await user.click(range.getByRole('radio', { name: 'Manual range' }))
  await user.click(range.getByRole('checkbox', { name: 'Symmetric around zero' }))
  for (const [name, value] of [
    ['Minimum (hPa)', '-2'],
    ['Maximum (hPa)', '8'],
  ]) {
    await user.clear(range.getByRole('textbox', { name: name! }))
    await user.type(range.getByRole('textbox', { name: name! }), value!)
  }
  await user.click(range.getByRole('button', { name: 'Apply range' }))
  const palette = within(screen.getByRole('group', { name: 'Difference palette' }))
  expect(palette.getByText(/Project standard · 7 colors/)).toBeInTheDocument()
  await user.click(palette.getByRole('button', { name: 'Edit custom palette' }))
  expect(palette.getAllByRole('textbox')).toHaveLength(6)
  expect(palette.getByText(/not the full project standard/)).toBeInTheDocument()
  const legend = screen.getAllByRole('group', { name: 'Map color legend' })[3]!
  const map = within(screen.getByRole('region', { name: 'Difference (Downscaled - Original) map' }))
  for (let cycle = 0; cycle < 2; cycle++) {
    for (const [index, color] of ['#ff0000', '#000000', '#0000ff'].entries()) {
      const input = palette.getByRole('textbox', { name: `Color ${index + 1} (#RRGGBB)` })
      await user.clear(input)
      await user.type(input, color)
    }
    await user.click(palette.getByRole('button', { name: 'Apply palette' }))
    expect(map.getByRole('img', { name: /· -2 hPa$/ }).querySelector('rect')).toHaveAttribute(
      'fill',
      '#ff0000',
    )
    expect(map.getByRole('img', { name: /· 0 hPa$/ }).querySelector('rect')).toHaveAttribute(
      'fill',
      '#000000',
    )
    expect(map.getByRole('img', { name: /· 8 hPa$/ }).querySelector('rect')).toHaveAttribute(
      'fill',
      '#0000ff',
    )
    expect(
      map.getByRole('img', { name: /missing \(unavailable\)/ }).querySelector('rect'),
    ).toHaveAttribute('fill', expect.stringMatching(/^url\(#.*-missing\)$/))
    expect(
      map.getByRole('img', { name: /missing \(nonfinite\)/ }).querySelector('rect'),
    ).toHaveAttribute('fill', '#64748b')
    expect(legend).toHaveTextContent('Negative: downscaled lower')
    expect(legend).toHaveTextContent('Positive: downscaled higher')
    expect(legend).not.toHaveTextContent('Negative (blue)')
    expect(legend).toHaveTextContent('Zero: 0 hPa')
    expect(legend).toHaveTextContent('not accuracy improvement')
    expect(legend).toHaveTextContent('5 finite · 1 missing · 1 nonfinite')
    expect(legend.querySelector('stop[offset="0.2"]')).toHaveAttribute('stop-color', '#000000')
    expect(legend).toHaveTextContent('Zero color: #000000')
    await user.click(palette.getByRole('button', { name: 'Restore standard palette' }))
    expect(map.getByRole('img', { name: /· -2 hPa$/ }).querySelector('rect')).toHaveAttribute(
      'fill',
      '#0c4a6e',
    )
    expect(map.getByRole('img', { name: /· 0 hPa$/ }).querySelector('rect')).toHaveAttribute(
      'fill',
      '#ffffff',
    )
    expect(map.getByRole('img', { name: /· 8 hPa$/ }).querySelector('rect')).toHaveAttribute(
      'fill',
      '#991b1b',
    )
    expect(palette.getByText(/Project standard · 7 colors/)).toBeInTheDocument()
    expect(legend.querySelectorAll('span[style]')).toHaveLength(8)
    expect(range.getByRole('radio', { name: 'Manual range' })).toBeChecked()
    if (cycle === 0) await user.click(palette.getByRole('button', { name: 'Edit custom palette' }))
  }
  expect(data).toEqual(science)
}, 15_000)

it('retains accepted custom colors and manual bounds across same-task frames and restores without losing camera or frame', async () => {
  const first = await publicMaps()
  const user = userEvent.setup()
  const view = render(<ResultMapDisplayGroup data={first} onRetry={() => {}} />)
  const map = screen.getByRole('region', { name: 'Original Data map' })
  const camera = within(map).getByLabelText('Original Data viewport')
  const surface = within(map).getByRole('group', { name: 'Original Data geographic samples' })
  surface.focus()
  await user.keyboard('{ArrowRight}')
  const selectedCamera = camera.textContent
  const range = within(screen.getByRole('group', { name: 'Absolute maps range' }))
  await user.click(range.getByRole('radio', { name: 'Manual range' }))
  for (const [name, value] of [
    ['Minimum (hPa)', '2000'],
    ['Maximum (hPa)', '3000'],
  ]) {
    await user.clear(range.getByRole('textbox', { name: name! }))
    await user.type(range.getByRole('textbox', { name: name! }), value!)
  }
  await user.click(range.getByRole('button', { name: 'Apply range' }))
  const palette = within(screen.getByRole('group', { name: 'Absolute maps palette' }))
  await user.click(palette.getByRole('button', { name: 'Edit custom palette' }))
  await user.clear(palette.getByRole('textbox', { name: 'Color 1 (#RRGGBB)' }))
  await user.type(palette.getByRole('textbox', { name: 'Color 1 (#RRGGBB)' }), '#ff00ff')
  await user.click(palette.getByRole('button', { name: 'Apply palette' }))
  const next = await publicMaps('2024-01-01T01:00:00.000Z')
  view.rerender(<ResultMapDisplayGroup data={next} onRetry={() => {}} />)
  expect(map).toHaveTextContent('2024-01-01T01:00:00.000Z')
  expect(within(map).getAllByRole('img')[0]!.querySelector('rect')).toHaveAttribute(
    'fill',
    '#ff00ff',
  )
  expect(screen.getAllByRole('group', { name: 'Map color legend' })[0]).toHaveTextContent(
    '2000 hPa',
  )
  expect(camera).toHaveTextContent(selectedCamera!)
  await user.click(palette.getByRole('button', { name: 'Restore standard palette' }))
  expect(camera).toHaveTextContent(selectedCamera!)
  expect(map).toHaveTextContent('2024-01-01T01:00:00.000Z')
  expect(within(map).getAllByRole('img')[0]!.querySelector('rect')).toHaveAttribute(
    'fill',
    '#9333ea',
  )
  expect(range.getByRole('radio', { name: 'Manual range' })).toBeChecked()
  view.rerender(
    <ResultMapDisplayGroup
      data={await publicMaps('2024-01-01T01:00:00.000Z', 'different-task')}
      onRetry={() => {}}
    />,
  )
  expect(screen.getByRole('group', { name: 'Absolute maps palette' })).toHaveTextContent(
    'Project standard',
  )
  expect(screen.getByRole('group', { name: 'Absolute maps range' })).toHaveTextContent('Automatic')
}, 15_000)

it('never applies a palette or range from an incompatible variable and restores each current variable independently', async () => {
  const data = await publicMaps()
  data.layers.observation.displayContext = {
    variable: 'wind',
    unit: 'm/s',
    quantity: 'U10/V10',
    temporalStatistic: 'instantaneous',
  }
  const user = userEvent.setup()
  render(<ResultMapDisplayGroup data={data} onRetry={() => {}} />)
  const pressure = within(screen.getByRole('group', { name: 'Absolute maps palette' }))
  const wind = within(screen.getByRole('group', { name: 'Observation Data palette' }))
  expect(wind.getByText(/White → Green → Dark Green/)).toBeInTheDocument()
  await user.click(pressure.getByRole('button', { name: 'Edit custom palette' }))
  await user.clear(pressure.getByRole('textbox', { name: 'Color 1 (#RRGGBB)' }))
  await user.type(pressure.getByRole('textbox', { name: 'Color 1 (#RRGGBB)' }), '#ff00ff')
  await user.click(pressure.getByRole('button', { name: 'Apply palette' }))
  expect(screen.getAllByRole('group', { name: 'Map color legend' })[2]).toHaveTextContent(
    'White → Green → Dark Green',
  )
  expect(screen.getAllByRole('group', { name: 'Map color legend' })[2]).toHaveTextContent('m/s')
  expect(screen.getAllByRole('group', { name: 'Map color legend' })[2]).not.toHaveTextContent('hPa')
  await user.click(wind.getByRole('button', { name: 'Edit custom palette' }))
  await user.clear(wind.getByRole('textbox', { name: 'Color 1 (#RRGGBB)' }))
  await user.type(wind.getByRole('textbox', { name: 'Color 1 (#RRGGBB)' }), '#0000ff')
  await user.click(wind.getByRole('button', { name: 'Apply palette' }))
  await user.click(pressure.getByRole('button', { name: 'Restore standard palette' }))
  expect(pressure.getByText(/Purple → White → Orange/)).toBeInTheDocument()
  expect(wind.getByText(/Active: Custom palette/)).toBeInTheDocument()
  await user.click(wind.getByRole('button', { name: 'Restore standard palette' }))
  expect(wind.getByText(/White → Green → Dark Green/)).toBeInTheDocument()
}, 15_000)

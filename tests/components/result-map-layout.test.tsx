import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import type { ResultQuery } from '@/features/downscaling-tasks/service'
import { ResultMapPointProvider } from '@/features/result-analysis/components/result-map-point-context'
import { ResultMapPointQuery } from '@/features/result-analysis/components/result-map-point-query'
import { queryTaskResult } from '@/features/downscaling-tasks/service/result-queries'
import { readResultMapData } from '@/features/result-analysis/service/result-map-data'
import { MapComparisonPanel } from '@/features/result-analysis/components/map-comparison-panel'
import { ResultMapDisplayGroup } from '@/features/result-analysis/components/result-map-display-group'
import { exportTask } from '../factories/export-task'

async function publicMaps() {
  const task = exportTask({
    id: 'layout-component',
    variable: 'pressure',
    region: { west: 0, east: 0.12, south: 0, north: 0.08 },
  })
  return readResultMapData({ result: async (_id, query) => queryTaskResult(task, query) }, task, {
    time: '2024-01-01T00:00:00.000Z',
    observationMode: 'interpolated',
  })
}

it('expands the chosen product and returns keyboard focus without flattening independent cameras', async () => {
  const user = userEvent.setup()
  render(<ResultMapDisplayGroup data={await publicMaps()} onRetry={() => {}} />)
  await user.click(screen.getByRole('checkbox', { name: 'Synchronize map cameras' }))
  await user.click(screen.getByRole('button', { name: 'Zoom in Original Data' }))
  await user.click(screen.getByRole('button', { name: 'Pan east Downscaled Data' }))
  const original = screen.getByLabelText('Original Data viewport').textContent
  const downscaled = screen.getByLabelText('Downscaled Data viewport').textContent
  expect(original).not.toBe(downscaled)
  const expand = screen.getByRole('button', { name: 'Expand Downscaled Data' })
  expand.focus()
  await user.keyboard('{Enter}')
  expect(screen.getByLabelText('Map layout')).toHaveTextContent('Single map · Downscaled Data')
  expect(screen.getByRole('region', { name: 'Downscaled Data map' })).toBeVisible()
  expect(screen.queryByRole('region', { name: 'Original Data map' })).not.toBeInTheDocument()
  expect(screen.getAllByRole('group', { name: 'Map color legend' })).toHaveLength(1)
  const back = screen.getByRole('button', { name: 'Return to 2×2 comparison' })
  expect(back).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(screen.getByRole('button', { name: 'Expand Downscaled Data' })).toHaveFocus()
  expect(screen.getByLabelText('Original Data viewport')).toHaveTextContent(original!)
  expect(screen.getByLabelText('Downscaled Data viewport')).toHaveTextContent(downscaled!)
  expect(screen.getByRole('checkbox', { name: 'Synchronize map cameras' })).not.toBeChecked()
  expect(screen.getByLabelText('Active map camera')).toHaveTextContent('Downscaled Data')
  await user.click(screen.getByRole('button', { name: '1×4 wide' }))
  expect(screen.getByLabelText('Map layout')).toHaveTextContent('1×4 comparison')
  await user.click(screen.getByRole('button', { name: 'Expand Downscaled Data' }))
  await user.click(screen.getByRole('button', { name: 'Return to 1×4 comparison' }))
  expect(screen.getByRole('button', { name: 'Expand Downscaled Data' })).toHaveFocus()
  expect(screen.getByLabelText('Map layout')).toHaveTextContent('1×4 comparison')
  expect(
    within(screen.getByRole('region', { name: 'Original Data map' })).getAllByRole('img').length,
  ).toBeGreaterThan(0)
  expect(screen.getByLabelText('Original Data viewport')).toHaveTextContent(original!)
})

it('keeps pinned coordinates and custom ranges, colors and scientific samples when every map expands and returns', async () => {
  const data = await publicMaps()
  const science = structuredClone(data)
  const task = exportTask({
    id: data.taskId,
    variable: 'pressure',
    region: data.region,
  })
  const source = { result: async (_id: string, query: ResultQuery) => queryTaskResult(task, query) }
  const user = userEvent.setup()
  render(
    <ResultMapPointProvider
      source={source}
      task={task}
      selection={{ time: data.time, observationMode: 'interpolated' }}
    >
      <ResultMapDisplayGroup data={data} onRetry={() => {}} />
      <ResultMapPointQuery />
    </ResultMapPointProvider>,
  )
  const range = within(screen.getByRole('group', { name: 'Absolute maps range' }))
  await user.click(range.getByRole('radio', { name: 'Manual range' }))
  for (const [label, value] of [
    ['Minimum (hPa)', '2000'],
    ['Maximum (hPa)', '3000'],
  ]) {
    const input = range.getByRole('textbox', { name: label! })
    await user.clear(input)
    await user.type(input, value!)
  }
  await user.click(range.getByRole('button', { name: 'Apply range' }))
  const palette = within(screen.getByRole('group', { name: 'Absolute maps palette' }))
  await user.click(palette.getByRole('button', { name: 'Edit custom palette' }))
  for (const [index, color] of ['#ff00ff', '#00ff00', '#0000ff'].entries()) {
    const input = palette.getByRole('textbox', { name: `Color ${index + 1} (#RRGGBB)` })
    await user.clear(input)
    await user.type(input, color)
  }
  await user.click(palette.getByRole('button', { name: 'Apply palette' }))
  const query = within(screen.getByRole('region', { name: 'Joint point query' }))
  await user.type(query.getByRole('textbox', { name: 'Longitude' }), '0.06')
  await user.type(query.getByRole('textbox', { name: 'Latitude' }), '0.04{Enter}')
  await user.click(query.getByRole('button', { name: 'Pin current point' }))
  const detail = within(screen.getByRole('region', { name: 'Pinned point detail' }))
  const value = await detail.findByRole('region', { name: 'Original Data point value' })
  const scientificValue = value.textContent
  for (const title of [
    'Original Data',
    'Downscaled Data',
    'Observation Data',
    'Difference (Downscaled - Original)',
  ]) {
    await user.click(screen.getByRole('button', { name: 'Expand ' + title }))
    expect(screen.getByLabelText('Map layout')).toHaveTextContent('Single map · ' + title)
    expect(detail.getByLabelText('Pinned coordinate')).toHaveTextContent(
      'longitude 0.06 · latitude 0.04',
    )
    expect(value).toHaveTextContent(scientificValue!)
    const legend = screen.getByRole('group', { name: 'Map color legend' })
    expect(legend).toHaveTextContent('missing or nonfinite, not zero')
    if (title !== 'Difference (Downscaled - Original)') {
      expect(legend).toHaveTextContent('2000 hPa')
      expect(legend).toHaveTextContent('3000 hPa')
      expect(legend.querySelector('stop[offset="0"]')).toHaveAttribute('stop-color', '#ff00ff')
      expect(legend).toHaveTextContent('True scientific values are not clipped')
      const sample = within(screen.getByRole('region', { name: title + ' map' })).getAllByRole(
        'img',
        { name: /2024-01-01T/ },
      )[0]!
      expect(sample.querySelector('[fill]')).toHaveAttribute('fill', '#ff00ff')
    } else {
      expect(legend).toHaveTextContent('Automatic range')
      expect(legend).toHaveTextContent('Zero: 0 hPa')
    }
    await user.click(screen.getByRole('button', { name: 'Return to 2×2 comparison' }))
    expect(screen.getAllByRole('group', { name: 'Map color legend' })).toHaveLength(4)
  }
  expect(palette.getByRole('textbox', { name: 'Color 1 (#RRGGBB)' })).toHaveValue('#ff00ff')
  expect(data).toEqual(science)
})

it('retains the single-map owner while new frame and mode reads are pending, then resets for another task', async () => {
  const task = exportTask({
    id: 'layout-pending',
    variable: 'pressure',
    region: { west: 0, east: 0.12, south: 0, north: 0.08 },
  })
  const first = '2024-01-01T00:00:00.000Z'
  const next = '2024-01-01T01:00:00.000Z'
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const source = {
    result: async (_id: string, query: ResultQuery) => {
      if ('times' in query && query.times.includes(next)) await held
      return queryTaskResult(task, query)
    },
  }
  const user = userEvent.setup()
  const view = render(<MapComparisonPanel task={task} source={source} timeSlice={first} />)
  await screen.findByRole('region', { name: 'Original Data map' })
  await user.click(screen.getByRole('checkbox', { name: 'Synchronize map cameras' }))
  await user.click(screen.getByRole('button', { name: 'Zoom in Original Data' }))
  const camera = screen.getByLabelText('Original Data viewport').textContent
  await user.click(screen.getByRole('button', { name: 'Expand Original Data' }))
  const query = within(screen.getByRole('region', { name: 'Joint point query' }))
  await user.type(query.getByRole('textbox', { name: 'Longitude' }), '0.06')
  await user.type(query.getByRole('textbox', { name: 'Latitude' }), '0.04{Enter}')
  await user.click(query.getByRole('button', { name: 'Pin current point' }))
  const detail = within(screen.getByRole('region', { name: 'Pinned point detail' }))
  await detail.findByRole('region', { name: 'Original Data point value' })
  view.rerender(<MapComparisonPanel task={task} source={source} timeSlice={next} />)
  expect(screen.getByLabelText('Map data loading')).toBeVisible()
  expect(screen.queryByRole('region', { name: 'Original Data map' })).not.toBeInTheDocument()
  expect(detail.getByLabelText('Pinned query pending')).toBeVisible()
  expect(
    detail.queryByRole('region', { name: 'Original Data point value' }),
  ).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Switch to Station View' }))
  await act(async () => {
    release()
  })
  await screen.findByRole('region', { name: 'Original Data map' })
  expect(screen.getByLabelText('Map layout')).toHaveTextContent('Single map · Original Data')
  expect(screen.getByLabelText('Original Data viewport')).toHaveTextContent(camera!)
  expect(screen.getByRole('checkbox', { name: 'Synchronize map cameras' })).not.toBeChecked()
  expect(screen.getByRole('button', { name: 'Switch to Interpolated View' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(detail.getByLabelText('Pinned coordinate')).toHaveTextContent(
    'longitude 0.06 · latitude 0.04',
  )
  expect(detail.getByLabelText('Pinned frame')).toHaveTextContent(next)
  await detail.findByRole('region', { name: 'Original Data point value' })
  await user.click(screen.getByRole('button', { name: 'Return to 2×2 comparison' }))
  expect(screen.getByRole('button', { name: 'Expand Original Data' })).toHaveFocus()
  const other = exportTask({ ...task.configuration, id: 'other-layout-task', variable: 'pressure' })
  const otherSource = {
    result: async (_id: string, query: ResultQuery) => queryTaskResult(other, query),
  }
  view.rerender(<MapComparisonPanel task={other} source={otherSource} timeSlice={first} />)
  await screen.findByRole('region', { name: 'Original Data map' })
  expect(screen.getByLabelText('Map layout')).toHaveTextContent('2×2 comparison')
  expect(screen.getByRole('checkbox', { name: 'Synchronize map cameras' })).toBeChecked()
  expect(screen.queryByRole('region', { name: 'Pinned point detail' })).not.toBeInTheDocument()
})

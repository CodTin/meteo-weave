import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { queryTaskResult } from '@/features/downscaling-tasks/service/result-queries'
import type { ResultQuery } from '@/features/downscaling-tasks/service'
import { readResultMapData } from '@/features/result-analysis/service/result-map-data'
import { ResultMapDisplayGroup } from '@/features/result-analysis/components/result-map-display-group'
import { exportTask } from '../factories/export-task'

async function publicMaps(time = '2024-01-01T00:00:00.000Z', id = 'display-component') {
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

it('changes real map fills and its legend together, keeps the prior valid range on invalid edits and restores automatic', async () => {
  const data = await publicMaps()
  const science = structuredClone(data)
  const user = userEvent.setup()
  render(<ResultMapDisplayGroup data={data} onRetry={() => {}} />)
  const map = screen.getByRole('region', { name: 'Original Data map' })
  const mark = within(map).getAllByRole('img')[0]!
  const automaticFill = mark.querySelector('[fill]')!.getAttribute('fill')
  const controls = within(screen.getByRole('group', { name: 'Absolute maps range' }))
  await user.click(controls.getByRole('radio', { name: 'Manual range' }))
  await user.clear(controls.getByRole('textbox', { name: 'Minimum (hPa)' }))
  await user.type(controls.getByRole('textbox', { name: 'Minimum (hPa)' }), '2000')
  await user.clear(controls.getByRole('textbox', { name: 'Maximum (hPa)' }))
  await user.type(controls.getByRole('textbox', { name: 'Maximum (hPa)' }), '3000')
  await user.click(controls.getByRole('button', { name: 'Apply range' }))
  expect(mark.querySelector('[fill]')).toHaveAttribute('fill', '#9333ea')
  expect(mark.querySelector('[fill]')!.getAttribute('fill')).not.toBe(automaticFill)
  const legends = screen.getAllByRole('group', { name: 'Map color legend' })
  expect(legends[0]).toHaveTextContent('2000 hPa')
  expect(legends[0]).toHaveTextContent('3000 hPa')
  expect(legends[0]).toHaveTextContent(/above.*upper.*saturated/i)
  await user.clear(controls.getByRole('textbox', { name: 'Maximum (hPa)' }))
  await user.type(controls.getByRole('textbox', { name: 'Maximum (hPa)' }), 'Infinity')
  await user.click(controls.getByRole('button', { name: 'Apply range' }))
  expect(controls.getByRole('alert')).toHaveTextContent(/finite numbers/i)
  expect(controls.getByRole('textbox', { name: 'Maximum (hPa)' })).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  expect(mark.querySelector('[fill]')).toHaveAttribute('fill', '#9333ea')
  expect(legends[0]).toHaveTextContent('3000 hPa')
  await user.click(controls.getByRole('radio', { name: 'Automatic range' }))
  expect(mark.querySelector('[fill]')).toHaveAttribute('fill', automaticFill!)
  expect(controls.queryByRole('alert')).not.toBeInTheDocument()
  expect(data).toEqual(science)
})

it('keeps a valid manual range through same-task frame updates and resets only for a different task', async () => {
  const first = await publicMaps()
  const user = userEvent.setup()
  const view = render(<ResultMapDisplayGroup data={first} onRetry={() => {}} />)
  const controls = within(screen.getByRole('group', { name: 'Absolute maps range' }))
  await user.click(controls.getByRole('radio', { name: 'Manual range' }))
  await user.clear(controls.getByRole('textbox', { name: 'Minimum (hPa)' }))
  await user.type(controls.getByRole('textbox', { name: 'Minimum (hPa)' }), '2000')
  await user.clear(controls.getByRole('textbox', { name: 'Maximum (hPa)' }))
  await user.type(controls.getByRole('textbox', { name: 'Maximum (hPa)' }), '3000')
  await user.click(controls.getByRole('button', { name: 'Apply range' }))
  const next = await publicMaps('2024-01-01T01:00:00.000Z')
  view.rerender(<ResultMapDisplayGroup data={next} onRetry={() => {}} />)
  expect(screen.getAllByRole('group', { name: 'Map color legend' })[0]).toHaveTextContent(
    '2000 hPa',
  )
  expect(screen.getAllByRole('group', { name: 'Map color legend' })[0]).toHaveTextContent(
    '3000 hPa',
  )
  expect(screen.getByRole('region', { name: 'Original Data map' })).toHaveTextContent(
    '2024-01-01T01:00:00.000Z',
  )
  const otherTask = await publicMaps('2024-01-01T01:00:00.000Z', 'another-task')
  view.rerender(<ResultMapDisplayGroup data={otherTask} onRetry={() => {}} />)
  expect(screen.getAllByRole('group', { name: 'Map color legend' })[0]).toHaveTextContent(
    'Automatic range',
  )
  expect(screen.queryByRole('textbox', { name: 'Minimum (hPa)' })).not.toBeInTheDocument()
})

it('keeps null and nonfinite marks visible and distinct from constant legal zero, with honest accessible legends', async () => {
  const data = await publicMaps()
  data.layers.original.samples = data.layers.original.samples.slice(0, 3).map((sample, index) => ({
    ...sample,
    value: index === 0 ? 0 : index === 1 ? null : Number.POSITIVE_INFINITY,
  }))
  for (const kind of ['downscaled', 'observation', 'difference'] as const) {
    data.layers[kind].samples = data.layers[kind].samples
      .slice(0, 1)
      .map((sample) => ({ ...sample, value: 0 }))
  }
  const view = render(<ResultMapDisplayGroup data={data} onRetry={() => {}} />)
  const original = within(screen.getByRole('region', { name: 'Original Data map' }))
  expect(original.getByRole('img', { name: /0 hPa/ }).querySelector('rect')).toHaveAttribute(
    'fill',
    '#ffffff',
  )
  expect(
    original.getByRole('img', { name: /missing \(unavailable\)/ }).querySelector('rect'),
  ).toHaveAttribute('fill', expect.stringMatching(/^url\(#.*-missing\)$/))
  expect(
    original.getByRole('img', { name: /missing \(nonfinite\)/ }).querySelector('rect'),
  ).toHaveAttribute('fill', '#64748b')
  expect(screen.getAllByRole('group', { name: 'Map color legend' })[0]).toHaveTextContent(
    'Constant field · 0 hPa',
  )
  expect(screen.getAllByRole('group', { name: 'Map color legend' })[0]).toHaveTextContent(
    '1 finite · 1 missing · 1 nonfinite',
  )
  const empty = structuredClone(data)
  for (const kind of ['original', 'downscaled', 'observation', 'difference'] as const) {
    empty.layers[kind].samples = empty.layers[kind].samples.map((sample) => ({
      ...sample,
      value: null,
    }))
  }
  view.rerender(<ResultMapDisplayGroup data={empty} onRetry={() => {}} />)
  expect(screen.getAllByRole('group', { name: 'Map color legend' })[0]).toHaveTextContent(
    'No finite values · no numeric color scale',
  )
  expect(screen.getAllByRole('group', { name: 'Map color legend' })[0]).not.toHaveTextContent(
    'Actual finite data bounds',
  )
})

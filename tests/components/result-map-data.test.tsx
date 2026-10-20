import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { queryTaskResult } from '@/features/downscaling-tasks/service/result-queries'
import type { ResultQuery } from '@/features/downscaling-tasks/service'
import { readResultMapData } from '@/features/result-analysis/service/result-map-data'
import { MapComparisonPanel } from '@/features/result-analysis/components/map-comparison-panel'
import { ControlledResultMap } from '@/features/result-analysis/components/controlled-result-map'
import { exportTask } from '../factories/export-task'

async function windMaps() {
  const task = exportTask({ variable: 'wind', region: { west: 0, east: 1, south: 0, north: 1 } })
  return readResultMapData(
    { result: async (_id: string, query: ResultQuery) => queryTaskResult(task, query) },
    task,
    {
      time: '2024-01-01T00:00:00.000Z',
      observationMode: 'stations',
    },
  )
}

const display = {
  min: 0,
  max: 10,
  colors: ['#ffffff', '#14532d'],
  unit: 'm/s',
  description: 'Wind speed',
}
const viewport = { longitude: 0.5, latitude: 0.5, zoom: 7 }

describe('controlled geographic result map', () => {
  it('draws actual native wind samples and station identity, including valid calm zero', async () => {
    const maps = await windMaps()
    render(
      <ControlledResultMap
        mapId="station-map"
        data={maps.layers.observation}
        region={maps.region}
        viewport={viewport}
        onViewportChange={() => {}}
        display={display}
      />,
    )
    const map = screen.getByRole('region', { name: 'Observation Data map' })
    expect(
      within(map).getByRole('img', { name: /synthetic-station-v1:1:1.*0 m\/s.*calm/i }),
    ).toBeVisible()
    expect(
      within(map).getByRole('img', { name: /synthetic-station-v1:0:0.*5 m\/s.*216.8699/i }),
    ).toBeVisible()
    expect(within(map).getByText(/EPSG:4326/)).toBeVisible()
    expect(within(map).getByText(/longitude 0.5000.*latitude 0.5000/i)).toBeVisible()
  })
})

it('proposes camera changes to its owner and does not mutate camera or scientific input by itself', async () => {
  const maps = await windMaps()
  const user = userEvent.setup()
  const changed = vi.fn()
  const before = JSON.stringify(maps)
  const view = render(
    <ControlledResultMap
      mapId="controlled-observation"
      data={maps.layers.observation}
      region={maps.region}
      viewport={viewport}
      onViewportChange={changed}
      display={display}
    />,
  )
  await user.click(screen.getByRole('button', { name: 'Zoom in Observation Data' }))
  expect(changed).toHaveBeenLastCalledWith({ ...viewport, zoom: 7.5 }, 'controlled-observation')
  expect(screen.getByLabelText('Observation Data viewport')).toHaveTextContent('zoom 7.00')
  view.rerender(
    <ControlledResultMap
      mapId="controlled-observation"
      data={maps.layers.observation}
      region={maps.region}
      viewport={{ ...viewport, zoom: 7.5 }}
      onViewportChange={changed}
      display={display}
    />,
  )
  expect(screen.getByLabelText('Observation Data viewport')).toHaveTextContent('zoom 7.50')
  const surface = screen.getByRole('group', { name: 'Observation Data geographic samples' })
  surface.focus()
  await user.keyboard('{ArrowRight}')
  expect(changed.mock.lastCall?.[0].longitude).toBeGreaterThan(viewport.longitude)
  expect(JSON.stringify(maps)).toBe(before)
})

it('shows real selected frame data instead of permanent loading and clears old samples before a new frame resolves', async () => {
  const task = exportTask({
    variable: 'pressure',
    region: { west: 0, east: 0.12, south: 0, north: 0.08 },
  })
  const first = '2024-01-01T00:00:00.000Z'
  const next = '2024-01-01T01:00:00.000Z'
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const source = {
    result: async (_id: string, query: ResultQuery) => {
      if ('times' in query && query.times.includes(next)) await held
      return queryTaskResult(task, query)
    },
  }
  const view = render(<MapComparisonPanel task={task} timeSlice={first} source={source} />)
  expect(await screen.findByRole('region', { name: 'Original Data map' })).toBeVisible()
  expect(screen.getAllByRole('img', { name: /1013.25 hPa/ }).length).toBeGreaterThan(0)
  view.rerender(<MapComparisonPanel task={task} timeSlice={next} source={source} />)
  expect(screen.getByRole('status', { name: 'Map data loading' })).toBeVisible()
  expect(screen.queryByRole('region', { name: 'Original Data map' })).not.toBeInTheDocument()
  release()
  expect(await screen.findByRole('region', { name: 'Original Data map' })).toBeVisible()
  expect(screen.getByLabelText('Map frame')).toHaveTextContent(next)
  expect(screen.queryByRole('status', { name: 'Map data loading' })).not.toBeInTheDocument()
})

it('explains transport failure and retries the actual failed read without permanent loading', async () => {
  const task = exportTask({
    variable: 'pressure',
    region: { west: 0, east: 0.12, south: 0, north: 0.08 },
  })
  let failed = true
  const source = {
    result: async (_id: string, query: ResultQuery) => {
      if (failed) throw new Error('Network unavailable')
      return queryTaskResult(task, query)
    },
  }
  const user = userEvent.setup()
  render(<MapComparisonPanel task={task} timeSlice="2024-01-01T00:00:00.000Z" source={source} />)
  expect((await screen.findAllByText('Network unavailable', { exact: false }))[0]).toBeVisible()
  expect(screen.queryByRole('status', { name: 'Map data loading' })).not.toBeInTheDocument()
  failed = false
  await user.click(screen.getByRole('button', { name: '重试读取 Original Data' }))
  expect(await screen.findByRole('region', { name: 'Original Data map' })).toBeVisible()
  expect(screen.queryByText('Network unavailable', { exact: false })).not.toBeInTheDocument()
})

it('shows the actual partial daily temperature interval instead of an unexplained ready Difference', async () => {
  const task = exportTask({
    variable: 'temperature',
    timeRange: {
      mode: 'forecast',
      start: '2024-01-01T10:00:00.000Z',
      end: '2024-01-01T12:00:00.000Z',
    },
  })
  const maps = await readResultMapData(
    { result: async (_id: string, query: ResultQuery) => queryTaskResult(task, query) },
    task,
    {
      time: '2024-01-01T00:00:00.000Z',
      observationMode: 'interpolated',
      temporalResolution: 'daily',
    },
  )
  const { ResultMapCard } = await import('@/features/result-analysis/components/result-map-card')
  const { resultMapDisplaySettings } =
    await import('@/features/result-analysis/service/result-map-display')
  render(
    <ResultMapCard
      data={maps.layers.original}
      context={maps}
      display={resultMapDisplaySettings(maps).original}
      onRetry={() => {}}
    />,
  )
  expect(screen.getByText(/daily.mean.*interval.*UTC/i)).toHaveTextContent('3/24 hours')
  expect(screen.getByText(/daily.mean.*interval.*UTC/i)).toHaveTextContent(
    'partial, not the full requested interval',
  )
})

it('renders the recovered initial-frame native 3.237 mm sample and an independent missing hatch', async () => {
  const fixture = exportTask({
    variable: 'precipitation',
    resolution: '1km',
    ensembleMembers: 5,
    dataSeed: 211,
    region: { west: 20, east: 26, south: 65, north: 71 },
    timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-01-03' },
  })
  const task = {
    ...fixture,
    configuration: { ...fixture.configuration, dataSource: 'fusion' as const },
  }
  const maps = await readResultMapData(
    { result: async (_id: string, query: ResultQuery) => queryTaskResult(task, query) },
    task,
    { time: '2024-01-01T00:00:00.000Z', observationMode: 'interpolated' },
  )
  const { resultMapDisplaySettings } =
    await import('@/features/result-analysis/service/result-map-display')
  render(
    <ControlledResultMap
      mapId="initial-rain-gap"
      data={maps.layers.original}
      region={maps.region}
      viewport={{ longitude: 23, latitude: 68, zoom: 5 }}
      onViewportChange={() => {}}
      display={resultMapDisplaySettings(maps).original}
    />,
  )
  const map = screen.getByRole('region', { name: 'Original Data map' })
  expect(
    within(map).getByRole('img', {
      name: /longitude 25.755229240145198, latitude 70.65936040244341.*3.237 mm/,
    }),
  ).toBeVisible()
  const missing = within(map).getAllByRole('img', { name: /missing \(MISSING_DATA\)/i })
  expect(missing.length).toBeGreaterThan(0)
  expect(missing[0]?.querySelector('rect')).toHaveAttribute('fill', expect.stringContaining('url('))
})

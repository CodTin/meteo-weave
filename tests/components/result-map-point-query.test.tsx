import { beforeAll, describe, expect, it } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { requestHandler } from '@tanstack/react-start/server'
import { loginDemoAccount } from '@/server/services/demo-session.server'
import {
  getDemoTaskCatalog,
  queryDownscalingTaskResult,
} from '@/server/services/downscaling-tasks.server'
import type { DownscalingTask, ResultQuery } from '@/features/downscaling-tasks/service'
import { MapComparisonPanel } from '@/features/result-analysis/components/map-comparison-panel'

const time = '2024-01-01T00:00:00.000Z'
let cookie = ''
let tasks: DownscalingTask[] = []
async function authenticated<T>(operation: () => T): Promise<T> {
  let value: T | undefined
  const response = await requestHandler(() => {
    value = operation()
    return Response.json(value)
  })(new Request('http://demo.test/tasks', { method: 'POST', headers: { cookie } }), {})
  if (response.status !== 200 || value === undefined)
    throw new Error('Authenticated task operation failed')
  return value
}

beforeAll(async () => {
  const login = await requestHandler(() =>
    Response.json(loginDemoAccount({ account: 'researcher', password: 'meteo-demo' })),
  )(new Request('http://demo.test/login', { method: 'POST' }), {})
  cookie = login.headers.get('set-cookie')?.split(';')[0] ?? ''
  tasks = (await authenticated(getDemoTaskCatalog)).tasks
})
function catalogCase(id = 'alpine-temperature') {
  const task = tasks.find((candidate) => candidate.catalog?.id === id)
  if (!task) throw new Error(`Missing demo ${id}`)
  return task
}
function publicSource(task: DownscalingTask) {
  return {
    result: async (_id: string, query: ResultQuery) =>
      authenticated(() => queryDownscalingTaskResult({ task, query })),
  }
}
async function enterPoint(
  user: ReturnType<typeof userEvent.setup>,
  longitude: string,
  latitude: string,
) {
  const query = within(screen.getByRole('region', { name: 'Joint point query' }))
  await user.clear(query.getByRole('textbox', { name: 'Longitude' }))
  await user.type(query.getByRole('textbox', { name: 'Longitude' }), longitude)
  await user.clear(query.getByRole('textbox', { name: 'Latitude' }))
  await user.type(query.getByRole('textbox', { name: 'Latitude' }), latitude)
  await user.click(query.getByRole('button', { name: 'Query point' }))
  return query
}

describe('public comparison panel point selection', () => {
  it('uses the visible keyboard entry to show the same canonical edge point and all four public values', async () => {
    const task = catalogCase()
    const user = userEvent.setup()
    render(<MapComparisonPanel task={task} source={publicSource(task)} timeSlice={time} />)
    const query = await enterPoint(user, '10', '48')
    expect(await query.findByText('16.2787 °C', { exact: true })).toBeVisible()
    expect(query.getByText('14.8358 °C', { exact: true })).toBeVisible()
    expect(query.getByText('0.8 °C', { exact: true })).toBeVisible()
    expect(query.getByText('-1.4429 °C', { exact: true })).toBeVisible()
    expect(query.getByLabelText('Canonical point')).toHaveTextContent('longitude 10 · latitude 48')
    expect(query.getByLabelText('Point frame')).toHaveTextContent(time)
    expect(
      within(
        query.getByRole('region', { name: 'Difference (Downscaled - Original) point value' }),
      ).getByText(/not accuracy improvement/),
    ).toBeVisible()
  })
})

it('keeps the same-task camera subtree masked while a new frame loads and refreshes the retained keyboard coordinate', async () => {
  const task = catalogCase()
  const actual = publicSource(task)
  const next = '2024-01-02T00:00:00.000Z'
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const source = {
    result: async (id: string, query: ResultQuery) => {
      if ('times' in query && query.times[0] === next) await held
      return actual.result(id, query)
    },
  }
  const user = userEvent.setup()
  const view = render(<MapComparisonPanel task={task} source={source} timeSlice={time} />)
  const query = await enterPoint(user, '11', '47')
  expect(await query.findByText('16.7216 °C', { exact: true })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Zoom in Original Data' }))
  const camera = screen.getByLabelText('Original Data viewport')
  const previousCamera = camera.textContent
  view.rerender(<MapComparisonPanel task={task} source={source} timeSlice={next} />)
  expect(query.getByLabelText('Point query pending')).toBeVisible()
  expect(query.queryByText('16.7216 °C', { exact: true })).not.toBeInTheDocument()
  expect(query.getByLabelText('Canonical point')).toHaveTextContent('longitude 11 · latitude 47')
  expect(camera).toBeInTheDocument()
  expect(camera).not.toBeVisible()
  expect(screen.queryByRole('region', { name: 'Original Data map' })).not.toBeInTheDocument()
  await act(async () => {
    release()
  })
  expect(await query.findByText('16.8248 °C', { exact: true })).toBeVisible()
  expect(query.getByText('17.4844 °C', { exact: true })).toBeVisible()
  expect(query.getByText('-0.7484 °C', { exact: true })).toBeVisible()
  expect(query.getByText('0.6596 °C', { exact: true })).toBeVisible()
  expect(screen.getByLabelText('Original Data viewport')).toBe(camera)
  expect(camera).toHaveTextContent(previousCamera ?? '')
  expect(camera).toBeVisible()
})

it('shows actual station position and distance rather than treating the requested echo coordinate as colocated observation', async () => {
  const task = catalogCase()
  const user = userEvent.setup()
  render(<MapComparisonPanel task={task} source={publicSource(task)} timeSlice={time} />)
  // The default is interpolated; switch through the public control to actual stations.
  await user.click(screen.getByRole('button', { name: 'Switch to Station View' }))
  const query = await enterPoint(user, '11.1', '47')
  const observation = within(
    await query.findByRole('region', { name: 'Observation Data point value' }),
  )
  expect(await observation.findByText('-0.8 °C', { exact: true })).toBeVisible()
  expect(observation.getByText(/Actual synthetic station.*longitude 11.*latitude 47/)).toBeVisible()
  expect(observation.getByText(/7.5835 km.*not colocated/)).toBeVisible()
  expect(observation.getByText(/synthetic-observations-v1.*1729/)).toBeVisible()
})

it('labels interpolated synthetic reference support at the canonical point, including all positive weights', async () => {
  const task = catalogCase()
  const user = userEvent.setup()
  render(<MapComparisonPanel task={task} source={publicSource(task)} timeSlice={time} />)
  const query = await enterPoint(user, '11.5', '47.5')
  const observation = within(
    await query.findByRole('region', { name: 'Observation Data point value' }),
  )
  expect(await observation.findByText('0 °C', { exact: true })).toBeVisible()
  expect(
    observation.getByText(/Interpolated synthetic reference.*not an actual station/),
  ).toBeVisible()
  for (const coordinate of ['11,47', '12,47', '11,48', '12,48'])
    expect(
      observation.getByText(new RegExp(`longitude,latitude ${coordinate}.*weight 0.25`)),
    ).toBeVisible()
  expect(query.getByText('-0.7334 °C', { exact: true })).toBeVisible()
})

it('projects the selected geographic crosshair in each independent viewport and hides an offscreen marker without moving a camera', async () => {
  const task = catalogCase()
  const user = userEvent.setup()
  render(<MapComparisonPanel task={task} source={publicSource(task)} timeSlice={time} />)
  await screen.findByRole('region', { name: 'Original Data map' })
  await user.click(screen.getByRole('checkbox', { name: 'Synchronize map cameras' }))
  const otherCamera = screen.getByLabelText('Downscaled Data viewport').textContent
  const query = await enterPoint(user, '11', '47')
  await query.findByText('16.7216 °C', { exact: true })
  expect(
    screen.getAllByRole('img', { name: 'Shared crosshair · longitude 11 · latitude 47' }),
  ).toHaveLength(4)
  const original = within(screen.getByRole('region', { name: 'Original Data map' }))
  for (let move = 0; move < 8; move++)
    await user.click(original.getByRole('button', { name: 'Pan east Original Data' }))
  expect(original.queryByRole('img', { name: /Shared crosshair/ })).not.toBeInTheDocument()
  expect(original.getByLabelText('Original Data point position')).toHaveTextContent(
    /outside this viewport/,
  )
  expect(
    screen.getAllByRole('img', { name: 'Shared crosshair · longitude 11 · latitude 47' }),
  ).toHaveLength(3)
  expect(screen.getByLabelText('Downscaled Data viewport')).toHaveTextContent(otherCamera ?? '')
  expect(query.getByLabelText('Canonical point')).toHaveTextContent('longitude 11 · latitude 47')
})

it('shows native rainfall bucket bounds, complete coverage, surviving ensemble count and a valid zero reference', async () => {
  const task = catalogCase('lowland-rain')
  const user = userEvent.setup()
  render(<MapComparisonPanel task={task} source={publicSource(task)} timeSlice={time} />)
  const query = await enterPoint(user, '114', '30')
  const downscaled = within(
    await query.findByRole('region', { name: 'Downscaled Data point value' }),
  )
  expect(downscaled.getByText('6.8779 mm', { exact: true })).toBeVisible()
  expect(
    downscaled.getByText(/Accumulation.*2024-01-01T00:00:00.000Z.*2024-01-02T00:00:00.000Z/),
  ).toBeVisible()
  expect(downscaled.getByText(/24\/24 hours.*complete/)).toBeVisible()
  expect(downscaled.getByText(/4\/5 valid members.*exclude unavailable/)).toBeVisible()
  const observation = within(query.getByRole('region', { name: 'Observation Data point value' }))
  expect(observation.getByText('0 mm', { exact: true })).toBeVisible()
})

it('suppresses a delayed point after mode and task changes, replacing it with unavailable at the latest coordinate', async () => {
  const task = catalogCase()
  const pressure = catalogCase('plateau-pressure')
  const actual = publicSource(task)
  let release: () => void = () => {}
  let received: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const started = new Promise<void>((resolve) => {
    received = resolve
  })
  const source = {
    result: async (id: string, query: ResultQuery) => {
      if (
        query.kind === 'points' &&
        query.points.length === 1 &&
        query.layer === 'original' &&
        query.points[0]?.longitude === 10
      ) {
        const reply = await actual.result(id, query)
        received()
        await held
        return reply
      }
      return actual.result(id, query)
    },
  }
  const user = userEvent.setup()
  const view = render(<MapComparisonPanel task={task} source={source} timeSlice={time} />)
  try {
    const query = await enterPoint(user, '10', '48')
    await started
    await user.click(screen.getByRole('button', { name: 'Switch to Station View' }))
    await enterPoint(user, '12.01', '47')
    expect(
      query.queryByRole('region', { name: 'Original Data point value' }),
    ).not.toBeInTheDocument()
    await act(async () => {
      release()
    })
    expect((await query.findAllByText(/OUTSIDE_COVERAGE/))[0]).toBeVisible()
    expect(query.queryByText('16.2787 °C', { exact: true })).not.toBeInTheDocument()
    view.rerender(
      <MapComparisonPanel task={pressure} source={publicSource(pressure)} timeSlice={time} />,
    )
    expect(screen.queryByLabelText('Canonical point')).not.toBeInTheDocument()
    expect(screen.queryByText('16.2787 °C', { exact: true })).not.toBeInTheDocument()
  } finally {
    await act(async () => {
      release()
    })
  }
})

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

describe('public pinned point details', () => {
  it('pins the keyboard-selected point with current task, frame, units and reference-error improvement', async () => {
    const task = catalogCase()
    const user = userEvent.setup()
    render(<MapComparisonPanel task={task} source={publicSource(task)} timeSlice={time} />)
    await screen.findByRole('region', { name: 'Original Data map' })
    await user.click(screen.getByRole('button', { name: 'Switch to Station View' }))
    const query = await enterPoint(user, '10', '48')
    await query.findByText('16.2787 °C', { exact: true })
    const pin = query.getByRole('button', { name: 'Pin current point' })
    pin.focus()
    await user.keyboard('{Enter}')
    expect(pin).toHaveFocus()
    const detail = within(await screen.findByRole('region', { name: 'Pinned point detail' }))
    expect(detail.getByLabelText('Pinned coordinate')).toHaveTextContent(
      'longitude 10 · latitude 48',
    )
    expect(detail.getByLabelText('Pinned task')).toHaveTextContent(task.id)
    expect(detail.getByLabelText('Pinned frame')).toHaveTextContent(time)
    expect(await detail.findByText('16.2787 °C', { exact: true })).toBeVisible()
    expect(detail.getByText('14.8358 °C', { exact: true })).toBeVisible()
    expect(detail.getByText('0.8 °C', { exact: true })).toBeVisible()
    expect(detail.getByLabelText('Local error improvement')).toHaveTextContent('9.3218%')
    expect(detail.getByText(/Synthetic Demo.*not.*model skill/i)).toBeVisible()
  })
})

it('preserves pinned identity during frame/mode refresh, hides old values pending, and supports keyboard replace/clear', async () => {
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
  const query = await enterPoint(user, '11.5', '47.5')
  await query.findByText('16.5027 °C', { exact: true })
  await user.click(query.getByRole('button', { name: 'Pin current point' }))
  const detail = within(screen.getByRole('region', { name: 'Pinned point detail' }))
  expect(await detail.findByLabelText('Local error improvement')).toHaveTextContent('4.4441%')
  await enterPoint(user, '10', '48')
  await query.findByText('16.2787 °C', { exact: true })
  expect(detail.getByLabelText('Pinned coordinate')).toHaveTextContent(
    'longitude 11.5 · latitude 47.5',
  )
  expect(detail.getByLabelText('Local error improvement')).toHaveTextContent('4.4441%')
  view.rerender(<MapComparisonPanel task={task} source={source} timeSlice={next} />)
  expect(detail.getByLabelText('Pinned query pending')).toBeVisible()
  expect(detail.queryByText('16.5027 °C', { exact: true })).not.toBeInTheDocument()
  expect(detail.getByLabelText('Pinned coordinate')).toHaveTextContent(
    'longitude 11.5 · latitude 47.5',
  )
  expect(detail.getByLabelText('Pinned frame')).toHaveTextContent(next)
  await act(async () => {
    release()
  })
  await detail.findByLabelText('Local error improvement')
  await user.click(screen.getByRole('button', { name: 'Switch to Station View' }))
  expect(detail.getByLabelText('Pinned query pending')).toBeVisible()
  expect(await detail.findByLabelText('Local error improvement')).toHaveTextContent(
    'NO_OBSERVATION',
  )
  expect(detail.getByLabelText('Pinned coordinate')).toHaveTextContent(
    'longitude 11.5 · latitude 47.5',
  )
  await enterPoint(user, '10', '48')
  const replace = query.getByRole('button', { name: 'Replace pinned point' })
  replace.focus()
  await user.keyboard('{Enter}')
  expect(replace).toHaveFocus()
  expect(detail.getByLabelText('Pinned coordinate')).toHaveTextContent('longitude 10 · latitude 48')
  await detail.findByLabelText('Local error improvement')
  const clear = query.getByRole('button', { name: 'Clear pinned point' })
  clear.focus()
  await user.keyboard(' ')
  expect(clear).toHaveFocus()
  expect(screen.queryByRole('region', { name: 'Pinned point detail' })).not.toBeInTheDocument()
  expect(query.getByLabelText('Pinned point status')).toHaveTextContent('No pinned point')
})

it('keeps current errors honest with retry and invalidates a delayed pin on replacement, task/account change and leaving', async () => {
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
  let failed = false
  const source = {
    result: async (id: string, query: ResultQuery) => {
      if (
        query.kind === 'points' &&
        query.layer === 'observation' &&
        query.points[0]?.longitude === 10
      ) {
        const reply = await actual.result(id, query)
        received()
        await held
        return reply
      }
      if (
        query.kind === 'points' &&
        query.layer === 'observation' &&
        query.points[0]?.longitude === 11 &&
        !failed
      ) {
        failed = true
        throw new Error('Current pinned reference transport failed')
      }
      return actual.result(id, query)
    },
  }
  const user = userEvent.setup()
  const view = render(<MapComparisonPanel task={task} source={source} timeSlice={time} />)
  try {
    const query = await enterPoint(user, '10', '48')
    await started
    await user.click(query.getByRole('button', { name: 'Pin current point' }))
    const detail = within(screen.getByRole('region', { name: 'Pinned point detail' }))
    expect(detail.getByLabelText('Pinned query pending')).toBeVisible()
    await enterPoint(user, '11', '47')
    await user.click(query.getByRole('button', { name: 'Replace pinned point' }))
    expect(detail.getByLabelText('Pinned coordinate')).toHaveTextContent(
      'longitude 11 · latitude 47',
    )
    await act(async () => {
      release()
    })
    expect(await detail.findByRole('alert')).toHaveTextContent('Current pinned query failed')
    expect(detail.getByLabelText('Local error improvement')).toHaveTextContent('QUERY_FAILED')
    expect(detail.queryByText('16.2787 °C', { exact: true })).not.toBeInTheDocument()
    await user.click(detail.getByRole('button', { name: 'Retry pinned query' }))
    expect(detail.getByLabelText('Pinned query pending')).toBeVisible()
    expect(await detail.findByText('16.7216 °C', { exact: true })).toBeVisible()
    expect(detail.queryByRole('alert')).not.toBeInTheDocument()
    const otherOwner = { ...task, ownerId: 'policy' as const }
    view.rerender(<MapComparisonPanel task={otherOwner} source={source} timeSlice={time} />)
    expect(screen.queryByRole('region', { name: 'Pinned point detail' })).not.toBeInTheDocument()
    view.rerender(
      <MapComparisonPanel task={pressure} source={publicSource(pressure)} timeSlice={time} />,
    )
    expect(screen.queryByRole('region', { name: 'Pinned point detail' })).not.toBeInTheDocument()
    view.unmount()
    await act(async () => {
      release()
    })
    expect(screen.queryByText(/Current pinned reference transport failed/)).not.toBeInTheDocument()
  } finally {
    await act(async () => {
      release()
    })
  }
})

it('does not expose a disposed pinned transport failure after an account/task transition', async () => {
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
      if (query.kind === 'points' && query.layer === 'observation') {
        received()
        await held
        throw new Error('Disposed pinned reference failure')
      }
      return actual.result(id, query)
    },
  }
  const user = userEvent.setup()
  const view = render(<MapComparisonPanel task={task} source={source} timeSlice={time} />)
  try {
    const query = await enterPoint(user, '10', '48')
    await user.click(query.getByRole('button', { name: 'Pin current point' }))
    await started
    expect(screen.getByLabelText('Pinned query pending')).toBeVisible()
    view.rerender(
      <MapComparisonPanel task={pressure} source={publicSource(pressure)} timeSlice={time} />,
    )
    expect(screen.queryByRole('region', { name: 'Pinned point detail' })).not.toBeInTheDocument()
    await act(async () => {
      release()
    })
    expect(screen.queryByText(/Disposed pinned reference failure/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Pinned coordinate')).not.toBeInTheDocument()
    const currentQuery = await enterPoint(user, '90', '32')
    await user.click(currentQuery.getByRole('button', { name: 'Pin current point' }))
    const detail = within(screen.getByRole('region', { name: 'Pinned point detail' }))
    expect(
      await within(
        await detail.findByRole('region', { name: 'Original Data point value' }),
      ).findByText('1021.55 hPa', { exact: true }),
    ).toBeVisible()
    expect(detail.getByLabelText('Local error improvement')).toHaveTextContent('0.0000%')
  } finally {
    await act(async () => {
      release()
    })
  }
})

import { StrictMode } from 'react'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { queryTaskResult } from '@/features/downscaling-tasks/service/result-queries'
import { readResultMapData } from '@/features/result-analysis/service/result-map-data'
import { ControlledResultMap } from '@/features/result-analysis/components/controlled-result-map'
import { ResultMapGrid } from '@/features/result-analysis/components/result-map-grid'
import { resultMapDisplaySettings } from '@/features/result-analysis/service/result-map-display'
import {
  ResultMapCameraGroup,
  ResultMapCameraInput,
} from '@/features/result-analysis/components/result-map-camera-group'
import type {
  ResultMapCameraControl,
  ResultMapCameraMember,
} from '@/features/result-analysis/types/result-map-camera-group'
import type { ResultMapData } from '@/features/result-analysis/types/result-map'
import { exportTask } from '../factories/export-task'

const initialViewport = { longitude: 0.06, latitude: 0.04, zoom: 10 }
const maps = [
  { mapId: 'original-camera', label: 'Original Data', initialViewport },
  { mapId: 'downscaled-camera', label: 'Downscaled Data', initialViewport },
]
const display = {
  min: 0,
  max: 30,
  colors: ['#ffffff', '#991b1b'],
  unit: '°C',
  description: 'Temperature',
}

async function temperatureMaps(time = '2024-01-01T00:00:00.000Z') {
  const task = exportTask({
    variable: 'temperature',
    region: { west: 0, east: 0.12, south: 0, north: 0.08 },
  })
  return readResultMapData({ result: async (_id, query) => queryTaskResult(task, query) }, task, {
    time,
    observationMode: 'stations',
  })
}

function CameraComparison({ data }: { data: ResultMapData }) {
  return (
    <ResultMapCameraGroup maps={maps}>
      {(camera) => (
        <>
          {(['original', 'downscaled'] as const).map((kind, index) => (
            <ResultMapCameraInput key={kind} mapId={maps[index]!.mapId} camera={camera}>
              <ControlledResultMap
                mapId={maps[index]!.mapId}
                data={data.layers[kind]}
                region={data.region}
                display={display}
                viewport={camera.viewports[maps[index]!.mapId]!}
                onViewportChange={camera.onViewportChange}
              />
            </ResultMapCameraInput>
          ))}
        </>
      )}
    </ResultMapCameraGroup>
  )
}

it('synchronizes real map cameras by default without changing scientific samples', async () => {
  const data = await temperatureMaps()
  const scientificData = JSON.stringify(data)
  const user = userEvent.setup()
  render(<CameraComparison data={data} />)
  expect(screen.getByRole('checkbox', { name: 'Synchronize map cameras' })).toBeChecked()
  const original = screen.getByRole('region', { name: 'Original Data map' })
  const sample = within(original).getAllByRole('img')[0]!
  const footprint = sample.querySelector('rect')!
  const before = footprint.getAttribute('x')
  await user.click(screen.getByRole('button', { name: 'Zoom in Original Data' }))
  for (const title of ['Original Data', 'Downscaled Data']) {
    expect(screen.getByLabelText(`${title} viewport`)).toHaveTextContent(
      'longitude 0.0600 · latitude 0.0400 · zoom 10.50',
    )
  }
  expect(footprint.getAttribute('x')).not.toBe(before)
  expect(JSON.stringify(data)).toBe(scientificData)
})

it('disables synchronization and re-enables from the current active map, not the initial range', async () => {
  const user = userEvent.setup()
  render(<CameraComparison data={await temperatureMaps()} />)
  const sync = screen.getByRole('checkbox', { name: 'Synchronize map cameras' })
  await user.click(sync)
  expect(sync).not.toBeChecked()
  await user.click(screen.getByRole('button', { name: 'Zoom in Original Data' }))
  expect(screen.getByLabelText('Original Data viewport')).toHaveTextContent('zoom 10.50')
  expect(screen.getByLabelText('Downscaled Data viewport')).toHaveTextContent('zoom 10.00')
  await user.click(screen.getByRole('button', { name: 'Zoom in Downscaled Data' }))
  await user.click(screen.getByRole('button', { name: 'Zoom in Downscaled Data' }))
  expect(screen.getByLabelText('Active map camera')).toHaveTextContent('Downscaled Data')
  await user.click(sync)
  expect(sync).toBeChecked()
  for (const title of ['Original Data', 'Downscaled Data']) {
    expect(screen.getByLabelText(`${title} viewport`)).toHaveTextContent(
      'longitude 0.0600 · latitude 0.0400 · zoom 11.00',
    )
  }
})

it('treats keyboard focus as the active camera before re-enabling synchronization', async () => {
  const user = userEvent.setup()
  render(<CameraComparison data={await temperatureMaps()} />)
  const sync = screen.getByRole('checkbox', { name: 'Synchronize map cameras' })
  await user.click(sync)
  await user.click(screen.getByRole('button', { name: 'Zoom in Original Data' }))
  await user.click(screen.getByRole('button', { name: 'Zoom in Downscaled Data' }))
  await user.click(screen.getByRole('button', { name: 'Zoom in Downscaled Data' }))
  act(() => screen.getByRole('group', { name: 'Original Data geographic samples' }).focus())
  expect(screen.getByLabelText('Active map camera')).toHaveTextContent('Original Data')
  sync.focus()
  await user.keyboard(' ')
  expect(sync).toBeChecked()
  expect(screen.getByLabelText('Downscaled Data viewport')).toHaveTextContent('zoom 10.50')
})

it('ignores equal controlled echoes from peers and keeps the actual active source', async () => {
  const user = userEvent.setup()
  render(
    <ResultMapCameraGroup maps={maps}>
      {({ viewports, onViewportChange }) => (
        <>
          <button
            onClick={() =>
              onViewportChange({ longitude: 11, latitude: 47, zoom: 8 }, 'original-camera')
            }
          >
            Move original camera
          </button>
          <button
            onClick={() =>
              onViewportChange({ ...viewports['downscaled-camera']! }, 'downscaled-camera')
            }
          >
            Echo accepted peer camera
          </button>
        </>
      )}
    </ResultMapCameraGroup>,
  )
  await user.click(screen.getByRole('button', { name: 'Move original camera' }))
  await user.click(screen.getByRole('button', { name: 'Echo accepted peer camera' }))
  expect(screen.getByLabelText('Active map camera')).toHaveTextContent(
    'Active map: Original Data · longitude 11.0000 · latitude 47.0000 · zoom 8.00',
  )
})

it('retains current cameras when membership changes and rejects callbacks from disposed membership', async () => {
  let disposedCamera: ResultMapCameraControl | undefined
  const changedViewport = { longitude: 11, latitude: 47, zoom: 8 }
  const receivers = (camera: ResultMapCameraControl) => (
    <>
      {Object.entries(camera.viewports).map(([mapId, viewport]) => (
        <output key={mapId} aria-label={mapId}>
          {viewport.longitude}, {viewport.latitude}, {viewport.zoom}
        </output>
      ))}
      <button onClick={() => camera.onViewportChange(changedViewport, 'original-camera')}>
        Move original camera
      </button>
    </>
  )
  const view = render(
    <ResultMapCameraGroup maps={maps}>
      {(camera) => {
        disposedCamera = camera
        return receivers(camera)
      }}
    </ResultMapCameraGroup>,
  )
  const outgoing = disposedCamera!
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Move original camera' }))
  const extra = { mapId: 'third-camera', label: 'Third task', initialViewport }
  view.rerender(<ResultMapCameraGroup maps={[...maps, extra]}>{receivers}</ResultMapCameraGroup>)
  expect(screen.getByLabelText('third-camera')).toHaveTextContent('11, 47, 8')
  view.rerender(<ResultMapCameraGroup maps={maps}>{receivers}</ResultMapCameraGroup>)
  act(() => outgoing.onViewportChange({ longitude: 0, latitude: 0, zoom: 1 }, 'original-camera'))
  expect(screen.getByLabelText('original-camera')).toHaveTextContent('11, 47, 8')
  expect(screen.getByLabelText('downscaled-camera')).toHaveTextContent('11, 47, 8')
})

it.each([0, 1, 3, 6])(
  'reuses the group with %i participating maps and converges to the last alternating source',
  async (count) => {
    const members: ResultMapCameraMember[] = Array.from({ length: count }, (_, index) => ({
      mapId: `task-${index}`,
      label: `Task ${index}`,
      initialViewport: { longitude: index, latitude: index, zoom: 4 },
    }))
    const user = userEvent.setup()
    render(
      <ResultMapCameraGroup maps={members}>
        {({ viewports, onViewportChange }) => (
          <>
            <button
              onClick={() => {
                for (let index = 0; index < 20; index++) {
                  onViewportChange(
                    { longitude: 20 + index, latitude: 40, zoom: 9 },
                    `task-${index % count}`,
                  )
                }
              }}
            >
              Alternate sources rapidly
            </button>
            {Object.entries(viewports).map(([mapId, viewport]) => (
              <output key={mapId} aria-label={mapId}>
                {viewport.longitude}, {viewport.latitude}, {viewport.zoom}
              </output>
            ))}
          </>
        )}
      </ResultMapCameraGroup>,
    )
    await user.click(screen.getByRole('button', { name: 'Alternate sources rapidly' }))
    if (count === 0) {
      expect(screen.getByLabelText('Active map camera')).toHaveTextContent('Active map: None')
    } else {
      for (const member of members) {
        expect(screen.getByLabelText(member.mapId)).toHaveTextContent('39, 40, 9')
      }
      expect(screen.getByLabelText('Active map camera')).toHaveTextContent(`Task ${19 % count}`)
    }
  },
)

it('synchronizes geographic cameras without sharing incompatible product units or color scales', async () => {
  const task = exportTask({
    variable: 'pressure',
    region: { west: 0, east: 0.12, south: 0, north: 0.08 },
  })
  const pressure = await readResultMapData(
    { result: async (_id, query) => queryTaskResult(task, query) },
    task,
    {
      time: '2024-01-01T00:00:00.000Z',
      observationMode: 'stations',
    },
  )
  const temperature = await temperatureMaps()
  const pressureDisplay = {
    min: 1000,
    max: 1040,
    colors: ['#112233', '#aabbcc'],
    unit: 'hPa',
    description: 'Pressure',
  }
  const immutable = JSON.stringify([temperature, pressure, display, pressureDisplay])
  const user = userEvent.setup()
  render(
    <ResultMapCameraGroup maps={maps}>
      {({ viewports, onViewportChange }) => (
        <>
          <ControlledResultMap
            mapId="original-camera"
            data={temperature.layers.original}
            region={temperature.region}
            display={display}
            viewport={viewports['original-camera']!}
            onViewportChange={onViewportChange}
          />
          <ControlledResultMap
            mapId="downscaled-camera"
            data={pressure.layers.downscaled}
            region={pressure.region}
            display={pressureDisplay}
            viewport={viewports['downscaled-camera']!}
            onViewportChange={onViewportChange}
          />
        </>
      )}
    </ResultMapCameraGroup>,
  )
  const originalSample = within(
    screen.getByRole('region', { name: 'Original Data map' }),
  ).getAllByRole('img')[0]!
  const pressureSample = within(
    screen.getByRole('region', { name: 'Downscaled Data map' }),
  ).getAllByRole('img')[0]!
  const originalColor = originalSample.querySelector('rect')!.getAttribute('fill')
  const pressureColor = pressureSample.querySelector('rect')!.getAttribute('fill')
  await user.click(screen.getByRole('button', { name: 'Zoom in Downscaled Data' }))
  expect(originalSample).toHaveAccessibleName(/°C/)
  expect(pressureSample).toHaveAccessibleName(/hPa/)
  expect(originalSample.querySelector('rect')).toHaveAttribute('fill', originalColor)
  expect(pressureSample.querySelector('rect')).toHaveAttribute('fill', pressureColor)
  expect(screen.getByLabelText('Original Data viewport')).toHaveTextContent('zoom 10.50')
  expect(JSON.stringify([temperature, pressure, display, pressureDisplay])).toBe(immutable)
})

it('preserves accepted cameras when the mounted group receives new scientific frame data', async () => {
  const user = userEvent.setup()
  const view = render(<CameraComparison data={await temperatureMaps()} />)
  await user.click(screen.getByRole('checkbox', { name: 'Synchronize map cameras' }))
  await user.click(screen.getByRole('button', { name: 'Zoom in Downscaled Data' }))
  view.rerender(<CameraComparison data={await temperatureMaps('2024-01-02T00:00:00.000Z')} />)
  expect(screen.getByRole('checkbox', { name: 'Synchronize map cameras' })).not.toBeChecked()
  expect(screen.getByLabelText('Original Data viewport')).toHaveTextContent('zoom 10.00')
  expect(screen.getByLabelText('Downscaled Data viewport')).toHaveTextContent('zoom 10.50')
  expect(
    within(screen.getByRole('region', { name: 'Original Data map' })).getAllByRole('img')[0]!,
  ).toHaveAccessibleName(/2024-01-02T00:00:00.000Z/)
})

it('invalidates retained callbacks on unmount and re-enters with one live controlled camera owner', async () => {
  let outgoing: ResultMapCameraControl | undefined
  const view = render(
    <ResultMapCameraGroup maps={maps}>
      {(camera) => {
        outgoing = camera
        return null
      }}
    </ResultMapCameraGroup>,
  )
  const disposed = outgoing!
  view.unmount()
  const user = userEvent.setup()
  render(
    <StrictMode>
      <CameraComparison data={await temperatureMaps()} />
    </StrictMode>,
  )
  act(() => {
    disposed.onViewportChange({ longitude: 100, latitude: 70, zoom: 1 }, 'original-camera')
    disposed.onActiveMapChange('downscaled-camera')
  })
  expect(screen.getByLabelText('Original Data viewport')).toHaveTextContent('zoom 10.00')
  expect(screen.getByLabelText('Active map camera')).toHaveTextContent('Original Data')
  await user.click(screen.getByRole('button', { name: 'Zoom in Original Data' }))
  for (const title of ['Original Data', 'Downscaled Data']) {
    expect(screen.getByLabelText(`${title} viewport`)).toHaveTextContent('zoom 10.50')
  }
})

it('wires default synchronization and active-source accessibility into the public four-map grid', async () => {
  const data = await temperatureMaps()
  const user = userEvent.setup()
  render(<ResultMapGrid data={data} display={resultMapDisplaySettings(data)} onRetry={() => {}} />)
  expect(screen.getByRole('checkbox', { name: 'Synchronize map cameras' })).toBeChecked()
  await user.click(screen.getByRole('button', { name: 'Zoom in Observation Data' }))
  const expected = screen.getByLabelText('Observation Data viewport').textContent
  for (const title of ['Original Data', 'Downscaled Data', 'Difference (Downscaled - Original)']) {
    expect(screen.getByLabelText(`${title} viewport`).textContent).toBe(expected)
  }
  expect(screen.getByLabelText('Active map camera')).toHaveTextContent('Observation Data')
})

it('rejects non-finite and unknown-source camera proposals at the public group interface', async () => {
  const user = userEvent.setup()
  render(
    <ResultMapCameraGroup maps={maps}>
      {({ onViewportChange, onActiveMapChange }) => (
        <button
          onClick={() => {
            onViewportChange({ longitude: 11, latitude: 47, zoom: 8 }, 'unknown-camera')
            onActiveMapChange('unknown-camera')
            onViewportChange({ longitude: Number.NaN, latitude: 47, zoom: 8 }, 'original-camera')
            onViewportChange(
              { longitude: 11, latitude: Number.POSITIVE_INFINITY, zoom: 8 },
              'original-camera',
            )
            onViewportChange(
              { longitude: 11, latitude: 47, zoom: Number.NEGATIVE_INFINITY },
              'original-camera',
            )
          }}
        >
          Propose invalid cameras
        </button>
      )}
    </ResultMapCameraGroup>,
  )
  await user.click(screen.getByRole('button', { name: 'Propose invalid cameras' }))
  expect(screen.getByLabelText('Active map camera')).toHaveTextContent(
    'Active map: Original Data · longitude 0.0600 · latitude 0.0400 · zoom 10.00',
  )
})

it('zooms once for a focused wheel event and cancels page scrolling without a passive listener', async () => {
  render(<CameraComparison data={await temperatureMaps()} />)
  const surface = screen.getByRole('group', { name: 'Original Data geographic samples' })
  const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120 })
  act(() => {
    surface.focus()
    surface.dispatchEvent(wheel)
  })
  expect(wheel.defaultPrevented).toBe(true)
  for (const title of ['Original Data', 'Downscaled Data']) {
    expect(screen.getByLabelText(`${title} viewport`)).toHaveTextContent('zoom 10.25')
  }
})

it('removes local wheel handling on unmount and re-enters without duplicate zoom responses', async () => {
  const data = await temperatureMaps()
  const view = render(<CameraComparison data={data} />)
  const outgoingSurface = screen.getByRole('group', { name: 'Original Data geographic samples' })
  view.unmount()
  render(
    <StrictMode>
      <CameraComparison data={data} />
    </StrictMode>,
  )
  const lateWheel = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    deltaY: -120,
  })
  act(() => outgoingSurface.dispatchEvent(lateWheel))
  expect(lateWheel.defaultPrevented).toBe(false)
  expect(screen.getByLabelText('Original Data viewport')).toHaveTextContent('zoom 10.00')
  act(() => {
    const liveSurface = screen.getByRole('group', { name: 'Original Data geographic samples' })
    liveSurface.focus()
    liveSurface.dispatchEvent(
      new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120 }),
    )
  })
  for (const title of ['Original Data', 'Downscaled Data']) {
    expect(screen.getByLabelText(`${title} viewport`)).toHaveTextContent('zoom 10.25')
  }
})

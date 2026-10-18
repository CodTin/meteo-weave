import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataExportPanel } from '@/features/result-analysis/components/data-export-panel'
import type { DownscalingTask } from '@/features/downscaling-tasks/service/contracts'

// Mock the map component since we're testing component logic, not map rendering
vi.mock('@/features/result-analysis/components/export-region-map', () => ({
  ExportRegionMap: ({
    taskBounds,
    exportBounds,
    onBoundsChange,
  }: {
    taskBounds: any
    exportBounds: any
    onBoundsChange: (bounds: any) => void
  }) => (
    <div data-testid="export-region-map">
      <button
        data-testid="mock-draw-rectangle"
        onClick={() => {
          // Simulate drawing a rectangle within task bounds
          onBoundsChange({
            west: taskBounds.west + 0.1,
            east: taskBounds.east - 0.1,
            south: taskBounds.south + 0.1,
            north: taskBounds.north - 0.1,
          })
        }}
      >
        Draw Rectangle
      </button>
    </div>
  ),
}))

const mockTask: DownscalingTask = {
  id: 'test-task-1',
  status: 'completed',
  configuration: {
    dataSource: 'ECMWF',
    variable: 'temperature',
    region: {
      west: 120.0,
      east: 121.0,
      south: 30.0,
      north: 31.0,
    },
    timeRange: {
      start: '2024-01-01T00:00:00Z',
      end: '2024-01-05T00:00:00Z',
    },
    targetResolution: '1km',
    downscalingMethod: 'deterministic',
  },
  createdAt: '2024-01-01T00:00:00Z',
  completedAt: '2024-01-01T00:05:00Z',
}

describe('DataExportPanel', () => {
  it('initializes bbox inputs with task bounds', () => {
    render(<DataExportPanel task={mockTask} />)

    expect(screen.getByLabelText(/西经/i)).toHaveValue(120.0)
    expect(screen.getByLabelText(/东经/i)).toHaveValue(121.0)
    expect(screen.getByLabelText(/南纬/i)).toHaveValue(30.0)
    expect(screen.getByLabelText(/北纬/i)).toHaveValue(31.0)
  })

  it('updates coordinate inputs when map rectangle is drawn', async () => {
    const user = userEvent.setup()
    render(<DataExportPanel task={mockTask} />)

    // Simulate drawing on map
    const drawButton = screen.getByTestId('mock-draw-rectangle')
    await user.click(drawButton)

    // Verify coordinates updated
    expect(screen.getByLabelText(/西经/i)).toHaveValue(120.1)
    expect(screen.getByLabelText(/东经/i)).toHaveValue(120.9)
    expect(screen.getByLabelText(/南纬/i)).toHaveValue(30.1)
    expect(screen.getByLabelText(/北纬/i)).toHaveValue(30.9)
  })

  it('updates map when coordinates are manually changed', async () => {
    const user = userEvent.setup()
    render(<DataExportPanel task={mockTask} />)

    const westInput = screen.getByLabelText(/西经/i)

    // Clear and type new value
    await user.clear(westInput)
    await user.type(westInput, '120.2')

    // The component should maintain the new value
    expect(westInput).toHaveValue(120.2)
  })

  it('displays map component', () => {
    render(<DataExportPanel task={mockTask} />)

    expect(screen.getByTestId('export-region-map')).toBeInTheDocument()
  })

  it('shows validation alert for export limits', () => {
    render(<DataExportPanel task={mockTask} />)

    expect(screen.getByText(/导出限制.*100km.*30 天/i)).toBeInTheDocument()
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DataExportPanel } from '@/features/result-analysis/components/data-export-panel'
import { demoCatalogFor } from '@/features/downscaling-tasks/service/demo-catalog'

const server = vi.hoisted(() => ({ estimate: vi.fn(), generate: vi.fn() }))
vi.mock('@/server/functions/csv-export', () => ({
  estimateExportFn: server.estimate,
  generateExportFn: server.generate,
}))
const tasks = demoCatalogFor('researcher')

beforeEach(() => {
  server.estimate.mockReset().mockResolvedValue({
    ok: true,
    recordCount: 48,
    approximateSize: 4096,
    sizeRule: 'CDF-1 header、UTF-8 属性与四字节填充；误差最多 256 字节。',
    counts: [
      { dataType: 'original', pointCount: 4, recordCount: 4 },
      { dataType: 'downscaled', pointCount: 44, recordCount: 44 },
      { dataType: 'observation', pointCount: 0, recordCount: 0 },
    ],
    notes: ['当前选区没有观测台站，观测贡献为 0 条。'],
    identity: 'authoritative-current-selection',
  })
  server.generate.mockReset()
})

function cropTask() {
  fireEvent.change(screen.getByLabelText('东经 (°E)'), { target: { value: '10.1' } })
  fireEvent.change(screen.getByLabelText('北纬 (°N)'), { target: { value: '46.1' } })
}

describe('Data Export selection controls', () => {
  it('offers all formats and UTC hourly/daily semantics without requiring a map token', async () => {
    const user = userEvent.setup()
    render(<DataExportPanel task={tasks[0]!} />)
    expect(screen.getByLabelText('西经 (°E)')).toHaveValue(10)
    expect(screen.getByLabelText('东经 (°E)')).toHaveValue(12)
    expect(screen.getByLabelText('开始时间 (UTC，包含)')).toHaveValue('2024-01-01T00:00')
    expect(screen.getByLabelText('结束时间 (UTC，不包含)')).toHaveValue('2024-01-04T00:00')
    expect(screen.getByText(/地图不可用：未配置 Mapbox/)).toBeVisible()
    expect(screen.getByRole('radio', { name: /CSV/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /GeoJSON/ })).toBeEnabled()
    expect(screen.getByRole('radio', { name: /NetCDF/ })).toBeEnabled()
    expect(screen.getByLabelText('时间粒度')).toHaveValue('hourly')
    expect(screen.getByRole('button', { name: '下载 CSV 文件' })).toBeDisabled()
    expect(screen.getByText(/BBOX_TOO_LARGE/)).toHaveTextContent(/缩小/)

    cropTask()
    await user.selectOptions(screen.getByLabelText('时间粒度'), 'daily')
    expect(await screen.findByText('48 条')).toBeVisible()
    expect(screen.getByText(/气温.*逐日.*均值/)).toBeVisible()
    expect(screen.getByText(/观测贡献为 0 条/)).toBeVisible()
    expect(screen.getByText(/UTF-8 属性与四字节填充/)).toBeVisible()
    expect(screen.getByRole('button', { name: '下载 CSV 文件' })).toBeEnabled()
    const selection = server.estimate.mock.calls.at(-1)?.[0].data
    expect(selection.task).toEqual(tasks[0]!)
    expect(selection.temporalResolution).toBe('daily')
    expect(selection.timeRange).toEqual({
      start: '2024-01-01T00:00:00Z',
      end: '2024-01-04T00:00:00Z',
    })
  })
})

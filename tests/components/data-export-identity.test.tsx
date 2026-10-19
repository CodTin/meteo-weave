import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataExportPanel } from '@/features/result-analysis/components/data-export-panel'
import { demoCatalogFor } from '@/features/downscaling-tasks/service/demo-catalog'
import type {
  ExportEstimationSuccess,
  ExportRequest,
} from '@/features/result-analysis/types/export'

const server = vi.hoisted(() => ({ estimate: vi.fn(), generate: vi.fn() }))
vi.mock('@/server/functions/csv-export', () => ({
  estimateExportFn: server.estimate,
  generateExportFn: server.generate,
}))

type PendingEstimate = {
  data: ExportRequest
  signal: AbortSignal
  resolve: (reply: ExportEstimationSuccess | { ok: false; code: string; message: string }) => void
  reject: (error: Error) => void
}
const estimates: PendingEstimate[] = []
const task = demoCatalogFor('researcher')[0]!
const result = (recordCount: number): ExportEstimationSuccess => ({
  ok: true,
  recordCount,
  approximateSize: recordCount * 128,
  sizeRule: 'CDF-1 header、坐标、属性与四字节填充；误差最多 256 字节。',
  counts: [{ dataType: 'downscaled', pointCount: recordCount, recordCount }],
  notes: [],
  identity: `server-selection-${recordCount}`,
})

function renderSmallSelection() {
  const view = render(<DataExportPanel task={task} />)
  fireEvent.change(screen.getByLabelText('东经 (°E)'), { target: { value: '10.1' } })
  fireEvent.change(screen.getByLabelText('北纬 (°N)'), { target: { value: '46.1' } })
  fireEvent.change(screen.getByLabelText('结束时间 (UTC，不包含)'), {
    target: { value: '2024-01-01T01:00' },
  })
  return view
}

beforeEach(() => {
  estimates.length = 0
  server.estimate
    .mockReset()
    .mockImplementation(
      ({ data, signal }) =>
        new Promise<ExportEstimationSuccess | { ok: false; code: string; message: string }>(
          (resolve, reject) => estimates.push({ data, signal, resolve, reject }),
        ),
    )
  server.generate.mockReset()
})

afterEach(() => vi.unstubAllGlobals())

describe('Data Export current selection identity', () => {
  it('clears a displayed estimate immediately and ignores older replies even if they resolve last', async () => {
    renderSmallSelection()
    await waitFor(() => expect(estimates).toHaveLength(1))
    await act(async () => estimates[0]!.resolve(result(12)))
    expect(await screen.findByText('12 条')).toBeVisible()

    fireEvent.change(screen.getByLabelText('东经 (°E)'), { target: { value: '10.2' } })
    expect(screen.queryByText('12 条')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下载 CSV 文件' })).toBeDisabled()
    await waitFor(() => expect(estimates).toHaveLength(2))
    fireEvent.change(screen.getByLabelText('东经 (°E)'), { target: { value: '10.3' } })
    expect(estimates[1]!.signal.aborted).toBe(true)
    await waitFor(() => expect(estimates).toHaveLength(3))
    await act(async () => estimates[2]!.resolve(result(36)))
    expect(await screen.findByText('36 条')).toBeVisible()
    await act(async () => estimates[1]!.resolve(result(24)))
    expect(screen.queryByText('24 条')).not.toBeInTheDocument()
    expect(screen.getByText('36 条')).toBeVisible()
    expect(screen.getByRole('button', { name: '下载 CSV 文件' })).toBeEnabled()
  })
  it('shows exact invalid-control errors with no retained size or old download action', async () => {
    renderSmallSelection()
    await waitFor(() => expect(estimates).toHaveLength(1))
    await act(async () => estimates[0]!.resolve(result(12)))
    expect(await screen.findByText('12 条')).toBeVisible()
    fireEvent.change(screen.getByLabelText('西经 (°E)'), { target: { value: '' } })
    expect(screen.getByText(/INVALID_REGION：请输入有效坐标/)).toBeVisible()
    expect(screen.getByLabelText('西经 (°E)')).toHaveValue(null)
    expect(screen.queryByText('12 条')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下载 CSV 文件' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('西经 (°E)'), { target: { value: '9' } })
    expect(screen.getByText(/REGION_OUTSIDE_TASK：/)).toBeVisible()
    fireEvent.change(screen.getByLabelText('西经 (°E)'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('开始时间 (UTC，包含)'), {
      target: { value: '2024-01-01T00:30' },
    })
    expect(screen.getByText(/INVALID_TIME_RANGE：请按 UTC 整点/)).toBeVisible()
    expect(screen.queryByRole('region', { name: '数据量估算' })).not.toBeInTheDocument()
  })

  it('aborts an estimate on owner replacement and never publishes its late response or error', async () => {
    const view = renderSmallSelection()
    await waitFor(() => expect(estimates).toHaveLength(1))
    const nextOwner = demoCatalogFor('policy')[0]!
    view.rerender(<DataExportPanel task={nextOwner} />)
    expect(estimates[0]!.signal.aborted).toBe(true)
    expect(screen.getByLabelText('东经 (°E)')).toHaveValue(12)
    expect(screen.getByText(/BBOX_TOO_LARGE/)).toBeVisible()
    await act(async () => estimates[0]!.resolve(result(9876)))
    expect(screen.queryByText('9,876 条')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下载 CSV 文件' })).toBeDisabled()
  })

  it('re-estimates for a changed seed and never lets an older transport error replace the new estimate', async () => {
    const view = renderSmallSelection()
    await waitFor(() => expect(estimates).toHaveLength(1))
    view.rerender(<DataExportPanel task={{ ...task, dataSeed: 103, referenceSeed: 42 }} />)
    expect(estimates[0]!.signal.aborted).toBe(true)
    fireEvent.change(screen.getByLabelText('东经 (°E)'), { target: { value: '10.1' } })
    fireEvent.change(screen.getByLabelText('北纬 (°N)'), { target: { value: '46.1' } })
    fireEvent.change(screen.getByLabelText('结束时间 (UTC，不包含)'), {
      target: { value: '2024-01-01T01:00' },
    })
    await waitFor(() => expect(estimates).toHaveLength(2))
    await act(async () => estimates[1]!.resolve(result(36)))
    expect(await screen.findByText('36 条')).toBeVisible()
    await act(async () => estimates[0]!.reject(new Error('stale estimate transport failure')))
    expect(screen.queryByText(/stale estimate transport failure/)).not.toBeInTheDocument()
    expect(screen.getByText('36 条')).toBeVisible()
  })

  it('keeps a capacity rejection visible without stale estimated bytes', async () => {
    renderSmallSelection()
    await waitFor(() => expect(estimates).toHaveLength(1))
    await act(async () =>
      estimates[0]!.resolve({
        ok: false,
        code: 'EXPORT_TOO_LARGE',
        message: 'CDF-1 布局超过 32 MiB，请缩小区域或时段。',
      }),
    )
    expect(await screen.findByText(/EXPORT_TOO_LARGE：CDF-1 布局超过 32 MiB/)).toBeVisible()
    expect(screen.queryByRole('region', { name: '数据量估算' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下载 CSV 文件' })).toBeDisabled()
  })

  it('retries a failed estimate for the unchanged selection and then downloads its file', async () => {
    const created = vi.fn().mockReturnValue('blob:retried-export')
    const revoked = vi.fn()
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = created
        static revokeObjectURL = revoked
      },
    )
    const downloads: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download)
    })
    server.generate.mockResolvedValue({
      ok: true,
      content: 'time,value\n2024-01-01T00:00:00Z,12\n',
      mimeType: 'text/csv;charset=utf-8',
      filename: 'current-selection.csv',
      recordCount: 1,
      notes: [],
    })
    renderSmallSelection()
    await waitFor(() => expect(estimates).toHaveLength(1))
    const selection = structuredClone(estimates[0]!.data)
    await act(async () => estimates[0]!.reject(new Error('估算连接中断，请重试。')))
    expect(await screen.findByText(/ESTIMATION_FAILED：估算连接中断/)).toBeVisible()
    expect(screen.getByRole('button', { name: '下载 CSV 文件' })).toBeDisabled()
    expect(screen.queryByRole('region', { name: '数据量估算' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重试当前选择估算' }))
    await waitFor(() => expect(estimates).toHaveLength(2))
    expect(estimates[0]!.signal.aborted).toBe(true)
    expect(estimates[1]!.data).toEqual(selection)
    expect(screen.queryByText(/ESTIMATION_FAILED/)).not.toBeInTheDocument()
    await act(async () => estimates[1]!.resolve(result(12)))
    expect(await screen.findByText('12 条')).toBeVisible()
    expect(screen.queryByRole('button', { name: '重试当前选择估算' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下载 CSV 文件' }))
    expect(await screen.findByText('已发起浏览器下载')).toBeVisible()
    expect(server.generate.mock.calls[0]![0].data).toEqual(selection)
    expect(downloads).toEqual(['current-selection.csv'])
    expect(created).toHaveBeenCalledTimes(1)
    expect(revoked).toHaveBeenCalledWith('blob:retried-export')
  })

  it('cancels estimates on unmount and never renders a response afterward', async () => {
    const view = renderSmallSelection()
    await waitFor(() => expect(estimates).toHaveLength(1))
    view.unmount()
    expect(estimates[0]!.signal.aborted).toBe(true)
    await act(async () => estimates[0]!.resolve(result(120)))
    expect(screen.queryByText('120 条')).not.toBeInTheDocument()
  })
})

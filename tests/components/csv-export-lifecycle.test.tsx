import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataExportPanel } from '@/features/result-analysis/components/data-export-panel'
import type { ExportRequest } from '@/features/result-analysis/types/export'
import { demoCatalogFor } from '@/features/downscaling-tasks/service/demo-catalog'

const transport = vi.hoisted(() => ({ generate: vi.fn(), estimate: vi.fn() }))
vi.mock('@/server/functions/csv-export', () => ({
  generateExportFn: transport.generate,
  estimateExportFn: transport.estimate,
}))

const task = demoCatalogFor('researcher')[0]!
const bytes = Uint8Array.from([67, 68, 70, 1, ...Array<number>(24).fill(0), 255, 128, 195, 169])
const urls = { created: vi.fn(), revoked: vi.fn() }
const downloads: Array<{ url: string; filename: string }> = []

function selectSmallWindow() {
  fireEvent.change(screen.getByLabelText('东经 (°E)'), { target: { value: '10.1' } })
  fireEvent.change(screen.getByLabelText('北纬 (°N)'), { target: { value: '46.1' } })
  fireEvent.change(screen.getByLabelText('结束时间 (UTC，不包含)'), {
    target: { value: '2024-01-01T01:00' },
  })
}

beforeEach(() => {
  downloads.length = 0
  urls.created.mockReset().mockReturnValue('blob:export-1')
  urls.revoked.mockReset()
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = urls.created
      static revokeObjectURL = urls.revoked
    },
  )
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push({ url: this.href, filename: this.download })
  })
  transport.estimate.mockReset().mockResolvedValue({
    ok: true,
    recordCount: 12,
    approximateSize: 1024,
    sizeRule: 'CDF-1 布局、属性和四字节填充；误差不超过 256 字节。',
    counts: [{ dataType: 'downscaled', pointCount: 12, recordCount: 12 }],
    notes: [],
    identity: 'controlled-current-selection',
  })
  transport.generate.mockReset().mockResolvedValue({
    ok: true,
    content: bytes,
    mimeType: 'application/x-netcdf',
    filename: 'temperature-downscaled.nc',
    recordCount: 12,
    notes: [],
  })
})

afterEach(() => vi.unstubAllGlobals())

async function readyNetCDF() {
  const view = render(<DataExportPanel task={task} />)
  selectSmallWindow()
  await userEvent.setup().click(screen.getByRole('radio', { name: /NetCDF/ }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '下载 NetCDF 文件' })).toBeEnabled(),
  )
  return view
}

function deferredGeneration() {
  let resolve!: (reply: unknown) => void
  let reject!: (error: Error) => void
  const promise = new Promise((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, resolve, reject }
}

const goodBinary = () => ({
  ok: true,
  content: bytes,
  mimeType: 'application/x-netcdf',
  filename: 'temperature-downscaled.nc',
  recordCount: 12,
  notes: [],
})

describe('Data Export browser download lifecycle', () => {
  it('downloads unchanged NetCDF bytes from the same panel and releases its temporary URL', async () => {
    const user = userEvent.setup()
    render(<DataExportPanel task={task} />)
    selectSmallWindow()
    await user.click(screen.getByRole('radio', { name: /NetCDF/ }))
    const download = screen.getByRole('button', { name: '下载 NetCDF 文件' })
    await waitFor(() => expect(download).toBeEnabled())
    await user.click(download)
    await screen.findByText('已发起浏览器下载')

    expect(downloads).toEqual([{ url: 'blob:export-1', filename: 'temperature-downscaled.nc' }])
    const blob: Blob = urls.created.mock.calls[0]![0]
    const actual = await new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(blob)
    })
    expect(actual).toEqual(bytes)
    expect(blob.type).toBe('application/x-netcdf')
    expect(urls.revoked.mock.calls).toEqual([['blob:export-1']])
    expect(screen.queryByText(/文件已保存|已撤回|删除.*文件/)).not.toBeInTheDocument()
  })
  it('cancels the transport and never downloads its late result while a retry is still pending', async () => {
    const first = deferredGeneration()
    const second = deferredGeneration()
    transport.generate.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    await readyNetCDF()
    fireEvent.click(screen.getByRole('button', { name: '下载 NetCDF 文件' }))
    await screen.findByText(/正在读取并编码 NetCDF/)
    const firstSignal: AbortSignal = transport.generate.mock.calls[0]![0].signal
    fireEvent.click(screen.getByRole('button', { name: '取消导出' }))
    expect(firstSignal.aborted).toBe(true)
    expect(screen.getByText('导出已取消，未提交浏览器下载')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '下载 NetCDF 文件' }))
    await screen.findByText(/正在读取并编码 NetCDF/)
    await act(async () => first.resolve(goodBinary()))
    expect(downloads).toHaveLength(0)
    expect(screen.getByRole('button', { name: '取消导出' })).toBeVisible()
    await act(async () => second.resolve(goodBinary()))
    expect(await screen.findByText('已发起浏览器下载')).toBeVisible()
    expect(downloads).toHaveLength(1)
    expect(urls.revoked.mock.calls).toEqual([['blob:export-1']])
  })

  it('does not let an old rejection or finally clear a newer export', async () => {
    const old = deferredGeneration()
    const current = deferredGeneration()
    transport.generate.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    await readyNetCDF()
    fireEvent.click(screen.getByRole('button', { name: '下载 NetCDF 文件' }))
    await screen.findByText(/正在读取并编码 NetCDF/)
    fireEvent.change(screen.getByLabelText('东经 (°E)'), { target: { value: '10.2' } })
    expect(transport.generate.mock.calls[0]![0].signal.aborted).toBe(true)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '下载 NetCDF 文件' })).toBeEnabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: '下载 NetCDF 文件' }))
    await screen.findByText(/正在读取并编码 NetCDF/)
    await act(async () => old.reject(new Error('old connection failed')))
    expect(screen.queryByText(/old connection failed/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取消导出' })).toBeVisible()
    await act(async () => current.resolve(goodBinary()))
    expect(await screen.findByText('已发起浏览器下载')).toBeVisible()
    expect(downloads).toHaveLength(1)
  })

  it('preserves a useful failure and retries exactly the current displayed selection without duplicate requests', async () => {
    const retry = deferredGeneration()
    transport.generate
      .mockResolvedValueOnce({
        ok: false,
        code: 'ENCODING_FAILED',
        message: '布局编码失败，请缩小请求后重试。',
      })
      .mockReturnValueOnce(retry.promise)
    await readyNetCDF()
    fireEvent.click(screen.getByRole('button', { name: '下载 NetCDF 文件' }))
    expect(await screen.findByText(/ENCODING_FAILED：布局编码失败/)).toBeVisible()
    const retryButton = screen.getByRole('button', { name: '重试导出' })
    fireEvent.click(retryButton)
    fireEvent.click(retryButton)
    await screen.findByText(/正在读取并编码 NetCDF/)
    const selection: ExportRequest = transport.generate.mock.calls[1]![0].data
    expect(selection.task).toEqual(task)
    expect(selection.bbox).toEqual({ west: 10, east: 10.1, south: 46, north: 46.1 })
    expect(selection.timeRange).toEqual({
      start: '2024-01-01T00:00:00Z',
      end: '2024-01-01T01:00:00Z',
    })
    expect(selection.format).toBe('netcdf')
    expect(transport.generate.mock.calls).toHaveLength(2)
    await act(async () => retry.resolve(goodBinary()))
    expect(await screen.findByText('已发起浏览器下载')).toBeVisible()
    expect(downloads).toHaveLength(1)
  })

  it.each([
    { name: 'zero bytes', content: new Uint8Array(), mimeType: 'application/x-netcdf' },
    {
      name: 'error JSON',
      content: '{"ok":false,"error":"failed"}',
      mimeType: 'application/x-netcdf',
    },
    { name: 'wrong signature', content: new Uint8Array(64), mimeType: 'application/x-netcdf' },
    { name: 'wrong media type', content: bytes, mimeType: 'application/json' },
    {
      name: 'partial header',
      content: Uint8Array.from([67, 68, 70, 1]),
      mimeType: 'application/x-netcdf',
    },
  ])('rejects $name instead of a successful .nc download', async ({ content, mimeType }) => {
    transport.generate.mockResolvedValue({ ...goodBinary(), content, mimeType })
    await readyNetCDF()
    fireEvent.click(screen.getByRole('button', { name: '下载 NetCDF 文件' }))
    expect(await screen.findByText(/服务器未返回完整的 NetCDF 二进制文件/)).toBeVisible()
    expect(downloads).toHaveLength(0)
    expect(urls.created).not.toHaveBeenCalled()
    expect(screen.queryByText('已发起浏览器下载')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试导出' })).toBeEnabled()
  })

  it('releases a created URL even when the browser refuses to start the download', async () => {
    await readyNetCDF()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('浏览器拒绝下载')
    })
    fireEvent.click(screen.getByRole('button', { name: '下载 NetCDF 文件' }))
    expect(await screen.findByText(/DOWNLOAD_FAILED：浏览器拒绝下载/)).toBeVisible()
    expect(screen.queryByText('已发起浏览器下载')).not.toBeInTheDocument()
    expect(urls.revoked.mock.calls).toEqual([['blob:export-1']])
    expect(document.querySelector('a[download]')).toBeNull()
  })

  it('aborts on unmount and never turns a late generation into a download', async () => {
    const pending = deferredGeneration()
    transport.generate.mockReturnValueOnce(pending.promise)
    const view = await readyNetCDF()
    fireEvent.click(screen.getByRole('button', { name: '下载 NetCDF 文件' }))
    await screen.findByText(/正在读取并编码 NetCDF/)
    view.unmount()
    expect(transport.generate.mock.calls[0]![0].signal.aborted).toBe(true)
    await act(async () => pending.resolve(goodBinary()))
    expect(downloads).toHaveLength(0)
    expect(urls.created).not.toHaveBeenCalled()
  })

  it('handles identical configuration rerenders without immediately re-exporting', async () => {
    const view = await readyNetCDF()
    fireEvent.click(screen.getByRole('button', { name: '下载 NetCDF 文件' }))
    await screen.findByText('已发起浏览器下载')
    view.rerender(<DataExportPanel task={structuredClone(task)} />)
    expect(screen.getByText('已发起浏览器下载')).toBeVisible()
    expect(downloads).toHaveLength(1)
    expect(transport.generate.mock.calls).toHaveLength(1)
  })

  it('releases a URL created at the same moment the panel is invalidated', async () => {
    const view = await readyNetCDF()
    urls.created.mockImplementationOnce(() => {
      view.unmount()
      return 'blob:interrupted-creation'
    })
    fireEvent.click(screen.getByRole('button', { name: '下载 NetCDF 文件' }))
    await waitFor(() => expect(urls.created).toHaveBeenCalled())
    expect(downloads).toHaveLength(0)
    expect(urls.revoked.mock.calls).toEqual([['blob:interrupted-creation']])
  })

  it.each([
    { name: 'owner', next: demoCatalogFor('policy')[0]! },
    { name: 'task', next: demoCatalogFor('researcher')[1]! },
    {
      name: 'same-id configuration',
      next: { ...task, configuration: { ...task.configuration, dataSource: 'fusion' as const } },
    },
    { name: 'same-id scientific identity', next: { ...task, dataSeed: 105, referenceSeed: 23 } },
  ])('invalidates $name replacement before any late generation is published', async ({ next }) => {
    const pending = deferredGeneration()
    transport.generate.mockReturnValueOnce(pending.promise)
    const view = await readyNetCDF()
    fireEvent.click(screen.getByRole('button', { name: '下载 NetCDF 文件' }))
    await screen.findByText(/正在读取并编码 NetCDF/)
    view.rerender(<DataExportPanel task={next} />)
    expect(transport.generate.mock.calls[0]![0].signal.aborted).toBe(true)
    expect(screen.getByRole('radio', { name: /CSV/ })).toBeChecked()
    await act(async () => pending.resolve(goodBinary()))
    expect(downloads).toHaveLength(0)
    expect(urls.created).not.toHaveBeenCalled()
    expect(screen.queryByText('已发起浏览器下载')).not.toBeInTheDocument()
  })

  it.each([
    {
      format: 'csv',
      label: 'CSV',
      content: 'time,value\n2024-01-01T00:00:00Z,12\n',
      mimeType: 'text/csv;charset=utf-8',
      filename: 'temperature.csv',
      recordCount: 1,
    },
    {
      format: 'geojson',
      label: 'GeoJSON',
      content:
        '{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[10,46]},"properties":{"value":12}}]}',
      mimeType: 'application/geo+json',
      filename: 'temperature.geojson',
      recordCount: 1,
    },
  ])(
    'uses the same download lifecycle for $label text without a duplicate workflow',
    async ({ label, ...reply }) => {
      const view = await readyNetCDF()
      transport.generate.mockResolvedValue({ ok: true, notes: [], ...reply })
      fireEvent.click(screen.getByRole('radio', { name: new RegExp(label) }))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: `下载 ${label} 文件` })).toBeEnabled(),
      )
      fireEvent.click(screen.getByRole('button', { name: `下载 ${label} 文件` }))
      expect(await screen.findByText('已发起浏览器下载')).toBeVisible()
      expect(downloads).toEqual([{ url: 'blob:export-1', filename: reply.filename }])
      expect(urls.revoked.mock.calls).toEqual([['blob:export-1']])
      view.unmount()
      expect(urls.revoked.mock.calls).toHaveLength(1)
    },
  )
})

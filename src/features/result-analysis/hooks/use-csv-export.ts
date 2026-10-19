import {
  bboxSchema,
  calculateBboxWidthKm,
  calculateBboxHeightKm,
  isBboxWithinBounds,
} from '@/features/spatial-region/geometry'
import { useCallback, useEffect, useState } from 'react'
import { generateExportFn } from '@/server/functions/csv-export'
import type {
  ExportFailure,
  ExportFormat,
  ExportRequest,
} from '@/features/result-analysis/types/export'

export type ExportState =
  | 'idle'
  | 'validating'
  | 'generating'
  | 'complete'
  | 'download-initiated'
  | 'cancelled'
  | 'failed'

type ExportSnapshot = {
  identity: number
  state: ExportState
  message: string | null
  error: string | null
  code: string | null
  downloadUrl: string | null
  filename: string | null
  notes: string[]
}

type PendingExport = {
  identity: number
  controller: AbortController
  request: ExportRequest
  url: string | null
  filename: string | null
  ready: boolean
}

const emptySnapshot = (identity: number): ExportSnapshot => ({
  identity,
  state: 'idle',
  message: null,
  error: null,
  code: null,
  downloadUrl: null,
  filename: null,
  notes: [],
})

export const exportFormatLabel = (format: ExportFormat) =>
  ({ csv: 'CSV', geojson: 'GeoJSON', netcdf: 'NetCDF' })[format]

/** Include the entire saved task, not just its id: owners, seeds and configurations can change. */
export function exportRequestKey(request: ExportRequest): string {
  return JSON.stringify({ ...request, dataTypes: [...request.dataTypes].sort() })
}

type RequestOperation = {
  identity: number
  controller: AbortController
  request: ExportRequest
  dispose: () => void
}

/** Resource identity is independent of React display state; retiring is synchronous and monotonic. */
export class ExportRequestIdentity {
  #key: string
  #request: ExportRequest
  #identity = 0
  #active: RequestOperation | null = null

  constructor(request: ExportRequest) {
    this.#request = request
    this.#key = exportRequestKey(request)
  }

  select(request: ExportRequest) {
    const key = exportRequestKey(request)
    if (this.#key !== key) {
      this.retire()
      this.#key = key
    }
    this.#request = request
  }

  get identity() {
    return this.#identity
  }
  get request() {
    return this.#request
  }
  get active() {
    return this.#active
  }

  begin(dispose: () => void = () => {}) {
    this.retire()
    const operation: RequestOperation = {
      identity: this.#identity,
      controller: new AbortController(),
      request: structuredClone(this.#request),
      dispose,
    }
    this.#active = operation
    return operation
  }

  owns(operation: RequestOperation) {
    return this.#active === operation && !operation.controller.signal.aborted
  }

  settle(operation: RequestOperation) {
    if (this.#active === operation) this.#active = null
  }

  retire() {
    this.#identity += 1
    const old = this.#active
    this.#active = null
    if (old) {
      old.controller.abort()
      old.dispose()
    }
  }
}

export function exportTaskTimeRange(task: ExportRequest['task']) {
  const range = task.configuration.timeRange
  const dateOnlyEnd = /^\d{4}-\d{2}-\d{2}$/.test(range.end)
  return {
    start: new Date(range.start).toISOString(),
    // Legacy historical dates include the last named day; normalized ISO ranges are half-open.
    end: new Date(
      Date.parse(range.end) + (range.mode === 'historical' && dateOnlyEnd ? 86_400_000 : 0),
    ).toISOString(),
  }
}

/** A validation preview only; the public estimate/generate functions remain authoritative. */
export function validateExportSelection(request: ExportRequest): ExportFailure | null {
  const fail = (code: string, message: string): ExportFailure => ({ ok: false, code, message })
  const { bbox, task, timeRange } = request
  if (task.status !== 'Completed') return fail('TASK_NOT_COMPLETED', '仅可导出已完成任务。')
  if (request.dataTypes.length === 0) return fail('NO_DATA_TYPES', '请至少选择一种数据类型。')
  if (!bboxSchema.safeParse(bbox).success)
    return fail('INVALID_REGION', '请输入有效坐标：西经必须小于东经，南纬必须小于北纬。')
  const region = task.configuration.region
  if (!isBboxWithinBounds(bbox, region))
    return fail('REGION_OUTSIDE_TASK', '导出区域必须位于任务范围内；不会自动裁剪。')
  const width = calculateBboxWidthKm(bbox)
  const height = calculateBboxHeightKm(bbox)
  if (width > 100 + 1e-9 || height > 100 + 1e-9)
    return fail('BBOX_TOO_LARGE', '区域宽度和高度各不得超过 100km，请缩小坐标或地图选区。')
  const start = Date.parse(timeRange.start)
  const end = Date.parse(timeRange.end)
  const interval = request.temporalResolution === 'daily' ? 86_400_000 : 3_600_000
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start >= end ||
    start % interval !== 0 ||
    end % interval !== 0
  )
    return fail(
      'INVALID_TIME_RANGE',
      request.temporalResolution === 'daily'
        ? '请按 UTC 整日选择开始和结束时间，结束时间必须晚于开始时间。'
        : '请按 UTC 整点选择开始和结束时间，结束时间必须晚于开始时间。',
    )
  if (
    request.temporalResolution === 'daily' &&
    !['temperature', 'precipitation'].includes(task.configuration.variable)
  )
    return fail('UNSUPPORTED_TEMPORAL_RESOLUTION', '逐日导出仅支持气温和降水。')
  const coverage = exportTaskTimeRange(task)
  if (start < Date.parse(coverage.start) || end > Date.parse(coverage.end))
    return fail('TIME_OUTSIDE_TASK', '导出时间必须位于任务的 UTC 时间范围内。')
  if (end - start > 30 * 86_400_000)
    return fail('DURATION_TOO_LONG', '时间跨度不得超过 30×24 小时，请缩短时间范围。')
  return null
}

function releaseUrl(pending: PendingExport) {
  const url = pending.url
  pending.url = null
  if (url) URL.revokeObjectURL(url)
}

function readDownload(result: unknown, format: ExportFormat) {
  if (!result || typeof result !== 'object') throw new Error('服务器未返回完整导出文件，请重试。')
  const reply = result as {
    ok?: boolean
    content?: unknown
    byteLength?: unknown
    mimeType?: unknown
    filename?: unknown
    recordCount?: unknown
    notes?: unknown
    code?: unknown
    message?: unknown
  }
  if (reply.ok === false) {
    const error = new Error(
      typeof reply.message === 'string' ? reply.message : '导出失败，请重试。',
    )
    Object.assign(error, { code: reply.code })
    throw error
  }
  const mimeType = typeof reply.mimeType === 'string' ? reply.mimeType : ''
  const mediaType = (mimeType.split(';')[0] ?? '').trim().toLowerCase()
  const extension = format === 'netcdf' ? 'nc' : format === 'geojson' ? 'geojson' : 'csv'
  if (
    reply.ok !== true ||
    typeof reply.filename !== 'string' ||
    !reply.filename.toLowerCase().endsWith(`.${extension}`) ||
    [...reply.filename].some(
      (character) => character.charCodeAt(0) < 32 || character === '/' || character === '\\',
    ) ||
    typeof reply.recordCount !== 'number' ||
    !Number.isSafeInteger(reply.recordCount) ||
    reply.recordCount <= 0 ||
    !Array.isArray(reply.notes) ||
    !reply.notes.every((note) => typeof note === 'string')
  )
    throw new Error('服务器未返回完整导出文件，请重试。')
  let blob: Blob
  if (format === 'netcdf') {
    const content = reply.content
    // This transport guard is not an independent scientific/format verification of the file.
    if (
      !(content instanceof Uint8Array) ||
      content.byteLength < 32 ||
      !Number.isSafeInteger(reply.byteLength) ||
      reply.byteLength !== content.byteLength ||
      content[0] !== 67 ||
      content[1] !== 68 ||
      content[2] !== 70 ||
      content[3] !== 1 ||
      !['application/x-netcdf', 'application/netcdf'].includes(mediaType)
    )
      throw new Error('服务器未返回完整的 NetCDF 二进制文件，请重试或缩小选择。')
    blob = new Blob([new Uint8Array(content).buffer], { type: mimeType })
  } else {
    if (
      typeof reply.content !== 'string' ||
      !reply.content.trim() ||
      !(format === 'csv'
        ? mediaType === 'text/csv'
        : ['application/geo+json', 'application/json'].includes(mediaType))
    )
      throw new Error('服务器未返回完整的文本导出文件，请重试。')
    if (format === 'geojson') {
      const json = JSON.parse(reply.content)
      if (
        json?.type !== 'FeatureCollection' ||
        !Array.isArray(json.features) ||
        json.features.length !== reply.recordCount
      )
        throw new Error('服务器未返回完整的 GeoJSON 要素集合，请重试。')
    }
    blob = new Blob([reply.content], { type: mimeType })
  }
  return {
    blob,
    filename: reply.filename,
    notes: reply.notes as string[],
    recordCount: reply.recordCount,
  }
}

export function useCsvExport(request: ExportRequest) {
  const [scope] = useState(() => new ExportRequestIdentity(request))
  const [snapshot, setSnapshot] = useState(() => emptySnapshot(0))
  scope.select(request)
  useEffect(() => () => scope.retire(), [scope])

  const startExport = useCallback(async () => {
    if (scope.active) return
    let pending: PendingExport | null = null
    const operation = scope.begin(() => {
      if (pending) {
        releaseUrl(pending)
        pending.filename = null
      }
    })
    pending = { ...operation, url: null, filename: null, ready: false }
    const file = pending
    const current = () => scope.owns(operation)
    const selection = operation.request
    const initial = emptySnapshot(operation.identity)
    setSnapshot({ ...initial, state: 'validating', message: '正在校验导出选择' })
    try {
      const failure = validateExportSelection(selection)
      if (failure) throw Object.assign(new Error(failure.message), { code: failure.code })
      await Promise.resolve()
      if (!current()) return
      setSnapshot({
        ...initial,
        state: 'generating',
        message: `正在读取并编码 ${exportFormatLabel(selection.format)}，等待服务器完成`,
      })
      const result = await generateExportFn({
        data: selection,
        signal: operation.controller.signal,
      })
      if (!current()) return
      const download = readDownload(result, selection.format)
      file.url = URL.createObjectURL(download.blob)
      if (!current()) {
        releaseUrl(file)
        return
      }
      file.filename = download.filename
      file.ready = true
      setSnapshot({
        ...initial,
        state: 'complete',
        message: `生成完成：${download.recordCount.toLocaleString()} 条记录，准备提交浏览器下载`,
        downloadUrl: file.url,
        filename: file.filename,
        notes: download.notes,
      })
      operation.dispose = () => {
        releaseUrl(file)
        file.filename = null
      }
    } catch (error) {
      if (!current()) return
      releaseUrl(file)
      scope.settle(operation)
      setSnapshot({
        ...initial,
        state: 'failed',
        error: error instanceof Error ? error.message : '导出失败，请重试。',
        code:
          error instanceof Error && 'code' in error && typeof error.code === 'string'
            ? error.code
            : 'EXPORT_FAILED',
      })
    }
  }, [scope])

  const initiateDownload = useCallback(() => {
    const operation = scope.active
    if (
      !operation ||
      snapshot.identity !== operation.identity ||
      snapshot.state !== 'complete' ||
      !snapshot.downloadUrl ||
      !snapshot.filename ||
      !scope.owns(operation)
    )
      return
    let link: HTMLAnchorElement | null = null
    try {
      link = document.createElement('a')
      link.href = snapshot.downloadUrl
      link.download = snapshot.filename
      link.hidden = true
      document.body.appendChild(link)
      link.click()
      if (!scope.owns(operation)) return
      setSnapshot((previous) => ({
        ...previous,
        state: 'download-initiated',
        message: '已发起浏览器下载',
        downloadUrl: null,
        filename: null,
      }))
    } catch (error) {
      if (!scope.owns(operation)) return
      setSnapshot({
        ...emptySnapshot(operation.identity),
        state: 'failed',
        code: 'DOWNLOAD_FAILED',
        error: error instanceof Error ? error.message : '浏览器下载未能发起，请重试。',
      })
    } finally {
      link?.remove()
      operation.dispose()
      scope.settle(operation)
    }
  }, [scope, snapshot])

  const cancel = useCallback(() => {
    scope.retire()
    setSnapshot({
      ...emptySnapshot(scope.identity),
      state: 'cancelled',
      message: '导出已取消，未提交浏览器下载',
    })
  }, [scope])

  const visible = snapshot.identity === scope.identity ? snapshot : emptySnapshot(scope.identity)
  // Drop even revoked URL/filename/notes state on identity changes, not just its visible projection.
  if (visible !== snapshot) setSnapshot(visible)
  return { ...visible, startExport, retry: startExport, cancel, initiateDownload }
}

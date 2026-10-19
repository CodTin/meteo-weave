import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Download, RotateCcw, X } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { DownscalingTask } from '@/features/downscaling-tasks/service/contracts'
import type {
  BBox,
  ExportDataType,
  ExportFormat,
  ExportRequest,
} from '@/features/result-analysis/types/export'
import {
  exportFormatLabel,
  exportTaskTimeRange,
  useCsvExport,
  validateExportSelection,
} from '@/features/result-analysis/hooks/use-csv-export'
import { useExportEstimation } from '@/features/result-analysis/hooks/use-export-estimation'
import { ExportRegionMap } from './export-region-map'

const coordinateFields = [
  { field: 'west', label: '西经 (°E)', axis: 'longitude' },
  { field: 'east', label: '东经 (°E)', axis: 'longitude' },
  { field: 'south', label: '南纬 (°N)', axis: 'latitude' },
  { field: 'north', label: '北纬 (°N)', axis: 'latitude' },
] as const
const dataTypeOptions: Array<{ value: ExportDataType; label: string }> = [
  { value: 'original', label: '原始数据（粗网格）' },
  { value: 'downscaled', label: '降尺度数据（目标网格）' },
  { value: 'observation', label: '观测数据（实际台站）' },
]
const formatOptions: Array<{ value: ExportFormat; label: string }> = [
  { value: 'csv', label: 'CSV（表格数据）' },
  { value: 'geojson', label: 'GeoJSON（地理要素集合）' },
  { value: 'netcdf', label: 'NetCDF（CDF-1 二进制）' },
]

type Selection = {
  taskKey: string
  coordinates: Record<keyof BBox, string>
  start: string
  end: string
  dataTypes: ExportDataType[]
  format: ExportFormat
  temporalResolution: ExportRequest['temporalResolution']
}

function initialSelection(task: DownscalingTask, taskKey: string): Selection {
  const { region } = task.configuration
  const range = exportTaskTimeRange(task)
  return {
    taskKey,
    coordinates: {
      west: String(region.west),
      east: String(region.east),
      south: String(region.south),
      north: String(region.north),
    },
    start: range.start.slice(0, 16),
    end: range.end.slice(0, 16),
    dataTypes: ['downscaled'],
    format: 'csv',
    temporalResolution: 'hourly',
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes.toLocaleString()} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
const coordinateNumber = (input: string) => (input.trim() ? Number(input) : Number.NaN)
const utcInput = (input: string) => (input ? `${input.length === 16 ? `${input}:00` : input}Z` : '')

export function DataExportPanel({ task }: { task: DownscalingTask }) {
  const taskKey = JSON.stringify(task)
  const [saved, setSelection] = useState(() => initialSelection(task, taskKey))
  const selection = saved.taskKey === taskKey ? saved : initialSelection(task, taskKey)
  // Reset displayed controls in the task-changing render; both hooks see the new owner/config immediately.
  if (selection !== saved) setSelection(selection)
  const bbox: BBox = {
    west: coordinateNumber(selection.coordinates.west),
    east: coordinateNumber(selection.coordinates.east),
    south: coordinateNumber(selection.coordinates.south),
    north: coordinateNumber(selection.coordinates.north),
  }
  const request: ExportRequest = {
    taskId: task.id,
    task,
    bbox,
    timeRange: { start: utcInput(selection.start), end: utcInput(selection.end) },
    dataTypes: dataTypeOptions
      .filter((option) => selection.dataTypes.includes(option.value))
      .map((option) => option.value),
    format: selection.format,
    temporalResolution: selection.temporalResolution,
  }
  const { state, message, error, code, notes, startExport, cancel, retry, initiateDownload } =
    useCsvExport(request)
  const {
    estimation,
    isEstimating,
    error: estimationError,
    code: estimationCode,
  } = useExportEstimation(request)
  const validation = validateExportSelection(request)
  const isExporting = state === 'validating' || state === 'generating' || state === 'complete'
  const canDownload = !!estimation && !isEstimating && !estimationError && !isExporting
  const label = exportFormatLabel(selection.format)
  const { configuration } = task
  const supportsDaily =
    configuration.variable === 'temperature' || configuration.variable === 'precipitation'
  const mapboxToken =
    typeof import.meta.env.VITE_MAPBOX_ACCESS_TOKEN === 'string'
      ? import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
      : undefined
  const handleMapBoundsChange = useCallback(
    (bounds: BBox) => {
      setSelection((previous) =>
        previous.taskKey !== taskKey
          ? previous
          : {
              ...previous,
              coordinates: {
                west: String(bounds.west),
                east: String(bounds.east),
                south: String(bounds.south),
                north: String(bounds.north),
              },
            },
      )
    },
    [taskKey],
  )

  useEffect(() => {
    if (state === 'complete') initiateDownload()
  }, [state, initiateDownload])

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>数据导出</CardTitle>
        <CardDescription>
          选择坐标、UTC 时段和数据类型，导出 CSV、GeoJSON 或 NetCDF；所有数据均为 Synthetic Demo。
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-6">
        <p className="break-words text-sm text-muted-foreground">当前任务：{task.name}</p>
        <section className="space-y-2" aria-label="区域选择">
          <h3 className="text-sm font-medium">区域选择</h3>
          <p className="text-xs text-muted-foreground">
            地图矩形与下方坐标同步。默认是完整任务范围；超限时请主动缩小，不会自动裁剪或扩大。
          </p>
          {Object.values(bbox).every(Number.isFinite) ? (
            <ExportRegionMap
              key={taskKey}
              taskBounds={configuration.region}
              exportBounds={bbox}
              onBoundsChange={handleMapBoundsChange}
              mapboxToken={mapboxToken}
            />
          ) : (
            <p className="rounded-md border p-4 text-sm">
              请先填写完整坐标，再同步地图；当前输入不会被自动修改。
            </p>
          )}
        </section>
        <fieldset className="min-w-0 space-y-4" aria-describedby="export-coordinate-help">
          <legend className="text-sm font-medium">坐标范围</legend>
          <p id="export-coordinate-help" className="text-xs text-muted-foreground">
            任务内经纬度，宽度和高度各不超过 100km。
          </p>
          <div className="grid grid-cols-2 gap-4">
            {coordinateFields.map(({ field, label: fieldLabel, axis }) => (
              <div key={field} className="min-w-0 space-y-2">
                <Label htmlFor={`export-${field}`}>{fieldLabel}</Label>
                <Input
                  id={`export-${field}`}
                  type="number"
                  step="any"
                  value={selection.coordinates[field]}
                  min={
                    axis === 'longitude' ? configuration.region.west : configuration.region.south
                  }
                  max={
                    axis === 'longitude' ? configuration.region.east : configuration.region.north
                  }
                  aria-describedby="export-coordinate-help"
                  aria-invalid={!!validation && /REGION|BBOX/.test(validation.code)}
                  onChange={(event) =>
                    setSelection((previous) => ({
                      ...previous,
                      coordinates: { ...previous.coordinates, [field]: event.target.value },
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </fieldset>
        <fieldset className="min-w-0 space-y-4" aria-describedby="export-time-help">
          <legend className="text-sm font-medium">时间范围 (UTC)</legend>
          <p id="export-time-help" className="text-xs leading-relaxed text-muted-foreground">
            输入按 UTC 解读，不按浏览器本地时区转换。半开范围 [开始, 结束)，不包含结束时刻；最大
            30×24 小时。
          </p>
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            {(['start', 'end'] as const).map((field) => (
              <div key={field} className="min-w-0 space-y-2">
                <Label htmlFor={`export-${field}-time`}>
                  {field === 'start' ? '开始时间 (UTC，包含)' : '结束时间 (UTC，不包含)'}
                </Label>
                <Input
                  id={`export-${field}-time`}
                  className="min-w-0"
                  type="datetime-local"
                  step={selection.temporalResolution === 'daily' ? 86400 : 3600}
                  value={selection[field]}
                  aria-describedby="export-time-help"
                  aria-invalid={!!validation && /TIME|DURATION/.test(validation.code)}
                  onChange={(event) =>
                    setSelection((previous) => ({ ...previous, [field]: event.target.value }))
                  }
                />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="export-temporal-resolution">时间粒度</Label>
            <select
              id="export-temporal-resolution"
              className="h-12 w-full min-w-0 rounded-sm border bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              value={selection.temporalResolution}
              aria-describedby="export-temporal-help"
              onChange={(event) => {
                const value = event.target.value
                if (value === 'hourly' || value === 'daily')
                  setSelection((previous) => ({ ...previous, temporalResolution: value }))
              }}
            >
              <option value="hourly">逐小时（默认）</option>
              <option value="daily" disabled={!supportsDaily}>
                逐日（仅气温和降水）
              </option>
            </select>
            <p id="export-temporal-help" className="text-xs leading-relaxed text-muted-foreground">
              每条记录代表一个位置和时段。逐小时支持所有变量；气温逐日为 UTC 日均值，降水逐日为 UTC
              整日累计。逐日须按 00:00 对齐；风和气压不支持逐日。
            </p>
          </div>
        </fieldset>
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium">数据类型</legend>
          {dataTypeOptions.map(({ value, label: dataLabel }) => (
            <div key={value} className="flex items-center gap-2">
              <Checkbox
                id={`export-${value}`}
                checked={selection.dataTypes.includes(value)}
                onCheckedChange={(checked) =>
                  setSelection((previous) => ({
                    ...previous,
                    dataTypes:
                      checked === true
                        ? [...previous.dataTypes.filter((type) => type !== value), value]
                        : previous.dataTypes.filter((type) => type !== value),
                  }))
                }
              />
              <Label htmlFor={`export-${value}`} className="cursor-pointer leading-relaxed">
                {dataLabel}
              </Label>
            </div>
          ))}
        </fieldset>
        <section className="space-y-4" aria-label="导出格式">
          <h3 className="text-sm font-medium">导出格式</h3>
          <RadioGroup
            aria-label="导出格式"
            value={selection.format}
            onValueChange={(value) => {
              if (value === 'csv' || value === 'geojson' || value === 'netcdf')
                setSelection((previous) => ({ ...previous, format: value }))
            }}
          >
            {formatOptions.map(({ value, label: formatLabel }) => (
              <div key={value} className="flex items-center gap-2">
                <RadioGroupItem value={value} id={`export-format-${value}`} />
                <Label
                  htmlFor={`export-format-${value}`}
                  className="cursor-pointer leading-relaxed"
                >
                  {formatLabel}
                </Label>
              </div>
            ))}
          </RadioGroup>
          <p className="text-xs leading-relaxed text-muted-foreground">
            GeoJSON 坐标按 [经度, 纬度] 排列；NetCDF
            保留独立原始网格、目标网格和实际台站。科学缺测保留标识，不以错误正文替代文件。
          </p>
        </section>
        <output className="block text-sm" aria-live="polite" aria-label="估算状态">
          {isEstimating
            ? '正在估算当前选择…'
            : estimationError
              ? `${estimationCode}：${estimationError}`
              : estimation
                ? '当前选择估算已更新。'
                : '等待当前选择估算。'}
        </output>
        {estimation && (
          <section className="space-y-3 rounded-md border p-4" aria-label="数据量估算">
            <h3 className="text-sm font-medium">数据量估算</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <dt>数据记录数（精确）：</dt>
                <dd className="font-mono">{estimation.recordCount.toLocaleString()} 条</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt>文件大小（约）：</dt>
                <dd className="font-mono">
                  {formatFileSize(estimation.approximateSize)}（
                  {estimation.approximateSize.toLocaleString()} B）
                </dd>
              </div>
            </dl>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {estimation.counts.map((count) => (
                <li key={count.dataType}>
                  {dataTypeOptions.find((option) => option.value === count.dataType)?.label}：
                  {count.pointCount.toLocaleString()} 个位置，{count.recordCount.toLocaleString()}{' '}
                  条记录
                </li>
              ))}
            </ul>
            <p className="text-xs leading-relaxed text-muted-foreground">
              文件大小为约数。{estimation.sizeRule}
            </p>
            {estimation.notes.map((note, index) => (
              <p key={index} className="text-xs leading-relaxed">
                {note}
              </p>
            ))}
          </section>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          导出限制：宽度和高度各不超过 100km，持续时间不超过 30 天（30×24
          小时）。最终容量、权限和科学数据由服务器校验。
        </p>
        <output className="block space-y-2 text-sm" aria-live="polite" aria-label="导出阶段">
          {message ||
            `当前选择：${label} · ${selection.temporalResolution === 'hourly' ? '逐小时' : '逐日'}。尚未生成文件。`}
          {state === 'download-initiated' && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              是否保存由浏览器决定；此状态不代表已保存，也不会撤回已交给浏览器的文件。
            </p>
          )}
        </output>
        {notes.map((note, index) => (
          <p key={index} className="text-xs">
            {note}
          </p>
        ))}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription className="break-words">
              {code}：{error} 重试将使用当前显示的选择。
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          {state !== 'failed' && !isExporting && (
            <Button
              type="button"
              onClick={startExport}
              disabled={!canDownload}
              className="min-w-0 flex-1"
              aria-label={`下载 ${label} 文件`}
            >
              <Download className="mr-2 size-4" aria-hidden="true" />
              下载 {label}
            </Button>
          )}
          {isExporting && (
            <Button
              type="button"
              onClick={cancel}
              variant="outline"
              className="flex-1"
              aria-label="取消导出"
            >
              <X className="mr-2 size-4" aria-hidden="true" />
              取消导出
            </Button>
          )}
          {state === 'failed' && (
            <Button
              type="button"
              onClick={retry}
              disabled={!canDownload}
              variant="outline"
              className="flex-1"
              aria-label="重试导出"
            >
              <RotateCcw className="mr-2 size-4" aria-hidden="true" />
              按当前选择重试
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

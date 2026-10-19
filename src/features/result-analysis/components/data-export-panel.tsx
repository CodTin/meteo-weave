import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Download, AlertCircle, X, RotateCcw } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import type { DownscalingTask } from '@/features/downscaling-tasks/service/contracts'
import { useCsvExport } from '@/features/result-analysis/hooks/use-csv-export'

interface DataExportPanelProps {
  task: DownscalingTask
}

export function DataExportPanel({ task }: DataExportPanelProps) {
  const { configuration } = task

  // Initialize with task bounds
  const [bbox, setBbox] = useState({
    west: configuration.region.west,
    east: configuration.region.east,
    south: configuration.region.south,
    north: configuration.region.north,
  })

  const [timeRange, setTimeRange] = useState({
    start: configuration.timeRange.start,
    end: configuration.timeRange.end,
  })

  const [includeDownscaled, setIncludeDownscaled] = useState(true)
  const [includeOriginal, setIncludeOriginal] = useState(false)

  // Build data types array
  const dataTypes = useMemo(() => {
    const types = []
    if (includeDownscaled) types.push('downscaled')
    if (includeOriginal) types.push('original')
    return types
  }, [includeDownscaled, includeOriginal])

  // Use export hook
  const exportHook = useCsvExport({
    taskId: task.id,
    bbox,
    timeRange,
    dataTypes,
  })

  const { state, progress, error, startExport, cancel, retry, downloadUrl, filename } = exportHook

  // Trigger download when URL becomes available
  useEffect(() => {
    if (downloadUrl && filename && state === 'complete') {
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      link.click()
    }
  }, [downloadUrl, filename, state])

  const handleDownload = () => {
    if (dataTypes.length === 0) {
      return
    }
    startExport()
  }

  const isExporting = state === 'validating' || state === 'generating'
  const canDownload = dataTypes.length > 0 && (state === 'idle' || state === 'failed')
  const canCancel = isExporting
  const canRetry = state === 'failed'

  return (
    <Card>
      <CardHeader>
        <CardTitle>数据导出</CardTitle>
        <CardDescription>选择坐标范围、时间段和数据类型，导出 CSV 格式的降尺度结果</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Coordinate Selection */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">坐标范围</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="west">西经 (°E)</Label>
              <Input
                id="west"
                type="number"
                step="0.01"
                value={bbox.west}
                onChange={(e) => setBbox({ ...bbox, west: parseFloat(e.target.value) })}
                min={configuration.region.west}
                max={configuration.region.east}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="east">东经 (°E)</Label>
              <Input
                id="east"
                type="number"
                step="0.01"
                value={bbox.east}
                onChange={(e) => setBbox({ ...bbox, east: parseFloat(e.target.value) })}
                min={configuration.region.west}
                max={configuration.region.east}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="south">南纬 (°N)</Label>
              <Input
                id="south"
                type="number"
                step="0.01"
                value={bbox.south}
                onChange={(e) => setBbox({ ...bbox, south: parseFloat(e.target.value) })}
                min={configuration.region.south}
                max={configuration.region.north}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="north">北纬 (°N)</Label>
              <Input
                id="north"
                type="number"
                step="0.01"
                value={bbox.north}
                onChange={(e) => setBbox({ ...bbox, north: parseFloat(e.target.value) })}
                min={configuration.region.south}
                max={configuration.region.north}
              />
            </div>
          </div>
        </div>

        {/* Time Range Selection */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">时间范围 (UTC)</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start-time">开始时间</Label>
              <Input
                id="start-time"
                type="datetime-local"
                value={timeRange.start.slice(0, 16)}
                onChange={(e) => setTimeRange({ ...timeRange, start: e.target.value + ':00Z' })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-time">结束时间</Label>
              <Input
                id="end-time"
                type="datetime-local"
                value={timeRange.end.slice(0, 16)}
                onChange={(e) => setTimeRange({ ...timeRange, end: e.target.value + ':00Z' })}
              />
            </div>
          </div>
        </div>

        {/* Data Type Selection */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">数据类型</h3>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="downscaled"
                checked={includeDownscaled}
                onCheckedChange={(checked) => setIncludeDownscaled(!!checked)}
              />
              <Label htmlFor="downscaled" className="cursor-pointer">
                降尺度数据
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="original"
                checked={includeOriginal}
                onCheckedChange={(checked) => setIncludeOriginal(!!checked)}
              />
              <Label htmlFor="original" className="cursor-pointer">
                原始数据
              </Label>
            </div>
          </div>
        </div>

        {/* Validation Info */}
        <Alert>
          <AlertCircle className="size-4" />
          <AlertDescription className="text-xs">
            导出限制：区域宽度和高度各不超过 100km，时间跨度不超过 30 天
          </AlertDescription>
        </Alert>

        {/* Progress Display */}
        {progress && (
          <output className="space-y-2" aria-live="polite">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{progress.message}</span>
              {progress.percent !== undefined && (
                <span className="text-muted-foreground">{progress.percent}%</span>
              )}
            </div>
            {progress.percent !== undefined && (
              <Progress value={progress.percent} className="h-2" aria-label="导出进度" />
            )}
          </output>
        )}

        {/* Success Message */}
        {state === 'complete' && !error && (
          <Alert>
            <AlertCircle className="size-4" />
            <AlertDescription>导出完成，文件已开始下载</AlertDescription>
          </Alert>
        )}

        {/* Cancelled Message */}
        {state === 'cancelled' && (
          <Alert>
            <AlertCircle className="size-4" />
            <AlertDescription>导出已取消</AlertDescription>
          </Alert>
        )}

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          {canDownload && (
            <Button
              onClick={handleDownload}
              disabled={dataTypes.length === 0}
              className="flex-1"
              aria-label="下载 CSV 文件"
            >
              <Download className="mr-2 size-4" aria-hidden="true" />
              下载 CSV
            </Button>
          )}

          {canCancel && (
            <Button onClick={cancel} variant="outline" className="flex-1" aria-label="取消导出">
              <X className="mr-2 size-4" aria-hidden="true" />
              取消
            </Button>
          )}

          {canRetry && (
            <Button onClick={retry} variant="outline" className="flex-1" aria-label="重试导出">
              <RotateCcw className="mr-2 size-4" aria-hidden="true" />
              重试
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

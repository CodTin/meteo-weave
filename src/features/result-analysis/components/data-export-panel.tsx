import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Download, AlertCircle, X, RotateCcw } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import type { DownscalingTask } from '@/features/downscaling-tasks/service/contracts'
import { ExportRegionMap } from './export-region-map'
import { useCsvExport } from '@/features/result-analysis/hooks/use-csv-export'
import { useExportEstimation } from '@/features/result-analysis/hooks/use-export-estimation'
import type { BBox } from '@/features/result-analysis/types/export'

interface DataExportPanelProps {
  task: DownscalingTask
}

/**
 * Format file size in human-readable format.
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }
}

export function DataExportPanel({ task }: DataExportPanelProps) {
  const { configuration } = task

  // Initialize with task bounds
  const [bbox, setBbox] = useState<BBox>({
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
  const [includeObservation, setIncludeObservation] = useState(false)
  const [format, setFormat] = useState<'csv' | 'geojson'>('csv')

  // Get Mapbox token from environment
  const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined

  const handleBboxChange = (field: keyof BBox, value: number) => {
    setBbox((prev) => ({ ...prev, [field]: value }))
  }

  const handleMapBoundsChange = (newBounds: BBox) => {
    setBbox(newBounds)
  }

  // Build data types array
  const dataTypes = useMemo(() => {
    const types = []
    if (includeDownscaled) types.push('downscaled')
    if (includeOriginal) types.push('original')
    if (includeObservation) types.push('observation')
    return types
  }, [includeDownscaled, includeOriginal, includeObservation])

  // Use export hook
  const exportHook = useCsvExport({
    taskId: task.id,
    bbox,
    timeRange,
    dataTypes,
    format,
  })

  const { state, progress, error, startExport, cancel, retry, downloadUrl, filename } = exportHook

  // Use estimation hook
  const { estimation } = useExportEstimation({
    taskId: task.id,
    bbox,
    timeRange,
    dataTypes,
    format,
    variable: configuration.variable,
  })

  // Trigger download when URL is ready
  useEffect(() => {
    if (downloadUrl && filename) {
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }, [downloadUrl, filename])

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
        {/* Map Component */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium">区域选择</h3>
          <p className="text-xs text-muted-foreground">
            在地图上绘制矩形或通过下方坐标输入精确选择导出区域
          </p>
          <ExportRegionMap
            taskBounds={configuration.region}
            exportBounds={bbox}
            onBoundsChange={handleMapBoundsChange}
            mapboxToken={mapboxToken}
          />
        </div>

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
                onChange={(e) => handleBboxChange('west', parseFloat(e.target.value))}
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
                onChange={(e) => handleBboxChange('east', parseFloat(e.target.value))}
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
                onChange={(e) => handleBboxChange('south', parseFloat(e.target.value))}
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
                onChange={(e) => handleBboxChange('north', parseFloat(e.target.value))}
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
                id="original"
                checked={includeOriginal}
                onCheckedChange={(checked) => setIncludeOriginal(!!checked)}
              />
              <Label htmlFor="original" className="cursor-pointer">
                原始数据（粗网格）
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="downscaled"
                checked={includeDownscaled}
                onCheckedChange={(checked) => setIncludeDownscaled(!!checked)}
              />
              <Label htmlFor="downscaled" className="cursor-pointer">
                降尺度数据（目标网格）
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="observation"
                checked={includeObservation}
                onCheckedChange={(checked) => setIncludeObservation(!!checked)}
              />
              <Label htmlFor="observation" className="cursor-pointer">
                观测数据（台站）
              </Label>
            </div>
          </div>
        </div>

        {/* Format Selection */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">导出格式</h3>
          <RadioGroup
            value={format}
            onValueChange={(value) => setFormat(value as 'csv' | 'geojson')}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="csv" id="format-csv" />
              <Label htmlFor="format-csv" className="cursor-pointer">
                CSV（表格数据）
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="geojson" id="format-geojson" />
              <Label htmlFor="format-geojson" className="cursor-pointer">
                GeoJSON（地理要素集合）
              </Label>
            </div>
          </RadioGroup>
          <p className="text-xs text-muted-foreground">
            GeoJSON 格式包含 Point 几何，坐标严格按 [经度, 纬度] 顺序，适合 GIS 工具导入
          </p>
        </div>

        {/* Estimation Display */}
        {estimation && dataTypes.length > 0 && (
          <div className="space-y-2 rounded-md border p-4">
            <h3 className="text-sm font-medium">数据量估算</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">数据记录数：</span>
                <span className="font-mono">{estimation.recordCount.toLocaleString()} 条</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">文件大小（约）：</span>
                <span className="font-mono">{formatFileSize(estimation.approximateSize)}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              记录数为精确计算；文件大小为近似值，实际大小可能略有差异
            </p>
          </div>
        )}

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
              aria-label={`下载 ${format === 'csv' ? 'CSV' : 'GeoJSON'} 文件`}
            >
              <Download className="mr-2 size-4" aria-hidden="true" />
              下载 {format === 'csv' ? 'CSV' : 'GeoJSON'}
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

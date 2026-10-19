import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, AlertCircle } from 'lucide-react'
import type { DownscalingTask } from '@/features/downscaling-tasks/service/contracts'
import { exportNetCDF } from '@/server/functions/export-netcdf'

interface DataExportPanelProps {
  task: DownscalingTask
}

export function DataExportPanel({ task }: DataExportPanelProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSupported =
    task.configuration.variable === 'temperature' &&
    task.configuration.resolvedMethod === 'deterministic'

  const handleExport = async () => {
    setIsExporting(true)
    setError(null)

    try {
      const response = await exportNetCDF({
        data: {
          taskId: task.id,
          layers: ['downscaled'],
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMsg = 'Export failed'
        try {
          const errorData = JSON.parse(errorText)
          errorMsg = errorData.error || errorMsg
        } catch {
          // Use default error message
        }
        throw new Error(errorMsg)
      }

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition')
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/)
      const filename = filenameMatch?.[1] || `task-${task.id}-temperature-downscaled.nc`

      // Download the file
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>数据导出</CardTitle>
        <CardDescription>导出降尺度结果为 NetCDF 格式</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h3 className="mb-2 text-sm font-medium">格式选项</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="font-medium">NetCDF Classic (CDF-1)</div>
                <div className="text-sm text-muted-foreground">
                  标准气象数据格式，包含坐标、时间和完整元数据
                </div>
              </div>
              {isSupported ? (
                <Button onClick={handleExport} disabled={isExporting}>
                  <Download className="mr-2 size-4" />
                  {isExporting ? '导出中...' : '导出'}
                </Button>
              ) : (
                <div className="flex items-center text-sm text-muted-foreground">
                  <AlertCircle className="mr-2 size-4" />
                  不支持
                </div>
              )}
            </div>

            {!isSupported && (
              <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                当前仅支持温度变量的确定性降尺度结果导出。其他变量和概率式结果将在后续版本提供。
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <div>
                <div className="font-medium">导出失败</div>
                <div>{error}</div>
              </div>
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          <p>
            导出的 NetCDF 文件包含：时间坐标（UTC，自 1970-01-01
            以来的秒数）、经纬度坐标（度）、温度数据（摄氏度）及完整的任务元数据。
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

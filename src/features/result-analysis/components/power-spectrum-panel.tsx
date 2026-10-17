import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { InfoIcon, AlertCircleIcon } from 'lucide-react'
import { usePowerSpectrumData } from '../hooks/use-power-spectrum-data'

type PowerSpectrumPanelProps = {
  taskId: string
  variable: string
  region: {
    west: number
    east: number
    south: number
    north: number
  }
  timeSlice: string
  requestId?: string
}

export function PowerSpectrumPanel({
  taskId,
  variable,
  region,
  timeSlice,
  requestId,
}: PowerSpectrumPanelProps) {
  const { data, loading, error } = usePowerSpectrumData({
    taskId,
    variable,
    timeSlice,
    region,
    requestId,
  })

  return (
    <div className="space-y-6">
      {/* Power Spectrum Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>二维功率谱对比</CardTitle>
          <CardDescription>原始与降尺度场的径向平均功率谱</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && <p className="text-sm text-muted-foreground">加载中...</p>}

          {error && (
            <Alert variant="destructive">
              <AlertCircleIcon className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {data && !data.original.available && (
            <Alert>
              <InfoIcon className="size-4" />
              <AlertDescription>
                原始场功率谱不可用：
                {!data.original.available && data.original.reason}
              </AlertDescription>
            </Alert>
          )}

          {data && !data.downscaled.available && (
            <Alert>
              <InfoIcon className="size-4" />
              <AlertDescription>
                降尺度场功率谱不可用：
                {!data.downscaled.available && data.downscaled.reason}
              </AlertDescription>
            </Alert>
          )}

          {data && data.original.available && data.downscaled.available && (
            <div className="space-y-4">
              {/* Chart Visualization */}
              <div className="rounded-lg border bg-card p-4">
                <PowerSpectrumChart
                  originalSpectrum={data.original}
                  downscaledSpectrum={data.downscaled}
                />
              </div>

              {/* Metadata Display */}
              <div className="rounded-lg bg-muted p-4 text-sm">
                <h4 className="mb-2 font-medium">方法说明</h4>
                <dl className="space-y-1 text-xs">
                  <div>
                    <dt className="inline font-medium">频率单位：</dt>
                    <dd className="inline">{data.original.metadata.unit}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">网格尺寸：</dt>
                    <dd className="inline">
                      {data.original.metadata.gridSize.rows} ×{' '}
                      {data.original.metadata.gridSize.cols}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">物理采样间距：</dt>
                    <dd className="inline">{data.original.metadata.cellSizeKm} km</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">窗函数：</dt>
                    <dd className="inline">
                      {data.original.metadata.window === 'hann'
                        ? '可分离 Hann 窗'
                        : data.original.metadata.window}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">归一化：</dt>
                    <dd className="inline">
                      {data.original.metadata.normalization === 'energy'
                        ? '能量归一化'
                        : data.original.metadata.normalization}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">去均值：</dt>
                    <dd className="inline">{data.original.metadata.detrended ? '是' : '否'}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">Nyquist 频率：</dt>
                    <dd className="inline">
                      {(1 / (2 * data.original.metadata.cellSizeKm)).toFixed(4)} cycles/km
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Upsampling Warning */}
              <Alert>
                <InfoIcon className="size-4" />
                <AlertDescription>
                  <strong>重要说明：</strong>
                  原始场的采样分辨率为 {data.original.metadata.cellSizeKm} km。
                  上采样不会产生真实的新增高频能力，高频部分的功率主要反映插值方法的特性，不应理解为原始分辨率的提升或预报精度的保证。
                </AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

type PowerSpectrumChartProps = {
  originalSpectrum: Extract<
    ReturnType<typeof import('../service/spatial-summary').calculatePowerSpectrum>,
    { available: true }
  >
  downscaledSpectrum: Extract<
    ReturnType<typeof import('../service/spatial-summary').calculatePowerSpectrum>,
    { available: true }
  >
}

function PowerSpectrumChart({ originalSpectrum, downscaledSpectrum }: PowerSpectrumChartProps) {
  const maxPower = Math.max(
    ...originalSpectrum.summary.meanPower,
    ...downscaledSpectrum.summary.meanPower,
  )

  // Simple SVG chart (in production, consider using a charting library)
  const width = 600
  const height = 400
  const padding = { top: 20, right: 20, bottom: 60, left: 80 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  // Scale functions
  const xScale = (freq: number) => {
    const maxFreq = Math.max(
      ...originalSpectrum.summary.frequencies,
      ...downscaledSpectrum.summary.frequencies,
    )
    return padding.left + (freq / maxFreq) * chartWidth
  }

  const yScale = (power: number) => {
    return padding.top + chartHeight - (power / maxPower) * chartHeight
  }

  // Create path data
  const createPath = (frequencies: number[], powers: number[]) => {
    if (frequencies.length === 0) return ''
    const points = frequencies.map((freq, i) => ({
      x: xScale(freq),
      y: yScale(powers[i] ?? 0),
    }))
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  }

  const originalPath = createPath(
    originalSpectrum.summary.frequencies,
    originalSpectrum.summary.meanPower,
  )
  const downscaledPath = createPath(
    downscaledSpectrum.summary.frequencies,
    downscaledSpectrum.summary.meanPower,
  )

  return (
    <div className="w-full overflow-x-auto">
      <svg width={width} height={height} className="mx-auto" aria-label="功率谱对比图表">
        {/* Chart background */}
        <rect
          x={padding.left}
          y={padding.top}
          width={chartWidth}
          height={chartHeight}
          fill="hsl(var(--muted))"
          stroke="hsl(var(--border))"
        />

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = padding.top + chartHeight * (1 - fraction)
          return (
            <line
              key={`grid-${fraction}`}
              x1={padding.left}
              y1={y}
              x2={padding.left + chartWidth}
              y2={y}
              stroke="hsl(var(--border))"
              strokeDasharray="2,2"
              opacity={0.5}
            />
          )
        })}

        {/* Original spectrum line */}
        <path
          d={originalPath}
          fill="none"
          stroke="hsl(var(--chart-1))"
          strokeWidth={2}
          data-testid="original-spectrum-line"
        />

        {/* Downscaled spectrum line */}
        <path
          d={downscaledPath}
          fill="none"
          stroke="hsl(var(--chart-2))"
          strokeWidth={2}
          data-testid="downscaled-spectrum-line"
        />

        {/* X-axis */}
        <line
          x1={padding.left}
          y1={padding.top + chartHeight}
          x2={padding.left + chartWidth}
          y2={padding.top + chartHeight}
          stroke="hsl(var(--foreground))"
        />

        {/* Y-axis */}
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={padding.top + chartHeight}
          stroke="hsl(var(--foreground))"
        />

        {/* X-axis label */}
        <text
          x={padding.left + chartWidth / 2}
          y={height - 10}
          textAnchor="middle"
          className="fill-foreground text-xs"
        >
          频率 (cycles/km)
        </text>

        {/* Y-axis label */}
        <text
          x={-padding.top - chartHeight / 2}
          y={20}
          textAnchor="middle"
          transform="rotate(-90)"
          className="fill-foreground text-xs"
        >
          功率（能量归一化）
        </text>

        {/* Legend */}
        <g transform={`translate(${padding.left + 20}, ${padding.top + 20})`}>
          <rect x={0} y={0} width={15} height={3} fill="hsl(var(--chart-1))" />
          <text x={20} y={5} className="fill-foreground text-xs">
            原始场
          </text>

          <rect x={0} y={15} width={15} height={3} fill="hsl(var(--chart-2))" />
          <text x={20} y={20} className="fill-foreground text-xs">
            降尺度场
          </text>
        </g>
      </svg>

      {/* Accessible data table */}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-muted-foreground">查看数值表格</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="p-2 text-left">频率 (cycles/km)</th>
                <th className="p-2 text-right">原始场功率</th>
                <th className="p-2 text-right">降尺度场功率</th>
              </tr>
            </thead>
            <tbody>
              {originalSpectrum.summary.frequencies.map((freq, idx) => (
                <tr key={idx} className="border-b">
                  <td className="p-2 font-mono">{freq.toFixed(4)}</td>
                  <td className="p-2 text-right font-mono">
                    {originalSpectrum.summary.meanPower[idx]?.toExponential(3)}
                  </td>
                  <td className="p-2 text-right font-mono">
                    {downscaledSpectrum.summary.meanPower[idx]?.toExponential(3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

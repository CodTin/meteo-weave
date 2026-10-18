import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useTimeSeriesData } from '../hooks/use-time-series-data'
import { validateCoordinate, isWithinRegion, type Coordinate } from '../service/time-series-data'
import {
  generateRepresentativePoints,
  type RepresentativePoint,
} from '../service/representative-points'
import { CoordinateSelectionMapClient } from './coordinate-selection-map-client'
import type { DownscalingTask } from '@/features/downscaling-tasks/service/contracts'
import { Loader2, MapPin, Mountain, Home, Wheat } from 'lucide-react'
import { LocalChangesBarChart } from '@/components/charts/local-changes-bar-chart'
import { ErrorBarChart } from '@/components/charts/error-bar-chart'
import { alignBarChartData } from '../service/bar-chart-data'
import { formatTimeSeriesTime } from '../service/time-series-formatting'

interface TimeSeriesPanelProps {
  task: DownscalingTask
}

export function TimeSeriesPanel({ task }: TimeSeriesPanelProps) {
  const [latitudeInput, setLatitudeInput] = useState('')
  const [longitudeInput, setLongitudeInput] = useState('')
  const [selectedCoordinate, setSelectedCoordinate] = useState<Coordinate | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Generate representative points when task changes
  const representativePoints = useMemo(
    () => generateRepresentativePoints(task.configuration.region, task.id),
    [task.id, task.configuration.region],
  )

  const { data, isLoading, error } = useTimeSeriesData({
    task,
    coordinate: selectedCoordinate,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError(null)

    // Parse inputs
    const lat = parseFloat(latitudeInput)
    const lon = parseFloat(longitudeInput)

    // Validate coordinate
    const validation = validateCoordinate({ latitude: lat, longitude: lon })
    if (!validation.valid) {
      setValidationError(validation.error!)
      return
    }

    // Check if within task region
    if (!isWithinRegion(validation.coordinate!, task.configuration.region)) {
      setValidationError('坐标超出任务范围')
      return
    }

    // Set coordinate for fetching
    setSelectedCoordinate(validation.coordinate!)
  }

  const handleRepresentativePointClick = (point: RepresentativePoint) => {
    setValidationError(null)
    setLatitudeInput(point.coordinate.latitude.toString())
    setLongitudeInput(point.coordinate.longitude.toString())
    setSelectedCoordinate(point.coordinate)
  }

  const handleMapCoordinateSelect = (coordinate: Coordinate) => {
    setValidationError(null)
    setLatitudeInput(coordinate.latitude.toFixed(4))
    setLongitudeInput(coordinate.longitude.toFixed(4))
    setSelectedCoordinate(coordinate)
  }

  const handleMapOutOfBounds = () => {
    setValidationError('点击位置超出任务范围，请在任务边界内选择')
  }

  // Prepare chart data
  const chartData = data
    ? data.original.map((originalPoint, index) => {
        const formattedTime = formatTimeSeriesTime(originalPoint.time, data.granularity)
        const baseData = {
          time: formattedTime,
          original: originalPoint.value,
          downscaled: data.downscaled[index]?.value ?? null,
          observation: data.observation?.[index]?.value ?? null,
        }

        // Add ensemble quantile data if available
        if (data.ensemble) {
          const quantilePoint = data.ensemble.quantiles[index]
          return {
            ...baseData,
            p10: quantilePoint?.p10 ?? null,
            p50: quantilePoint?.p50 ?? null,
            p90: quantilePoint?.p90 ?? null,
            validCount: quantilePoint?.validCount ?? 0,
          }
        }

        return baseData
      })
    : []

  const getTerrainIcon = (terrainType: string) => {
    switch (terrainType) {
      case 'city':
        return <Home className="size-4" />
      case 'mountain':
        return <Mountain className="size-4" />
      case 'plain':
        return <Wheat className="size-4" />
      default:
        return <MapPin className="size-4" />
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>坐标选点</CardTitle>
          <CardDescription>输入经纬度、选择代表点位，或在地图上点击选取分析位置</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="latitude">纬度 (°N)</Label>
                <Input
                  id="latitude"
                  type="number"
                  step="any"
                  placeholder="例如: 35.5"
                  value={latitudeInput}
                  onChange={(e) => setLatitudeInput(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="longitude">经度 (°E)</Label>
                <Input
                  id="longitude"
                  type="number"
                  step="any"
                  placeholder="例如: 120.5"
                  value={longitudeInput}
                  onChange={(e) => setLongitudeInput(e.target.value)}
                  required
                />
              </div>
            </div>

            {validationError && (
              <Alert variant="destructive">
                <AlertDescription>{validationError}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Button type="submit">查询时间序列</Button>
              {selectedCoordinate && (
                <div className="text-sm text-muted-foreground">
                  当前坐标: {selectedCoordinate.latitude.toFixed(4)}°N,{' '}
                  {selectedCoordinate.longitude.toFixed(4)}°E
                </div>
              )}
            </div>
          </form>

          {/* Representative terrain points */}
          <div className="mt-6 space-y-3">
            <Label className="text-sm font-medium">典型地形快捷点位</Label>
            <div className="flex flex-wrap gap-2">
              {representativePoints.map((point) => (
                <Button
                  key={point.terrainType}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleRepresentativePointClick(point)}
                  className="flex items-center gap-2"
                >
                  {getTerrainIcon(point.terrainType)}
                  <span>{point.label}</span>
                  <span className="text-xs text-muted-foreground">
                    ({point.coordinate.latitude.toFixed(2)}°N,{' '}
                    {point.coordinate.longitude.toFixed(2)}°E)
                  </span>
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              快捷点位基于当前任务区域生成，不代表真实城市或观测站点
            </p>
          </div>

          <div className="mt-4 text-sm text-muted-foreground">
            <p>
              任务范围: {task.configuration.region.south}°N ~ {task.configuration.region.north}°N,{' '}
              {task.configuration.region.west}°E ~ {task.configuration.region.east}°E
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Map selection */}
      <Card>
        <CardHeader>
          <CardTitle>地图选点</CardTitle>
          <CardDescription>点击地图任务范围内的任意位置选择分析坐标</CardDescription>
        </CardHeader>
        <CardContent>
          <CoordinateSelectionMapClient
            region={task.configuration.region}
            selectedCoordinate={selectedCoordinate}
            onCoordinateSelect={handleMapCoordinateSelect}
            onOutOfBounds={handleMapOutOfBounds}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            点击地图内任意位置选择坐标。红色标记显示当前选中的点位。
          </p>
        </CardContent>
      </Card>

      {isLoading && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">加载时间序列数据...</span>
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error instanceof Error ? error.message : '加载失败，请重试'}
          </AlertDescription>
        </Alert>
      )}

      {data && !isLoading && (
        <Card>
          <CardHeader>
            <CardTitle>时间序列对比</CardTitle>
            <CardDescription>
              {data.coordinate.latitude.toFixed(4)}°N, {data.coordinate.longitude.toFixed(4)}°E ·{' '}
              {data.timezone} · {data.unit} · {getSemanticsLabel(data.semantics)} ·{' '}
              {data.granularity === 'daily' ? '按日' : '按小时'}
              {data.ensemble && <> · 概率式集合 (K={data.ensemble.totalMembers})</>}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="time"
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis label={{ value: data.unit, angle: -90, position: 'insideLeft' }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))' }}
                    formatter={(value, name) => {
                      if (value !== null && typeof value === 'number') {
                        return [value.toFixed(2), getTooltipLabel(name as string)]
                      }
                      return ['无数据', getTooltipLabel(name as string)]
                    }}
                    labelFormatter={(label) => `时间: ${label}`}
                  />
                  <Legend formatter={(value) => getLegendLabel(value)} />

                  {/* P10-P90 quantile band (80% ensemble quantile interval) */}
                  {data.ensemble && (
                    <Area
                      type="monotone"
                      dataKey="p90"
                      stroke="none"
                      fill="hsl(var(--destructive))"
                      fillOpacity={0.15}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  )}
                  {data.ensemble && (
                    <Area
                      type="monotone"
                      dataKey="p10"
                      stroke="none"
                      fill="hsl(var(--card))"
                      fillOpacity={1}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  )}

                  <Line
                    type="monotone"
                    dataKey="original"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    name="原始数据"
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="downscaled"
                    stroke="hsl(var(--destructive))"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    name="降尺度数据"
                    dot={false}
                    connectNulls
                  />

                  {/* P50 (median) line for ensemble */}
                  {data.ensemble && (
                    <Line
                      type="monotone"
                      dataKey="p50"
                      stroke="hsl(var(--destructive))"
                      strokeWidth={2}
                      name="P50 (中位数)"
                      dot={false}
                      connectNulls={false}
                    />
                  )}

                  {data.observation && (
                    <Line
                      type="monotone"
                      dataKey="observation"
                      stroke="hsl(142 76% 36%)"
                      strokeWidth={2}
                      strokeDasharray="3 3"
                      name="观测参考"
                      dot={false}
                      connectNulls={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {data.ensemble && (
              <div className="mt-4 rounded border border-amber-500 bg-amber-50 p-3 dark:bg-amber-950/20">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                  80% 集合分位区间 (P10–P90)
                </p>
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                  阴影区间显示第10至第90百分位数，覆盖80%的集合成员。P50为中位数。此区间基于保存的集合样本计算，不代表已校准的置信区间或正式风险发生率。(Synthetic
                  Demo)
                </p>
              </div>
            )}

            <div className="mt-4 text-sm text-muted-foreground">
              <p>
                时间范围: {formatTimeSeriesTime(data.timeRange.start, data.granularity)} ~{' '}
                {formatTimeSeriesTime(data.timeRange.end, data.granularity)}
              </p>
              <p className="mt-1">
                数据点数: 原始 {data.original.length} 点，降尺度 {data.downscaled.length} 点
                {data.observation && `，观测 ${data.observation.length} 点`}
              </p>
              {data.stationInfo && (
                <div className="mt-3 rounded border border-muted bg-muted/50 p-3">
                  <p className="font-medium">观测参考信息 (Synthetic Demo / 邻站参考)</p>
                  <p className="mt-1">
                    台站: {data.stationInfo.name} ({data.stationInfo.stationId})
                  </p>
                  <p className="mt-1">
                    坐标: {data.stationInfo.coordinate.latitude.toFixed(4)}°N,{' '}
                    {data.stationInfo.coordinate.longitude.toFixed(4)}°E
                  </p>
                  <p className="mt-1">距离: {data.stationInfo.distance.toFixed(2)} km</p>
                  <p className="mt-2 text-xs italic">
                    注:
                    观测数据来自邻近合成台站，不代表所选坐标的实际观测或真实预报验证。仅供演示参考。
                  </p>
                </div>
              )}
              {!data.stationInfo && !data.observation && (
                <div className="mt-3 rounded border border-muted bg-muted/50 p-3">
                  <p className="font-medium">观测数据不可用</p>
                  <p className="mt-1 text-xs">
                    所选坐标 25km 范围内无可用台站。原始和降尺度数据仍可正常查看。
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {data && !isLoading && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>局地变化：降尺度相对原始</CardTitle>
              <CardDescription>
                降尺度−原始数据的差值 · {data.unit} · 正值表示降尺度高于原始，负值表示降尺度低于原始
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LocalChangesBarChart
                data={alignBarChartData(data.original, data.downscaled, data.observation).map(
                  (point) => ({
                    time: point.time,
                    change: point.change,
                  }),
                )}
                unit={data.unit}
                granularity={data.granularity}
              />
              <div className="mt-4 text-sm text-muted-foreground">
                <p>
                  柱状图显示降尺度数据相对原始数据的局地变化。零线表示无变化，正值表示降尺度增强，负值表示降尺度减弱。
                </p>
                {alignBarChartData(data.original, data.downscaled, data.observation).some(
                  (point) => point.change === null,
                ) && (
                  <p className="mt-2 text-amber-600 dark:text-amber-500">
                    部分时间点缺少原始或降尺度数据，对应柱图缺失。
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>降尺度相对观测的误差</CardTitle>
              <CardDescription>
                降尺度−观测数据的差值 · {data.unit} · 正值表示高估，负值表示低估
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ErrorBarChart
                data={alignBarChartData(data.original, data.downscaled, data.observation).map(
                  (point) => ({
                    time: point.time,
                    error: point.error,
                  }),
                )}
                unit={data.unit}
                granularity={data.granularity}
              />
              <div className="mt-4 text-sm text-muted-foreground">
                {data.observation && data.stationInfo ? (
                  <>
                    <p>
                      柱状图显示降尺度数据相对观测参考的误差。零线表示无误差，正值表示高估，负值表示低估。
                    </p>
                    {alignBarChartData(data.original, data.downscaled, data.observation).some(
                      (point) => point.error === null,
                    ) && (
                      <p className="mt-2 text-amber-600 dark:text-amber-500">
                        部分时间点缺少降尺度或观测数据，对应柱图缺失。
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    所选坐标 25km 范围内无可用观测参考，误差柱图无法显示。局地变化柱图仍可查看。
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function getSemanticsLabel(semantics: string): string {
  switch (semantics) {
    case 'instantaneous':
      return '瞬时值'
    case 'daily-mean':
      return '日均值'
    case 'daily-minimum':
      return '日最低值'
    default:
      return semantics
  }
}

function getLegendLabel(value: string): string {
  switch (value) {
    case 'original':
      return '原始数据'
    case 'downscaled':
      return '降尺度数据'
    case 'observation':
      return '观测参考'
    case 'p50':
      return 'P50 (中位数)'
    case 'p10':
      return 'P10–P90 区间'
    case 'p90':
      return 'P10–P90 区间'
    default:
      return value
  }
}

function getTooltipLabel(name: string): string {
  switch (name) {
    case 'original':
      return '原始'
    case 'downscaled':
      return '降尺度'
    case 'observation':
      return '观测'
    case 'p10':
      return 'P10'
    case 'p50':
      return 'P50'
    case 'p90':
      return 'P90'
    case 'validCount':
      return '有效成员数'
    default:
      return name
  }
}

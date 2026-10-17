import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  LineChart,
  Line,
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
    ? data.original.map((originalPoint, index) => ({
        time: formatTime(originalPoint.time, data.granularity),
        original: originalPoint.value,
        downscaled: data.downscaled[index]?.value ?? null,
      }))
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
                    formatter={(value) =>
                      value !== null && typeof value === 'number' ? value.toFixed(2) : '无数据'
                    }
                  />
                  <Legend />
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
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 text-sm text-muted-foreground">
              <p>
                时间范围: {formatTime(data.timeRange.start, data.granularity)} ~{' '}
                {formatTime(data.timeRange.end, data.granularity)}
              </p>
              <p className="mt-1">
                数据点数: 原始 {data.original.length} 点，降尺度 {data.downscaled.length} 点
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function formatTime(isoString: string, granularity: 'hourly' | 'daily'): string {
  const date = new Date(isoString)
  if (granularity === 'daily') {
    return date.toLocaleDateString('zh-CN', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }
  return date.toLocaleString('zh-CN', {
    timeZone: 'UTC',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
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

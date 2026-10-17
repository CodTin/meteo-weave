import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { InfoIcon } from 'lucide-react'
import type { Variable } from '../service/color-scales'
import {
  useErrorMapData,
  type ErrorMapMode,
  type PredictionType,
} from '../hooks/use-error-map-data'

type SpatialAnalysisPanelProps = {
  taskId: string
  variable: Variable
  region: {
    west: number
    east: number
    south: number
    north: number
  }
  timeSlice: string
  requestId?: string
}

export function SpatialAnalysisPanel({
  taskId,
  variable,
  region,
  timeSlice,
  requestId,
}: SpatialAnalysisPanelProps) {
  const { options, setOptions, errorMapResult, loading, error } = useErrorMapData({
    taskId,
    variable,
    timeSlice,
    region,
    requestId,
  })

  const handleModeChange = (mode: ErrorMapMode) => {
    setOptions((prev) => ({ ...prev, mode }))
  }

  const handlePredictionTypeChange = (predictionType: PredictionType) => {
    setOptions((prev) => ({ ...prev, predictionType }))
  }

  return (
    <div className="space-y-6">
      {/* Context Information */}
      <Card>
        <CardHeader>
          <CardTitle>分析上下文</CardTitle>
          <CardDescription>当前任务的空间分析范围与时间设置</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">任务 ID</dt>
              <dd className="font-mono text-xs">{taskId}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">分析时刻</dt>
              <dd className="font-medium">{new Date(timeSlice).toLocaleString('zh-CN')}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">空间范围</dt>
              <dd className="font-mono text-xs">
                {region.south.toFixed(2)}°N - {region.north.toFixed(2)}°N, {region.west.toFixed(2)}
                °E - {region.east.toFixed(2)}°E
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">变量</dt>
              <dd className="font-medium">{getVariableLabel(variable)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Error Map Controls */}
      <Card>
        <CardHeader>
          <CardTitle>误差地图设置</CardTitle>
          <CardDescription>选择误差类型和预测数据源</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Error Mode Selection */}
          <div className="space-y-3">
            <Label>误差类型</Label>
            <RadioGroup
              value={options.mode}
              onValueChange={(value) => handleModeChange(value as ErrorMapMode)}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="signed" id="mode-signed" />
                <Label htmlFor="mode-signed" className="font-normal">
                  带符号误差（预测 - 参考）
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="absolute" id="mode-absolute" />
                <Label htmlFor="mode-absolute" className="font-normal">
                  绝对误差（|预测 - 参考|）
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="improvement" id="mode-improvement" />
                <Label htmlFor="mode-improvement" className="font-normal">
                  改善图（原始误差 - 降尺度误差）
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Prediction Type Selection (disabled for improvement mode) */}
          {options.mode !== 'improvement' && (
            <div className="space-y-3">
              <Label>预测数据源</Label>
              <RadioGroup
                value={options.predictionType}
                onValueChange={(value) => handlePredictionTypeChange(value as PredictionType)}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="original" id="pred-original" />
                  <Label htmlFor="pred-original" className="font-normal">
                    原始数据
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="downscaled" id="pred-downscaled" />
                  <Label htmlFor="pred-downscaled" className="font-normal">
                    降尺度数据
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error Map Visualization */}
      <Card>
        <CardHeader>
          <CardTitle>误差地图</CardTitle>
          <CardDescription>
            {options.mode === 'improvement'
              ? '改善区域（正值）与退化区域（负值）分布'
              : options.mode === 'signed'
                ? '带符号误差分布：正值表示过高预测，负值表示过低预测'
                : '绝对误差分布：显示预测与参考的差异幅度'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && <p className="text-sm text-muted-foreground">加载中...</p>}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {errorMapResult && !errorMapResult.available && (
            <Alert>
              <InfoIcon className="size-4" />
              <AlertDescription>{errorMapResult.reason}</AlertDescription>
            </Alert>
          )}

          {errorMapResult && errorMapResult.available && (
            <div className="space-y-4">
              {/* Map Placeholder */}
              <div className="rounded-lg border bg-muted p-8 text-center">
                <p className="text-sm text-muted-foreground">地图可视化区域（待集成地图组件）</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  数据已就绪：{errorMapResult.result.validPoints} 个有效点
                </p>
              </div>

              {/* Statistics Summary */}
              <div className="rounded-lg border bg-card p-4">
                <h4 className="mb-3 text-sm font-medium">统计摘要</h4>
                <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                  <div>
                    <dt className="text-muted-foreground">最小值</dt>
                    <dd className="font-mono">
                      {errorMapResult.result.minError.toFixed(2)}{' '}
                      {errorMapResult.result.metadata.unit}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">最大值</dt>
                    <dd className="font-mono">
                      {errorMapResult.result.maxError.toFixed(2)}{' '}
                      {errorMapResult.result.metadata.unit}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">平均值</dt>
                    <dd className="font-mono">
                      {errorMapResult.result.meanError.toFixed(2)}{' '}
                      {errorMapResult.result.metadata.unit}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">有效点数</dt>
                    <dd className="font-mono">
                      {errorMapResult.result.validPoints} / {errorMapResult.result.totalPoints}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Metadata */}
              <div className="rounded-lg bg-muted p-4 text-sm">
                <h4 className="mb-2 font-medium">方法说明</h4>
                <dl className="space-y-1 text-xs">
                  <div>
                    <dt className="inline font-medium">误差定义：</dt>
                    <dd className="inline">{errorMapResult.result.metadata.description}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">采样方法：</dt>
                    <dd className="inline">{errorMapResult.result.metadata.samplingMethod}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">单位：</dt>
                    <dd className="inline">{errorMapResult.result.metadata.unit}</dd>
                  </div>
                </dl>
              </div>

              {/* Reference Source Warning (when applicable) */}
              <Alert>
                <InfoIcon className="size-4" />
                <AlertDescription>
                  <strong>插值参考说明：</strong>
                  若参考数据来自台站插值，仅作空间展示用途。网格误差与台站精度可能因取样口径不同而不同，不将插值点数计入独立台站样本数。
                </AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function getVariableLabel(variable: Variable): string {
  switch (variable) {
    case 'temperature':
      return '气温 (T2M)'
    case 'pressure':
      return '海平面气压 (MSL)'
    case 'precipitation':
      return '总降水 (TP)'
    case 'wind':
      return '风速风向 (U10/V10)'
    default:
      return variable
  }
}

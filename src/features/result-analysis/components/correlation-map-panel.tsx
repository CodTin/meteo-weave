import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { InfoIcon } from 'lucide-react'
import type { Variable } from '../service/color-scales'
import { useCorrelationMapData, type PredictionType } from '../hooks/use-correlation-map-data'
import {
  AnalysisContextWrapper,
  MapPlaceholder,
  InterpolationWarning,
  getVariableLabel,
} from './analysis-context-shared'

type CorrelationMapPanelProps = {
  taskId: string
  variable: Variable
  region: {
    west: number
    east: number
    south: number
    north: number
  }
  timeWindow: {
    start: string
    end: string
  }
  requestId?: string
}

export function CorrelationMapPanel({
  taskId,
  variable,
  region,
  timeWindow,
  requestId,
}: CorrelationMapPanelProps) {
  const { options, setOptions, correlationMapResult, loading, error } = useCorrelationMapData({
    taskId,
    variable,
    timeWindow,
    region,
    requestId,
  })

  const handlePredictionTypeChange = (predictionType: PredictionType) => {
    setOptions((prev) => ({ ...prev, predictionType }))
  }

  return (
    <div className="space-y-6">
      {/* Context Information */}
      <AnalysisContextWrapper
        title="分析上下文"
        description="当前任务的空间分析范围与时间窗口设置"
        taskId={taskId}
        timeInfo={{
          label: '时间窗口',
          value: `${new Date(timeWindow.start).toLocaleDateString('zh-CN')} - ${new Date(timeWindow.end).toLocaleDateString('zh-CN')}`,
        }}
        region={region}
        variable={getVariableLabel(variable)}
      />

      {/* Correlation Map Controls */}
      <Card>
        <CardHeader>
          <CardTitle>相关性地图设置</CardTitle>
          <CardDescription>选择预测数据源以查看时间相关性分布</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Prediction Type Selection */}
          <div className="space-y-3">
            <Label>预测数据源</Label>
            <RadioGroup
              value={options.predictionType}
              onValueChange={(value) => handlePredictionTypeChange(value as PredictionType)}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="original" id="pred-original" />
                <Label htmlFor="pred-original" className="font-normal">
                  原始数据与参考的相关性
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="downscaled" id="pred-downscaled" />
                <Label htmlFor="pred-downscaled" className="font-normal">
                  降尺度数据与参考的相关性
                </Label>
              </div>
            </RadioGroup>
          </div>
        </CardContent>
      </Card>

      {/* Correlation Map Visualization */}
      <Card>
        <CardHeader>
          <CardTitle>逐网格点时间相关性地图</CardTitle>
          <CardDescription>每个网格点在所选时间窗内的预测与参考 Pearson r 分布</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && <p className="text-sm text-muted-foreground">加载中...</p>}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {correlationMapResult && !correlationMapResult.available && (
            <Alert>
              <InfoIcon className="size-4" />
              <AlertDescription>{correlationMapResult.reason}</AlertDescription>
            </Alert>
          )}

          {correlationMapResult && correlationMapResult.available && (
            <div className="space-y-4">
              {/* Map Placeholder */}
              <MapPlaceholder validPoints={correlationMapResult.result.validPoints} />

              {/* Statistics Summary */}
              <div className="rounded-lg border bg-card p-4">
                <h4 className="mb-3 text-sm font-medium">统计摘要</h4>
                <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                  <div>
                    <dt className="text-muted-foreground">最小相关性</dt>
                    <dd className="font-mono">
                      {Number.isFinite(correlationMapResult.result.minCorrelation)
                        ? correlationMapResult.result.minCorrelation.toFixed(3)
                        : 'N/A'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">最大相关性</dt>
                    <dd className="font-mono">
                      {Number.isFinite(correlationMapResult.result.maxCorrelation)
                        ? correlationMapResult.result.maxCorrelation.toFixed(3)
                        : 'N/A'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">平均相关性</dt>
                    <dd className="font-mono">
                      {Number.isFinite(correlationMapResult.result.meanCorrelation)
                        ? correlationMapResult.result.meanCorrelation.toFixed(3)
                        : 'N/A'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">有效点数</dt>
                    <dd className="font-mono">
                      {correlationMapResult.result.validPoints} /{' '}
                      {correlationMapResult.result.totalPoints}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Unavailable Points Summary */}
              {(correlationMapResult.result.unavailableReasons.insufficientSamples > 0 ||
                correlationMapResult.result.unavailableReasons.zeroVariance > 0) && (
                <div className="rounded-lg border bg-card p-4">
                  <h4 className="mb-3 text-sm font-medium">不可用点位统计</h4>
                  <dl className="grid grid-cols-1 gap-2 text-sm md:grid-cols-3">
                    <div>
                      <dt className="text-muted-foreground">有效时间点不足（&lt;3）</dt>
                      <dd className="font-mono">
                        {correlationMapResult.result.unavailableReasons.insufficientSamples}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">预测或参考方差为零</dt>
                      <dd className="font-mono">
                        {correlationMapResult.result.unavailableReasons.zeroVariance}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">掩码排除点位</dt>
                      <dd className="font-mono">
                        {correlationMapResult.result.unavailableReasons.masked}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Metadata and Method Description */}
              <div className="rounded-lg bg-muted p-4 text-sm">
                <h4 className="mb-2 font-medium">方法说明</h4>
                <dl className="space-y-1 text-xs">
                  <div>
                    <dt className="inline font-medium">相关性类型：</dt>
                    <dd className="inline">Pearson r（逐网格点时间相关性，非 R²）</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">预测类型：</dt>
                    <dd className="inline">
                      {options.predictionType === 'original' ? '原始数据' : '降尺度数据'}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">时间窗口：</dt>
                    <dd className="inline">
                      {correlationMapResult.result.metadata.windowDescription}（
                      {correlationMapResult.result.metadata.timeCoverage} 个时间点）
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">采样方法：</dt>
                    <dd className="inline">
                      按时间身份、单位和统计区间形成共同有效样本，不填零或跨缺口插值
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">有效性要求：</dt>
                    <dd className="inline">每点至少 3 个共同有效时间样本，方差不为零</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">结果说明：</dt>
                    <dd className="inline">
                      正相关（r &gt; 0）、负相关（r &lt; 0）和缺测（NaN）明确区分。缺测不显示为 r=0
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Reference Source Warning */}
              <InterpolationWarning>
                若参考数据来自台站插值，仅作空间展示用途。网格点数、每点时间支撑与独立台站精度样本数需区分。结果不作为同位真实观测验证。
              </InterpolationWarning>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

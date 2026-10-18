import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { type Variable, getVariableUnit } from '../service/color-scales'
import type { DistributionMetrics } from '../service/distribution-metrics'
import { ThresholdPanel } from './threshold-panel'
import { useThresholdResultData } from '../hooks/use-threshold-result-data'

export interface AccuracyPanelProps {
  taskId: string
  variable: Variable
  timeRange: {
    start: string
    end: string
  }
  region: {
    west: number
    east: number
    south: number
    north: number
  }
  isProbabilistic?: boolean
  currentTime?: string
}

export function AccuracyPanel({
  variable,
  taskId,
  region,
  isProbabilistic,
  currentTime,
}: AccuracyPanelProps) {
  // TODO: Fetch distribution metrics from API
  // taskId, timeRange, and region will be used when integrating with the backend
  const metrics = null as DistributionMetrics | null
  const loading = false
  const error = null as string | null

  const unit = getVariableUnit(variable)

  // Fetch result data for threshold analysis if probabilistic
  const thresholdResultQuery = useThresholdResultData({
    taskId,
    timeSlice: currentTime || '',
    region,
    enabled: isProbabilistic && !!currentTime,
  })

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>精度评估</CardTitle>
          <CardDescription>加载中...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>精度评估</CardTitle>
          <CardDescription>加载失败</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{String(error)}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Threshold Analysis for Probabilistic Tasks */}
      {isProbabilistic && (
        <Card>
          <CardHeader>
            <CardTitle>阈值概率分析</CardTitle>
            <CardDescription>可配置气象阈值的集合成员超阈值概率与格点影响范围</CardDescription>
          </CardHeader>
          <CardContent>
            {thresholdResultQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">加载结果数据中...</p>
            ) : thresholdResultQuery.error ? (
              <p className="text-sm text-destructive">
                加载失败: {String(thresholdResultQuery.error)}
              </p>
            ) : (
              <ThresholdPanel result={thresholdResultQuery.data || null} isPreview={true} />
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>精度评估</CardTitle>
          <CardDescription>分布统计与箱线图对比分析</CardDescription>
        </CardHeader>
        <CardContent>
          {metrics ? (
            <div className="space-y-6">
              {/* Sample Info */}
              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="flex items-center gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">样本数:</span>{' '}
                    <span className="font-medium">{metrics.n}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">单位:</span>{' '}
                    <span className="font-medium">{unit}</span>
                  </div>
                </div>
              </div>

              {/* Distribution Statistics Table */}
              <div>
                <h3 className="mb-3 text-sm font-medium">分布统计</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="py-2 text-left font-medium">指标</th>
                        <th className="py-2 text-right font-medium">原始</th>
                        <th className="py-2 text-right font-medium">降尺度</th>
                        <th className="py-2 text-right font-medium">观测</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="py-2">偏差 (Bias)</td>
                        <td className="py-2 text-right tabular-nums">
                          {metrics.original.bias.toFixed(2)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {metrics.downscaled.bias.toFixed(2)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {metrics.observed.bias.toFixed(2)}
                        </td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2">标准差 (σ)</td>
                        <td className="py-2 text-right tabular-nums">
                          {metrics.original.stdDev.toFixed(2)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {metrics.downscaled.stdDev.toFixed(2)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {metrics.observed.stdDev.toFixed(2)}
                        </td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2">最小值</td>
                        <td className="py-2 text-right tabular-nums">
                          {metrics.original.quantiles.min.toFixed(2)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {metrics.downscaled.quantiles.min.toFixed(2)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {metrics.observed.quantiles.min.toFixed(2)}
                        </td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2">Q25 (25%)</td>
                        <td className="py-2 text-right tabular-nums">
                          {metrics.original.quantiles.q25.toFixed(2)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {metrics.downscaled.quantiles.q25.toFixed(2)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {metrics.observed.quantiles.q25.toFixed(2)}
                        </td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2">Q50 (中位数)</td>
                        <td className="py-2 text-right tabular-nums">
                          {metrics.original.quantiles.q50.toFixed(2)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {metrics.downscaled.quantiles.q50.toFixed(2)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {metrics.observed.quantiles.q50.toFixed(2)}
                        </td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2">Q75 (75%)</td>
                        <td className="py-2 text-right tabular-nums">
                          {metrics.original.quantiles.q75.toFixed(2)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {metrics.downscaled.quantiles.q75.toFixed(2)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {metrics.observed.quantiles.q75.toFixed(2)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2">最大值</td>
                        <td className="py-2 text-right tabular-nums">
                          {metrics.original.quantiles.max.toFixed(2)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {metrics.downscaled.quantiles.max.toFixed(2)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {metrics.observed.quantiles.max.toFixed(2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Box Plot Placeholder */}
              <div>
                <h3 className="mb-3 text-sm font-medium">箱线图对比</h3>
                <div className="rounded-lg border bg-muted/50 p-8 text-center text-sm text-muted-foreground">
                  箱线图组件待实现
                </div>
              </div>

              {/* Methodology Note */}
              <div className="rounded-lg border bg-muted/50 p-4 text-xs text-muted-foreground">
                <p className="mb-2">
                  <strong>计算说明:</strong>
                </p>
                <ul className="list-inside list-disc space-y-1">
                  <li>偏差 (Bias) = 预测均值 - 观测均值</li>
                  <li>标准差采用总体口径 (除以 N)</li>
                  <li>分位数采用线性插值法 (R-7 方法)</li>
                  <li>箱线图须线为 Q1-1.5×IQR 至 Q3+1.5×IQR 范围内的最值</li>
                </ul>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">暂无数据。请选择时间范围并加载结果。</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'

type MetricSet = {
  rmse: number
  mae: number
  r2: number
}

type AccuracyData =
  | {
      available: true
      metrics: {
        original: MetricSet
        downscaled: MetricSet
      }
      samples: {
        n: number
        timeCoverage: { start: string; end: string }
      }
      method: {
        matching: string
        unit: string
      }
    }
  | {
      available: false
      reason: string
    }

type AccuracyAssessmentPanelProps = {
  data: AccuracyData
  variable: string
}

function formatImprovement(original: number, downscaled: number): string {
  const improvement = ((original - downscaled) / original) * 100
  const sign = improvement >= 0 ? '+' : ''
  return `${sign}${improvement.toFixed(1)}%`
}

function MetricCard({
  title,
  original,
  downscaled,
  unit,
  higherIsBetter = false,
}: {
  title: string
  original: number
  downscaled: number
  unit: string
  higherIsBetter?: boolean
}) {
  const improvement = higherIsBetter
    ? ((downscaled - original) / Math.abs(original)) * 100
    : ((original - downscaled) / original) * 100

  const isDegraded = improvement < 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>误差改善</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-muted-foreground">原始</div>
            <div className="text-2xl font-semibold">
              {original.toFixed(2)} {unit}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">降尺度</div>
            <div className="text-2xl font-semibold">
              {downscaled.toFixed(2)} {unit}
            </div>
          </div>
        </div>
        <div className="pt-2 border-t">
          <div className="text-sm text-muted-foreground">改善</div>
          <div
            className={`text-xl font-semibold ${isDegraded ? 'text-destructive' : 'text-green-600'}`}
          >
            {formatImprovement(original, downscaled)}
            {isDegraded && <span className="ml-2 text-sm">(退化)</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function AccuracyAssessmentPanel({ data, variable }: AccuracyAssessmentPanelProps) {
  if (!data.available) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>精度评估</CardTitle>
          <CardDescription>无法计算精度指标</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="size-4" />
            <AlertDescription>{data.reason}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  const { metrics, samples, method } = data

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <CardTitle>精度评估</CardTitle>
          <CardDescription>
            基于 {samples.n} 个共同有效样本 · {method.matching} · Synthetic Demo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            <p>评估时段：{samples.timeCoverage.start} 至 {samples.timeCoverage.end}</p>
            <p className="mt-2">
              单位：{method.unit} ·
              模拟评估数据，不代表真实预报能力
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="RMSE"
          original={metrics.original.rmse}
          downscaled={metrics.downscaled.rmse}
          unit={method.unit}
        />
        <MetricCard
          title="MAE"
          original={metrics.original.mae}
          downscaled={metrics.downscaled.mae}
          unit={method.unit}
        />
        <MetricCard
          title="R²"
          original={metrics.original.r2}
          downscaled={metrics.downscaled.r2}
          unit=""
          higherIsBetter
        />
      </div>

      {/* Scatter Plot Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>观测-预测散点图</CardTitle>
          <CardDescription>对比原始与降尺度预测的观测匹配</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 items-center justify-center rounded-md border border-dashed">
            <p className="text-sm text-muted-foreground">散点图将在后续实现</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

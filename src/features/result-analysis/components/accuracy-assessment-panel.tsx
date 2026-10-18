import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AssessmentHeaderCard,
  AssessmentInfoRow,
  AssessmentUnavailableCard,
} from './assessment-shared-ui'

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
        stationCount: number
        timeCoverage: { start: string; end: string; actualTimes: number }
      }
      sampling: {
        budget: { maxPoints: number; maxTimes: number }
        actual: { points: number; times: number }
        plan: string
      }
      method: {
        matching: string
        unit: string
        dataSource: 'Synthetic Demo'
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

export function AccuracyAssessmentPanel({
  data,
  variable: _variable,
}: AccuracyAssessmentPanelProps) {
  if (!data.available) {
    return (
      <AssessmentUnavailableCard
        title="精度评估"
        subtitle="无法计算精度指标"
        reason={data.reason}
      />
    )
  }

  const { metrics, samples, sampling, method } = data

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <AssessmentHeaderCard
        title="精度评估"
        description={`基于 ${samples.stationCount} 个独立台站 · ${samples.n} 个站时样本 · ${method.dataSource}`}
      >
        <AssessmentInfoRow
          label="时间覆盖"
          value={`${samples.timeCoverage.start} 至 ${samples.timeCoverage.end}（实际查询 ${samples.timeCoverage.actualTimes} 个时刻）`}
        />
        <AssessmentInfoRow label="取样方案" value={`${method.matching} · ${sampling.plan}`} />
        <AssessmentInfoRow
          label="单位与数据说明"
          value={`${method.unit} · 合成台站参考，不代表真实预报能力`}
        />
      </AssessmentHeaderCard>

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

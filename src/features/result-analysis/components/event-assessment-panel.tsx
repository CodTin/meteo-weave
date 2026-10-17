import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'

type EventCounts = {
  truePositives: number
  falsePositives: number
  falseNegatives: number
  trueNegatives: number
}

type EventThreshold = {
  value: number
  direction: 'greater' | 'less'
  inclusive: boolean
  unit: string
  variable: string
}

type AccumulationInterval = {
  interval: string
  description: string
}

type EventAssessmentDefinition = {
  threshold: EventThreshold
  accumulation?: AccumulationInterval
}

type EventMethodResult = {
  available: true
  hitRate: number
  precision: number
  counts: EventCounts
  n: number
}

type EventAssessmentData =
  | {
      available: true
      original: EventMethodResult
      downscaled: EventMethodResult
      samples: {
        n: number
        timeCoverage: { start: string; end: string }
      }
      definition: EventAssessmentDefinition
    }
  | {
      available: false
      reason: string
    }

type EventAssessmentPanelProps = {
  data: EventAssessmentData
  variable: string
}

function formatThresholdDescription(threshold: EventThreshold): string {
  const direction = threshold.direction === 'greater' ? '>' : '<'
  const inclusive = threshold.inclusive ? '=' : ''
  return `${direction}${inclusive} ${threshold.value} ${threshold.unit}`
}

function EventMetricCard({
  title,
  value,
  denominator,
  denominatorLabel,
  counts,
  available,
}: {
  title: string
  value?: number
  denominator?: number
  denominatorLabel: string
  counts: EventCounts
  available: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>
          {available && denominator !== undefined
            ? `分母: ${denominatorLabel} = ${denominator}`
            : '不可用'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {available && value !== undefined ? (
          <>
            <div className="text-4xl font-bold">{(value * 100).toFixed(1)}%</div>
            <div className="text-sm text-muted-foreground">
              {denominatorLabel}: {denominator}
            </div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">
            {!available ? '分母为零，指标不可用' : '无法计算'}
          </div>
        )}
        <div className="pt-2 border-t space-y-1 text-xs text-muted-foreground">
          <div>TP: {counts.truePositives}</div>
          <div>FP: {counts.falsePositives}</div>
          <div>FN: {counts.falseNegatives}</div>
          <div>TN: {counts.trueNegatives}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function MethodComparisonCard({
  method,
  result,
}: {
  method: '原始' | '降尺度'
  result: EventMethodResult
}) {
  const hitRateDenominator = result.counts.truePositives + result.counts.falseNegatives
  const precisionDenominator = result.counts.truePositives + result.counts.falsePositives

  return (
    <Card>
      <CardHeader>
        <CardTitle>{method}方法</CardTitle>
        <CardDescription>基于 {result.n} 个共同有效样本</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          <EventMetricCard
            title="命中率 (Hit Rate)"
            value={result.hitRate}
            denominator={hitRateDenominator}
            denominatorLabel="TP + FN"
            counts={result.counts}
            available={hitRateDenominator > 0}
          />
          <EventMetricCard
            title="精确率 (Precision)"
            value={result.precision}
            denominator={precisionDenominator}
            denominatorLabel="TP + FP"
            counts={result.counts}
            available={precisionDenominator > 0}
          />
        </div>
      </CardContent>
    </Card>
  )
}

export function EventAssessmentPanel({ data, variable: _variable }: EventAssessmentPanelProps) {
  if (!data.available) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>极端事件评估</CardTitle>
          <CardDescription>无法计算事件指标</CardDescription>
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

  const { original, downscaled, samples, definition } = data
  const thresholdDesc = formatThresholdDescription(definition.threshold)

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <CardTitle>极端事件评估</CardTitle>
          <CardDescription>
            基于 {samples.n} 个共同有效样本 · 事件阈值: {thresholdDesc}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              评估时段：{samples.timeCoverage.start} 至 {samples.timeCoverage.end}
            </p>
            <p>
              阈值定义：{definition.threshold.variable} {thresholdDesc}
              {definition.accumulation && ` · ${definition.accumulation.description}`}
            </p>
            <p className="text-xs mt-2">
              演示评估口径，非经过业务验证的预警标准 · 模拟数据，不代表真实预报能力
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Method Comparison */}
      <div className="grid gap-4 lg:grid-cols-2">
        <MethodComparisonCard method="原始" result={original} />
        <MethodComparisonCard method="降尺度" result={downscaled} />
      </div>

      {/* Legend Card */}
      <Card>
        <CardHeader>
          <CardTitle>指标说明</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 text-sm">
            <div>
              <span className="font-medium">命中率 (Hit Rate)</span> = TP / (TP + FN)
              <p className="text-muted-foreground">
                观测到事件时，预测也识别为事件的比例。分母为观测事件总数。
              </p>
            </div>
            <div>
              <span className="font-medium">精确率 (Precision)</span> = TP / (TP + FP)
              <p className="text-muted-foreground">
                预测为事件时，实际也是事件的比例。分母为预测事件总数。
              </p>
            </div>
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                TP: 真阳性 · FP: 假阳性（误报） · FN: 假阴性（漏报） · TN: 真阴性
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Info } from 'lucide-react'
import {
  AssessmentHeaderCard,
  AssessmentInfoRow,
  AssessmentUnavailableCard,
} from './assessment-shared-ui'

type EnsembleCRPSData =
  | {
      available: true
      metrics: {
        crps: number
        rmse: number
        mae: number
      }
      samples: {
        n: number
        stationCount: number
        timeCoverage: { start: string; end: string; actualTimes: number }
        averageMembers: number
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
        crpsDefinition: string
      }
    }
  | {
      available: false
      reason: string
    }

type EnsembleCRPSPanelProps = {
  data: EnsembleCRPSData
  variable: string
}

function MetricCard({
  title,
  value,
  unit,
  description,
}: {
  title: string
  value: number
  unit: string
  description?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold">
          {value.toFixed(3)} {unit}
        </div>
      </CardContent>
    </Card>
  )
}

export function EnsembleCRPSPanel({ data, variable: _variable }: EnsembleCRPSPanelProps) {
  if (!data.available) {
    return (
      <AssessmentUnavailableCard
        title="集合 CRPS 评估"
        subtitle="无法计算 CRPS 指标"
        reason={data.reason}
      />
    )
  }

  const { metrics, samples, sampling, method } = data

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <AssessmentHeaderCard
        title="集合 CRPS 评估"
        description={`基于 ${samples.stationCount} 个独立台站 · ${samples.n} 个站时样本 · 平均 ${samples.averageMembers.toFixed(1)} 个有效成员 · ${method.dataSource}`}
      >
        <AssessmentInfoRow
          label="时间覆盖"
          value={`${samples.timeCoverage.start} 至 ${samples.timeCoverage.end}（实际查询 ${samples.timeCoverage.actualTimes} 个时刻）`}
        />
        <AssessmentInfoRow label="取样方案" value={`${method.matching} · ${sampling.plan}`} />
        <AssessmentInfoRow label="CRPS 定义" value={method.crpsDefinition} />
        <AssessmentInfoRow
          label="单位与数据说明"
          value={`${method.unit} · 合成台站参考，不代表真实预报能力，未做概率校准`}
        />
      </AssessmentHeaderCard>

      {/* Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="CRPS"
          value={metrics.crps}
          unit={method.unit}
          description="集合概率评分"
        />
        <MetricCard
          title="RMSE"
          value={metrics.rmse}
          unit={method.unit}
          description="同口径确定性对照"
        />
        <MetricCard title="MAE" value={metrics.mae} unit={method.unit} description="同口径对照" />
      </div>

      {/* Method Explanation Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="size-5" />
            方法说明
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">评估口径：</strong>
            CRPS 使用与确定性 RMSE/MAE 一致的台站身份、坐标、时间、变量与单位，以 (stationId, time)
            去重确保独立样本。
          </p>
          <p>
            <strong className="text-foreground">有效成员：</strong>
            每个站时样本使用实际可用成员数 K（平均 {samples.averageMembers.toFixed(1)}
            个），缺测按公开规则排除，不补零或复制成员。K=1 时 CRPS 等于该成员绝对误差。
          </p>
          <p>
            <strong className="text-foreground">汇总权重：</strong>
            总体 CRPS 对所有站时样本等权平均，不因成员数多而获得更大权重。
          </p>
          <p>
            <strong className="text-foreground">注意事项：</strong>
            本评估基于 Synthetic Demo
            合成数据，较低的模拟评分不代表已验证的真实预报能力或安全决策保证。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

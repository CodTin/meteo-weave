import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FlaskConical, Landmark, Sprout, Info } from 'lucide-react'
import type { UserRole } from '../types/role-emphasis'
import type { DownscalingTask } from '@/features/downscaling-tasks/service/contracts'

export interface RoleSummaryPanelProps {
  role: UserRole
  task: DownscalingTask
  summaryData?: {
    ensemble?: {
      memberCount: number
      mean: number
      stdDev: number
      p10: number
      p90: number
      crps?: { mean: number; median: number }
    }
    threshold?: {
      probability: number
      affectedArea: number
      thresholdValue: number
      unit: string
    }
    agriculture?: {
      accumulatedDegreeDay: number
      frostRisk: number
      precipitationProbability: number
    }
  }
}

const roleConfig = {
  researcher: {
    icon: FlaskConical,
    title: '研究人员视角',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  policy: {
    icon: Landmark,
    title: '决策者视角',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
  },
  agriculture: {
    icon: Sprout,
    title: '农业用户视角',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
  },
}

function ResearcherSummary({ task, summaryData }: Omit<RoleSummaryPanelProps, 'role'>) {
  const isProbabilistic = task.configuration.resolvedMethod === 'probabilistic'

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {isProbabilistic && summaryData?.ensemble && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">集合分布特征</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">成员数 (K)</span>
                <span className="font-medium">{summaryData.ensemble.memberCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">集合均值</span>
                <span className="font-medium">{summaryData.ensemble.mean.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">集合标准差 (σ)</span>
                <span className="font-medium">{summaryData.ensemble.stdDev.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">P10–P90 区间</span>
                <span className="font-medium">
                  {summaryData.ensemble.p10.toFixed(2)} – {summaryData.ensemble.p90.toFixed(2)}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {isProbabilistic && summaryData?.ensemble?.crps && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">CRPS 评估</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">平均 CRPS</span>
                <span className="font-medium">{summaryData.ensemble.crps.mean.toFixed(3)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">中位数 CRPS</span>
                <span className="font-medium">{summaryData.ensemble.crps.median.toFixed(3)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                与台站精度同口径，值越小表示集合预报与观测越接近
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <Alert>
        <Info className="size-4" />
        <AlertDescription className="text-sm">
          研究视角强调成员分布、离散度与 CRPS 技术指标。所有指标基于相同样本、时间与空间覆盖计算，
          不因角色切换而改变数值。
        </AlertDescription>
      </Alert>
    </div>
  )
}

function PolicySummary({ task, summaryData }: Omit<RoleSummaryPanelProps, 'role'>) {
  const isProbabilistic = task.configuration.resolvedMethod === 'probabilistic'

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {isProbabilistic && summaryData?.threshold && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">阈值概率评估</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">评估阈值</span>
                <span className="font-medium">
                  {summaryData.threshold.thresholdValue} {summaryData.threshold.unit}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">超阈值概率</span>
                <span className="font-medium">{(summaryData.threshold.probability * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">影响范围</span>
                <span className="font-medium">{summaryData.threshold.affectedArea.toFixed(0)} km²</span>
              </div>
            </CardContent>
          </Card>
        )}

        {isProbabilistic && summaryData?.ensemble && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">集合分位区间</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">P10–P90 区间</span>
                <span className="font-medium">
                  {summaryData.ensemble.p10.toFixed(2)} – {summaryData.ensemble.p90.toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                80% 的集合成员预报值落在此区间，反映预报不确定性范围
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <Alert>
        <Info className="size-4" />
        <AlertDescription className="text-sm">
          决策视角强调经验阈值概率、集合分位区间与气象条件影响范围。阈值为演示口径，
          非官方预警标准。不用于人口经济损失预测或安全决策建议。
        </AlertDescription>
      </Alert>
    </div>
  )
}

function AgricultureSummary({ task, summaryData }: Omit<RoleSummaryPanelProps, 'role'>) {
  const isProbabilistic = task.configuration.resolvedMethod === 'probabilistic'
  const isTemperature = task.configuration.variable === 'temperature'
  const isPrecipitation = task.configuration.variable === 'precipitation'

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {isTemperature && summaryData?.agriculture && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">温度积累指标</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">日积温 (≥10°C)</span>
                <span className="font-medium">{summaryData.agriculture.accumulatedDegreeDay.toFixed(1)} °C·d</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">霜冻风险 (&lt;0°C)</span>
                <span className="font-medium">{(summaryData.agriculture.frostRisk * 100).toFixed(1)}%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                基于时间序列完整日数据计算，不适用于单时刻预览
              </p>
            </CardContent>
          </Card>
        )}

        {isPrecipitation && isProbabilistic && summaryData?.agriculture && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">降水概率区间</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">≥10mm 概率</span>
                <span className="font-medium">{(summaryData.agriculture.precipitationProbability * 100).toFixed(1)}%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                有效降水阈值，用于灌溉决策参考
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <Alert>
        <Info className="size-4" />
        <AlertDescription className="text-sm">
          农业视角强调完整日积温、霜冻条件与对应区间降水概率。气象阈值为评估口径，
          不直接转换为作物损失或种植建议。需结合作物模型与本地物候期。
        </AlertDescription>
      </Alert>
    </div>
  )
}

export function RoleSummaryPanel({ role, task, summaryData }: RoleSummaryPanelProps) {
  const config = roleConfig[role]
  const Icon = config.icon
  const isProbabilistic = task.configuration.resolvedMethod === 'probabilistic'

  if (!isProbabilistic) {
    return (
      <Card className={`${config.borderColor} border-2`}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Icon className={`size-5 ${config.color}`} />
            <CardTitle>{config.title}</CardTitle>
          </div>
          <CardDescription>角色摘要</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="size-4" />
            <AlertDescription className="text-sm">
              当前任务为确定性方法，无集合成员与概率分析。角色摘要仅适用于概率式任务。
              可在精度、时间序列与空间分析标签页查看确定性结果。
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={`${config.borderColor} border-2`}>
      <CardHeader className={config.bgColor}>
        <div className="flex items-center gap-2">
          <Icon className={`size-5 ${config.color}`} />
          <CardTitle>{config.title}</CardTitle>
        </div>
        <CardDescription>根据角色关注点定制的结果摘要</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {role === 'researcher' && <ResearcherSummary task={task} summaryData={summaryData} />}
        {role === 'policy' && <PolicySummary task={task} summaryData={summaryData} />}
        {role === 'agriculture' && <AgricultureSummary task={task} summaryData={summaryData} />}
      </CardContent>
    </Card>
  )
}

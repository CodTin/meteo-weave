/**
 * Elevation grouping panel for spatial analysis.
 * Displays station accuracy metrics grouped by synthetic elevation.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Info, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { ElevationGroupingData } from '@/server/services/elevation-grouping.server'
import type { GroupMetrics } from '@/features/result-analysis/service/elevation-grouping'
import {
  getGroupLabel,
  getGroupElevationRange,
} from '@/features/result-analysis/service/elevation-grouping'

interface ElevationGroupingPanelProps {
  data: ElevationGroupingData | { available: false; reason: string }
}

/**
 * Formats a number with specified decimal places.
 */
function formatNumber(value: number, decimals: number = 2): string {
  return value.toFixed(decimals)
}

/**
 * Formats improvement percentage with sign and color.
 */
function formatImprovement(value: number | undefined | null): {
  text: string
  icon: React.ReactNode
  className: string
} {
  if (value === undefined || value === null) {
    return {
      text: 'N/A',
      icon: <Minus className="size-4" />,
      className: 'text-muted-foreground',
    }
  }

  const sign = value >= 0 ? '+' : ''
  const text = `${sign}${formatNumber(value, 1)}%`

  if (value > 0) {
    return {
      text,
      icon: <TrendingUp className="size-4" />,
      className: 'text-green-600',
    }
  } else if (value < 0) {
    return {
      text,
      icon: <TrendingDown className="size-4" />,
      className: 'text-red-600',
    }
  } else {
    return {
      text: '0%',
      icon: <Minus className="size-4" />,
      className: 'text-muted-foreground',
    }
  }
}

/**
 * Renders a single elevation group metrics card.
 */
function GroupMetricsCard({ metrics, unit }: { metrics: GroupMetrics; unit: string }) {
  const groupLabel = getGroupLabel(metrics.group)
  const elevationRange = getGroupElevationRange(metrics.group)

  const rmseImprovement = formatImprovement(metrics.improvement.rmse)
  const maeImprovement = formatImprovement(metrics.improvement.mae)

  if (!metrics.available) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{groupLabel}</CardTitle>
          <CardDescription>{elevationRange}</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="size-4" />
            <AlertDescription>{metrics.reason}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{groupLabel}</span>
          <span className="text-sm font-normal text-muted-foreground">{elevationRange}</span>
        </CardTitle>
        <CardDescription>
          {metrics.stationCount} 个台站，{metrics.sampleCount} 个站时样本
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* RMSE */}
        <div>
          <div className="text-sm font-medium mb-2">RMSE ({unit})</div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <div className="text-muted-foreground">原始</div>
              <div className="font-mono">{formatNumber(metrics.original.rmse)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">降尺度</div>
              <div className="font-mono">{formatNumber(metrics.downscaled.rmse)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">改善</div>
              <div className={`font-mono flex items-center gap-1 ${rmseImprovement.className}`}>
                {rmseImprovement.icon}
                {rmseImprovement.text}
              </div>
            </div>
          </div>
        </div>

        {/* MAE */}
        <div>
          <div className="text-sm font-medium mb-2">MAE ({unit})</div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <div className="text-muted-foreground">原始</div>
              <div className="font-mono">{formatNumber(metrics.original.mae)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">降尺度</div>
              <div className="font-mono">{formatNumber(metrics.downscaled.mae)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">改善</div>
              <div className={`font-mono flex items-center gap-1 ${maeImprovement.className}`}>
                {maeImprovement.icon}
                {maeImprovement.text}
              </div>
            </div>
          </div>
        </div>

        {/* Improvement reason if available */}
        {metrics.improvement.reason && (
          <Alert>
            <Info className="size-4" />
            <AlertDescription className="text-xs">{metrics.improvement.reason}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

export function ElevationGroupingPanel({ data }: ElevationGroupingPanelProps) {
  if (!data.available) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>高程分组分析</CardTitle>
          <CardDescription>按合成高程分组的台站精度评估</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="size-4" />
            <AlertDescription>{data.reason}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  const unit = data.metadata.unit

  return (
    <div className="space-y-6">
      {/* Header and metadata */}
      <Card className="border-primary/50 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="size-5" />
            合成高程分组与台站精度对照
          </CardTitle>
          <CardDescription>{data.metadata.demoNotice}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <strong>高程规则：</strong>
            {data.metadata.elevationRule} (v{data.metadata.elevationRuleVersion})
          </div>
          <div>
            <strong>分组阈值：</strong>
            平原 {data.metadata.thresholds.plains}、丘陵 {data.metadata.thresholds.hills}、山区{' '}
            {data.metadata.thresholds.mountains}
          </div>
          <div>
            <strong>时间覆盖：</strong>
            {data.metadata.timeCoverage.start} 至 {data.metadata.timeCoverage.end}
          </div>
          <div className="text-muted-foreground">
            注：200m 与 500m 边界值属于丘陵组。这不是通用地貌分类标准，仅用于演示高程分组功能。
          </div>
        </CardContent>
      </Card>

      {/* Group metrics cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <GroupMetricsCard metrics={data.groups.plains} unit={unit} />
        <GroupMetricsCard metrics={data.groups.hills} unit={unit} />
        <GroupMetricsCard metrics={data.groups.mountains} unit={unit} />
      </div>

      {/* Overall metrics for cross-reference */}
      <Card className="border-muted">
        <CardHeader>
          <CardTitle className="text-base">与精度评估 Tab 对照</CardTitle>
          <CardDescription>
            以下总体指标应与精度评估 Tab 中的相同任务、区域、时段结果一致
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">总样本数</div>
              <div className="text-lg font-semibold">{data.overall.sampleCount}</div>
            </div>
            <div>
              <div className="text-muted-foreground">总台站数</div>
              <div className="text-lg font-semibold">{data.overall.stationCount}</div>
            </div>
            <div>
              <div className="text-muted-foreground">总体 RMSE 改善</div>
              <div className={`text-lg font-semibold ${formatImprovement(data.overall.rmse.improvement).className}`}>
                {formatImprovement(data.overall.rmse.improvement).text}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">总体 MAE 改善</div>
              <div className={`text-lg font-semibold ${formatImprovement(data.overall.mae.improvement).className}`}>
                {formatImprovement(data.overall.mae.improvement).text}
              </div>
            </div>
          </div>
          <Alert>
            <Info className="size-4" />
            <AlertDescription className="text-xs">
              总体指标基于所有分组的共同有效样本计算，不是各组 RMSE/MAE
              的简单平均。请在精度评估 Tab 中核对这些数值。
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Interpretation guide */}
      <Card className="border-muted">
        <CardHeader>
          <CardTitle className="text-base">结果解读说明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div>
            <strong className="text-foreground">改善计算：</strong>
            改善率 = (原始误差 - 降尺度误差) / 原始误差 × 100%。正值表示降尺度改善，负值表示退化。
          </div>
          <div>
            <strong className="text-foreground">分组差异：</strong>
            不同高程组的改善、退化或无支撑均如实呈现。本演示不预设所有山区显著改善。
          </div>
          <div>
            <strong className="text-foreground">与插值地图区别：</strong>
            台站分组基于独立台站样本，插值误差地图基于网格采样。位置和取样口径不同，数值可能不同。
          </div>
          <div>
            <strong className="text-foreground">样本计数：</strong>
            n 为有效站时样本数（台站×时刻），不是空间网格点数或插值点数。
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { InfoIcon } from 'lucide-react'

type AnalysisContextCardProps = {
  taskId: string
  timeInfo: {
    label: string
    value: string
  }
  region: {
    south: number
    north: number
    west: number
    east: number
  }
  variable: string
}

export function AnalysisContextCard({
  taskId,
  timeInfo,
  region,
  variable,
}: AnalysisContextCardProps) {
  return (
    <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
      <div>
        <dt className="text-muted-foreground">任务 ID</dt>
        <dd className="font-mono text-xs">{taskId}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{timeInfo.label}</dt>
        <dd className="font-medium">{timeInfo.value}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">空间范围</dt>
        <dd className="font-mono text-xs">
          {region.south.toFixed(2)}°N - {region.north.toFixed(2)}°N, {region.west.toFixed(2)}°E -{' '}
          {region.east.toFixed(2)}°E
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">变量</dt>
        <dd className="font-medium">{variable}</dd>
      </div>
    </dl>
  )
}

type MapPlaceholderProps = {
  validPoints: number
}

export function MapPlaceholder({ validPoints }: MapPlaceholderProps) {
  return (
    <div className="rounded-lg border bg-muted p-8 text-center">
      <p className="text-sm text-muted-foreground">地图可视化区域（待集成地图组件）</p>
      <p className="mt-2 text-xs text-muted-foreground">数据已就绪：{validPoints} 个有效点</p>
    </div>
  )
}

type InterpolationWarningProps = {
  children?: ReactNode
}

export function InterpolationWarning({ children }: InterpolationWarningProps) {
  return (
    <Alert>
      <InfoIcon className="size-4" />
      <AlertDescription>
        <strong>插值参考说明：</strong>
        {children ||
          '若参考数据来自台站插值，仅作空间展示用途。网格误差与台站精度可能因取样口径不同而不同，不将插值点数计入独立台站样本数。'}
      </AlertDescription>
    </Alert>
  )
}

type AnalysisContextWrapperProps = {
  title?: string
  description?: string
  taskId: string
  timeInfo: {
    label: string
    value: string
  }
  region: {
    south: number
    north: number
    west: number
    east: number
  }
  variable: string
}

export function AnalysisContextWrapper({
  title = '分析上下文',
  description = '当前任务的空间分析范围与时间设置',
  taskId,
  timeInfo,
  region,
  variable,
}: AnalysisContextWrapperProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <AnalysisContextCard
          taskId={taskId}
          timeInfo={timeInfo}
          region={region}
          variable={variable}
        />
      </CardContent>
    </Card>
  )
}

export function getVariableLabel(variable: string): string {
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

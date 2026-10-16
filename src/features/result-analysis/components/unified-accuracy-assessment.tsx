/**
 * Unified accuracy assessment with role-based emphasis.
 * Displays all four assessment groups (overall, distribution, spatial, events)
 * in an order determined by the user's role, while maintaining consistent
 * evaluation inputs and statistical results across all roles.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Info } from 'lucide-react'
import { AccuracyAssessmentPanel } from './accuracy-assessment-panel'
import { type UserRole, getRoleEmphasis } from '../types/role-emphasis'

interface UnifiedAccuracyAssessmentProps {
  taskId: string
  variable: string
  role: UserRole
}

/**
 * Group component wrapper with role-specific styling.
 */
function AssessmentGroup({
  id,
  title,
  description,
  emphasized,
  children,
}: {
  id: string
  title: string
  description: string
  emphasized?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      id={`assessment-${id}`}
      className={emphasized ? 'ring-2 ring-primary ring-offset-2 rounded-lg' : ''}
      aria-label={`${title}评估组`}
    >
      <div className="space-y-2 mb-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          {title}
          {emphasized && (
            <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">
              重点
            </span>
          )}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}

/**
 * Placeholder for groups not yet implemented (distribution, spatial).
 */
function PlaceholderGroup({ title, reason }: { title: string; reason: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>待实现</CardDescription>
      </CardHeader>
      <CardContent>
        <Alert>
          <Info className="size-4" />
          <AlertDescription>{reason}</AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  )
}

export function UnifiedAccuracyAssessment({
  taskId: _taskId,
  variable,
  role,
}: UnifiedAccuracyAssessmentProps) {
  const emphasis = getRoleEmphasis(role)

  // Define all four assessment groups
  const assessmentGroups = {
    overall: {
      id: 'overall',
      title: '整体精度',
      description: 'RMSE、MAE、R² 等基础统计指标',
      component: (
        <AccuracyAssessmentPanel
          data={{
            available: false,
            reason: '整体精度评估功能待实现（依赖 Ticket #60）',
          }}
          variable={variable}
        />
      ),
    },
    distribution: {
      id: 'distribution',
      title: '分布特征',
      description: '偏差、标准差、分位数与箱线图对比',
      component: (
        <PlaceholderGroup title="分布指标" reason="分布统计与箱线图功能待实现（依赖 Ticket #62）" />
      ),
    },
    spatial: {
      id: 'spatial',
      title: '空间结构',
      description: '空间相关性与功率谱摘要',
      component: (
        <PlaceholderGroup
          title="空间分析"
          reason="空间相关性与功率谱摘要待实现（依赖 Ticket #64）"
        />
      ),
    },
    events: {
      id: 'events',
      title: '极端事件',
      description: '基于气象阈值的事件命中与误报分析',
      component: (
        <PlaceholderGroup title="极端事件评估" reason="极端事件评估功能待实现（依赖 Ticket #63）" />
      ),
    },
  }

  // Reorder groups based on role emphasis
  const orderedGroups = emphasis.groupOrder.map((groupKey) => ({
    ...assessmentGroups[groupKey],
    emphasized: groupKey === emphasis.groupOrder[0], // First group is emphasized
  }))

  return (
    <div className="space-y-8">
      {/* Role-specific header */}
      <Card className="border-primary/50 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="size-5" />
            角色视角：{emphasis.description}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            以下评估基于相同的共同有效样本、时间覆盖和统计方法。
            角色视角仅影响展示顺序和重点说明，不改变评估结果的数值或计算公式。
          </p>
          {emphasis.notes && emphasis.notes.length > 0 && (
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              {emphasis.notes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Ordered assessment groups */}
      {orderedGroups.map((group) => (
        <AssessmentGroup
          key={group.id}
          id={group.id}
          title={group.title}
          description={group.description}
          emphasized={group.emphasized}
        >
          {group.component}
        </AssessmentGroup>
      ))}

      {/* Consistent source and limitation statement */}
      <Card className="border-muted">
        <CardHeader>
          <CardTitle className="text-base">数据来源与限制说明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div>
            <strong className="text-foreground">评估样本：</strong>
            所有指标基于相同的三方共同有效样本（原始预报、降尺度预报、台站观测）。
            样本数量(n)、时间覆盖范围和空间范围在各组指标中保持一致。
          </div>
          <div>
            <strong className="text-foreground">统计口径：</strong>
            相同的评估输入使用一致的统计公式和样本筛选规则。
            不因角色不同而改变计算方法或选择性展示更优结果。
          </div>
          <div>
            <strong className="text-foreground">模拟数据声明：</strong>
            当前展示为 Synthetic Demo 演示数据，不代表真实模型的预报能力或业务精度保证。
          </div>
          <div>
            <strong className="text-foreground">账号隔离：</strong>
            评估结果与提交任务的账号绑定，不同账号无法访问彼此的任务和评估数据。
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

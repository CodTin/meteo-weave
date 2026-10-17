/**
 * Role-based emphasis for accuracy assessment presentation.
 * Same evaluation input and statistical results, different sorting and emphasis.
 */

export type UserRole = 'researcher' | 'policy' | 'agriculture'

/**
 * Defines the order and emphasis for different metric groups by role.
 */
export interface RoleEmphasis {
  /**
   * Order in which the four assessment groups should be displayed.
   * All four groups must be present, only the order changes.
   */
  groupOrder: [
    'overall' | 'distribution' | 'spatial' | 'events',
    ...Array<'overall' | 'distribution' | 'spatial' | 'events'>,
  ]

  /**
   * Which metrics to highlight within the overall accuracy group.
   */
  overallHighlight: string[]

  /**
   * Additional descriptive text for this role's focus.
   */
  description: string

  /**
   * Special notes or warnings relevant to this role.
   */
  notes?: string[]
}

/**
 * Role-specific emphasis configurations.
 * These affect presentation only - not the underlying calculations or samples.
 */
export const ROLE_EMPHASIS: Record<UserRole, RoleEmphasis> = {
  researcher: {
    groupOrder: ['overall', 'distribution', 'spatial', 'events'],
    overallHighlight: ['rmse', 'mae', 'r2'],
    description: '完整技术指标与方法说明',
    notes: ['所有指标基于相同的共同有效样本', '模拟评估数据，不代表真实模型性能'],
  },
  policy: {
    groupOrder: ['events', 'overall', 'distribution', 'spatial'],
    overallHighlight: ['r2'],
    description: '强调极端事件及其阈值定义',
    notes: ['极端事件阈值为演示口径，非业务预警标准', '命中率与精确率使用不同分母，需理解其含义'],
  },
  agriculture: {
    groupOrder: ['events', 'distribution', 'overall', 'spatial'],
    overallHighlight: ['mae'],
    description: '强调农业相关气象阈值与区间',
    notes: [
      '气象阈值为明确标注的评估口径',
      '不直接转换为作物损失或风险概率',
      '分布指标显示气象量的偏差与离散程度',
    ],
  },
}

/**
 * Get the role emphasis configuration for a given role.
 */
export function getRoleEmphasis(role: UserRole): RoleEmphasis {
  return ROLE_EMPHASIS[role]
}

/**
 * Check if a metric should be highlighted for the current role.
 */
export function isMetricHighlighted(role: UserRole, metricKey: string): boolean {
  return ROLE_EMPHASIS[role].overallHighlight.includes(metricKey)
}

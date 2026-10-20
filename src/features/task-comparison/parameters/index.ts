import type { DownscalingTask } from '@/features/downscaling-tasks/service'
import {
  dataSourceLabels,
  methodLabels,
  variableLabels,
} from '@/features/downscaling-tasks/utils/formatters'
import { getVariableUnit } from '@/features/result-analysis/service/color-scales'

export type ComparisonParameterRow = {
  key: string
  label: string
  a: string
  b: string
  different: boolean
}

function parameterValues(task: DownscalingTask) {
  const { dataSource, variable, region, timeRange, method, resolvedMethod, resolution, advanced } =
    task.configuration
  const historical = timeRange.mode === 'historical'
  const interval = historical ? 24 : 1
  return {
    dataSource: dataSourceLabels[dataSource],
    variable: `${variable === 'pressure' ? '海平面气压' : variableLabels[variable]} · ${getVariableUnit(variable)}`,
    region: `${region.west}°E – ${region.east}°E；${region.south}°N – ${region.north}°N`,
    timeMode: historical ? '历史模式' : '预测模式',
    timeRange: `${timeRange.start} 至 ${timeRange.end}（UTC）`,
    granularity:
      variable === 'precipitation'
        ? `${interval} 小时累计区间 [start,end)`
        : historical
          ? '逐日原生快照（非日统计）'
          : '逐小时瞬时值',
    requestedMethod: method === 'recommended' ? '推荐方法' : `${methodLabels[method]}方法`,
    resolvedMethod: `${methodLabels[resolvedMethod]}方法`,
    resolution,
    ensembleMembers:
      resolvedMethod === 'probabilistic'
        ? `${advanced?.ensembleMembers ?? 10} 个`
        : '不适用（确定性输出）',
    advanced: advanced
      ? `不确定性量化：${advanced.uncertaintyQuantification ? '开启' : '关闭'}${
          'ensembleMembers' in advanced ? `；集合成员数：${advanced.ensembleMembers}` : ''
        }`
      : '未设置',
    createdAt: task.createdAt,
  }
}

const parameterLabels = [
  ['dataSource', '数据源'],
  ['variable', '气象变量与单位'],
  ['region', '空间范围'],
  ['timeMode', '时间模式'],
  ['timeRange', '时间范围（UTC）'],
  ['granularity', '时间粒度／降水累计区间'],
  ['requestedMethod', '请求方法'],
  ['resolvedMethod', '实际方法'],
  ['resolution', '目标分辨率'],
  ['ensembleMembers', '集合成员数'],
  ['advanced', '高级参数'],
  ['createdAt', '创建时间（UTC）'],
] as const

export function getComparisonParameters({ a, b }: { a: DownscalingTask; b: DownscalingTask }) {
  const left = parameterValues(a)
  const right = parameterValues(b)
  return {
    identities: [
      { position: 'A' as const, id: a.id, name: a.name },
      { position: 'B' as const, id: b.id, name: b.name },
    ],
    rows: parameterLabels.map(([key, label]): ComparisonParameterRow => ({
      key,
      label,
      a: left[key],
      b: right[key],
      different: left[key] !== right[key],
    })),
  }
}

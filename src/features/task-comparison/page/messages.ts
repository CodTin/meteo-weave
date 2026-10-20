import type { ComparisonReason, ComparisonExclusionCode } from '../types'

export const comparisonReasons: Record<ComparisonReason['code'], string> = {
  VARIABLE_MISMATCH: '气象变量不同，不能直接比较精度数值。',
  UNIT_MISMATCH: '单位不同，不能直接比较精度数值。',
  QUANTITY_MISMATCH: '物理量不同，不能直接比较精度数值。',
  GRAIN_MISMATCH: '时间粒度不同，逐日快照与逐小时值不能直接比较。',
  STATISTIC_MISMATCH: '时间统计量不同，不能直接比较精度数值。',
  ACCUMULATION_MISMATCH: '降水累计区间不完整或不一致，不能直接比较。',
  REFERENCE_MISMATCH: '参考种子、版本或来源不同；仅显示各自参考统计，禁止排名或改善结论。',
  REFERENCE_UNAVAILABLE: '没有可验证的共同参考，不能计算共同精度指标。',
  NO_SPATIAL_OVERLAP: '空间范围没有重叠，无法取得共同台站样本。',
  NO_TEMPORAL_OVERLAP: '没有共同的原生时间片，不能计算共同精度指标。',
  NO_COMMON_SAMPLES: '没有共同有效台站样本，不补零、不生成精度指标。',
  RESULT_UNAVAILABLE: '所需结果暂不可用，不能计算共同精度指标。',
}

export const exclusionLabels: Record<ComparisonExclusionCode, string> = {
  'missing-observation': '缺失参考',
  'missing-prediction': '缺失预测',
  'non-finite': '非有限数值',
  'station-mismatch': '台站身份或坐标不一致',
  'reference-value-mismatch': '参考值不一致',
  'incomplete-interval': '累计区间不完整',
  'interval-mismatch': '累计区间不一致',
  incompatible: '比较条件不兼容',
}

export function pairRecovery(code: string) {
  if (code === 'INVALID_PAIR' || code === 'DUPLICATE_TASK') return '请选择两个不同且已完成的任务。'
  if (code === 'NOT_FOUND' || code === 'FORBIDDEN')
    return '任务已删除或不属于当前账号，请返回任务管理重新选择。'
  if (code === 'NOT_COMPLETED' || code === 'INVALID_STATUS' || code === 'NOT_READY')
    return '所选任务尚未完成或状态已改变，只有已完成任务可以对比。'
  if (code === 'RECORD_CHANGED' || code === 'TASK_CHANGED' || code === 'INVALID_RECORD')
    return '任务身份或保存的配置已改变，本次旧结果已清除，请重新读取或返回任务管理。'
  return '无法读取当前账号的任务或结果，本次旧结果已清除。请重试或返回任务管理重新选择。'
}

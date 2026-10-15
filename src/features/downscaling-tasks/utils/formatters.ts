export const dataSourceLabels = {
  ecmwf: 'ECMWF',
  gfs: 'GFS',
  fusion: 'Fusion',
} as const

export const variableLabels = {
  temperature: '气温',
  wind: '风速',
  pressure: '气压',
  precipitation: '降水',
} as const

export const methodLabels = {
  deterministic: '确定性',
  probabilistic: '概率式',
} as const

export function formatDate(isoString: string) {
  return new Date(isoString).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

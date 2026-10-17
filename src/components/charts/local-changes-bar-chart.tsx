import { BaseBarChart } from './base-bar-chart'

interface LocalChangesBarChartProps {
  data: Array<{
    time: string
    change: number | null
  }>
  unit: string
  granularity: 'hourly' | 'daily'
}

/**
 * Bar chart displaying local changes: downscaled - original
 * Shows positive and negative changes with a zero reference line
 */
export function LocalChangesBarChart({ data, unit, granularity }: LocalChangesBarChartProps) {
  return (
    <BaseBarChart
      data={data.map((point) => ({ time: point.time, value: point.change }))}
      unit={unit}
      granularity={granularity}
      dataKey="change"
      dataLabel="降尺度−原始"
      barColor="hsl(var(--primary))"
    />
  )
}

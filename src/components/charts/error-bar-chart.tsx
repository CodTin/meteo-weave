import { BaseBarChart } from './base-bar-chart'

interface ErrorBarChartProps {
  data: Array<{
    time: string
    error: number | null
  }>
  unit: string
  granularity: 'hourly' | 'daily'
}

/**
 * Bar chart displaying errors: downscaled - observation
 * Shows positive and negative errors with a zero reference line
 */
export function ErrorBarChart({ data, unit, granularity }: ErrorBarChartProps) {
  return (
    <BaseBarChart
      data={data.map((point) => ({ time: point.time, value: point.error }))}
      unit={unit}
      granularity={granularity}
      dataKey="error"
      dataLabel="降尺度−观测"
      barColor="hsl(var(--destructive))"
    />
  )
}

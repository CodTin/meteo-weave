import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { formatTimeSeriesTime } from '@/features/result-analysis/service/time-series-formatting'

interface BaseBarChartProps {
  data: Array<{
    time: string
    value: number | null
  }>
  unit: string
  granularity: 'hourly' | 'daily'
  dataKey: string
  dataLabel: string
  barColor: string
}

/**
 * Base bar chart component for time series difference visualization
 * Shows positive and negative values with a zero reference line
 */
export function BaseBarChart({
  data,
  unit,
  granularity,
  dataKey,
  dataLabel,
  barColor,
}: BaseBarChartProps) {
  const chartData = data.map((point) => ({
    time: formatTimeSeriesTime(point.time, granularity),
    [dataKey]: point.value,
    rawTime: point.time,
  }))

  return (
    <div className="h-[400px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 12 }} />
          <YAxis label={{ value: unit, angle: -90, position: 'insideLeft' }} />
          <Tooltip
            contentStyle={{ backgroundColor: 'hsl(var(--card))' }}
            formatter={(value: any) => {
              if (value === null || value === undefined) {
                return ['缺测', dataLabel]
              }
              return [typeof value === 'number' ? value.toFixed(2) : value, dataLabel]
            }}
            labelFormatter={(label, payload) => {
              if (payload && payload[0]) {
                return `时间: ${payload[0].payload.rawTime}`
              }
              return label
            }}
          />
          <Legend />
          <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={2} />
          <Bar dataKey={dataKey} fill={barColor} name={dataLabel} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

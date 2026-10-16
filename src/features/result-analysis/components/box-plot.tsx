import { useMemo } from 'react'
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Scatter,
} from 'recharts'
import { calculateBoxPlotData } from '../service/distribution-metrics'

export interface BoxPlotProps {
  data: {
    label: string
    values: number[]
    color: string
  }[]
  unit: string
  height?: number
}

interface BoxPlotChartData {
  name: string
  min: number
  q25: number
  median: number
  q75: number
  max: number
  whiskerLow: number
  whiskerHigh: number
  outliers: number[]
  color: string
  // For rendering
  box: [number, number] // [q25, q75]
  whisker: [number, number] // [whiskerLow, whiskerHigh]
}

export function BoxPlot({ data, unit, height = 400 }: BoxPlotProps) {
  const chartData = useMemo(() => {
    return data.map((series) => {
      const boxData = calculateBoxPlotData(series.values)
      if (!boxData) {
        throw new Error(`Failed to calculate box plot data for ${series.label}`)
      }

      return {
        name: series.label,
        min: boxData.min,
        q25: boxData.q25,
        median: boxData.q50,
        q75: boxData.q75,
        max: boxData.max,
        whiskerLow: boxData.whiskerLow,
        whiskerHigh: boxData.whiskerHigh,
        outliers: boxData.outliers,
        color: series.color,
        box: [boxData.q25, boxData.q75] as [number, number],
        whisker: [boxData.whiskerLow, boxData.whiskerHigh] as [number, number],
      }
    })
  }, [data])

  // Calculate y-axis domain
  const [yMin, yMax] = useMemo(() => {
    const allValues = chartData.flatMap((d) => [d.min, d.max, ...d.outliers])
    const min = Math.min(...allValues)
    const max = Math.max(...allValues)
    const padding = (max - min) * 0.1
    return [min - padding, max + padding]
  }, [chartData])

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" label={{ value: '数据源', position: 'insideBottom', offset: -10 }} />
        <YAxis
          domain={[yMin, yMax]}
          label={{ value: `数值 (${unit})`, angle: -90, position: 'insideLeft' }}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.[0]) return null
            const data = payload[0].payload as BoxPlotChartData
            return (
              <div className="rounded-lg border bg-background p-3 shadow-lg">
                <p className="mb-2 font-medium">{data.name}</p>
                <div className="space-y-1 text-xs">
                  <p>
                    最大值: {data.max.toFixed(2)} {unit}
                  </p>
                  <p>
                    Q75: {data.q75.toFixed(2)} {unit}
                  </p>
                  <p>
                    中位数: {data.median.toFixed(2)} {unit}
                  </p>
                  <p>
                    Q25: {data.q25.toFixed(2)} {unit}
                  </p>
                  <p>
                    最小值: {data.min.toFixed(2)} {unit}
                  </p>
                  {data.outliers.length > 0 && (
                    <p className="mt-2 text-muted-foreground">离群点: {data.outliers.length} 个</p>
                  )}
                </div>
              </div>
            )
          }}
        />
        <Legend />

        {/* Render box plot elements */}
        {chartData.map((item, index) => (
          <g key={item.name}>
            {/* Box (Q25 to Q75) - using Bar for simplicity */}
            <Bar
              dataKey={() => item.q75 - item.q25}
              stackId={`stack-${index}`}
              fill={item.color}
              fillOpacity={0.6}
              stroke={item.color}
              strokeWidth={2}
            />

            {/* Median line - rendered as a thin bar on top of the box */}
            <Bar
              dataKey={() => 0}
              stackId={`median-${index}`}
              fill="none"
              stroke="#000"
              strokeWidth={3}
            />
          </g>
        ))}

        {/* Outliers as scatter points */}
        {chartData.flatMap((item, seriesIndex) =>
          item.outliers.map((outlier, outIndex) => (
            <Scatter
              key={`outlier-${seriesIndex}-${outIndex}`}
              data={[{ x: seriesIndex, y: outlier }]}
              fill={item.color}
              shape="circle"
            />
          )),
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

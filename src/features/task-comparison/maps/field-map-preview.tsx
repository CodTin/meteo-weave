import { useId } from 'react'
import {
  AnalysisContextCard,
  getVariableLabel,
} from '@/features/result-analysis/components/analysis-context-shared'
import type { ComparisonMapLegend, ComparisonMapPreview, ComparisonMapPreviewsReply } from './types'

const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 })
const statisticLabels = {
  instantaneous: '瞬时值',
  accumulation: '降水累计值',
  'daily-mean': '日均值',
}

function coordinate(value: number, axis: 'longitude' | 'latitude') {
  const hemisphere = axis === 'longitude' ? (value < 0 ? 'W' : 'E') : value < 0 ? 'S' : 'N'
  return `${number.format(Math.abs(value))}°${hemisphere}`
}

function color(value: number, legend: ComparisonMapLegend) {
  const fraction =
    legend.max === legend.min ? 0.5 : (value - legend.min) / (legend.max - legend.min)
  const position = Math.max(0, Math.min(1, fraction)) * (legend.colors.length - 1)
  const lower = Math.floor(position)
  const from = legend.colors[lower]!
  const to = legend.colors[Math.min(lower + 1, legend.colors.length - 1)]!
  const channels = [1, 3, 5].map((offset) => {
    const start = Number.parseInt(from.slice(offset, offset + 2), 16)
    const end = Number.parseInt(to.slice(offset, offset + 2), 16)
    return Math.round(start + (end - start) * (position - lower))
      .toString(16)
      .padStart(2, '0')
  })
  return `#${channels.join('')}`
}

type FieldMapPreviewProps = { preview: ComparisonMapPreview; position: 'A' | 'B' }

/** A coordinate scatter of actual public result samples, not a basemap or resampled field image. */
export function ComparisonFieldMapPreview({ preview, position }: FieldMapPreviewProps) {
  const id = useId()
  const titleId = `${id}-title`
  const descriptionId = `${id}-description`
  const gradientId = `${id}-scale`
  const { task, window, time } = preview
  const longitudeSpan = window.east - window.west
  const latitudeSpan = window.north - window.south
  // One equal unit per degree on both axes; each task keeps its own extent/aspect.
  const unitsPerDegree = 360 / Math.max(longitudeSpan, latitudeSpan)
  const width = longitudeSpan * unitsPerDegree
  const height = latitudeSpan * unitsPerDegree
  const left = 68
  const top = 20
  const svgWidth = left + width + 28
  const svgHeight = top + height + 64
  const xTicks = width < 140 ? [0.5] : [0, 0.5, 1]
  const yTicks = height < 100 ? [0.5] : [0, 0.5, 1]
  const finite = preview.ok
    ? preview.points.flatMap((point) => (point.value === null ? [] : [point.value]))
    : []
  const summary = finite.length
    ? {
        min: Math.min(...finite),
        max: Math.max(...finite),
        mean: finite.reduce((sum, value) => sum + value, 0) / finite.length,
      }
    : null

  return (
    <section
      className="min-w-0 space-y-4 rounded-lg border bg-card p-4"
      aria-label={`${position}：${task.name} 空间场预览`}
    >
      <h3 className="break-words font-semibold">
        {position} · {task.name}
      </h3>
      <AnalysisContextCard
        taskId={task.id}
        timeInfo={{ label: '预览时间片 (UTC)', value: time }}
        region={window}
        variable={getVariableLabel(task.configuration.variable)}
      />
      {!preview.ok ? (
        <output className="block text-sm text-muted-foreground">
          结果不可用：{preview.error} ({preview.code})
        </output>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {preview.result.quantity} · {statisticLabels[preview.result.temporalStatistic]} ·{' '}
            {preview.result.unit}
            {preview.result.ensemble?.kind === 'mean' && ' · 概率集合均值（逐点排除不可用成员）'}
          </p>
          {preview.result.variable === 'precipitation' && preview.result.values[0] && (
            <p className="break-words text-xs text-muted-foreground">
              首个样本累计区间 [{preview.result.values[0].accumulation.start},{' '}
              {preview.result.values[0].accumulation.end}) UTC ·
              {preview.result.values[0].accumulation.complete ? ' 完整' : ' 不完整'} ·
              {preview.result.values[0].accumulation.sampledHours}/
              {preview.result.values[0].accumulation.expectedHours} 小时；每个点的实际区间见点提示。
            </p>
          )}
          <p className="text-sm">
            有效 {preview.sampleCounts.valid} 点 · 缺失/非有限 {preview.sampleCounts.missing} 点 ·
            未返回 {preview.sampleCounts.omitted} 个抽样节点
          </p>
          {summary && (
            <p className="text-xs text-muted-foreground">
              仅当前有效抽样点：最小 {number.format(summary.min)} / 最大{' '}
              {number.format(summary.max)} / 均值 {number.format(summary.mean)}{' '}
              {preview.result.unit}（非全域统计）
            </p>
          )}
          <figure className="space-y-3">
            {/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Inline SVG needs an accessible image role; an img cannot contain sample geometry. */}
            <svg
              role="img"
              aria-labelledby={`${titleId} ${descriptionId}`}
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              width={svgWidth}
              height={svgHeight}
              preserveAspectRatio="xMidYMid meet"
              className="mx-auto block h-auto w-full"
              style={{ maxWidth: svgWidth }}
            >
              <title id={titleId}>
                {position} · {task.name} · 实际样本空间场 ({preview.result.unit})
              </title>
              <desc id={descriptionId}>
                经纬度等距 SVG 点位预览，非地理底图。经度 {window.west} 至 {window.east}，纬度{' '}
                {window.south} 至 {window.north}。 时间 {time} UTC，{preview.sampleCounts.valid}{' '}
                个有效点，缺失点以叉号表示；点间空白不插值、不补零。Synthetic Demo 合成结果。
              </desc>
              <rect
                x={left}
                y={top}
                width={width}
                height={height}
                fill="#f8fafc"
                stroke="#64748b"
              />
              {xTicks.map((fraction) => (
                <g key={fraction}>
                  <line
                    x1={left + fraction * width}
                    x2={left + fraction * width}
                    y1={top}
                    y2={top + height}
                    stroke="#cbd5e1"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={left + fraction * width}
                    y={top + height + 18}
                    textAnchor="middle"
                    fontSize="11"
                    fill="currentColor"
                  >
                    {coordinate(window.west + fraction * longitudeSpan, 'longitude')}
                  </text>
                </g>
              ))}
              {yTicks.map((fraction) => (
                <g key={fraction}>
                  <line
                    x1={left}
                    x2={left + width}
                    y1={top + (1 - fraction) * height}
                    y2={top + (1 - fraction) * height}
                    stroke="#cbd5e1"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={left - 8}
                    y={top + (1 - fraction) * height + 4}
                    textAnchor="end"
                    fontSize="11"
                    fill="currentColor"
                  >
                    {coordinate(window.south + fraction * latitudeSpan, 'latitude')}
                  </text>
                </g>
              ))}
              <text
                x={left + width / 2}
                y={top + height + 44}
                textAnchor="middle"
                fontSize="12"
                fill="currentColor"
              >
                经度 (°)
              </text>
              <text
                x="14"
                y={top + height / 2}
                textAnchor="middle"
                fontSize="12"
                fill="currentColor"
                transform={`rotate(-90 14 ${top + height / 2})`}
              >
                纬度 (°)
              </text>
              {preview.points.map((point, index) => {
                const x = left + (point.longitude - window.west) * unitsPerDegree
                const y = top + (window.north - point.latitude) * unitsPerDegree
                const sample = preview.result.values[index]
                const interval = sample && 'accumulation' in sample ? sample.accumulation : null
                const detail = `${coordinate(point.longitude, 'longitude')}, ${coordinate(point.latitude, 'latitude')} · ${point.time} UTC · ${point.value === null ? '缺失/非有限值（不是零）' : `${number.format(point.value)} ${preview.result.unit}`}${interval ? ` · 累计 [${interval.start}, ${interval.end}) ${interval.complete ? '完整' : '不完整'}` : ''}`
                return point.value === null || !preview.legend ? (
                  <g key={`${point.longitude}:${point.latitude}:${index}`}>
                    <title>{detail}</title>
                    <path
                      d={`M ${x - 3} ${y - 3} l 6 6 M ${x - 3} ${y + 3} l 6 -6`}
                      stroke="#64748b"
                      strokeWidth="1.5"
                    />
                  </g>
                ) : (
                  <circle
                    key={`${point.longitude}:${point.latitude}:${index}`}
                    cx={x}
                    cy={y}
                    r="3.5"
                    fill={color(point.value, preview.legend)}
                    stroke="#475569"
                    strokeWidth="0.6"
                  >
                    <title>{detail}</title>
                  </circle>
                )
              })}
            </svg>
            {/* oxlint-enable jsx-a11y/prefer-tag-over-role */}
            <figcaption className="break-words text-xs text-muted-foreground">
              本图范围：{coordinate(window.west, 'longitude')} –{' '}
              {coordinate(window.east, 'longitude')}，{coordinate(window.south, 'latitude')} –{' '}
              {coordinate(window.north, 'latitude')}。 EPSG:4326
              经纬度等距显示（不是地表等距投影），保留本任务范围与纵横比例；圆点是返回的实际样本，叉号是已知位置的缺失值。
            </figcaption>
          </figure>
          {preview.legend ? (
            <div
              className="space-y-1"
              aria-label={`绝对色阶 ${preview.legend.min} 至 ${preview.legend.max} ${preview.legend.unit}`}
            >
              <svg
                viewBox="0 0 300 14"
                width="300"
                height="14"
                className="block h-3.5 w-full"
                aria-hidden="true"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id={gradientId}>
                    {preview.legend.colors.map((entry, index) => (
                      <stop
                        key={entry}
                        offset={`${(index / (preview.legend!.colors.length - 1)) * 100}%`}
                        stopColor={entry}
                      />
                    ))}
                  </linearGradient>
                </defs>
                <rect width="300" height="14" fill={`url(#${gradientId})`} stroke="#64748b" />
              </svg>
              <div className="flex justify-between gap-2 text-xs">
                <span>
                  {number.format(preview.legend.min)} {preview.legend.unit}
                </span>
                <span>
                  {number.format(preview.legend.max)} {preview.legend.unit}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                绝对值色阶；{preview.legend.description}
              </p>
            </div>
          ) : (
            <output className="block text-sm text-muted-foreground">
              无有效数值样本，不生成零值色阶。
            </output>
          )}
          <p className="text-xs text-muted-foreground">
            Synthetic Demo 合成结果，非实际天气或真实模型推理；SVG
            仅绘制实际返回样本，非地图引擎/地理底图。
            {preview.result.grid.sampling === 'requested-points'
              ? '稀疏请求点位。'
              : `${preview.result.grid.sampling === 'decimated-grid' ? '原生逻辑网格抽稀预览' : '原生逻辑网格节点'}：抽样 ${preview.result.grid.returnedPoints}/${preview.result.grid.availablePoints} 个节点，步长 ${preview.result.grid.stride.columns} 列 × ${preview.result.grid.stride.rows} 行。`}
            点间留白不表示零值，不插值或扩展到另一任务的覆盖范围。
          </p>
        </>
      )}
    </section>
  )
}

/** Pure presentation: V owns loading, selected-time controls and route/lifecycle recovery. */
export function ComparisonFieldMaps({ data }: { data: ComparisonMapPreviewsReply }) {
  if (!data.ok)
    return (
      <p role="alert">
        对比地图不可用：{data.error} ({data.code})
      </p>
    )
  return (
    <section className="space-y-4" aria-label="双任务空间场预览">
      <div className="space-y-2 rounded-lg border p-4 text-sm">
        <h2 className="font-semibold">
          {data.scale.kind === 'shared' ? '共享绝对色阶' : '独立图例'}
        </h2>
        <p>{data.scale.explanation}</p>
        <p className="text-muted-foreground">
          Synthetic Demo：这里是真实读取的合成结果样本，不是实际天气资料或真实模型推理。SVG
          点位图不是地图引擎或地理底图；不依赖 Mapbox token 或外部资产。
        </p>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ComparisonFieldMapPreview preview={data.previews[0]} position="A" />
        <ComparisonFieldMapPreview preview={data.previews[1]} position="B" />
      </div>
    </section>
  )
}

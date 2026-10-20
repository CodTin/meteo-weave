import type { ResultMapDisplaySettings } from '../types/result-map'

export function ResultMapLegend({ display }: { display: ResultMapDisplaySettings }) {
  return (
    <div className="space-y-1 text-xs text-muted-foreground" aria-label="Map color legend">
      <div
        className="h-3 rounded-sm border"
        style={{ background: `linear-gradient(to right, ${display.colors.join(', ')})` }}
      />
      <div className="flex justify-between gap-2 font-mono">
        <span>
          {display.min.toFixed(2)} {display.unit}
        </span>
        <span>
          {display.max.toFixed(2)} {display.unit}
        </span>
      </div>
      <p>Color scale: {display.description}</p>
      <p>斜线：缺测（不是 0） · 深色间隙：预览未采样 · 色阶只改变显示，不改变科学值</p>
    </div>
  )
}

import {
  formatResultMapBound,
  resultMapRangeColors,
  resultSampleColor,
} from '../service/result-map-display'
import type { ResultMapDisplaySettings } from '../types/result-map'

export function ResultMapLegend({ display }: { display: ResultMapDisplaySettings }) {
  const empty = display.domain === 'empty'
  const constant = display.domain === 'constant'
  const zero = display.kind === 'difference' && display.min <= 0 && display.max >= 0
  const colors = constant
    ? [resultSampleColor(display.dataMin ?? display.min, display)]
    : resultMapRangeColors(display)
  return (
    <fieldset
      className="min-w-0 space-y-2 text-xs text-muted-foreground"
      aria-label="Map color legend"
    >
      {empty ? (
        <p>No finite values · no numeric color scale.</p>
      ) : (
        <>
          <div className="flex h-3 overflow-hidden rounded-sm border" aria-hidden="true">
            {colors.map((color, index) => (
              <span key={index} className="flex-1" style={{ backgroundColor: color }} />
            ))}
          </div>
          <div className="flex flex-wrap justify-between gap-2 font-mono">
            <span>
              {formatResultMapBound(constant ? (display.dataMin ?? display.min) : display.min)}{' '}
              {display.unit}
            </span>
            {!constant && zero && display.min < 0 && display.max > 0 && (
              <span>0 {display.unit}</span>
            )}
            {!constant && (
              <span>
                {formatResultMapBound(display.max)} {display.unit}
              </span>
            )}
          </div>
          {constant && (
            <p>
              Constant field · {formatResultMapBound(display.dataMin ?? display.min)} {display.unit}{' '}
              · one color, no invented variation.
            </p>
          )}
        </>
      )}
      <p>
        Color scale: {display.description} ·{' '}
        {display.mode === 'manual' ? 'Manual range' : 'Automatic range'}
      </p>
      <p className="break-words">{display.basis}</p>
      {display.dataMin !== undefined && display.dataMax !== undefined && (
        <p>
          Actual finite data bounds: {formatResultMapBound(display.dataMin)}–
          {formatResultMapBound(display.dataMax)} {display.unit}.
        </p>
      )}
      {display.kind === 'difference' && (
        <p>
          Zero: 0 {display.unit}
          {!empty && !zero ? ' (outside display range)' : ''} · Negative (blue): downscaled lower ·
          Positive (red): downscaled higher · Downscaled − Original, not accuracy improvement
          {display.symmetricZero ? ' · symmetric around zero' : ''}.
        </p>
      )}
      {display.mode === 'manual' && (
        <p>
          Below lower boundary ({formatResultMapBound(display.min)} {display.unit}): saturated at
          the low endpoint color. Above upper boundary ({formatResultMapBound(display.max)}{' '}
          {display.unit}): saturated at the high endpoint color. True scientific values are not
          clipped.
        </p>
      )}
      <p>
        <span
          aria-hidden="true"
          className="mr-1 inline-block h-3 w-5 rounded-sm border"
          style={{
            background: 'repeating-linear-gradient(135deg, #475569 0 3px, #cbd5e1 3px 4px)',
          }}
        />
        斜线：缺测（不是 0） · 灰色：非有限值 / missing or nonfinite, not zero.
      </p>
      <p>
        {display.finiteCount ?? '—'} finite · {display.missingCount ?? '—'} missing ·{' '}
        {display.nonfiniteCount ?? '—'} nonfinite. 深色间隙：预览未采样 ·
        色阶只改变显示，不改变科学值
      </p>
    </fieldset>
  )
}

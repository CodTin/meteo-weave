import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatResultMapBound } from '../service/result-map-display'
import type { ResultMapDisplaySettings } from '../types/result-map'
import type { ResultMapRangeInput } from '../service/result-map-display-validation'

interface ResultMapRangeControlsProps {
  display: ResultMapDisplaySettings
  onApply: (input: ResultMapRangeInput) => { ok: true } | { ok: false; error: string }
  onAutomatic: () => void
}

/** Drafts are not active settings: only the common public validator can accept them. */
export function ResultMapRangeControls({
  display,
  onApply,
  onAutomatic,
}: ResultMapRangeControlsProps) {
  const id = useId()
  const [manual, setManual] = useState(display.mode === 'manual')
  const [min, setMin] = useState(formatResultMapBound(display.min))
  const [max, setMax] = useState(formatResultMapBound(display.max))
  const [symmetricZero, setSymmetricZero] = useState(display.symmetricZero === true)
  const [error, setError] = useState<string>()
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const result = onApply({ min, max, symmetricZero })
        setError(result.ok ? undefined : result.error)
      }}
    >
      <fieldset className="min-w-0 space-y-3 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">{display.groupLabel}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <label className="flex min-h-9 items-center gap-2">
            <input
              type="radio"
              name={`${id}-mode`}
              checked={!manual}
              onChange={() => {
                setManual(false)
                setError(undefined)
                onAutomatic()
              }}
            />
            Automatic range
          </label>
          <label className="flex min-h-9 items-center gap-2">
            <input
              type="radio"
              name={`${id}-mode`}
              checked={manual}
              onChange={() => {
                setManual(true)
                setMin(formatResultMapBound(display.min))
                setMax(formatResultMapBound(display.max))
              }}
            />
            Manual range
          </label>
        </div>
        {manual && (
          <>
            <div className="grid min-w-0 grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor={`${id}-min`}>Minimum ({display.unit})</Label>
                <Input
                  id={`${id}-min`}
                  type="text"
                  inputMode="decimal"
                  value={min}
                  onChange={(event) => setMin(event.target.value)}
                  aria-invalid={Boolean(error)}
                  aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${id}-max`}>Maximum ({display.unit})</Label>
                <Input
                  id={`${id}-max`}
                  type="text"
                  inputMode="decimal"
                  value={max}
                  onChange={(event) => setMax(event.target.value)}
                  aria-invalid={Boolean(error)}
                  aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
                />
              </div>
            </div>
            {display.kind === 'difference' && (
              <label className="flex min-h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={symmetricZero}
                  onChange={(event) => setSymmetricZero(event.target.checked)}
                />
                Symmetric around zero
              </label>
            )}
            <Button type="submit" size="sm">
              Apply range
            </Button>
          </>
        )}
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          Finite minimum &lt; maximum{display.nonnegative ? ' · minimum ≥ 0' : ''}. Only Apply
          changes the active mapping; invalid edits retain the previous valid range.
        </p>
        {error && (
          <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <p className="break-words text-xs text-muted-foreground">
          Active: {display.mode === 'manual' ? 'Manual' : 'Automatic'}
          {display.domain === 'empty'
            ? ' · no finite values'
            : ` · ${formatResultMapBound(display.min)}–${formatResultMapBound(display.max)} ${display.unit}`}
          .
        </p>
      </fieldset>
    </form>
  )
}

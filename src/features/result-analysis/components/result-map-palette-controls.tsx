import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ResultMapDisplaySettings } from '../types/result-map'
import type { ResultMapPaletteInput } from '../service/result-map-display-validation'

interface ResultMapPaletteControlsProps {
  display: ResultMapDisplaySettings
  onApply: (input: ResultMapPaletteInput) => { ok: true } | { ok: false; error: string }
  onRestore: () => void
}

/** A bounded custom draft is separate from the complete immutable project standard. */
export function ResultMapPaletteControls({
  display,
  onApply,
  onRestore,
}: ResultMapPaletteControlsProps) {
  const id = useId()
  const [editing, setEditing] = useState(false)
  const [stops, setStops] = useState<{ position: string; color: string }[]>([])
  const [error, setError] = useState<string>()
  const firstPosition = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editing) firstPosition.current?.focus()
  }, [editing])
  const label = display.groupLabel?.replace(/range$/, 'palette') ?? 'Map palette'
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const result = onApply(stops)
        setError(result.ok ? undefined : result.error)
      }}
    >
      <fieldset className="min-w-0 space-y-3 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">{label}</legend>
        <p className="text-xs text-muted-foreground">
          Active:{' '}
          {display.colorStops
            ? 'Custom palette'
            : `Project standard · ${display.colors.length} colors`}{' '}
          · {display.description}
        </p>
        <div className="flex flex-wrap gap-2">
          {!editing && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const draft = display.colorStops ?? [
                  { position: 0, color: display.colors[0]! },
                  { position: 0.5, color: display.colors[Math.floor(display.colors.length / 2)]! },
                  { position: 1, color: display.colors[display.colors.length - 1]! },
                ]
                setStops(
                  draft.map((stop) => ({ position: String(stop.position), color: stop.color })),
                )
                setEditing(true)
                setError(undefined)
              }}
            >
              Edit custom palette
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              onRestore()
              setEditing(false)
              setStops([])
              setError(undefined)
            }}
          >
            Restore standard palette
          </Button>
        </div>
        {editing && (
          <>
            <p className="text-xs text-muted-foreground">
              Custom draft · not the full project standard. Only Apply changes active colors.
            </p>
            {stops.map((stop, index) => (
              <div key={index} className="grid min-w-0 grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor={`${id}-position-${index}`}>Position {index + 1} (0–1)</Label>
                  <Input
                    ref={index === 0 ? firstPosition : undefined}
                    id={`${id}-position-${index}`}
                    type="text"
                    inputMode="decimal"
                    value={stop.position}
                    onChange={(event) =>
                      setStops((current) =>
                        current.map((item, i) =>
                          i === index ? { ...item, position: event.target.value } : item,
                        ),
                      )
                    }
                    aria-invalid={Boolean(error)}
                    aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${id}-color-${index}`}>Color {index + 1} (#RRGGBB)</Label>
                  <Input
                    id={`${id}-color-${index}`}
                    type="text"
                    value={stop.color}
                    spellCheck={false}
                    onChange={(event) =>
                      setStops((current) =>
                        current.map((item, i) =>
                          i === index ? { ...item, color: event.target.value } : item,
                        ),
                      )
                    }
                    aria-invalid={Boolean(error)}
                    aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
                  />
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={stops.length >= 5}
                onClick={() =>
                  setStops((current) => {
                    const left = current[current.length - 2]!
                    const last = current[current.length - 1]!
                    return [
                      ...current.slice(0, -1),
                      {
                        position: String((Number(left.position) + Number(last.position)) / 2),
                        color: left.color,
                      },
                      last,
                    ]
                  })
                }
              >
                Add stop
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={stops.length <= 3}
                onClick={() =>
                  setStops((current) =>
                    current.filter((_stop, index) => index !== current.length - 2),
                  )
                }
              >
                Remove last interior stop
              </Button>
              <Button type="submit" size="sm">
                Apply palette
              </Button>
            </div>
          </>
        )}
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          3–5 color stops · finite positions strictly increasing from exactly 0 to 1 · #RRGGBB, six
          hex digits, no alpha. Invalid drafts retain the last valid colors; no silent sorting.
          Restore changes only colors, not range, frame or point.
          {display.kind === 'difference' &&
            ' Difference: position 0.5 represents numeric zero; negative and positive meanings do not depend on hue.'}
        </p>
        {error && (
          <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </fieldset>
    </form>
  )
}

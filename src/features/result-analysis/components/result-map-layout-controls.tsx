import type { Ref } from 'react'
import { Button } from '@/components/ui/button'
import type { ResultMapComparisonLayout, ResultMapLayout } from '../types/result-map-layout'
import { resultMapTitles } from '../service/result-map-display'

interface ResultMapLayoutControlsProps {
  layout: ResultMapLayout
  onSelect: (mode: ResultMapComparisonLayout) => void
  onReturn: () => void
  returnButton: Ref<HTMLButtonElement>
}

export function ResultMapLayoutControls({
  layout,
  onSelect,
  onReturn,
  returnButton,
}: ResultMapLayoutControlsProps) {
  return (
    <fieldset className="min-w-0 space-y-2 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">Map layout controls</legend>
      <output aria-label="Map layout" className="block break-words text-sm" aria-live="polite">
        {layout.mode === 'single'
          ? `Single map · ${resultMapTitles[layout.kind]}`
          : `${layout.mode} comparison`}
      </output>
      <div className="flex flex-wrap gap-2">
        {layout.mode === 'single' ? (
          <Button ref={returnButton} type="button" variant="outline" onClick={onReturn}>
            Return to {layout.returnTo} comparison
          </Button>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={layout.mode === '2×2'}
              onClick={() => onSelect('2×2')}
            >
              2×2
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={layout.mode === '1×4'}
              onClick={() => onSelect('1×4')}
            >
              1×4 wide
            </Button>
          </>
        )}
      </div>
      {layout.mode === '1×4' && (
        <p className="text-xs text-muted-foreground @min-[1024px]:hidden">
          1×4 wide is unavailable at this width. Maps use a readable column; widen the result area
          to show all four in one row.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Layout changes presentation only. Cameras, current frame, point, ranges and palettes stay
        unchanged. On narrow screens the comparison uses a readable column.
      </p>
    </fieldset>
  )
}

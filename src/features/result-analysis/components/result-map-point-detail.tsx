import { Button } from '@/components/ui/button'
import { calculateResultMapPointImprovement } from '../service/result-map-point-improvement'
import { useResultMapPointContext } from './result-map-point-context'
import { ResultMapPointValues } from './result-map-point-values'

export function ResultMapPointDetail({ id }: { id?: string }) {
  const context = useResultMapPointContext()
  if (!context?.pinnedPoint) return null
  const { task, selection, pinnedPoint, pinnedQuery, retryPinned } = context
  const result = pinnedQuery.status === 'ready' ? pinnedQuery.result : null
  const improvement = result ? calculateResultMapPointImprovement(result) : null
  const failed = result && Object.values(result.values).some((value) => value.status === 'error')
  return (
    <section
      id={id}
      aria-label="Pinned point detail"
      className="min-w-0 space-y-3 rounded-md border p-4"
    >
      <h3 className="font-semibold">Pinned point detail · Synthetic Demo</h3>
      <output aria-label="Pinned coordinate" className="block break-all font-mono text-sm">
        longitude {pinnedPoint.longitude} · latitude {pinnedPoint.latitude} · EPSG:4326
      </output>
      <output aria-label="Pinned task" className="block break-words text-sm">
        Task {task.name} · {task.id}
      </output>
      <output aria-label="Pinned frame" className="block break-all font-mono text-sm">
        {new Date(selection.time).toISOString()} · UTC · {selection.observationMode}
        {selection.ensemble && ` · ${selection.ensemble.kind}`}
      </output>
      {result ? (
        <>
          {failed && (
            <div role="alert">
              <p>Current pinned query failed; unavailable values are not previous-frame values.</p>
              <Button variant="outline" onClick={retryPinned}>
                Retry pinned query
              </Button>
            </div>
          )}
          <ResultMapPointValues result={result} />
          <section
            aria-label="Reference-error improvement"
            className="space-y-2 rounded-md border p-3 text-sm"
          >
            <h4 className="font-semibold">Local reference-error improvement</h4>
            {improvement?.status === 'available' ? (
              <>
                <output aria-label="Local error improvement" className="block font-mono">
                  {(improvement.fraction * 100).toFixed(4)}%
                </output>
                <p className="break-words">
                  {improvement.referenceType === 'interpolated-synthetic-reference'
                    ? 'Interpolated-reference improvement; evaluated synthetic reference, not measured-station validation.'
                    : 'Colocated synthetic-station reference-error improvement; not measured validation.'}
                </p>
                <p className="font-mono">
                  Absolute error: Original {Number(improvement.originalAbsoluteError.toFixed(4))}{' '}
                  {improvement.unit}
                  {' → '}Downscaled {Number(improvement.downscaledAbsoluteError.toFixed(4))}{' '}
                  {improvement.unit}
                </p>
              </>
            ) : (
              <output aria-label="Local error improvement" className="block break-words">
                Unavailable · {improvement?.code}: {improvement?.reason}
              </output>
            )}
            <p className="break-words text-muted-foreground">
              (|Original − Reference| − |Downscaled − Reference|) / |Original − Reference|. Negative
              means larger error. Difference is Downscaled − Original, not accuracy improvement.
            </p>
          </section>
        </>
      ) : (
        <output aria-label="Pinned query pending" aria-live="polite" className="block text-sm">
          Reading the pinned coordinate in the current frame and mode… Previous values are not
          shown.
        </output>
      )}
      <p className="text-sm text-muted-foreground">
        Synthetic Demo · synthetic reference; not evidence of real model skill.
      </p>
    </section>
  )
}

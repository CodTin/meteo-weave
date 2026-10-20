import type { ResultMapData } from '../types/result-map'
import { useResultMapDisplay } from '../hooks/use-result-map-display'
import { ResultMapGrid } from './result-map-grid'
import { ResultMapRangeControls } from './result-map-range-controls'

type ResultMapDisplayGroupProps = { data: ResultMapData; onRetry: () => void }

/** Task identity resets page-only preferences; data/frame object identity never does. */
export function ResultMapDisplayGroup(props: ResultMapDisplayGroupProps) {
  return <TaskMapDisplayGroup key={props.data.taskId} {...props} />
}

function TaskMapDisplayGroup({ data, onRetry }: ResultMapDisplayGroupProps) {
  const { display, applyRange, restoreAutomatic } = useResultMapDisplay(data)
  const groups = new Set<string>()
  const controls = (['original', 'downscaled', 'observation', 'difference'] as const).filter(
    (kind) => {
      const group = display[kind].rangeGroup!
      if (groups.has(group)) return false
      groups.add(group)
      return true
    },
  )
  return (
    <div className="min-w-0 space-y-4">
      <section aria-label="Map display ranges" className="space-y-3">
        <h3 className="text-sm font-medium">色阶范围 / Map display ranges</h3>
        <p className="text-xs text-muted-foreground">
          Result-page UI only · no changes to task configuration, seed, scientific values, metrics
          or exports.
        </p>
        <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
          {controls.map((kind) => (
            <ResultMapRangeControls
              key={display[kind].rangeGroup}
              display={display[kind]}
              onApply={(input) => applyRange(kind, input)}
              onAutomatic={() => restoreAutomatic(kind)}
            />
          ))}
        </div>
      </section>
      <ResultMapGrid key={data.taskId} data={data} display={display} onRetry={onRetry} />
    </div>
  )
}

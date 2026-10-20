import type { ResultMapData } from '../types/result-map'
import { useResultMapDisplay } from '../hooks/use-result-map-display'
import { ResultMapGrid } from './result-map-grid'

/** Presentation composition stays independent of selection/query and camera ownership. */
export function ResultMapDisplayGroup({
  data,
  onRetry,
}: {
  data: ResultMapData
  onRetry: () => void
}) {
  const display = useResultMapDisplay(data)
  return <ResultMapGrid key={data.taskId} data={data} display={display} onRetry={onRetry} />
}

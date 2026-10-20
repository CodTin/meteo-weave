import { useEffect, useRef, useState } from 'react'
import type { DownscalingTask, ResultPoint } from '@/features/downscaling-tasks/service/contracts'
import type { ResultMapSelection, ResultMapSource } from '../service/result-map-data'
import { readResultMapPointQuery } from '../service/result-map-point-query'
import type { ResultMapPointQueryState } from '../types/result-map-point'

type PointRead = {
  key: string
  source: ResultMapSource
  task: DownscalingTask
  selection: ResultMapSelection
  point: ResultPoint
}

/** At most one joint read in flight and one replaceable latest slot, even across context changes. */
export function useResultMapPointQuery(
  source: ResultMapSource,
  task: DownscalingTask,
  selection: ResultMapSelection,
  point: ResultPoint | null,
) {
  const [reload, setReload] = useState(0)
  const key = JSON.stringify([task, selection, point, reload])
  const [snapshot, setSnapshot] = useState<{
    key: string
    source: ResultMapSource
    state: ResultMapPointQueryState
  }>()
  const running = useRef(false)
  const latest = useRef<PointRead | null>(null)
  const queued = useRef<PointRead | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const job = point ? { key, source, task, selection, point } : null
    latest.current = job
    queued.current = job
    if (timer.current) clearTimeout(timer.current)
    const schedule = () => {
      if (running.current || !queued.current) return
      timer.current = setTimeout(() => {
        timer.current = null
        const next = queued.current
        if (!next) return
        queued.current = null
        running.current = true
        void readResultMapPointQuery(next.source, next.task, next.selection, next.point)
          .then((result) => {
            if (latest.current === next)
              setSnapshot({
                key: next.key,
                source: next.source,
                state: { status: 'ready', result },
              })
          })
          .finally(() => {
            running.current = false
            schedule()
          })
      }, 80)
    }
    schedule()
    return () => {
      if (latest.current === job) latest.current = null
      queued.current = null
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
    }
    // key owns the immutable scientific identity; queued jobs are snapshots, not unstable caller objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, key])
  const state: ResultMapPointQueryState = !point
    ? { status: 'idle' }
    : snapshot?.key === key && snapshot.source === source
      ? snapshot.state
      : { status: 'pending' }
  return {
    state,
    retry: () => {
      setSnapshot(undefined)
      setReload((value) => value + 1)
    },
  }
}

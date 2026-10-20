import { useEffect, useState } from 'react'
import type { DownscalingTask } from '@/features/downscaling-tasks/service'
import {
  readResultMapData,
  type ResultMapSource,
  type ResultMapSelection,
} from '../service/result-map-data'
import type { ResultMapData } from '../types/result-map'

/** Latest selection wins; old task/frame/member results are never presented as current. */
export function useResultMapData(
  source: ResultMapSource,
  task: DownscalingTask,
  selection: ResultMapSelection,
) {
  const key = JSON.stringify([task, selection])
  const [reload, setReload] = useState(0)
  const [snapshot, setSnapshot] = useState<{ key: string; data?: ResultMapData; error?: string }>()
  useEffect(() => {
    let active = true
    setSnapshot({ key })
    void readResultMapData(source, task, selection).then(
      (data) => {
        if (active) setSnapshot({ key, data })
      },
      (error) => {
        if (active)
          setSnapshot({
            key,
            error: error instanceof Error ? error.message : 'Result data read failed.',
          })
      },
    )
    return () => {
      active = false
    }
    // key owns the complete immutable task/selection, avoiding unstable caller object identities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, key, reload])
  return {
    data: snapshot?.key === key ? snapshot.data : undefined,
    error: snapshot?.key === key ? snapshot.error : undefined,
    retry: () => {
      setSnapshot(undefined)
      setReload((value) => value + 1)
    },
  }
}

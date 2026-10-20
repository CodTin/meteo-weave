import { useState } from 'react'
import type { ResultMapData } from '../types/result-map'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { DownscalingTask } from '@/features/downscaling-tasks/service'
import type { ResultMapSource } from '../service/result-map-data'
import { useWorkspaceMapSource } from '../hooks/use-workspace-map-source'
import { useResultMapData } from '../hooks/use-result-map-data'
import { useObservationViewMode } from '../hooks/use-observation-view-mode'
import { useEnsembleSelection } from '../hooks/use-ensemble-selection'
import { ObservationViewToggle } from './observation-view-toggle'
import { EnsembleSwitcher } from './ensemble-switcher'
import { ComparisonInfoCard } from './comparison-info-card'
import { ResultMapDisplayGroup } from './result-map-display-group'
import { ResultMapPointProvider } from './result-map-point-context'
import { ResultMapPointQuery } from './result-map-point-query'

interface MapComparisonPanelProps {
  task: DownscalingTask
  timeSlice: string
  /** Environmental public result transport, also used by component callers. */
  source?: ResultMapSource
}

export function MapComparisonPanel(props: MapComparisonPanelProps) {
  return props.source ? (
    <MapComparisonContent
      key={`${props.task.ownerId}:${props.task.id}`}
      {...props}
      source={props.source}
    />
  ) : (
    <WorkspaceMapComparison {...props} />
  )
}

function WorkspaceMapComparison(props: MapComparisonPanelProps) {
  const source = useWorkspaceMapSource()
  return (
    <MapComparisonContent
      key={`${props.task.ownerId}:${props.task.id}`}
      {...props}
      source={source}
    />
  )
}

function MapComparisonContent({
  task,
  timeSlice,
  source,
}: MapComparisonPanelProps & { source: ResultMapSource }) {
  const { mode, toggle } = useObservationViewMode()
  const { view, selectView } = useEnsembleSelection()
  const probabilistic = task.configuration.resolvedMethod === 'probabilistic'
  const ensemble = probabilistic
    ? view === 'mean' || view === 'stddev'
      ? ({ kind: view } as const)
      : { kind: 'members' as const, memberIds: [view] }
    : undefined
  const selection = {
    time: timeSlice,
    observationMode: mode === 'station' ? ('stations' as const) : ('interpolated' as const),
    ensemble,
  }
  const { data, error, retry } = useResultMapData(source, task, selection)
  const [retainedData, setRetainedData] = useState<ResultMapData>()
  if (data && data !== retainedData) setRetainedData(data)
  const presentationData = data ?? retainedData
  const memberIds = Array.from(
    { length: task.configuration.advanced?.ensembleMembers ?? 10 },
    (_, index) => `member-${String(index + 1).padStart(2, '0')}`,
  )
  return (
    <ResultMapPointProvider source={source} task={task} selection={selection}>
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm text-muted-foreground">
              Synthetic Demo ·
              使用当前任务公开结果；模型来源只是配置标签，不是真实资料、观测或推理。地图仅显示样本，不补齐预览间隙。
            </p>
            <ObservationViewToggle mode={mode} onToggle={toggle} />
            {probabilistic && (
              <EnsembleSwitcher view={view} onViewChange={selectView} allMemberIds={memberIds} />
            )}
            <output aria-label="Map frame" className="block break-all font-mono text-xs">
              {new Date(timeSlice).toISOString()} · UTC
            </output>
          </CardContent>
        </Card>
        {error ? (
          <div role="alert" className="rounded-md border p-4">
            <p>读取失败：{error}</p>
            <Button onClick={retry}>重试地图读取</Button>
          </div>
        ) : (
          !data && (
            <output aria-label="Map data loading" className="block rounded-md border p-6">
              正在读取当前帧地图数据… 上一帧科学内容已隐藏；保留同任务镜头与显示偏好。
            </output>
          )
        )}
        {presentationData && (
          <div hidden={!data} inert={!data} aria-hidden={!data}>
            <ResultMapDisplayGroup data={presentationData} onRetry={retry} />
          </div>
        )}
        <ResultMapPointQuery />
        {task.configuration.variable === 'wind' && (
          <p className="text-sm text-muted-foreground">
            Wind Speed · m/s · U10/V10 · Meteorological from-direction (0° N, 90° E). Arrows point
            toward the flow direction. Calm wind is valid zero with no arrow; missing components are
            not zero. Mean U10/V10 are averaged before speed; directions are never averaged.
            Difference is speed only.
          </p>
        )}
        <ComparisonInfoCard
          taskId={task.id}
          timeSlice={timeSlice}
          region={task.configuration.region}
          variable={task.configuration.variable}
        />
      </div>
    </ResultMapPointProvider>
  )
}

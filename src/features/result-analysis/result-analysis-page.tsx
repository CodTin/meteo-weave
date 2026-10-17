import { useState } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { AnalysisTabs, TabPanel, type AnalysisTab } from './components/analysis-tabs'
import { MapComparisonPanel } from './components/map-comparison-panel'
import { WindMapComparisonPanel } from './components/wind-map-comparison-panel'
import { TimeSliceSelector } from './components/time-slice-selector'
import { AccuracyPanel } from './components/accuracy-panel'
import { TimeSeriesPanel } from './components/time-series-panel'
import { ElevationGroupingPanel } from './components/elevation-grouping-panel'
import { useTimeSlice } from './hooks/use-time-slice'
import { useTaskLoader } from '@/features/downscaling-tasks/hooks/use-task-loader'
import { createServerFn } from '@tanstack/react-start'
import { getElevationGroupingData } from '@/server/services/elevation-grouping.server'
import { useQuery } from '@tanstack/react-query'
import { TaskLoadingState } from '@/features/downscaling-tasks/components/task-loading-state'
import { TaskErrorState } from '@/features/downscaling-tasks/components/task-error-state'
import { getVariableLabel, type Variable } from './service/color-scales'

const getElevationGroupingDataFn = createServerFn({ method: 'GET' })
  .validator((data: string) => data)
  .handler(({ data }) => getElevationGroupingData(data))

export function ResultAnalysisPage() {
  const { taskId } = useParams({ from: '/_workspace/tasks/$taskId/result' })
  const navigate = useNavigate()
  const search = useSearch({ from: '/_workspace/tasks/$taskId/result' })
  const [activeTab, setActiveTab] = useState<AnalysisTab>((search as any)?.tab || 'map-comparison')

  const { task, loading, error } = useTaskLoader({ taskId })

  // Time slice management
  const timeSliceState = useTimeSlice({
    taskId,
    timeRange: task?.configuration.timeRange || { start: '', end: '' },
    initialTime: task?.configuration.timeRange.start,
    granularity: 'hourly',
  })

  if (loading) {
    return <TaskLoadingState message="加载结果分析中..." />
  }

  if (error) {
    return (
      <TaskErrorState
        error={error}
        actionLabel="返回任务列表"
        actionIcon={<ArrowLeft className="mr-2 size-4" />}
        onAction={() => navigate({ to: '/tasks' })}
      />
    )
  }

  if (!task) {
    return null
  }

  // Check if task is completed
  if (task.status !== 'Completed') {
    return (
      <TaskErrorState
        error={`任务尚未完成（当前状态：${task.status === 'Running' ? '运行中' : '失败'}）`}
        actionLabel="返回任务列表"
        actionIcon={<ArrowLeft className="mr-2 size-4" />}
        onAction={() => navigate({ to: '/tasks' })}
      />
    )
  }

  const handleTabChange = (tab: AnalysisTab) => {
    setActiveTab(tab)
    navigate({
      to: '/tasks/$taskId/result',
      params: { taskId },
      search: { tab },
    })
  }

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const variable = task.configuration.variable as Variable

  // Load elevation grouping data for spatial analysis tab
  const elevationGroupingQuery = useQuery({
    queryKey: ['elevation-grouping', taskId],
    queryFn: () => getElevationGroupingDataFn({ data: taskId }),
    enabled: activeTab === 'spatial',
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">结果分析</h1>
        <Button variant="outline" onClick={() => navigate({ to: '/tasks' })}>
          <ArrowLeft className="mr-2 size-4" />
          返回
        </Button>
      </div>

      {/* Task Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>{task.name}</CardTitle>
          <CardDescription>
            {task.catalog?.label || 'Synthetic Demo'} · 创建于 {formatDate(task.createdAt)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">数据源</dt>
              <dd className="font-medium">
                {task.configuration.dataSource === 'fusion'
                  ? 'Fusion'
                  : task.configuration.dataSource.toUpperCase()}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">变量</dt>
              <dd className="font-medium">{getVariableLabel(variable)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">分辨率</dt>
              <dd className="font-medium">{task.configuration.resolution}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">方法</dt>
              <dd className="font-medium">
                {task.configuration.resolvedMethod === 'deterministic' ? '确定性' : '概率式'}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Time Slice Selector */}
      <Card>
        <CardContent className="pt-6">
          <TimeSliceSelector
            timeSlices={timeSliceState.timeSlices}
            currentTime={timeSliceState.currentTime}
            onTimeChange={timeSliceState.setTime}
            timezone="UTC"
          />
        </CardContent>
      </Card>

      {/* Analysis Tabs */}
      <AnalysisTabs activeTab={activeTab} onTabChange={handleTabChange}>
        <TabPanel value="map-comparison">
          {variable === 'wind' ? (
            <WindMapComparisonPanel
              taskId={task.id}
              region={task.configuration.region}
              timeSlice={timeSliceState.currentTime}
              requestId={timeSliceState.requestId}
            />
          ) : (
            <MapComparisonPanel
              taskId={task.id}
              variable={variable}
              region={task.configuration.region}
              timeSlice={timeSliceState.currentTime}
              requestId={timeSliceState.requestId}
            />
          )}
        </TabPanel>

        <TabPanel value="accuracy">
          <AccuracyPanel
            taskId={task.id}
            variable={variable}
            timeRange={task.configuration.timeRange}
            region={task.configuration.region}
          />
        </TabPanel>

        <TabPanel value="time-series">
          <TimeSeriesPanel task={task} />
        </TabPanel>

        <TabPanel value="spatial">
          {elevationGroupingQuery.isLoading ? (
            <Card>
              <CardHeader>
                <CardTitle>空间分析</CardTitle>
                <CardDescription>加载中...</CardDescription>
              </CardHeader>
            </Card>
          ) : elevationGroupingQuery.error ? (
            <Card>
              <CardHeader>
                <CardTitle>空间分析</CardTitle>
                <CardDescription>加载失败</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {elevationGroupingQuery.error instanceof Error
                    ? elevationGroupingQuery.error.message
                    : '未知错误'}
                </p>
              </CardContent>
            </Card>
          ) : elevationGroupingQuery.data?.ok && elevationGroupingQuery.data.data ? (
            <ElevationGroupingPanel data={elevationGroupingQuery.data.data} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>空间分析</CardTitle>
                <CardDescription>无数据</CardDescription>
              </CardHeader>
            </Card>
          )}
        </TabPanel>

        <TabPanel value="export">
          <Card>
            <CardHeader>
              <CardTitle>数据导出</CardTitle>
              <CardDescription>待交付</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                数据导出功能将在后续版本提供，支持 CSV、GeoJSON、NetCDF 格式。
              </p>
            </CardContent>
          </Card>
        </TabPanel>
      </AnalysisTabs>
    </div>
  )
}

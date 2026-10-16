import { useState } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { AnalysisTabs, TabPanel, type AnalysisTab } from './components/analysis-tabs'
import { MapComparisonPanel } from './components/map-comparison-panel'
import { WindMapComparisonPanel } from './components/wind-map-comparison-panel'
import { AccuracyAssessmentPanel } from './components/accuracy-assessment-panel'
import { TimeSliceSelector } from './components/time-slice-selector'
import { useTimeSlice } from './hooks/use-time-slice'
import { useTaskLoader } from '@/features/downscaling-tasks/hooks/use-task-loader'
import { TaskLoadingState } from '@/features/downscaling-tasks/components/task-loading-state'
import { TaskErrorState } from '@/features/downscaling-tasks/components/task-error-state'
import { getVariableLabel, type Variable } from './service/color-scales'

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
          <AccuracyAssessmentPanel
            data={{
              available: false,
              reason: '精度评估数据加载功能正在开发中',
            }}
            variable={variable}
          />
        </TabPanel>

        <TabPanel value="time-series">
          <Card>
            <CardHeader>
              <CardTitle>时间序列</CardTitle>
              <CardDescription>待交付</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                时间序列分析功能将在后续版本提供，展示特定点位的时间演变对比。
              </p>
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value="spatial">
          <Card>
            <CardHeader>
              <CardTitle>空间分析</CardTitle>
              <CardDescription>待交付</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                空间分析功能将在后续版本提供，包括相关性分布、功率谱等分析。
              </p>
            </CardContent>
          </Card>
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

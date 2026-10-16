import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { createTaskService, type DownscalingTask } from '@/features/downscaling-tasks/service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, ArrowLeft, XCircle } from 'lucide-react'
import { AnalysisTabs, TabPanel, type AnalysisTab } from './components/analysis-tabs'

export function ResultAnalysisPage() {
  const { taskId } = useParams({ from: '/_workspace/tasks/$taskId/result' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const search = useSearch({ from: '/_workspace/tasks/$taskId/result' })
  const [task, setTask] = useState<DownscalingTask | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<AnalysisTab>((search as any)?.tab || 'map-comparison')

  useEffect(() => {
    let mounted = true
    const taskService = createTaskService({ queryClient })

    const loadTask = async () => {
      try {
        await taskService.initialize()
        const result = await taskService.get(taskId)

        if (!mounted) return

        if (!result.ok) {
          setError(result.error)
          setLoading(false)
          return
        }

        // Check if task is completed
        if (result.task.status !== 'Completed') {
          setError(
            `任务尚未完成（当前状态：${result.task.status === 'Running' ? '运行中' : '失败'}）`,
          )
          setLoading(false)
          return
        }

        setTask(result.task)
        setLoading(false)
      } catch (err) {
        if (!mounted) return
        setError(err instanceof Error ? err.message : '加载任务失败')
        setLoading(false)
      }
    }

    loadTask()

    return () => {
      mounted = false
      taskService.close()
    }
  }, [taskId, queryClient])

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">加载结果分析中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <XCircle className="size-5 text-destructive" />
            任务未找到
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-muted-foreground">{error}</p>
          <Button onClick={() => navigate({ to: '/tasks' })}>
            <ArrowLeft className="mr-2 size-4" />
            返回任务列表
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!task) {
    return null
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
              <dd className="font-medium">
                {{
                  temperature: 'Temperature',
                  wind: 'Wind',
                  pressure: 'Pressure',
                  precipitation: 'Precipitation',
                }[task.configuration.variable] || task.configuration.variable}
              </dd>
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

      {/* Analysis Tabs */}
      <AnalysisTabs activeTab={activeTab} onTabChange={handleTabChange}>
        <TabPanel value="map-comparison">
          <Card>
            <CardHeader>
              <CardTitle>地图对比</CardTitle>
              <CardDescription>原始数据与降尺度数据对比</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">地图可视化开发中...</p>
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value="accuracy">
          <Card>
            <CardHeader>
              <CardTitle>精度评估</CardTitle>
              <CardDescription>待交付</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                精度评估功能将在后续版本提供，包括 RMSE、MAE、R² 等统计指标。
              </p>
            </CardContent>
          </Card>
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

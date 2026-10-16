import { useNavigate, useParams } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, ArrowLeft, Loader2 } from 'lucide-react'
import { useTaskLoader } from './hooks/use-task-loader'
import { TaskLoadingState } from './components/task-loading-state'
import { TaskErrorState } from './components/task-error-state'

export function TaskResultPage() {
  const { taskId } = useParams({ from: '/_workspace/tasks/$taskId' })
  const navigate = useNavigate()

  const { task, loading, error } = useTaskLoader({ taskId, pollIfRunning: true })

  if (loading) {
    return <TaskLoadingState />
  }

  if (error) {
    return (
      <TaskErrorState
        error={error}
        actionLabel="返回创建任务"
        actionIcon={<ArrowLeft className="mr-2 size-4" />}
        onAction={() => navigate({ to: '/tasks/new' })}
      />
    )
  }

  if (!task) {
    return null
  }

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const statusIcon =
    task.status === 'Completed' ? (
      <CheckCircle2 className="size-5 text-green-600" />
    ) : task.status === 'Running' ? (
      <Loader2 className="size-5 animate-spin text-blue-600" />
    ) : (
      <XCircle className="size-5 text-destructive" />
    )

  const statusLabel =
    task.status === 'Completed' ? '已完成' : task.status === 'Running' ? '运行中' : '失败'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{task.name}</h1>
        <Button variant="outline" onClick={() => navigate({ to: '/tasks/new' })}>
          <ArrowLeft className="mr-2 size-4" />
          返回
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {statusIcon}
            任务状态：{statusLabel}
          </CardTitle>
          {task.status === 'Running' && (
            <CardDescription>正在执行降尺度计算...（Synthetic Demo 模拟）</CardDescription>
          )}
          {task.status === 'Completed' && (
            <CardDescription>任务已完成 · Synthetic Demo 演示结果</CardDescription>
          )}
          {task.status === 'Failed' && task.failureReason && (
            <CardDescription className="text-destructive">{task.failureReason}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border p-4">
            <h3 className="mb-3 font-medium">任务信息</h3>
            <dl className="grid gap-2 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <dt className="text-muted-foreground">任务 ID：</dt>
                <dd className="col-span-2 font-mono text-xs">{task.id}</dd>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <dt className="text-muted-foreground">创建时间：</dt>
                <dd className="col-span-2">{formatDate(task.createdAt)}</dd>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <dt className="text-muted-foreground">提交时间：</dt>
                <dd className="col-span-2">{formatDate(task.submittedAt)}</dd>
              </div>
              {task.status !== 'Running' && (
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-muted-foreground">完成时间：</dt>
                  <dd className="col-span-2">{formatDate(task.completionAt)}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="rounded-md border p-4">
            <h3 className="mb-3 font-medium">配置详情</h3>
            <dl className="grid gap-2 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <dt className="text-muted-foreground">数据源：</dt>
                <dd className="col-span-2">
                  {task.configuration.dataSource === 'fusion'
                    ? 'Fusion（融合）'
                    : task.configuration.dataSource.toUpperCase()}
                </dd>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <dt className="text-muted-foreground">气象变量：</dt>
                <dd className="col-span-2">
                  {{
                    temperature: 'Temperature（气温）',
                    wind: 'Wind（风场）',
                    pressure: 'Pressure（气压）',
                    precipitation: 'Precipitation（降水）',
                  }[task.configuration.variable] || task.configuration.variable}
                </dd>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <dt className="text-muted-foreground">目标分辨率：</dt>
                <dd className="col-span-2">{task.configuration.resolution}</dd>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <dt className="text-muted-foreground">降尺度方法：</dt>
                <dd className="col-span-2">
                  {{
                    recommended: '推荐方法',
                    deterministic: '确定性方法',
                    probabilistic: '概率式方法',
                  }[task.configuration.method] || task.configuration.method}{' '}
                  → {task.configuration.resolvedMethod === 'deterministic' ? '确定性' : '概率式'}
                </dd>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <dt className="text-muted-foreground">空间区域：</dt>
                <dd className="col-span-2">
                  {task.configuration.region.west}°E - {task.configuration.region.east}°E,{' '}
                  {task.configuration.region.south}°N - {task.configuration.region.north}°N
                </dd>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <dt className="text-muted-foreground">时间范围（UTC）：</dt>
                <dd className="col-span-2">
                  {task.configuration.timeRange.start} 至 {task.configuration.timeRange.end}{' '}
                  （半开区间）
                </dd>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <dt className="text-muted-foreground">时区说明：</dt>
                <dd className="col-span-2 text-xs text-muted-foreground">
                  输入时间按 Asia/Shanghai (UTC+8) 解释后转换为 UTC 存储
                </dd>
              </div>
            </dl>
          </div>

          {task.status === 'Completed' && (
            <div className="space-y-3 rounded-md bg-green-50 p-4 dark:bg-green-950/20">
              <p className="text-sm text-green-900 dark:text-green-100">
                任务已完成。可以查看结果分析。
              </p>
              <Button
                onClick={() => navigate({ to: '/tasks/$taskId/result', params: { taskId: task.id } })}
                className="w-full"
              >
                查看结果分析
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

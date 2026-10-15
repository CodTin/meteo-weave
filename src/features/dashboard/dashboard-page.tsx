import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ListIcon,
  Database,
} from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useDashboardData } from './hooks/use-dashboard-data'
import { useTaskActions } from '@/features/downscaling-tasks/hooks/use-task-actions'
import type { DownscalingTask } from '@/features/downscaling-tasks/service'
import { variableLabels, formatDate } from '@/features/downscaling-tasks/utils/formatters'

function TaskStatusBadge({ task }: { task: DownscalingTask }) {
  if (task.status === 'Completed') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
        <CheckCircle2 className="size-3.5" aria-hidden="true" />
        已完成
      </span>
    )
  }
  if (task.status === 'Running') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        运行中
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
      <XCircle className="size-3.5" aria-hidden="true" />
      失败
    </span>
  )
}

function RecentTaskCard({ task }: { task: DownscalingTask }) {
  const { viewTask } = useTaskActions()
  const config = task.configuration

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors">
      <div className="flex-1 space-y-1.5">
        <h4 className="font-medium leading-none">{task.name}</h4>
        <p className="text-sm text-muted-foreground">
          {variableLabels[config.variable] || config.variable} · {config.resolution} · 创建于{' '}
          {formatDate(task.createdAt)}
        </p>
        <div className="pt-1">
          <TaskStatusBadge task={task} />
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={() => viewTask(task)}>
        查看
      </Button>
    </div>
  )
}

export function DashboardPage() {
  const dashboardState = useDashboardData()
  const { viewTask } = useTaskActions()

  if (dashboardState.status === 'loading') {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <span>加载仪表盘数据...</span>
        </div>
      </div>
    )
  }

  if (dashboardState.status === 'error') {
    return (
      <div className="flex items-center justify-center py-12">
        <Card className="max-w-md border-destructive">
          <CardHeader>
            <div className="flex items-center gap-3">
              <AlertCircle className="size-5 text-destructive" aria-hidden="true" />
              <CardTitle>加载失败</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{dashboardState.error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { stats, recentTasks, exampleTask } = dashboardState

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
        降尺度任务概览与快速入口。查看统计数据、最近任务，并浏览示例结果。
      </p>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">总任务数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">运行中</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold">{stats.running}</div>
              <Loader2 className="size-5 animate-spin text-blue-600" aria-hidden="true" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">已完成</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold">{stats.completed}</div>
              <CheckCircle2 className="size-5 text-green-600" aria-hidden="true" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Tasks */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>最近任务</CardTitle>
              <CardDescription>按创建时间排序的最新 5 个任务</CardDescription>
            </div>
            <Link to="/tasks" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <ListIcon className="size-4" aria-hidden="true" />
              全部历史
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {recentTasks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">暂无任务</p>
          ) : (
            <div className="space-y-3">
              {recentTasks.map((task) => (
                <RecentTaskCard key={task.id} task={task} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="surface-accent">
          <CardHeader>
            <CardTitle>创建新任务</CardTitle>
            <CardDescription>配置并提交新的降尺度计算任务</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/tasks/new" className={buttonVariants({ className: 'w-full' })}>
              创建任务 <ArrowRight aria-hidden="true" />
            </Link>
          </CardContent>
        </Card>

        <Card className="surface-accent">
          <CardHeader>
            <CardTitle>浏览示例数据</CardTitle>
            <CardDescription>
              {exampleTask ? '查看预生成的示例降尺度结果' : '暂无可用示例'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {exampleTask ? (
              <Button variant="outline" className="w-full" onClick={() => viewTask(exampleTask)}>
                <Database className="size-4" aria-hidden="true" />
                查看示例
              </Button>
            ) : (
              <Button variant="outline" className="w-full" disabled>
                <Database className="size-4" aria-hidden="true" />
                暂无示例
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

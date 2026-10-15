import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Eye, Loader2, AlertCircle, CheckCircle2, XCircle, Trash2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useTaskList } from './hooks/use-task-list'
import { useTaskActions } from './hooks/use-task-actions'
import type { DownscalingTask } from './service'

const dataSourceLabels = {
  ecmwf: 'ECMWF',
  gfs: 'GFS',
  fusion: 'Fusion',
} as const

const variableLabels = {
  temperature: '气温',
  wind: '风速',
  pressure: '气压',
  precipitation: '降水',
} as const

const methodLabels = {
  deterministic: '确定性',
  probabilistic: '概率式',
} as const

function formatDate(isoString: string) {
  return new Date(isoString).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function TaskRow({ task }: { task: DownscalingTask }) {
  const { viewTask, deleteTask } = useTaskActions()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDelete = async () => {
    setDeleteError(null)
    const result = await deleteTask(task.id)
    if (result.ok) {
      setShowDeleteDialog(false)
    } else {
      setDeleteError(result.error)
    }
  }

  const statusIcon =
    task.status === 'Completed' ? (
      <CheckCircle2 className="size-4 text-green-600" aria-hidden="true" />
    ) : task.status === 'Running' ? (
      <Loader2 className="size-4 animate-spin text-blue-600" aria-hidden="true" />
    ) : (
      <XCircle className="size-4 text-destructive" aria-hidden="true" />
    )

  const statusLabel =
    task.status === 'Completed' ? '已完成' : task.status === 'Running' ? '运行中' : '失败'

  const config = task.configuration
  const timeRange = config.timeRange
  const regionStr = `${config.region.north.toFixed(1)}°N, ${config.region.south.toFixed(1)}°N, ${config.region.east.toFixed(1)}°E, ${config.region.west.toFixed(1)}°E`
  const timeStr =
    timeRange.mode === 'historical' ? `${timeRange.start} 至 ${timeRange.end}` : '预测模式'

  return (
    <>
      <tr className="border-b hover:bg-muted/50">
        <td className="px-4 py-3 font-medium">{task.name}</td>
        <td className="px-4 py-3 text-muted-foreground">
          {dataSourceLabels[config.dataSource] || config.dataSource}
        </td>
        <td className="px-4 py-3 text-muted-foreground">
          {variableLabels[config.variable] || config.variable}
        </td>
        <td className="px-4 py-3 text-muted-foreground">{regionStr}</td>
        <td className="px-4 py-3 text-muted-foreground">{timeStr}</td>
        <td className="px-4 py-3 text-muted-foreground">
          {config.method === 'recommended'
            ? '推荐'
            : methodLabels[config.resolvedMethod] || config.resolvedMethod}
        </td>
        <td className="px-4 py-3 text-muted-foreground">{config.resolution}</td>
        <td className="px-4 py-3 text-muted-foreground">{formatDate(task.createdAt)}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            {statusIcon}
            <span className="text-muted-foreground">{statusLabel}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => viewTask(task)}
              aria-label={`查看任务 ${task.name}`}
            >
              <Eye className="size-4" aria-hidden="true" />
              <span className="ml-1">查看</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              aria-label={`删除任务 ${task.name}`}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </td>
      </tr>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除任务</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除任务"{task.name}"吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {deleteError}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function TaskListPage() {
  const listState = useTaskList()

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
          查看和管理降尺度任务，根据状态查看结果或重新配置失败任务。
        </p>
        <Link to="/tasks/new" className={buttonVariants()}>
          创建任务 <ArrowRight aria-hidden="true" />
        </Link>
      </div>

      <Card className="surface-accent">
        <CardHeader>
          <CardTitle>降尺度任务</CardTitle>
          <CardDescription id="task-fields-description">
            任务列表显示所有已创建的降尺度任务，包括配置详情、执行状态和结果访问入口。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {listState.status === 'loading' && (
            <div className="flex min-h-[20rem] items-center justify-center">
              <div className="text-center">
                <Loader2 className="mx-auto mb-4 size-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">加载任务列表...</p>
              </div>
            </div>
          )}

          {listState.status === 'error' && (
            <div className="flex min-h-[20rem] items-center justify-center">
              <div className="text-center">
                <AlertCircle className="mx-auto mb-4 size-8 text-destructive" />
                <p className="text-sm text-muted-foreground">{listState.error}</p>
                <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
                  重新加载
                </Button>
              </div>
            </div>
          )}

          {listState.status === 'success' && (
            <>
              {listState.tasks.length === 0 ? (
                <div className="flex min-h-[20rem] items-center justify-center">
                  <div className="text-center">
                    <AlertCircle className="mx-auto mb-4 size-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">暂无任务</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      创建第一个降尺度任务开始分析
                    </p>
                    <Link to="/tasks/new" className={buttonVariants({ className: 'mt-4' })}>
                      创建任务
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  <p
                    id="task-table-scroll-hint"
                    className="mb-3 text-xs leading-6 text-muted-foreground"
                  >
                    窄屏可在表格区域横向滚动，查看全部字段。共 {listState.tasks.length} 个任务。
                  </p>
                  <section
                    aria-label="降尺度任务表格"
                    aria-describedby="task-table-scroll-hint"
                    // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users need focus to scroll this table region horizontally.
                    tabIndex={0}
                    className="overflow-x-auto rounded-sm border bg-background"
                  >
                    <table
                      aria-describedby="task-fields-description"
                      className="w-full min-w-[80rem] border-collapse text-left text-sm"
                    >
                      <caption className="sr-only">降尺度任务列表</caption>
                      <thead className="border-b-2 border-b-primary/60 bg-background text-muted-foreground">
                        <tr>
                          {[
                            '任务名称',
                            '数据源',
                            '气象变量',
                            '经纬范围',
                            '分析时间',
                            '实际方法',
                            '分辨率',
                            '创建时间',
                            '状态',
                            '操作',
                          ].map((field) => (
                            <th
                              key={field}
                              scope="col"
                              className="px-4 py-4 text-xs font-semibold tracking-wide whitespace-nowrap"
                            >
                              {field}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {listState.tasks
                          .slice()
                          .sort(
                            (a, b) =>
                              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
                          )
                          .map((task) => (
                            <TaskRow key={task.id} task={task} />
                          ))}
                      </tbody>
                    </table>
                  </section>
                </>
              )}

              {listState.issues.length > 0 && (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="size-5 text-amber-600 dark:text-amber-500" />
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                        部分任务无法读取
                      </h4>
                      <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                        {listState.issues.length} 个任务记录存在问题，已从列表中排除。
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

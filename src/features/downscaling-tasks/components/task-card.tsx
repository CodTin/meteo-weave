import { Eye, Loader2, CheckCircle2, XCircle, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
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
import type { DownscalingTask } from '../service'
import { useTaskActions } from '../hooks/use-task-actions'
import type { TaskComparisonControl } from '../hooks/use-comparison-selection'
import { dataSourceLabels, variableLabels, methodLabels, formatDate } from '../utils/formatters'

interface TaskCardProps {
  task: DownscalingTask
  comparison?: TaskComparisonControl
}

export function TaskCard({ task, comparison }: TaskCardProps) {
  const { viewTask, deleteTask } = useTaskActions()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (isDeleting) return

    setDeleteError(null)
    setIsDeleting(true)
    const result = await deleteTask(task.id)
    setIsDeleting(false)

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
      <div className="min-w-0 rounded-lg border bg-card p-4 hover:border-primary/50 transition-colors">
        <div className="space-y-3">
          {/* Task Name and Status */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 break-all font-semibold text-lg leading-tight">{task.name}</h3>
            <div className="flex items-center gap-1.5 shrink-0">
              {statusIcon}
              <span className="text-xs text-muted-foreground">{statusLabel}</span>
            </div>
          </div>

          {comparison && (
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={comparison.selected}
                disabled={comparison.disabled}
                onChange={comparison.onToggle}
                aria-label={`选择任务 ${task.name} 进行对比`}
                aria-describedby="comparison-instructions"
                className="size-5 accent-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              {comparison.disabled ? '仅已完成任务可对比' : '选择进行对比'}
            </label>
          )}

          {/* Variable and Method */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">变量:</span>
              <span className="font-medium">
                {variableLabels[config.variable] || config.variable}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">方法:</span>
              <span className="font-medium">
                {config.method === 'recommended'
                  ? '推荐'
                  : methodLabels[config.resolvedMethod] || config.resolvedMethod}
              </span>
            </div>
          </div>

          {/* Spatial Range */}
          <div className="text-sm">
            <span className="text-muted-foreground">经纬范围: </span>
            <span className="text-xs">{regionStr}</span>
          </div>

          {/* Temporal Range */}
          <div className="text-sm">
            <span className="text-muted-foreground">分析时间: </span>
            <span className="text-xs">{timeStr}</span>
          </div>

          {/* Data Source and Resolution */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">数据源:</span>
              <span>{dataSourceLabels[config.dataSource] || config.dataSource}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">分辨率:</span>
              <span>{config.resolution}</span>
            </div>
          </div>

          {/* Created Time */}
          <div className="text-xs text-muted-foreground">创建于 {formatDate(task.createdAt)}</div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t">
            <Button
              variant="default"
              size="sm"
              onClick={() => viewTask(task)}
              className="flex-1"
              aria-label={`查看任务 ${task.name}`}
            >
              <Eye className="mr-1 size-4" aria-hidden="true" />
              查看
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isDeleting}
              aria-label={`删除任务 ${task.name}`}
            >
              {isDeleting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>
      </div>

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
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                  删除中...
                </>
              ) : (
                '删除'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

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

interface TaskCardProps {
  task: DownscalingTask
}

export function TaskCard({ task }: TaskCardProps) {
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
      <div className="rounded-lg border bg-card p-4 hover:border-primary/50 transition-colors">
        <div className="space-y-3">
          {/* Task Name and Status */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-lg leading-tight">{task.name}</h3>
            <div className="flex items-center gap-1.5 shrink-0">
              {statusIcon}
              <span className="text-xs text-muted-foreground">{statusLabel}</span>
            </div>
          </div>

          {/* Variable and Method */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">变量:</span>
              <span className="font-medium">{variableLabels[config.variable] || config.variable}</span>
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
          <div className="text-xs text-muted-foreground">
            创建于 {formatDate(task.createdAt)}
          </div>

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
              aria-label={`删除任务 ${task.name}`}
            >
              <Trash2 className="size-4" aria-hidden="true" />
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
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

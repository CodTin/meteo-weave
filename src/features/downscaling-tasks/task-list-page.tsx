import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Eye,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Trash2,
  Search,
  X,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Table,
} from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTaskList } from './hooks/use-task-list'
import { useTaskActions } from './hooks/use-task-actions'
import { TaskCard } from './components/task-card'
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
  const {
    state,
    tasks,
    filteredCount,
    totalCount,
    issues,
    filters,
    updateFilters,
    clearFilters,
    sortConfig,
    updateSort,
    currentPage,
    setCurrentPage,
    totalPages,
  } = useTaskList()

  const [viewMode, setViewMode] = useState<'table' | 'card'>('table')

  const hasActiveFilters =
    filters.nameSearch.trim() !== '' || filters.variable || filters.status || filters.method

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
          {state.status === 'loading' && (
            <div className="flex min-h-[20rem] items-center justify-center">
              <div className="text-center">
                <Loader2 className="mx-auto mb-4 size-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">加载任务列表...</p>
              </div>
            </div>
          )}

          {state.status === 'error' && (
            <div className="flex min-h-[20rem] items-center justify-center">
              <div className="text-center">
                <AlertCircle className="mx-auto mb-4 size-8 text-destructive" />
                <p className="text-sm text-muted-foreground">{state.error}</p>
                <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
                  重新加载
                </Button>
              </div>
            </div>
          )}

          {state.status === 'success' && (
            <>
              {/* Filter Controls */}
              <div className="mb-6 space-y-4">
                {/* View Toggle */}
                <div className="flex items-center gap-2" role="group" aria-label="视图切换">
                  <Button
                    variant={viewMode === 'table' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('table')}
                    aria-pressed={viewMode === 'table'}
                    aria-label="表格视图"
                  >
                    <Table className="mr-1 size-4" aria-hidden="true" />
                    表格视图
                  </Button>
                  <Button
                    variant={viewMode === 'card' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('card')}
                    aria-pressed={viewMode === 'card'}
                    aria-label="卡片视图"
                  >
                    <LayoutGrid className="mr-1 size-4" aria-hidden="true" />
                    卡片视图
                  </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {/* Name Search */}
                  <div className="space-y-2">
                    <Label htmlFor="name-search">任务名称搜索</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="name-search"
                        type="text"
                        placeholder="搜索任务名称..."
                        value={filters.nameSearch}
                        onChange={(e) => updateFilters({ nameSearch: e.target.value })}
                        className="pl-9"
                      />
                    </div>
                  </div>

                  {/* Variable Filter */}
                  <div className="space-y-2">
                    <Label htmlFor="variable-filter">气象变量</Label>
                    <Select
                      value={filters.variable || 'all'}
                      onValueChange={(value: string) =>
                        updateFilters({ variable: value === 'all' ? undefined : value })
                      }
                    >
                      <SelectTrigger id="variable-filter">
                        <SelectValue placeholder="全部变量" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部变量</SelectItem>
                        <SelectItem value="temperature">气温</SelectItem>
                        <SelectItem value="wind">风速</SelectItem>
                        <SelectItem value="pressure">气压</SelectItem>
                        <SelectItem value="precipitation">降水</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Status Filter */}
                  <div className="space-y-2">
                    <Label htmlFor="status-filter">任务状态</Label>
                    <Select
                      value={filters.status || 'all'}
                      onValueChange={(value: string) =>
                        updateFilters({
                          status:
                            value === 'all' ? undefined : (value as DownscalingTask['status']),
                        })
                      }
                    >
                      <SelectTrigger id="status-filter">
                        <SelectValue placeholder="全部状态" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部状态</SelectItem>
                        <SelectItem value="Running">运行中</SelectItem>
                        <SelectItem value="Completed">已完成</SelectItem>
                        <SelectItem value="Failed">失败</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Method Filter */}
                  <div className="space-y-2">
                    <Label htmlFor="method-filter">实际降尺度方法</Label>
                    <Select
                      value={filters.method || 'all'}
                      onValueChange={(value: string) =>
                        updateFilters({
                          method:
                            value === 'all'
                              ? undefined
                              : (value as 'deterministic' | 'probabilistic'),
                        })
                      }
                    >
                      <SelectTrigger id="method-filter">
                        <SelectValue placeholder="全部方法" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部方法</SelectItem>
                        <SelectItem value="deterministic">确定性</SelectItem>
                        <SelectItem value="probabilistic">概率式</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Clear Filters Button */}
                {hasActiveFilters && (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      <X className="mr-1 size-4" />
                      清除所有筛选
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      显示 {filteredCount} / {totalCount} 个任务
                    </p>
                  </div>
                )}
              </div>

              {totalCount === 0 ? (
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
              ) : filteredCount === 0 ? (
                <div className="flex min-h-[20rem] items-center justify-center">
                  <div className="text-center">
                    <AlertCircle className="mx-auto mb-4 size-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">没有匹配的任务</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      尝试调整筛选条件或清除所有筛选
                    </p>
                    <Button variant="outline" className="mt-4" onClick={clearFilters}>
                      清除筛选
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {viewMode === 'table' ? (
                    <>
                      <p
                        id="task-table-scroll-hint"
                        className="mb-3 text-xs leading-6 text-muted-foreground"
                      >
                        窄屏可在表格区域横向滚动，查看全部字段。
                        {hasActiveFilters ? (
                          <>
                            显示 {filteredCount} / {totalCount} 个任务
                          </>
                        ) : (
                          <>共 {totalCount} 个任务</>
                        )}
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
                                { label: '任务名称', field: 'name' as const },
                                { label: '数据源', field: null },
                                { label: '气象变量', field: null },
                                { label: '经纬范围', field: null },
                                { label: '分析时间', field: null },
                                { label: '实际方法', field: null },
                                { label: '分辨率', field: null },
                                { label: '创建时间', field: 'createdAt' as const },
                                { label: '状态', field: 'status' as const },
                                { label: '操作', field: null },
                              ].map(({ label, field }) => (
                                <th
                                  key={label}
                                  scope="col"
                                  className="px-4 py-4 text-xs font-semibold tracking-wide whitespace-nowrap"
                                >
                                  {field ? (
                                    <button
                                      onClick={() => updateSort(field)}
                                      className="flex items-center gap-1 hover:text-foreground"
                                      aria-label={`按${label}排序`}
                                    >
                                      {label}
                                      <ArrowUpDown className="size-3" />
                                      {sortConfig.field === field && (
                                        <span className="sr-only">
                                          {sortConfig.direction === 'asc' ? '升序' : '降序'}
                                        </span>
                                      )}
                                    </button>
                                  ) : (
                                    label
                                  )}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {tasks.map((task) => (
                              <TaskRow key={task.id} task={task} />
                            ))}
                          </tbody>
                        </table>
                      </section>
                    </>
                  ) : (
                    <>
                      <p className="mb-3 text-xs leading-6 text-muted-foreground">
                        {hasActiveFilters ? (
                          <>
                            显示 {filteredCount} / {totalCount} 个任务
                          </>
                        ) : (
                          <>共 {totalCount} 个任务</>
                        )}
                      </p>
                      <div role="list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {tasks.map((task) => (
                          <div key={task.id} role="listitem">
                            <TaskCard task={task} />
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        第 {currentPage} / {totalPages} 页
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          aria-label="上一页"
                        >
                          <ChevronLeft className="size-4" />
                          上一页
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          aria-label="下一页"
                        >
                          下一页
                          <ChevronRight className="size-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {issues.length > 0 && (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="size-5 text-amber-600 dark:text-amber-500" />
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                        部分任务无法读取
                      </h4>
                      <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                        {issues.length} 个任务记录存在问题，已从列表中排除。
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

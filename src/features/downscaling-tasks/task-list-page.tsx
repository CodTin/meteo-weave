import { useState } from 'react'
import { Link, useRouteContext } from '@tanstack/react-router'
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
import {
  useComparisonSelection,
  type TaskComparisonControl,
} from './hooks/use-comparison-selection'
import type { DownscalingTask } from './service'
import { dataSourceLabels, variableLabels, methodLabels, formatDate } from './utils/formatters'

function TaskRow({
  task,
  comparison,
}: {
  task: DownscalingTask
  comparison: TaskComparisonControl
}) {
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
      <tr className="border-b hover:bg-muted/50">
        <td className="px-4 py-3 font-medium">{task.name}</td>
        <td className="px-4 py-3">
          <input
            type="checkbox"
            checked={comparison.selected}
            disabled={comparison.disabled}
            onChange={comparison.onToggle}
            aria-label={`选择任务 ${task.name} 进行对比`}
            aria-describedby="comparison-instructions"
            className="size-5 cursor-pointer accent-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        </td>
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

export function TaskListPage() {
  const {
    state,
    tasks,
    allTasks,
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
  const { account } = useRouteContext({ from: '/_workspace' })
  const { selectedTasks, selectionError, controlFor, comparisonHref, removeTask, clearSelection } =
    useComparisonSelection(allTasks, account.id)

  const hasActiveFilters =
    filters.nameSearch.trim() !== '' ||
    filters.variable ||
    filters.status ||
    filters.method ||
    filters.timeRangeStart ||
    filters.timeRangeEnd

  return (
    <div
      className={
        comparisonHref
          ? 'min-w-0 max-w-full space-y-6 pb-64 sm:pb-36'
          : 'min-w-0 max-w-full space-y-6'
      }
    >
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
        <CardContent className="min-w-0 max-w-full">
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
              <section
                aria-label="任务对比选择"
                className="mb-6 space-y-3 rounded-lg border bg-muted/30 p-4"
              >
                <output
                  aria-live="polite"
                  aria-atomic="true"
                  className="block text-sm font-semibold"
                >
                  已选择 {selectedTasks.length} / 2 个任务
                </output>
                <p id="comparison-instructions" className="text-xs leading-6 text-muted-foreground">
                  选择两个当前账号的已完成任务进行对比。运行中、失败或不可用的任务不能选择。
                </p>
                {selectedTasks.length > 0 && (
                  <ol aria-label="已选择的对比任务" className="space-y-2 text-sm">
                    {selectedTasks.map((task, index) => (
                      <li key={task.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="min-w-0 flex-1 break-all">
                          {index === 0 ? 'A' : 'B'} · {task.name}
                          {!tasks.some((visible) => visible.id === task.id) && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              当前筛选或分页隐藏
                            </span>
                          )}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeTask(task.id)}
                          aria-label={`移除对比任务 ${task.name}`}
                        >
                          <X className="size-4" aria-hidden="true" /> 移除
                        </Button>
                      </li>
                    ))}
                  </ol>
                )}
                {selectedTasks.length > 0 && (
                  <Button variant="outline" size="sm" onClick={clearSelection}>
                    清除对比选择
                  </Button>
                )}
                {selectionError && (
                  <p role="alert" className="text-sm leading-6 text-destructive">
                    {selectionError}
                  </p>
                )}
              </section>

              {/* Filter Controls */}
              <div className="mb-6 space-y-4">
                {/* View Toggle */}
                <fieldset className="flex items-center gap-2">
                  <legend className="sr-only">视图切换</legend>
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
                </fieldset>

                <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-5 [&>div]:min-w-0">
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

                {/* Time Range Filter - Second Row */}
                <div className="grid min-w-0 gap-4 sm:grid-cols-2 [&>div]:min-w-0">
                  <div className="space-y-2">
                    <Label htmlFor="time-range-start">分析时间范围（起始）</Label>
                    <Input
                      id="time-range-start"
                      type="date"
                      value={filters.timeRangeStart || ''}
                      onChange={(e) =>
                        updateFilters({
                          timeRangeStart: e.target.value || undefined,
                        })
                      }
                      min="2020-01-01"
                      max="2024-12-31"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="time-range-end">分析时间范围（结束）</Label>
                    <Input
                      id="time-range-end"
                      type="date"
                      value={filters.timeRangeEnd || ''}
                      onChange={(e) =>
                        updateFilters({
                          timeRangeEnd: e.target.value || undefined,
                        })
                      }
                      min="2020-01-01"
                      max="2024-12-31"
                    />
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
                        className="relative min-w-0 max-w-full overflow-x-auto rounded-sm border bg-background"
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
                                { label: '对比选择', field: null },
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
                              <TaskRow key={task.id} task={task} comparison={controlFor(task)} />
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
                      <ul className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {tasks.map((task) => (
                          <li key={task.id} className="min-w-0 list-none">
                            <TaskCard task={task} comparison={controlFor(task)} />
                          </li>
                        ))}
                      </ul>
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
      {comparisonHref && (
        <section
          aria-label="任务对比操作"
          className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border bg-background p-4 shadow-lg sm:flex-row sm:items-center"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">已选择 2 / 2 个任务</p>
            <ol className="mt-1 space-y-1 text-xs leading-5">
              {selectedTasks.map((task, index) => (
                <li key={task.id} className="break-all">
                  {index === 0 ? 'A' : 'B'} · {task.name}
                </li>
              ))}
            </ol>
          </div>
          <div className="flex flex-col gap-2">
            {selectionError && (
              <p className="max-w-xs text-sm leading-6 text-destructive">{selectionError}</p>
            )}
            <a href={comparisonHref} className={buttonVariants()}>
              对比所选任务 <ArrowRight aria-hidden="true" />
            </a>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (selectedTasks[1]) removeTask(selectedTasks[1].id)
              }}
              aria-label={`取消第二个对比任务 ${selectedTasks[1]?.name}`}
            >
              取消第二个选择
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}

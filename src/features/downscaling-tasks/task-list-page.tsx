import { Link } from '@tanstack/react-router'
import { ArrowRight, Unplug } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function TaskListPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
          管理降尺度任务，并在服务接入后查看输入配置、任务状态与结果。当前仅展示未来列表的字段含义。
        </p>
        <Link to="/tasks/new" className={buttonVariants()}>
          前往创建任务 <ArrowRight aria-hidden="true" />
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>降尺度任务</CardTitle>
          <CardDescription id="task-fields-description">
            任务名称用于识别计算请求；数据源、气象变量与目标分辨率描述输入配置；任务状态与创建时间用于追踪计算过程。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p id="task-table-scroll-hint" className="mb-3 text-xs leading-6 text-muted-foreground">
            窄屏可在表格区域横向滚动，查看全部字段。
          </p>
          <section
            aria-label="降尺度任务表格"
            aria-describedby="task-table-scroll-hint"
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users need focus to scroll this table region horizontally.
            tabIndex={0}
            className="overflow-x-auto rounded-lg border p-1"
          >
            <table
              aria-describedby="task-fields-description task-service-status"
              className="w-full min-w-[44rem] border-collapse text-left text-sm"
            >
              <caption className="sr-only">降尺度任务字段预览</caption>
              <thead className="border-b bg-muted/50 text-muted-foreground">
                <tr>
                  {['任务名称', '数据源', '气象变量', '目标分辨率', '任务状态', '创建时间'].map(
                    (field) => (
                      <th
                        key={field}
                        scope="col"
                        className="px-4 py-4 font-medium whitespace-nowrap"
                      >
                        {field}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody />
            </table>
          </section>
          <div
            id="task-service-status"
            className="mt-6 flex flex-col items-start gap-3 rounded-lg border border-dashed p-5 sm:flex-row sm:gap-4"
          >
            <Unplug className="mt-1 size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <h3 className="font-medium">任务服务尚未接入</h3>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                尚未查询任务，不代表任务数量为零。这里没有任务记录、已完成统计或计算结果。
              </p>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                可前往创建任务页了解将来的配置流程；当前无法提交、筛选或管理任务。
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

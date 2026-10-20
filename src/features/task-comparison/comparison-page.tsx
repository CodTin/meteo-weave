import { getRouteApi, Link } from '@tanstack/react-router'
import { Button, buttonVariants } from '@/components/ui/button'
import { TaskComparisonParameters } from './parameters/parameter-table'
import { ComparisonFieldMaps } from './maps/field-map-preview'
import { useComparisonPage } from './page/use-comparison-page'
import { ComparisonMetrics } from './page/comparison-metrics'

const route = getRouteApi('/_workspace/tasks/compare')

export function TaskComparisonPage() {
  const { a, b } = route.useSearch()
  const state = useComparisonPage(a, b)
  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/tasks" className={buttonVariants({ variant: 'outline' })}>
          返回任务管理
        </Link>
        <p className="text-sm text-muted-foreground">
          A／B 保留选择顺序；Synthetic Demo 合成数据。
        </p>
      </div>
      {state.status === 'loading' ? (
        <output className="block rounded-lg border bg-card p-5 text-sm leading-6">
          正在读取当前账号的两个已完成任务；浏览器存储仅在页面加载后读取。
          完成存在性、配置与结果核验前，不显示缓存对比。
        </output>
      ) : state.status === 'error' ? (
        <section role="alert" className="space-y-3 rounded-lg border bg-card p-5">
          <h2 className="text-xl font-semibold">无法对比所选任务</h2>
          <p className="text-sm leading-6">{state.message}</p>
          <Button onClick={state.retry}>重新读取对比</Button>
        </section>
      ) : (
        <>
          <section aria-label="对比任务身份" className="grid min-w-0 gap-4 md:grid-cols-2">
            {state.comparison.tasks.map((task, index) => (
              <div key={task.id} className="min-w-0 space-y-2 rounded-lg border bg-card p-5">
                <h2 className="break-words text-lg font-semibold">
                  {index === 0 ? 'A' : 'B'} · {task.name}
                </h2>
                <code className="block break-all text-xs text-muted-foreground">{task.id}</code>
                <p className="text-sm text-muted-foreground">已完成 · 当前账号任务</p>
              </div>
            ))}
          </section>
          <TaskComparisonParameters a={state.comparison.tasks[0]} b={state.comparison.tasks[1]} />
          <ComparisonFieldMaps data={state.maps} />
          <ComparisonMetrics comparison={state.comparison} />
        </>
      )}
    </div>
  )
}

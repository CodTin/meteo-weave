export type ComparisonMetricValues = {
  rmse: number
  mae: number
  r2: number | null
  n: number
  r2UnavailableReason?: string | null
}

export function TaskComparisonMetricBars({
  names,
  metrics,
  unit,
}: {
  names: { a: string; b: string }
  metrics: { a: ComparisonMetricValues; b: ComparisonMetricValues }
  unit: string
}) {
  return (
    <section aria-label="共同样本精度指标" className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">
        同一共同有效参考样本 n = {metrics.a.n}；RMSE／MAE 越低越好，R² 越高越好。
        这些合成数据指标不证明真实模型的优劣。
      </p>
      <div className="grid min-w-0 gap-4 xl:grid-cols-3">
        {(['rmse', 'mae', 'r2'] as const).map((metric) => {
          const values = [metrics.a[metric], metrics.b[metric]]
          const finite = values.filter(
            (value): value is number => value !== null && Number.isFinite(value),
          )
          const minimum = Math.min(0, ...finite)
          const maximum = Math.max(metric === 'r2' ? 1 : 0, ...finite)
          const extent = maximum - minimum || 1
          const zero = (-minimum / extent) * 100
          const label = { rmse: 'RMSE', mae: 'MAE', r2: 'R²' }[metric]
          return (
            <figure key={metric} className="min-w-0 rounded-md border bg-card p-4">
              <figcaption className="font-semibold">{label}</figcaption>
              <div className="mt-3 space-y-4">
                {(['a', 'b'] as const).map((side) => {
                  const value = metrics[side][metric]
                  const available = value !== null && Number.isFinite(value)
                  const endpoint = available ? ((value - minimum) / extent) * 100 : zero
                  return (
                    <div key={side}>
                      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm">
                        <span className="min-w-0 break-words">
                          {side.toUpperCase()} · {names[side]}
                        </span>
                        <span className="font-mono tabular-nums">
                          {available
                            ? `${value.toFixed(3)}${metric === 'r2' ? '' : ` ${unit}`}`
                            : '不可计算'}
                        </span>
                      </div>
                      {available ? (
                        <div aria-hidden="true" className="relative mt-2 h-3 rounded bg-muted">
                          <div
                            className="absolute inset-y-0 w-px bg-foreground/50"
                            style={{ left: `${zero}%` }}
                          />
                          <div
                            className={
                              side === 'a'
                                ? 'absolute inset-y-0 rounded bg-blue-600'
                                : 'absolute inset-y-0 rounded bg-orange-600'
                            }
                            style={{
                              left: `${Math.min(endpoint, zero)}%`,
                              width: `${Math.abs(endpoint - zero)}%`,
                            }}
                          />
                        </div>
                      ) : (
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          共同参考没有变化，R² 无定义；不会以零替代。
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {metric === 'r2' ? '无量纲，负值从零基线向左显示' : `${unit} · 统一零基线与刻度`}
              </p>
            </figure>
          )
        })}
      </div>
    </section>
  )
}

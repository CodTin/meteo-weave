import { getVariableUnit } from '@/features/result-analysis/service/color-scales'
import { TaskComparisonMetricBars } from '../metrics/metric-bars'
import type { CommonComparison, IndividualComparisonStats, TaskComparisonReply } from '../types'
import { comparisonReasons, exclusionLabels } from './messages'

type AvailableComparison = Extract<TaskComparisonReply, { ok: true }>

function SampleEvidence({ evidence }: { evidence: CommonComparison | IndividualComparisonStats }) {
  const { coverage, sampling, exclusions } = evidence
  return (
    <div className="space-y-3 text-sm leading-6">
      <p>
        {'rankingAllowed' in evidence && !evidence.rankingAllowed && 'reference' in evidence
          ? '有效台站'
          : '共同有效台站'}
        ：{coverage.stationCount} · 有效样本 n = {coverage.n}
      </p>
      <p className="break-words">
        有效样本范围：
        {coverage.window
          ? `${coverage.window.west}°E – ${coverage.window.east}°E；${coverage.window.south}°N – ${coverage.window.north}°N`
          : '无有效空间覆盖'}
      </p>
      <div>
        <p className="font-medium">实际保留时间片（UTC）</p>
        {coverage.times.length ? (
          <ul className="space-y-1 font-mono text-xs">
            {coverage.times.map((time) => (
              <li key={time} className="break-all">
                {time}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">没有共同有效时间片。</p>
        )}
      </div>
      <details className="rounded-md border p-3">
        <summary className="cursor-pointer rounded-sm font-medium">
          台站身份、坐标与抽样明细
        </summary>
        <ul className="mt-3 space-y-1 text-xs">
          {coverage.stations.map((station) => (
            <li key={station.id} className="break-all">
              {station.id} · {station.longitude}°E，{station.latitude}°N
            </li>
          ))}
        </ul>
        <p className="mt-3">
          可用台站 {sampling.availableStations} · 可用时间片 {sampling.availableTimes}； 已查询{' '}
          {sampling.queriedSamples} · 保留 {sampling.retainedSamples} · 未抽取{' '}
          {sampling.omittedSamples} 个台站／时间样本。
        </p>
        <p>
          抽样上限：{sampling.limits.stations} 个台站、{sampling.limits.times} 个时间片、
          {sampling.limits.samples} 个样本；缺失数据的有界回退请求 {sampling.fallbackRequests} 次。
        </p>
        <p className="break-words">
          查询范围：
          {sampling.selectedWindow
            ? `${sampling.selectedWindow.west}°E – ${sampling.selectedWindow.east}°E；${sampling.selectedWindow.south}°N – ${sampling.selectedWindow.north}°N`
            : '无可查询共同范围'}
        </p>
        <p className="mt-2 font-medium">实际抽取时间片（UTC）</p>
        <ul className="font-mono text-xs">
          {sampling.selectedTimes.map((time) => (
            <li key={time} className="break-all">
              {time}
            </li>
          ))}
        </ul>
      </details>
      <p>
        候选 {exclusions.candidates} · 保留 {exclusions.retained} · 排除 {exclusions.excluded}；
        {Object.entries(exclusions.counts).map(([code, count]) => (
          <span key={code}>
            {' '}
            {Reflect.get(exclusionLabels, code)}：{count}。
          </span>
        ))}
      </p>
      <p className="text-muted-foreground">
        {sampling.decimated
          ? '已按首尾均匀有界抽样，未抽取样本不参加计算。'
          : '本次有界抽样未省略候选样本。'}
        缺失或非有限值被排除，绝不补零。仅为 Synthetic Demo
        台站样本，非全网格统计或真实模型公平性证明。
      </p>
    </div>
  )
}

export function ComparisonMetrics({ comparison }: { comparison: AvailableComparison }) {
  const { common, individual, tasks } = comparison
  return (
    <section
      aria-label="精度比较依据"
      className="min-w-0 space-y-5 rounded-lg border bg-card p-5 sm:p-6"
    >
      <h2 className="text-xl font-semibold">精度指标与样本依据</h2>
      {common.available ? (
        <>
          <p className="break-words text-sm leading-6">
            相同变量、单位、时间统计与共同有效参考样本；{common.quantity} · {common.unit} ·
            {common.temporalStatistic === 'accumulation'
              ? '完整且一致的累计区间'
              : '相同原生时间统计'}
            。 referenceSeed：{common.reference.referenceSeed} · 参考版本：
            {common.reference.referenceVersion}
          </p>
          <TaskComparisonMetricBars
            names={{ a: tasks[0].name, b: tasks[1].name }}
            unit={common.unit}
            metrics={{
              a: {
                rmse: common.metrics.a.rmse,
                mae: common.metrics.a.mae,
                r2: common.metrics.a.r2,
                n: common.metrics.a.n,
              },
              b: {
                rmse: common.metrics.b.rmse,
                mae: common.metrics.b.mae,
                r2: common.metrics.b.r2,
                n: common.metrics.b.n,
              },
            }}
          />
          <p className="text-sm text-muted-foreground">
            RMSE = √平均平方误差；MAE = 平均绝对误差；R² = 1 − 残差平方和／参考离差平方和。
            使用相同台站 id、坐标和 UTC 时间重算；参考恒定时 R²
            无定义，不以零替代。不提供自动胜负或排名。
          </p>
        </>
      ) : (
        <>
          <h3 className="font-semibold">精度指标不可直接比较</h3>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-6">
            {common.reasons.map((reason, index) => (
              <li key={`${reason.code}-${index}`}>{comparisonReasons[reason.code]}</li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            参数与独立地图仍可查看；不提供胜负或排名。
          </p>
        </>
      )}
      <SampleEvidence evidence={common} />
      {individual && (
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          {(['a', 'b'] as const).map((side, index) => {
            const stats = individual[side]
            const unit = getVariableUnit(tasks[index]!.configuration.variable)
            return (
              <section
                key={side}
                aria-label={`${side.toUpperCase()} 各自参考统计`}
                className="min-w-0 space-y-3 rounded-lg border p-4"
              >
                <h3 className="break-words font-semibold">
                  {side.toUpperCase()} · {tasks[index]!.name} · 各自参考统计
                </h3>
                <p className="text-sm">
                  仅该任务自己的参考与样本；禁止与另一任务排名或计算改善幅度。
                </p>
                <p className="break-words text-xs">
                  referenceSeed：{stats.reference?.referenceSeed ?? '不可用'} · 参考版本：
                  {stats.reference?.referenceVersion ?? '不可用'}
                </p>
                {stats.available ? (
                  <p className="text-sm">
                    RMSE：{stats.metrics.rmse.toFixed(3)} {unit}；MAE：
                    {stats.metrics.mae.toFixed(3)} {unit}； R²：
                    {stats.metrics.r2 === null
                      ? '不可计算（参考恒定，不补零）'
                      : stats.metrics.r2.toFixed(3)}
                  </p>
                ) : (
                  <p className="text-sm">本任务有效参考样本不足，统计不可用。</p>
                )}
                <SampleEvidence evidence={stats} />
              </section>
            )
          })}
        </div>
      )}
    </section>
  )
}

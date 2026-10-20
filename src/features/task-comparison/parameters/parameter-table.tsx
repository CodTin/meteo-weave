import type { DownscalingTask } from '@/features/downscaling-tasks/service'
import { getComparisonParameters } from './index'

export function TaskComparisonParameters({ a, b }: { a: DownscalingTask; b: DownscalingTask }) {
  const { identities, rows } = getComparisonParameters({ a, b })
  return (
    <section
      aria-labelledby="comparison-parameters-title"
      className="min-w-0 rounded-lg border bg-card p-4 sm:p-6"
    >
      <h2 id="comparison-parameters-title" className="font-display text-xl font-semibold">
        参数差异
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        A／B 按选择顺序固定；不同字段同时以文字和视觉标记。时间为保存的 UTC 值。
      </p>
      {/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- Native horizontal scrolling requires a focusable, named viewport. */}
      <section
        aria-label="参数差异横向滚动区域"
        tabIndex={0}
        className="mt-4 max-w-full overflow-x-auto rounded-md border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <table className="w-full min-w-[36rem] table-fixed text-sm">
          <caption className="sr-only">完整配置参数差异，A／B 对应选择顺序</caption>
          <thead className="bg-muted/50">
            <tr>
              <th scope="col" className="w-1/4 px-3 py-3 text-left">
                配置参数
              </th>
              {identities.map(({ position, id, name }) => (
                <th key={position} scope="col" className="px-3 py-3 text-left break-words">
                  <span>
                    {position} · {name}
                  </span>
                  <code className="mt-1 block break-all text-xs font-normal text-muted-foreground">
                    {id}
                  </code>
                </th>
              ))}
              <th scope="col" className="w-16 px-3 py-3 text-left">
                差异
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={row.different ? 'border-t bg-primary/5' : 'border-t'}>
                <th scope="row" className="px-3 py-3 text-left font-medium">
                  {row.label}
                </th>
                <td className="px-3 py-3 align-top break-words">{row.a}</td>
                <td className="px-3 py-3 align-top break-words">{row.b}</td>
                <td className="px-3 py-3 align-top font-medium">
                  {row.different ? '不同' : '相同'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {/* oxlint-enable jsx-a11y/no-noninteractive-tabindex */}
    </section>
  )
}

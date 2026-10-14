/** Bounded row-major native indices, preserving aspect allocation and the far edge.
 * A one-sample axis keeps its first node. Callers own geometry, coverage and query limits.
 */
export function previewSampling(columns: number, rows: number, budget: number) {
  const count = columns * rows
  const targetColumns =
    count <= budget
      ? columns
      : Math.min(columns, Math.max(1, Math.floor(Math.sqrt((budget * columns) / rows))), budget)
  const targetRows = count <= budget ? rows : Math.min(rows, Math.floor(budget / targetColumns))
  function axis(size: number, target: number) {
    const stride = target === 1 ? size : Math.max(1, Math.ceil((size - 1) / (target - 1)))
    return { stride, count: target === 1 ? 1 : Math.ceil((size - 1) / stride) + 1 }
  }
  const x = axis(columns, targetColumns)
  const y = axis(rows, targetRows)
  const indices: Array<{ column: number; row: number }> = []
  for (let row = 0; row < y.count; row++) {
    for (let column = 0; column < x.count; column++) {
      indices.push({
        column: Math.min(columns - 1, column * x.stride),
        row: Math.min(rows - 1, row * y.stride),
      })
    }
  }
  return {
    indices,
    stride: { columns: x.stride, rows: y.stride },
    sampled: { columns: x.count, rows: y.count },
  }
}

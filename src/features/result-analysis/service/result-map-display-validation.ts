/** Public presentation validation. Never accepts or rewrites scientific values. */
export type ResultMapRangeInput = {
  min: number | string
  max: number | string
  symmetricZero?: boolean
}
export type ResultMapRange = { min: number; max: number; symmetricZero: boolean }
export type ResultMapRangeValidation =
  | { ok: true; range: ResultMapRange }
  | { ok: false; error: string }

export function validateResultMapRange(
  input: ResultMapRangeInput,
  constraints: { nonnegative?: boolean; difference?: boolean } = {},
): ResultMapRangeValidation {
  const min =
    typeof input.min === 'string' && input.min.trim() === '' ? Number.NaN : Number(input.min)
  const max =
    typeof input.max === 'string' && input.max.trim() === '' ? Number.NaN : Number(input.max)
  if (!Number.isFinite(min) || !Number.isFinite(max))
    return { ok: false, error: '请输入有限数值 / Minimum and maximum must be finite numbers.' }
  if (min >= max)
    return { ok: false, error: '下限必须小于上限 / Minimum must be less than maximum.' }
  if (constraints.nonnegative && min < 0)
    return {
      ok: false,
      error: '绝对值下限不能为负 / Wind, precipitation and spread require a nonnegative minimum.',
    }
  const symmetricZero = constraints.difference === true && input.symmetricZero === true
  const magnitude = Math.max(Math.abs(min), Math.abs(max))
  return {
    ok: true,
    range: {
      min: symmetricZero ? -magnitude : min,
      max: symmetricZero ? magnitude : max,
      symmetricZero,
    },
  }
}

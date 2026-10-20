import type { ResultMapKind } from './result-map'

export type ResultMapComparisonLayout = '2×2' | '1×4'
export type ResultMapLayout =
  | { mode: ResultMapComparisonLayout }
  | { mode: 'single'; kind: ResultMapKind; returnTo: ResultMapComparisonLayout }

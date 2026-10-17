export type AccuracyMetrics = {
  rmse: number
  mae: number
  r2: number
  n: number
}

export type AccuracyResult =
  | { available: true; metrics: AccuracyMetrics }
  | { available: false; reason: string }

export function calculateAccuracyMetrics(observed: number[], predicted: number[]): AccuracyResult {
  if (observed.length !== predicted.length) {
    return { available: false, reason: 'Sample count mismatch' }
  }

  if (observed.length === 0) {
    return { available: false, reason: 'No common valid samples' }
  }

  const n = observed.length

  // Calculate RMSE
  let sumSquaredError = 0
  for (let i = 0; i < n; i++) {
    const obs = observed[i]
    const pred = predicted[i]
    if (obs === undefined || pred === undefined) continue
    const error = pred - obs
    sumSquaredError += error * error
  }
  const rmse = Math.sqrt(sumSquaredError / n)

  // Calculate MAE
  let sumAbsoluteError = 0
  for (let i = 0; i < n; i++) {
    const obs = observed[i]
    const pred = predicted[i]
    if (obs === undefined || pred === undefined) continue
    sumAbsoluteError += Math.abs(pred - obs)
  }
  const mae = sumAbsoluteError / n

  // Calculate R²
  const observedMean = observed.reduce((sum, val) => sum + val, 0) / n
  let sst = 0 // Total sum of squares
  let sse = 0 // Sum of squared errors
  for (let i = 0; i < n; i++) {
    const obs = observed[i]
    const pred = predicted[i]
    if (obs === undefined || pred === undefined) continue
    sst += (obs - observedMean) ** 2
    sse += (pred - obs) ** 2
  }
  const r2 = sst === 0 ? NaN : 1 - sse / sst

  return {
    available: true,
    metrics: { rmse, mae, r2, n },
  }
}

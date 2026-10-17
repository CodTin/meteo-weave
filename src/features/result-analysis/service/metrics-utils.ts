/**
 * Shared accuracy metrics utilities
 *
 * Common functions for calculating error metrics (RMSE, MAE) across
 * different analysis modules (elevation grouping, error maps, etc.)
 */

/**
 * Calculates Root Mean Square Error.
 *
 * @param errors - Array of error values (prediction - observation)
 * @returns RMSE value, or 0 if no errors provided
 */
export function calculateRmse(errors: number[]): number {
  if (errors.length === 0) return 0
  const sumSquares = errors.reduce((sum, err) => sum + err * err, 0)
  return Math.sqrt(sumSquares / errors.length)
}

/**
 * Calculates Mean Absolute Error.
 *
 * @param errors - Array of error values (prediction - observation)
 * @returns MAE value, or 0 if no errors provided
 */
export function calculateMae(errors: number[]): number {
  if (errors.length === 0) return 0
  const sumAbs = errors.reduce((sum, err) => sum + Math.abs(err), 0)
  return sumAbs / errors.length
}

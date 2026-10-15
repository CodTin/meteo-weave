/**
 * Task naming utilities for downscaling tasks.
 * Provides default name generation based on configuration parameters.
 */

const variableNames = {
  temperature: '气温',
  wind: '风场',
  pressure: '气压',
  precipitation: '降水',
} as const

/**
 * Generate a default task name from configuration.
 * Uses single-day format for matching start/end dates, otherwise region-based format.
 */
export function generateDefaultTaskName(config: {
  variable: string
  region: { west: number; east: number; south: number; north: number }
  timeRange: { mode: string; start: string; end: string }
}): string {
  const varName = variableNames[config.variable as keyof typeof variableNames] || config.variable

  if (config.timeRange.mode === 'historical' && config.timeRange.start === config.timeRange.end) {
    // Single day
    return `${varName} · ${config.timeRange.start}`
  }

  return `${varName} · ${config.region.west}-${config.region.east}E, ${config.region.south}-${config.region.north}N`
}

/**
 * Shared time formatting utilities for time series visualizations
 */

/**
 * Formats an ISO string to localized time format based on granularity
 */
export function formatTimeSeriesTime(isoString: string, granularity: 'hourly' | 'daily'): string {
  const date = new Date(isoString)
  if (granularity === 'daily') {
    return date.toLocaleDateString('zh-CN', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }
  return date.toLocaleString('zh-CN', {
    timeZone: 'UTC',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

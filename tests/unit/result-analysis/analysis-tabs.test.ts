import { describe, expect, it } from 'vitest'
import type { AnalysisTab } from '@/features/result-analysis/components/analysis-tabs'

describe('Result Analysis - Analysis Tabs', () => {
  it('defines five valid tab types', () => {
    const validTabs: AnalysisTab[] = [
      'map-comparison',
      'accuracy',
      'time-series',
      'spatial',
      'export',
    ]

    expect(validTabs).toHaveLength(5)
    expect(validTabs).toContain('map-comparison')
    expect(validTabs).toContain('accuracy')
    expect(validTabs).toContain('time-series')
    expect(validTabs).toContain('spatial')
    expect(validTabs).toContain('export')
  })

  it('map-comparison is the default tab', () => {
    const defaultTab: AnalysisTab = 'map-comparison'
    expect(defaultTab).toBe('map-comparison')
  })
})

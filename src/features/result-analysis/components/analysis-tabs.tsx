import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export type AnalysisTab = 'map-comparison' | 'accuracy' | 'time-series' | 'spatial' | 'export'

interface AnalysisTabsProps {
  activeTab: AnalysisTab
  onTabChange: (tab: AnalysisTab) => void
  children: React.ReactNode
}

export function AnalysisTabs({ activeTab, onTabChange, children }: AnalysisTabsProps) {
  return (
    <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as AnalysisTab)}>
      <TabsList className="grid w-full grid-cols-5">
        <TabsTrigger value="map-comparison">地图对比</TabsTrigger>
        <TabsTrigger value="accuracy">精度评估</TabsTrigger>
        <TabsTrigger value="time-series">时间序列</TabsTrigger>
        <TabsTrigger value="spatial">空间分析</TabsTrigger>
        <TabsTrigger value="export">数据导出</TabsTrigger>
      </TabsList>
      {children}
    </Tabs>
  )
}

interface TabPanelProps {
  value: AnalysisTab
  children: React.ReactNode
}

export function TabPanel({ value, children }: TabPanelProps) {
  return <TabsContent value={value}>{children}</TabsContent>
}

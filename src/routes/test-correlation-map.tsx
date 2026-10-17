import { createFileRoute } from '@tanstack/react-router'
import { CorrelationMapPanel } from '@/features/result-analysis/components/correlation-map-panel'

export const Route = createFileRoute('/test-correlation-map')({
  component: TestCorrelationMapPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      scenario: (search.scenario as string) || 'default',
    }
  },
})

function TestCorrelationMapPage() {
  const { scenario } = Route.useSearch()

  // Mock data for testing
  const mockTaskId = 'test-task-123'
  const mockVariable = 'temperature' as const
  const mockRegion = {
    west: 100,
    east: 110,
    south: 30,
    north: 40,
  }
  const mockTimeWindow = {
    start: '2020-01-01T00:00:00Z',
    end: '2020-01-05T00:00:00Z',
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="mb-4 text-2xl font-bold">Correlation Map Test Page</h1>
      <p className="mb-4 text-sm text-muted-foreground">Test scenario: {scenario}</p>
      <CorrelationMapPanel
        taskId={mockTaskId}
        variable={mockVariable}
        region={mockRegion}
        timeWindow={mockTimeWindow}
        requestId={scenario}
      />
    </div>
  )
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ComparisonInfoCard } from './comparison-info-card'

interface MapComparisonPanelProps {
  taskId: string
  variable: string
  unit: string
  region: {
    west: number
    east: number
    south: number
    north: number
  }
  timeSlice: string
}

export function MapComparisonPanel({
  taskId,
  variable,
  unit,
  region,
  timeSlice,
}: MapComparisonPanelProps) {
  return (
    <div className="space-y-4">
      {/* Four-map grid layout */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Original Data */}
        <Card>
          <CardHeader>
            <CardTitle>Original Data</CardTitle>
            <CardDescription>
              {variable} · {unit} · 10km spacing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="aspect-video rounded-md border bg-muted">
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Original field map loading...
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Downscaled Data */}
        <Card>
          <CardHeader>
            <CardTitle>Downscaled Data</CardTitle>
            <CardDescription>
              {variable} · {unit} · High-resolution
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="aspect-video rounded-md border bg-muted">
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Downscaled field map loading...
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Observation Data */}
        <Card>
          <CardHeader>
            <CardTitle>Observation Data</CardTitle>
            <CardDescription>
              {variable} · {unit} · Interpolated from synthetic stations, for display only
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="aspect-video rounded-md border bg-muted">
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Observation field map loading...
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Difference */}
        <Card>
          <CardHeader>
            <CardTitle>Difference (Downscaled - Original)</CardTitle>
            <CardDescription>
              {unit} · Positive: downscaled predicts higher · Negative: lower
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="aspect-video rounded-md border bg-muted">
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Difference map loading...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Metadata */}
      <ComparisonInfoCard taskId={taskId} timeSlice={timeSlice} region={region} />
    </div>
  )
}

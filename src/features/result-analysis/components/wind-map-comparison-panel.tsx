import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ComparisonInfoCard } from './comparison-info-card'

interface WindMapComparisonPanelProps {
  taskId: string
  region: {
    west: number
    east: number
    south: number
    north: number
  }
  timeSlice: string
  requestId?: string
}

export function WindMapComparisonPanel({ taskId, region, timeSlice, requestId: _requestId }: WindMapComparisonPanelProps) {
  return (
    <div className="space-y-4">
      {/* Four-map grid layout */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Original Data */}
        <Card>
          <CardHeader>
            <CardTitle>Original Data</CardTitle>
            <CardDescription>Wind Speed · m/s · 10km spacing</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="aspect-video rounded-md border bg-muted">
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Original wind field map loading...
              </p>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Wind speed computed from U10/V10 components. Direction arrows show meteorological
              from-direction.
            </p>
          </CardContent>
        </Card>

        {/* Downscaled Data */}
        <Card>
          <CardHeader>
            <CardTitle>Downscaled Data</CardTitle>
            <CardDescription>Wind Speed · m/s · High-resolution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="aspect-video rounded-md border bg-muted">
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Downscaled wind field map loading...
              </p>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Wind speed computed from U10/V10 components. Direction arrows show meteorological
              from-direction.
            </p>
          </CardContent>
        </Card>

        {/* Observation Data */}
        <Card>
          <CardHeader>
            <CardTitle>Observation Data</CardTitle>
            <CardDescription>
              Wind Speed · m/s · Interpolated from synthetic stations, for display only
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="aspect-video rounded-md border bg-muted">
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Observation wind field map loading...
              </p>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Wind speed computed from U10/V10 components. Direction arrows show meteorological
              from-direction.
            </p>
          </CardContent>
        </Card>

        {/* Difference */}
        <Card>
          <CardHeader>
            <CardTitle>Difference (Downscaled - Original)</CardTitle>
            <CardDescription>
              Wind Speed Difference · m/s · Positive: downscaled predicts higher · Negative: lower
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="aspect-video rounded-md border bg-muted">
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Wind speed difference map loading...
              </p>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Difference computed from wind speeds (not direction angles). Zero-symmetric diverging
              color scale.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Wind-specific Legend and Info */}
      <Card>
        <CardHeader>
          <CardTitle>Wind Vector Legend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="mb-2 text-sm font-medium">Direction Convention</h4>
              <p className="text-sm text-muted-foreground">
                Arrows show meteorological <strong>from-direction</strong> (0° = North, 90° = East,
                180° = South, 270° = West). Arrow points toward the direction wind is flowing to.
              </p>
            </div>
            <div>
              <h4 className="mb-2 text-sm font-medium">Calm Wind</h4>
              <p className="text-sm text-muted-foreground">
                Zero wind speed (U10=0, V10=0) is valid calm wind with no determinable direction. No
                arrow is drawn for calm wind.
              </p>
            </div>
            <div>
              <h4 className="mb-2 text-sm font-medium">Missing Components</h4>
              <p className="text-sm text-muted-foreground">
                If either U10 or V10 is missing, wind speed and direction are unavailable. Missing
                components are never treated as zero.
              </p>
            </div>
            <div>
              <h4 className="mb-2 text-sm font-medium">Color Scale</h4>
              <p className="text-sm text-muted-foreground">
                Wind speed: Green → Yellow → Red (0 to maximum). Difference: Blue ← Zero → Red
                (symmetric diverging scale).
              </p>
            </div>
            <div>
              <h4 className="mb-2 text-sm font-medium">Ensemble Mean</h4>
              <p className="text-sm text-muted-foreground">
                For probabilistic forecasts, U10 and V10 components are averaged separately before
                computing wind speed and direction. Direction angles are never averaged directly.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metadata */}
      <ComparisonInfoCard taskId={taskId} timeSlice={timeSlice} region={region} variable="wind" />
    </div>
  )
}

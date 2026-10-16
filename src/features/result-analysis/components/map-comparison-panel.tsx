import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import {
  type Variable,
  getAbsoluteColorScale,
  getDifferenceColorScale,
  getVariableUnit,
  getVariableLabel,
} from '../service/color-scales'
import type { AccumulationInterval } from '../service/comparison-data'

interface MapComparisonPanelProps {
  taskId: string
  variable: Variable
  region: {
    west: number
    east: number
    south: number
    north: number
  }
  timeSlice: string
  accumulationInterval?: AccumulationInterval
  intervalsMatch?: boolean
}

interface MapCardProps {
  title: string
  description: string
  colorScaleDescription: string
  loadingText: string
}

function MapCard({ title, description, colorScaleDescription, loadingText }: MapCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="aspect-video rounded-md border bg-muted">
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {loadingText}
          </p>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          Color scale: {colorScaleDescription}
        </div>
      </CardContent>
    </Card>
  )
}

export function MapComparisonPanel({
  taskId,
  variable,
  region,
  timeSlice,
  accumulationInterval,
  intervalsMatch = true,
}: MapComparisonPanelProps) {
  const unit = getVariableUnit(variable)
  const variableLabel = getVariableLabel(variable)
  const absoluteColorScale = getAbsoluteColorScale(variable)
  const differenceColorScale = getDifferenceColorScale()

  const formatAccumulationInterval = (interval?: AccumulationInterval) => {
    if (!interval) return null
    const start = new Date(interval.start).toISOString().slice(0, 16)
    const end = new Date(interval.end).toISOString().slice(0, 16)
    return `${start} to ${end}`
  }

  return (
    <div className="space-y-4">
      {/* Accumulation interval warning for precipitation */}
      {variable === 'precipitation' && !intervalsMatch && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>
            Accumulation intervals do not match. Raw and downscaled data have different time
            coverage and cannot be compared directly. Difference map is not available.
          </AlertDescription>
        </Alert>
      )}

      {/* Accumulation interval display for precipitation */}
      {variable === 'precipitation' && accumulationInterval && intervalsMatch && (
        <Alert>
          <AlertDescription>
            <strong>Accumulation Interval:</strong>{' '}
            {formatAccumulationInterval(accumulationInterval)}
          </AlertDescription>
        </Alert>
      )}

      {/* Four-map grid layout */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Original Data */}
        <MapCard
          title="Original Data"
          description={`${variableLabel} · ${unit} · 10km spacing`}
          colorScaleDescription={absoluteColorScale.description}
          loadingText="Original field map loading..."
        />

        {/* Downscaled Data */}
        <MapCard
          title="Downscaled Data"
          description={`${variableLabel} · ${unit} · High-resolution`}
          colorScaleDescription={absoluteColorScale.description}
          loadingText="Downscaled field map loading..."
        />

        {/* Observation Data */}
        <MapCard
          title="Observation Data"
          description={`${variableLabel} · ${unit} · Interpolated from synthetic stations, for display only`}
          colorScaleDescription={absoluteColorScale.description}
          loadingText="Observation field map loading..."
        />

        {/* Difference */}
        <Card>
          <CardHeader>
            <CardTitle>Difference (Downscaled - Original)</CardTitle>
            <CardDescription>
              {unit} · Positive: downscaled predicts higher · Negative: lower
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!intervalsMatch && variable === 'precipitation' ? (
              <div className="aspect-video rounded-md border bg-muted">
                <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Not comparable - accumulation intervals differ
                </p>
              </div>
            ) : (
              <>
                <div className="aspect-video rounded-md border bg-muted">
                  <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Difference map loading...
                  </p>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Color scale: {differenceColorScale.description}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle>Comparison Info</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Task ID</dt>
              <dd className="font-mono text-xs">{taskId.slice(0, 8)}...</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {variable === 'precipitation' && accumulationInterval
                  ? 'Accumulation End'
                  : 'Time Slice'}
              </dt>
              <dd className="font-medium">{new Date(timeSlice).toISOString().slice(0, 16)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Region</dt>
              <dd className="font-medium">
                [{region.west.toFixed(1)}, {region.east.toFixed(1)}] × [{region.south.toFixed(1)},{' '}
                {region.north.toFixed(1)}]
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Color Scale</dt>
              <dd className="font-medium">Shared absolute (O/D/Obs) · Diverging (Diff)</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}

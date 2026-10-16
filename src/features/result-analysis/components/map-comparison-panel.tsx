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
import { ComparisonInfoCard } from './comparison-info-card'
import { useObservationViewMode } from '../hooks/use-observation-view-mode'
import { ObservationViewToggle } from './observation-view-toggle'

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
  requestId?: string
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
  requestId: _requestId,
  accumulationInterval,
  intervalsMatch = true,
}: MapComparisonPanelProps) {
  const unit = getVariableUnit(variable)
  const variableLabel = getVariableLabel(variable)
  const absoluteColorScale = getAbsoluteColorScale(variable)
  const differenceColorScale = getDifferenceColorScale()
  const { mode: observationMode, toggle: toggleObservationMode } = useObservationViewMode()

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
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <CardTitle>Observation Data</CardTitle>
                <CardDescription>
                  {variableLabel} · {unit}
                  {observationMode === 'interpolated' &&
                    ' · Interpolated from synthetic stations, for display only'}
                  {observationMode === 'station' && ' · Synthetic station points'}
                </CardDescription>
              </div>
              <ObservationViewToggle mode={observationMode} onToggle={toggleObservationMode} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="aspect-video rounded-md border bg-muted">
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {observationMode === 'interpolated'
                  ? 'Observation field map loading...'
                  : 'Station points loading...'}
              </p>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Color scale: {absoluteColorScale.description}
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
      <ComparisonInfoCard
        taskId={taskId}
        timeSlice={timeSlice}
        region={region}
        variable={variable}
        accumulationInterval={accumulationInterval}
      />
    </div>
  )
}

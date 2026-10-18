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
import { EnsembleSwitcher } from './ensemble-switcher'
import { useEnsembleSelection } from '../hooks/use-ensemble-selection'

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
  isProbabilistic?: boolean
  allMemberIds?: string[]
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

interface MapPlaceholderProps {
  loadingText: string
}

function MapPlaceholder({ loadingText }: MapPlaceholderProps) {
  return (
    <div className="aspect-video rounded-md border bg-muted">
      <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {loadingText}
      </p>
    </div>
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
  isProbabilistic = false,
  allMemberIds = [],
}: MapComparisonPanelProps) {
  const unit = getVariableUnit(variable)
  const variableLabel = getVariableLabel(variable)
  const absoluteColorScale = getAbsoluteColorScale(variable)
  const differenceColorScale = getDifferenceColorScale()
  const { mode: observationMode, toggle: toggleObservationMode } = useObservationViewMode()
  const { view: ensembleView, selectView: selectEnsembleView } = useEnsembleSelection()

  const formatAccumulationInterval = (interval?: AccumulationInterval) => {
    if (!interval) return null
    const start = new Date(interval.start).toISOString().slice(0, 16)
    const end = new Date(interval.end).toISOString().slice(0, 16)
    return `${start} to ${end}`
  }

  const getDownscaledDescription = () => {
    if (!isProbabilistic) {
      return `${variableLabel} · ${unit} · High-resolution`
    }
    if (ensembleView === 'mean') {
      return `${variableLabel} · ${unit} · Ensemble Mean · Synthetic Demo`
    }
    if (ensembleView === 'stddev') {
      return `${variableLabel} · ${unit} · Standard Deviation (ensemble spread) · Synthetic Demo`
    }
    const memberLabel = ensembleView.replace('member-', 'Member ')
    return `${variableLabel} · ${unit} · ${memberLabel} · Synthetic Demo`
  }

  return (
    <div className="space-y-4">
      {/* Ensemble switcher for probabilistic tasks */}
      {isProbabilistic && allMemberIds.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <EnsembleSwitcher
              view={ensembleView}
              onViewChange={selectEnsembleView}
              allMemberIds={allMemberIds}
              effectiveK={allMemberIds.length}
            />
          </CardContent>
        </Card>
      )}

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
          description={getDownscaledDescription()}
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
            <MapPlaceholder
              loadingText={
                observationMode === 'interpolated'
                  ? 'Observation field map loading...'
                  : 'Station points loading...'
              }
            />
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
              <MapPlaceholder loadingText="Not comparable - accumulation intervals differ" />
            ) : (
              <>
                <MapPlaceholder loadingText="Difference map loading..." />
                <div className="mt-2 text-xs text-muted-foreground">
                  Color scale: {differenceColorScale.description}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Comparison metadata */}
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

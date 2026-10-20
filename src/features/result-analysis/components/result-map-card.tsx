import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { ResultMapData, ResultMapDisplaySettings, ResultMapLayer } from '../types/result-map'
import { getVariableLabel } from '../service/color-scales'
import { resultMapTitles } from '../service/result-map-display'
import { ResultMapLegend } from './result-map-legend'

interface ResultMapCardProps {
  data: ResultMapLayer
  context: ResultMapData
  display: ResultMapDisplaySettings
  onRetry: () => void
  children?: ReactNode
}

export function ResultMapCard({ data, context, display, onRetry, children }: ResultMapCardProps) {
  const grid = data.grid
  const stationMode = data.kind === 'observation' && context.observationMode === 'stations'
  const spread = data.kind === 'downscaled' && data.ensemble?.kind === 'stddev'
  const valid = data.samples.filter(
    (sample) => sample.value !== null && Number.isFinite(sample.value),
  ).length
  const interval = data.samples.find((sample) => sample.accumulation)?.accumulation
  const counts = data.samples.flatMap((sample) =>
    sample.ensembleMean ? [sample.ensembleMean.sampleCount] : [],
  )
  const description =
    data.kind === 'difference'
      ? 'Positive: downscaled predicts higher · Negative: lower · Not accuracy improvement'
      : data.kind === 'observation'
        ? stationMode
          ? 'Synthetic station locations and values · Not real observations'
          : 'Interpolated from synthetic stations, for display only'
        : spread
          ? 'Standard Deviation (ensemble spread) · Not validated uncertainty'
          : data.ensemble?.kind === 'members'
            ? data.ensemble.memberIds.join(', ')
            : data.ensemble
              ? 'Ensemble Mean'
              : data.kind === 'original'
                ? 'Native original grid'
                : 'Native target grid'
  return (
    <Card>
      <CardHeader>
        <CardTitle>{resultMapTitles[data.kind]}</CardTitle>
        <CardDescription>
          {getVariableLabel(data.displayContext?.variable ?? context.variable)} · {display.unit} ·{' '}
          {description} · Synthetic Demo
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.status === 'ready' ? (
          children
        ) : (
          <div
            role={data.status === 'error' ? 'alert' : 'status'}
            className="rounded-md border p-4 text-sm"
          >
            <p>
              {data.status === 'error' ? '读取失败 / Read failed' : '数据不可用 / Unavailable'}
              {data.code ? ` (${data.code})` : ''}
            </p>
            <p className="mt-1 break-words text-muted-foreground">{data.reason}</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={onRetry}>
              重试读取 {resultMapTitles[data.kind]}
            </Button>
          </div>
        )}
        {grid && (
          <p className="text-xs text-muted-foreground">
            {stationMode ? 'Station identity' : `${grid.nominalSpacingKm} km native spacing`} ·{' '}
            {grid.interpolation} · {grid.sampling}
          </p>
        )}
        {grid && grid.sampling !== 'requested-points' && (
          <p className="text-xs text-muted-foreground">
            {grid.returnedPoints} / {grid.availablePoints} sampled locations · stride{' '}
            {grid.stride.columns} × {grid.stride.rows}
            {grid.sampling === 'decimated-grid'
              ? ' · 预览抽稀 / decimated preview, not a lower-resolution result'
              : ''}
          </p>
        )}
        {data.status === 'ready' && (
          <p className="text-xs text-muted-foreground">
            {valid} valid · {data.samples.length - valid} missing ·{' '}
            {stationMode ? 'Station View' : 'Grid View'}
          </p>
        )}
        {counts.length > 0 && (
          <p className="text-xs text-muted-foreground">
            K = {Math.min(...counts)}–{Math.max(...counts)} available members per location; missing
            members excluded, not zero-filled.
          </p>
        )}
        {data.ensemble?.kind === 'members' && (
          <p className="text-xs text-muted-foreground">
            Member values: {data.ensemble.memberIds.join(', ')}; {data.ensemble.unavailable.length}{' '}
            unavailable slots.
          </p>
        )}
        {interval && (
          <p className="text-xs text-muted-foreground">
            Accumulation Interval (UTC): [{interval.start}, {interval.end}) ·{' '}
            {interval.sampledHours}/{interval.expectedHours} hours ·{' '}
            {interval.complete ? 'complete' : 'partial, not the full requested interval'}
          </p>
        )}
        {data.provenance && (
          <p className="break-words text-xs text-muted-foreground">
            Source: {data.provenance.label} · {data.provenance.dataSource} configuration label ·{' '}
            {data.provenance.generatorVersion}
          </p>
        )}
        {data.reference && (
          <p className="break-words text-xs text-muted-foreground">
            Reference: {data.reference.referenceVersion} · seed {data.reference.referenceSeed} ·
            synthetic-stations ·{' '}
            {stationMode
              ? 'actual reference station coordinates'
              : 'bilinear-station-values, not measured at every grid node'}
          </p>
        )}
        {data.kind === 'difference' && data.reason && (
          <p className="text-xs text-muted-foreground">{data.reason}</p>
        )}
        <ResultMapLegend display={display} />
      </CardContent>
    </Card>
  )
}

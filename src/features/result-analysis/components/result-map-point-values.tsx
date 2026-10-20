import type { ResultMapPointResult } from '../types/result-map-point'
import { resultMapTitles } from '../service/result-map-display'

export function ResultMapPointValues({ result }: { result: ResultMapPointResult }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
      {(['original', 'downscaled', 'observation', 'difference'] as const).map((kind) => {
        const value = result.values[kind]
        return (
          <section
            key={kind}
            aria-label={`${resultMapTitles[kind]} point value`}
            className="rounded-md border p-3 text-sm"
          >
            <h4 className="font-semibold">{resultMapTitles[kind]}</h4>
            {value.status === 'available' ? (
              <>
                <output className="block font-mono">
                  {Number(value.sample.value.toFixed(4))} {value.metadata.unit}
                </output>
                <p className="text-xs text-muted-foreground">
                  {value.metadata.quantity} · {value.metadata.temporalStatistic} ·{' '}
                  {value.metadata.grid.interpolation} requested-point sampling
                </p>
                {value.sample.accumulation && (
                  <>
                    <p className="break-all text-xs">
                      Accumulation (UTC) [{value.sample.accumulation.start},{' '}
                      {value.sample.accumulation.end})
                    </p>
                    <p className="break-all text-xs">
                      Requested (UTC) [{value.sample.accumulation.requestedStart},{' '}
                      {value.sample.accumulation.requestedEnd}) ·{' '}
                      {value.sample.accumulation.sampledHours}/
                      {value.sample.accumulation.expectedHours} hours ·{' '}
                      {value.sample.accumulation.complete
                        ? 'complete'
                        : 'partial; not the full interval'}
                    </p>
                  </>
                )}
                {value.sample.daily && (
                  <p className="break-all text-xs">
                    Daily mean (UTC) [{value.sample.daily.start}, {value.sample.daily.end}) ·{' '}
                    {value.sample.daily.sampledHours}/{value.sample.daily.expectedHours} hours ·{' '}
                    {value.sample.daily.completeDay
                      ? 'complete day'
                      : 'partial; not a full-day mean'}{' '}
                    · minimum diagnostic {value.sample.daily.minimum} {value.metadata.unit}
                  </p>
                )}
                {kind === 'downscaled' && value.metadata.ensemble && (
                  <>
                    <p className="break-all text-xs">
                      {value.sample.memberId
                        ? `Member ${value.sample.memberId}`
                        : value.metadata.ensemble.kind === 'stddev'
                          ? 'Standard Deviation · ensemble spread, not forecast level'
                          : 'Ensemble mean'}
                      {value.sample.ensembleMean &&
                        ` · ${value.sample.ensembleMean.sampleCount}/${value.metadata.ensemble.memberIds.length} valid members`}{' '}
                      · exclude unavailable members, never zero fill.
                    </p>
                    {value.metadata.ensemble.meanDefinition && (
                      <p className="text-xs">{value.metadata.ensemble.meanDefinition}</p>
                    )}
                  </>
                )}
                {kind !== 'difference' && value.metadata.variable === 'wind' && (
                  <p className="text-xs">
                    Wind speed {value.sample.speed} m/s · U10 {value.sample.u10} · V10{' '}
                    {value.sample.v10} · meteorological-from direction{' '}
                    {value.sample.fromDirection === null
                      ? 'unavailable for valid calm zero'
                      : `${value.sample.fromDirection}°`}
                    . Mean components before speed; not mean member magnitudes; directions are not
                    subtracted.
                  </p>
                )}
                {kind === 'observation' && value.sample.observation?.mode === 'stations' && (
                  <>
                    <p className="break-all text-xs">
                      Actual synthetic station {value.sample.observation.station.id} · longitude{' '}
                      {value.sample.observation.station.longitude} · latitude{' '}
                      {value.sample.observation.station.latitude}
                    </p>
                    <p className="text-xs">
                      {Number(value.sample.observation.distanceKm.toFixed(4))} km from requested
                      point ·{' '}
                      {value.sample.observation.station.longitude === result.point.longitude &&
                      value.sample.observation.station.latitude === result.point.latitude
                        ? 'colocated synthetic station'
                        : 'not colocated; not point-error validation'}
                    </p>
                  </>
                )}
                {kind === 'observation' && value.sample.observation?.mode === 'interpolated' && (
                  <>
                    <p className="text-xs">
                      Interpolated synthetic reference at the requested point; not an actual station
                      or measured validation.
                    </p>
                    <ul className="space-y-1 break-all text-xs">
                      {value.sample.observation.stations.map(({ station, weight }) => (
                        <li key={station.id}>
                          {station.id} · longitude,latitude {station.longitude},{station.latitude} ·
                          weight {weight}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {kind === 'observation' && value.metadata.reference && (
                  <p className="break-all text-xs text-muted-foreground">
                    Synthetic reference {value.metadata.reference.referenceVersion} · reference seed{' '}
                    {value.metadata.reference.referenceSeed}; independent of model seed.
                  </p>
                )}
                {value.reason && <p className="text-xs text-muted-foreground">{value.reason}</p>}
              </>
            ) : (
              <p>
                {value.status === 'error' ? 'Query failed' : 'Unavailable'} · {value.code}:{' '}
                {value.reason}
              </p>
            )}
          </section>
        )
      })}
    </div>
  )
}

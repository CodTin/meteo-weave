import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useResultMapPointContext } from './result-map-point-context'
import { ResultMapPointValues } from './result-map-point-values'

export function ResultMapPointQuery() {
  const context = useResultMapPointContext()
  const id = useId()
  const [longitude, setLongitude] = useState('')
  const [latitude, setLatitude] = useState('')
  if (!context) return null
  const { point, query } = context
  return (
    <section aria-label="Joint point query" className="space-y-3 rounded-md border p-4">
      <h3 className="font-semibold">Joint point query · Synthetic Demo</h3>
      <p id={`${id}-help`} className="text-sm text-muted-foreground">
        Longitude / latitude · EPSG:4326. One point for Original, Downscaled, synthetic reference
        and Difference; not accuracy improvement.
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          context.selectPoint({
            longitude: longitude.trim() ? Number(longitude) : Number.NaN,
            latitude: latitude.trim() ? Number(latitude) : Number.NaN,
          })
        }}
      >
        <div className="min-w-0 flex-1 basis-36 space-y-1">
          <Label htmlFor={`${id}-longitude`}>Longitude</Label>
          <Input
            id={`${id}-longitude`}
            inputMode="decimal"
            value={longitude}
            aria-describedby={`${id}-help`}
            onChange={(event) => setLongitude(event.target.value)}
          />
        </div>
        <div className="min-w-0 flex-1 basis-36 space-y-1">
          <Label htmlFor={`${id}-latitude`}>Latitude</Label>
          <Input
            id={`${id}-latitude`}
            inputMode="decimal"
            value={latitude}
            aria-describedby={`${id}-help`}
            onChange={(event) => setLatitude(event.target.value)}
          />
        </div>
        <Button type="submit">Query point</Button>
        <Button type="button" variant="outline" onClick={context.clearPoint}>
          Clear point
        </Button>
      </form>
      {point && (
        <output aria-label="Canonical point" className="block break-all font-mono text-xs">
          longitude {String(point.longitude)} · latitude {String(point.latitude)}
        </output>
      )}
      {query.status === 'idle' ? (
        <p className="text-sm text-muted-foreground">
          Hover a map or enter coordinates to query one geographic point.
        </p>
      ) : query.status === 'pending' ? (
        <output aria-label="Point query pending">
          Reading current point… Previous point values are not shown.
        </output>
      ) : (
        <>
          <output aria-label="Point frame" className="block break-all font-mono text-xs">
            {query.result.selection.time} · UTC
          </output>
          <ResultMapPointValues result={query.result} />
        </>
      )}
    </section>
  )
}

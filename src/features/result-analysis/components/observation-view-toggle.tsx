import { Button } from '@/components/ui/button'
import { MapPin, Grid3x3 } from 'lucide-react'
import type { ObservationViewMode } from '../types/observation-view-mode'

interface ObservationViewToggleProps {
  mode: ObservationViewMode
  onToggle: () => void
}

/**
 * Toggle button for switching between station and interpolated observation views.
 * Keyboard accessible with clear visual indication of current mode.
 */
export function ObservationViewToggle({ mode, onToggle }: ObservationViewToggleProps) {
  const isStation = mode === 'station'

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onToggle}
      className="gap-2"
      aria-label={isStation ? 'Switch to Interpolated View' : 'Switch to Station View'}
      aria-pressed={isStation}
    >
      {isStation ? (
        <>
          <MapPin className="size-4" />
          <span>Station View</span>
        </>
      ) : (
        <>
          <Grid3x3 className="size-4" />
          <span>Interpolated View</span>
        </>
      )}
    </Button>
  )
}

/**
 * Observation view mode for the result analysis map comparison.
 *
 * - station: Display actual synthetic station points with stationId, coordinates, and values
 * - interpolated: Display interpolated field for visual comparison (default)
 */
export type ObservationViewMode = 'station' | 'interpolated'

/**
 * Validates and normalizes observation view mode.
 * Defaults to 'interpolated' for invalid values.
 */
export function normalizeObservationViewMode(mode: string | undefined): ObservationViewMode {
  if (mode === 'station' || mode === 'interpolated') {
    return mode
  }
  return 'interpolated'
}

/**
 * Toggles between station and interpolated view modes.
 */
export function toggleObservationViewMode(current: ObservationViewMode): ObservationViewMode {
  return current === 'station' ? 'interpolated' : 'station'
}

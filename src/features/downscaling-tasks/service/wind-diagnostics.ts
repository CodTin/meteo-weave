/** Shared v1/v2/v3 diagnostics after sampling or averaging valid U10/V10 components.
 * Missing support is rejected by callers, never converted to calm wind here.
 */
export function windDiagnostics(u10: number, v10: number) {
  const round = (value: number) => Math.round(value * 10_000) / 10_000
  const speed = round(Math.hypot(u10, v10))
  return {
    u10,
    v10,
    speed,
    value: speed,
    fromDirection:
      speed === 0 ? null : round(((Math.atan2(-u10, -v10) * 180) / Math.PI + 360) % 360) % 360,
    directionStatus: speed === 0 ? ('calm' as const) : ('available' as const),
  }
}

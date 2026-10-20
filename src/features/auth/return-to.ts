const workspacePaths = new Set([
  '/dashboard',
  '/tasks',
  '/tasks/new',
  '/tasks/compare',
  '/settings',
])
const base = 'https://meteo-weave.invalid'

// Accept only current workspace destinations. Extend deliberately when real task routes arrive.
// Check the raw pathname before URL parsing can normalize slashes, controls or dot segments.
export function safeReturnTo(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value !== value.trim() ||
    value.includes('\\') ||
    [...value].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    !workspacePaths.has(value.split(/[?#]/, 1)[0] ?? '')
  ) {
    return '/dashboard'
  }
  const url = new URL(value, base)
  if (url.origin !== base) return '/dashboard'
  return `${url.pathname}${url.search}${url.hash}`
}

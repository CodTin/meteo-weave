/** Stable diagnostics at the public service boundary; storage failures are never empty success. */
export class TaskStorageError extends Error {
  readonly name = 'TaskStorageError'
  readonly code = 'STORAGE_UNAVAILABLE'
  readonly retryable = true

  constructor(
    readonly operation: 'open' | 'read' | 'write',
    cause: unknown,
  ) {
    super(
      `Browser task storage is unavailable: ${operation} failed. No persistence success is confirmed. ` +
        'Restore browser storage access (or close other tabs), initialize() and retry the operation; saved history was not reset.',
      { cause },
    )
  }
}

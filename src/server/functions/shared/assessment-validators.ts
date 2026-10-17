/**
 * Validates and extracts taskId from assessment function input
 */
export function validateTaskIdInput(data: unknown): { taskId: string } {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid input')
  }
  const input = data as Record<string, unknown>
  if (typeof input.taskId !== 'string') {
    throw new Error('taskId must be a string')
  }
  return { taskId: input.taskId }
}

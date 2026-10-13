import '@tanstack/react-start/server-only'
import { requireDemoAccount } from '@/server/services/demo-session.server'
import { checkDownscalingConfiguration } from '@/features/downscaling-tasks/configuration-admission'

// Admission only: no task, persistence, execution or result is created here.
export function admitDownscalingConfiguration(input: unknown) {
  const account = requireDemoAccount('/tasks/new')
  const result = checkDownscalingConfiguration(account, input)
  return result.ok ? { ...result, ownerId: account.id } : result
}

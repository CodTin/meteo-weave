import { createServerFn } from '@tanstack/react-start'
import { admitDownscalingConfiguration } from '@/server/services/downscaling-admission.server'

// For configuration clients, not task creation. Authenticate before business validation.
export const admitDownscaling = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => input)
  .handler(({ data }) => admitDownscalingConfiguration(data))

import { initializeClientMonitoring } from './lib/monitoring/sentry.client'

import { StartClient } from '@tanstack/react-start/client'
import { startTransition, StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'

startTransition(async () => {
  await initializeClientMonitoring()
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  )
})

import { initializeClientMonitoring } from './lib/monitoring/sentry.client'
import { isWorkspaceResourceError } from './components/workspace/workspace-error'
import { hydrateStart } from '@tanstack/react-start/client'
import { RouterProvider } from '@tanstack/react-router'
import { startTransition, StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'

startTransition(async () => {
  await initializeClientMonitoring()
  const router = await hydrateStart()
  // Start can retain a transported success match when its lazy import fails.
  // Verify the matched workspace module before attaching React to that SSR DOM.
  // loadRouteChunk reuses successful imports; no loaders rerun on normal entries.
  let unavailableWorkspace = false
  for (const match of router.state.matches) {
    if (!match.routeId.startsWith('/_workspace/')) continue
    try {
      await router.loadRouteChunk(router.routesById[match.routeId])
    } catch (error) {
      if (!isWorkspaceResourceError(error)) throw error
      // Let Router produce its genuine route error state and keep the shell usable.
      await router.load()
      unavailableWorkspace = router.state.matches.some(
        (current) =>
          current.routeId === match.routeId &&
          current.status === 'error' &&
          isWorkspaceResourceError(current.error),
      )
    }
  }
  const app = (
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  )
  if (unavailableWorkspace) {
    // The matching SSR component cannot be downloaded. Explicitly mount the
    // available recovery shell instead; no hydration error callback is silenced.
    createRoot(document).render(app)
  } else {
    hydrateRoot(document, app)
  }
})

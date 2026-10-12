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
  let replaceServerDocument = false
  for (const match of router.state.matches) {
    if (!match.routeId.startsWith('/_workspace/')) continue
    try {
      await router.loadRouteChunk(router.routesById[match.routeId])
    } catch (error) {
      if (!isWorkspaceResourceError(error)) throw error
      // Do not retain a transported account during recovery: the session may have expired.
      await router.invalidate({ sync: true })
      // Recovery can now be a resource error OR a login redirect. Neither may hydrate
      // the obsolete successful workspace document, even if the original match is gone.
      replaceServerDocument = true
      break
    }
  }
  const app = (
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  )
  if (replaceServerDocument) {
    // Only a confirmed initial module failure reaches this replacement path.
    // Normal entries retain their SSR DOM; no hydration error callback is silenced.
    createRoot(document).render(app)
  } else {
    hydrateRoot(document, app)
  }
})

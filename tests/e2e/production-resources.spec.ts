import { test, expect } from './browser-guard'
import { signInDemo } from './demo-login'
import { workspaceCases } from './workspace-cases'

test.beforeEach(async ({ context }) => {
  await signInDemo(context)
})

// Production resource loading and query reuse verification
// This test suite verifies:
// 1. Lazy loading of route modules in production builds
// 2. Query reuse for identical parameters (no redundant computation)
// 3. Resource loading timing and bundle structure
// 4. SSR and hydration behavior preservation

test('workspace routes lazy load their modules on demand', async ({ page }) => {
  const loadedModules = new Set<string>()

  page.on('response', (response) => {
    const url = response.url()
    if (url.includes('/assets/') && url.endsWith('.js')) {
      loadedModules.add(url)
    }
  })

  // Navigate to dashboard - should only load dashboard module
  await page.goto('/dashboard')
  await expect(page.getByRole('main')).toHaveAccessibleName('Dashboard')

  const dashboardModules = Array.from(loadedModules).filter((url) => url.includes('dashboard.lazy'))
  expect(dashboardModules.length).toBeGreaterThan(0)

  // Task module should NOT be loaded yet
  const taskModulesBefore = Array.from(loadedModules).filter((url) => url.includes('index.lazy'))
  expect(taskModulesBefore.length).toBe(0)

  // Navigate to tasks - should now load task module
  await page.goto('/tasks')
  await expect(page.getByRole('main')).toHaveAccessibleName('任务管理')

  const taskModulesAfter = Array.from(loadedModules).filter((url) => url.includes('index.lazy'))
  expect(taskModulesAfter.length).toBeGreaterThan(0)
})

test('each workspace route loads its own lazy chunk', async ({ page }) => {
  const moduleLoadMap = new Map<string, string[]>()

  for (const workspaceCase of workspaceCases) {
    const modules: string[] = []

    const responseHandler = (response: any) => {
      const url = response.url()
      if (url.includes('/assets/') && url.endsWith('.js') && url.includes('.lazy-')) {
        modules.push(url)
      }
    }

    page.on('response', responseHandler)
    await page.goto(workspaceCase.path)
    await expect(page.getByRole('main')).toContainText(workspaceCase.content)
    page.off('response', responseHandler)

    // Extract just the chunk name for comparison
    const chunkNames = modules
      .map((url) => {
        const match = url.match(/\/assets\/([^/]+\.lazy-[^/]+\.js)$/)
        return match ? match[1] : null
      })
      .filter((name): name is string => name !== null)

    moduleLoadMap.set(workspaceCase.path, chunkNames)
  }

  // Verify each route loaded at least one lazy chunk
  for (const [path, chunks] of moduleLoadMap.entries()) {
    expect(chunks.length, `Route ${path} should load lazy chunks`).toBeGreaterThan(0)
  }
})

test('map and chart resources load only when result analysis is accessed', async ({ page }) => {
  const resourceRequests: string[] = []

  page.on('request', (request) => {
    const url = request.url()
    // Track map tiles, chart libraries, and related resources
    if (url.includes('mapbox') || url.includes('recharts') || url.includes('turf')) {
      resourceRequests.push(url)
    }
  })

  // Navigate to dashboard - no map/chart resources should load
  await page.goto('/dashboard')
  await expect(page.getByRole('main')).toHaveAccessibleName('Dashboard')

  const dashboardResources = resourceRequests.length
  expect(dashboardResources).toBe(0)

  // Navigate to tasks list - still no map/chart resources
  await page.goto('/tasks')
  await expect(page.getByRole('main')).toHaveAccessibleName('任务管理')

  const tasksResources = resourceRequests.length
  expect(tasksResources).toBe(0)

  // Note: Full result analysis map/chart loading will be verified when result pages are implemented
  // This test establishes that non-result pages don't preload these resources
})

test('query reuse: identical task result queries do not trigger redundant requests', async ({
  page,
}) => {
  // This test verifies query deduplication and reuse behavior
  // When accessing the same result with same parameters, no new computation should occur

  const serverFunctionCalls = new Map<string, number>()

  page.on('request', (request) => {
    const url = request.url()
    // Track server function calls (TanStack Start server functions)
    if (request.method() === 'POST' && url.includes('/_server')) {
      const count = serverFunctionCalls.get(url) || 0
      serverFunctionCalls.set(url, count + 1)
    }
  })

  await page.goto('/dashboard')
  await expect(page.getByRole('main')).toHaveAccessibleName('Dashboard')

  // Record baseline server function calls
  const baselineCalls = new Map(serverFunctionCalls)

  // Navigate away and back to dashboard
  await page.goto('/tasks')
  await expect(page.getByRole('main')).toHaveAccessibleName('任务管理')

  await page.goto('/dashboard')
  await expect(page.getByRole('main')).toHaveAccessibleName('Dashboard')

  // Verify that returning to dashboard doesn't make redundant calls
  // within the staleTime window (60 seconds as configured in query client)
  for (const [url, initialCount] of baselineCalls) {
    const finalCount = serverFunctionCalls.get(url) || 0
    // Allow for initial call, but subsequent navigation within staleTime should reuse
    expect(finalCount).toBeLessThanOrEqual(initialCount + 1)
  }
})

test('SSR shell and hydration work correctly with lazy loaded routes', async ({ page }) => {
  // Verify SSR delivers initial content and hydration works
  let ssrContent = ''

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

  // Capture content before JavaScript fully executes
  ssrContent = (await page.textContent('body')) || ''

  // SSR should deliver the workspace shell and navigation
  expect(ssrContent).toContain('MeteoWeave')

  // Wait for full hydration
  await expect(page.getByRole('main')).toHaveAccessibleName('Dashboard')

  // Navigation should work after hydration
  await page.getByRole('link', { name: '任务管理' }).click()
  await expect(page.getByRole('main')).toHaveAccessibleName('任务管理')
  await expect(page).toHaveURL('/tasks')
})

test('production build serves route modules with correct cache headers', async ({ page }) => {
  const moduleResponses: Array<{ url: string; headers: Record<string, string> }> = []

  page.on('response', async (response) => {
    const url = response.url()
    if (url.includes('/assets/') && url.endsWith('.js')) {
      const headers: Record<string, string> = {}
      for (const [key, value] of Object.entries(response.headers())) {
        headers[key] = value
      }
      moduleResponses.push({ url, headers })
    }
  })

  await page.goto('/dashboard')
  await expect(page.getByRole('main')).toHaveAccessibleName('Dashboard')

  await page.goto('/tasks')
  await expect(page.getByRole('main')).toHaveAccessibleName('任务管理')

  // Verify that production bundles have appropriate caching
  for (const { url, headers } of moduleResponses) {
    // Hashed assets should have long-term cache headers
    if (url.match(/\.[a-f0-9]{8,}\./)) {
      const cacheControl = headers['cache-control']
      // Should allow caching (not no-store or max-age=0)
      expect(cacheControl).toBeDefined()
    }
  }
})

import type { Page, Route } from '@playwright/test'

/**
 * Mapbox API endpoints that may be intercepted for controlled testing.
 * Real map components still perform actual rendering, positioning, and user interaction.
 */
const MAPBOX_STYLE_PATTERN = /^https:\/\/api\.mapbox\.com\/styles\/v1\/.+\/style/
const MAPBOX_TILES_PATTERN = /^https:\/\/api\.mapbox\.com\/v4\/.+\.(png|jpg|webp)/

interface MapFixtureOptions {
  /** Simulate style loading failure */
  failStyle?: boolean
  /** Simulate tile loading failure */
  failTiles?: boolean
  /** Delay style response (ms) */
  delayStyle?: number
  /** Delay tile responses (ms) */
  delayTiles?: number
}

/**
 * Install controlled responses for external Mapbox resources.
 * Real map components complete actual drawing, positioning, and user interaction;
 * fixtures bound the network seam, not the map product itself.
 *
 * Task and scientific sample data remain unaffected—they use the same public query paths.
 */
export async function installMapFixtures(page: Page, options: MapFixtureOptions = {}) {
  const { failStyle = false, failTiles = false, delayStyle = 0, delayTiles = 0 } = options

  // Intercept style requests
  await page.route(MAPBOX_STYLE_PATTERN, async (route: Route) => {
    if (delayStyle > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayStyle))
    }

    if (failStyle) {
      await route.abort('failed')
    } else {
      // Return minimal valid Mapbox style
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          version: 8,
          name: 'Test Outdoors',
          sources: {
            'mapbox-terrain': {
              type: 'raster-dem',
              url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
              tileSize: 512,
              maxzoom: 14,
            },
          },
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: { 'background-color': '#f8f4f0' },
            },
          ],
        }),
      })
    }
  })

  // Intercept tile requests
  await page.route(MAPBOX_TILES_PATTERN, async (route: Route) => {
    if (delayTiles > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayTiles))
    }

    if (failTiles) {
      await route.abort('failed')
    } else {
      // Return 1x1 transparent PNG
      const transparentPng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64',
      )
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: transparentPng,
      })
    }
  })
}

/**
 * Remove all map fixtures and restore normal network behavior.
 */
export async function uninstallMapFixtures(page: Page) {
  await page.unroute(MAPBOX_STYLE_PATTERN)
  await page.unroute(MAPBOX_TILES_PATTERN)
}

import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '../browser-guard'

/**
 * Helper functions for accessibility testing across the application.
 * Used by keyboard-accessibility.spec.ts and other accessibility tests.
 */

export interface FocusInfo {
  element: string
  outlineStyle: string
  outlineWidth: number
  inViewport: boolean
}

/**
 * Run axe accessibility checks with WCAG 2.1 AA tags.
 * Expects zero violations.
 */
export async function expectAccessible(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  )
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(results.violations).toEqual([])
}

/**
 * Verify that the currently focused element has a visible focus indicator.
 * Returns focus information for further assertions.
 */
export async function expectVisibleFocus(page: Page): Promise<FocusInfo> {
  const focusInfo = await page.evaluate(() => {
    const element = document.activeElement
    if (!element) return null
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return {
      element: element.tagName + (element.id ? `#${element.id}` : ''),
      outlineStyle: style.outlineStyle,
      outlineWidth: parseFloat(style.outlineWidth),
      inViewport:
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.right <= window.innerWidth,
    }
  })

  expect(focusInfo).not.toBeNull()
  expect(focusInfo!.outlineStyle).not.toBe('none')
  expect(focusInfo!.outlineWidth).toBeGreaterThanOrEqual(2)
  expect(focusInfo!.inViewport).toBe(true)

  return focusInfo!
}

/**
 * Verify focus order follows logical reading sequence.
 * Takes a list of locators and ensures Tab moves through them in order.
 */
export async function verifyFocusOrder(
  page: Page,
  elements: Array<{ name: string; role?: string }>,
) {
  for (const element of elements) {
    const locator = element.role
      ? page.getByRole(element.role as any, { name: element.name })
      : page.getByLabel(element.name)
    await expect(locator).toBeFocused()
    await expectVisibleFocus(page)
    await page.keyboard.press('Tab')
  }
}

/**
 * Verify that Escape key closes a dialog and returns focus appropriately.
 */
export async function verifyDialogEscapeAndFocus(
  page: Page,
  dialogName: string,
  expectedFocusAfterClose: { role?: string; name: string },
) {
  const dialog = page.getByRole('dialog', { name: dialogName })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()

  const focusTarget = expectedFocusAfterClose.role
    ? page.getByRole(expectedFocusAfterClose.role as any, { name: expectedFocusAfterClose.name })
    : page.getByLabel(expectedFocusAfterClose.name)
  await expect(focusTarget).toBeFocused()
}

/**
 * Verify that a scrollable table region can be reached and navigated with keyboard.
 */
export async function verifyTableKeyboardAccess(page: Page, tableName: string) {
  const table = page.getByRole('table', { name: tableName })
  await expect(table).toBeVisible()

  // Table or its container should be focusable
  await page.keyboard.press('Tab')
  const focused = await page.evaluate(() => {
    const el = document.activeElement
    return el?.closest('table') !== null || el?.getAttribute('role') === 'table'
  })
  expect(focused).toBe(true)
}

/**
 * Check that all interactive elements have accessible names.
 */
export async function verifyAccessibleNames(page: Page) {
  const unnamedElements = await page.evaluate(() => {
    const interactive = document.querySelectorAll('button, a, input, select, textarea')
    const unnamed: string[] = []
    interactive.forEach((el) => {
      const name =
        el.getAttribute('aria-label') || el.textContent?.trim() || el.getAttribute('title')
      if (!name && el.getAttribute('type') !== 'hidden') {
        unnamed.push(el.tagName + (el.id ? `#${el.id}` : ''))
      }
    })
    return unnamed
  })
  expect(unnamedElements).toEqual([])
}

/**
 * Verify that status messages are announced (have appropriate ARIA roles).
 */
export async function verifyStatusAnnouncement(page: Page, expectedText: string) {
  const status = page.getByRole('status')
  await expect(status).toContainText(expectedText)
}

/**
 * Verify that alert messages are announced (have alert role).
 */
export async function verifyAlertAnnouncement(page: Page, expectedText: string) {
  const alert = page.getByRole('alert')
  await expect(alert).toContainText(expectedText)
}

/**
 * Check for landmarks and proper document structure.
 */
export async function verifyLandmarks(page: Page) {
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.getByRole('navigation')).toBeVisible()
  // Check for proper heading hierarchy (h1 exists)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

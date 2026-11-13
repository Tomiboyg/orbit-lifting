import { expect, test } from '@playwright/test'

/**
 * Smoke suite. Runs without Supabase env vars, so it accepts both states:
 * the setup screen (unconfigured) or the auth screen (configured).
 * Width coverage comes from playwright.config.ts projects (spec 11.4).
 */

test('loads with a title and no horizontal overflow (spec 11.4)', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Orbit Lifting/)
  const noOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  )
  expect(noOverflow).toBe(true)
})

test('shows either the setup notice or the auth screen', async ({ page }) => {
  await page.goto('/')
  const setup = page.getByText('Setup required')
  const auth = page.getByText(/Welcome back|Create your account/)
  await expect(setup.or(auth).first()).toBeVisible({ timeout: 10_000 })
})

test('has viewport-fit=cover and 100dvh base styles (spec 11.1)', async ({ page }) => {
  await page.goto('/')
  const meta = await page.getAttribute('meta[name="viewport"]', 'content')
  expect(meta).toContain('viewport-fit=cover')
})

test('has no horizontal overflow on key routes at every viewport (spec 11.4)', async ({ page }) => {
  for (const route of ['/', '/login', '/register', '/history', '/insights', '/settings', '/exercises', '/log']) {
    await page.goto(route)
    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    )
    expect(noOverflow, `route ${route}`).toBe(true)
  }
})

test('manifest and theme colour are present (PWA, spec 11.1)', async ({ page }) => {
  await page.goto('/')
  const manifest = await page.getAttribute('link[rel="manifest"]', 'href')
  expect(manifest).toBeTruthy()
  const theme = await page.getAttribute('meta[name="theme-color"]', 'content')
  expect(theme).toBeTruthy()
})

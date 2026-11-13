import { defineConfig, devices } from '@playwright/test'

// Mobile-first viewport matrix from spec 11.4: phones at 320–430 px,
// plus one tablet and one desktop width.
const MOBILE_WIDTHS = [320, 360, 375, 390, 414, 430]

const projects = MOBILE_WIDTHS.map((width) => ({
  name: `mobile-${width}`,
  use: {
    ...devices['iPhone 13'],
    viewport: { width, height: 800 },
  },
}))

projects.push(
  {
    name: 'tablet',
    use: { viewport: { width: 834, height: 1112 } },
  },
  {
    name: 'desktop',
    use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
  },
)

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects,
})

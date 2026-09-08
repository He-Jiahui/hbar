import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 40_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    channel: process.env.HBAR_BROWSER_CHANNEL ?? 'msedge',
    headless: true,
    viewport: { width: 1440, height: 960 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'bun scripts/e2e-host.ts',
    url: `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}/healthz`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})

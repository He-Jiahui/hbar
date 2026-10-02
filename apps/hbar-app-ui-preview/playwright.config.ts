import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

const port = Number(process.env.HBAR_APP_UI_PREVIEW_PORT ?? 5180)

export default defineConfig({
  testDir: '../../e2e',
  testMatch: ['component-gallery.spec.ts', 'preview-workspace.spec.ts'],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: 'list',
  outputDir: '../../test-results/component-gallery',
  use: {
    channel: process.env.HBAR_BROWSER_CHANNEL ?? 'msedge',
    headless: true,
    viewport: { width: 1440, height: 960 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `bun node_modules/vite/bin/vite.js --config apps/hbar-app-ui-preview/vite.config.ts --host 127.0.0.1 --port ${port}`,
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    url: `http://127.0.0.1:${port}/components.html`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})

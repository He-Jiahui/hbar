import { defineConfig } from '@playwright/test'

const port = Number(process.env.HBAR_NODE_CONSOLE_E2E_PORT ?? 4339)
const origin = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  testMatch: 'node-console.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: 'list',
  use: { channel: 'msedge', headless: true, baseURL: origin },
  webServer: {
    command: `bun e2e/fixtures/node-console-production-server.ts`,
    url: origin,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})

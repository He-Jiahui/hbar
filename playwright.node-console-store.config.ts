import { defineConfig } from '@playwright/test'

const port = Number(process.env.HBAR_NODE_CONSOLE_STORE_E2E_PORT ?? 4349)
const origin = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  testMatch: 'node-console-credential-store.spec.ts',
  timeout: 40_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: 'list',
  use: { channel: 'msedge', headless: true, baseURL: origin },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --config apps/web/vite.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    url: origin,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})

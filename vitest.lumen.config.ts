import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@mui/internal-test-utils': fileURLToPath(new URL('./tests/lumen/renderer.tsx', import.meta.url)),
    },
  },
  test: {
    name: 'lumen-host-ui',
    include: ['hbar-ui/packages/lumen-app-ui/src/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['./tests/lumen/setup.ts'],
    sequence: { hooks: 'list' },
    testTimeout: 10_000,
    hookTimeout: 10_000,
    maxWorkers: 1,
    environmentOptions: { jsdom: { pretendToBeVisual: true } },
  },
})

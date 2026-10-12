import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  test: {
    include: ['packages/app-react/src/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['./tests/lumen/setup.ts'],
    maxWorkers: 1,
    testTimeout: 10_000,
  },
})

import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: { '@mui/internal-test-utils': fileURLToPath(new URL('./test/renderer.tsx', import.meta.url)) },
  },
  test: {
    include: ['src/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    maxWorkers: 1,
    environmentOptions: { jsdom: { pretendToBeVisual: true } },
  },
})

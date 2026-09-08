import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  build: { outDir: '../../dist/web', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/rpc': { target: 'http://127.0.0.1:4317', ws: true },
      '/auth': 'http://127.0.0.1:4317',
      '/api': 'http://127.0.0.1:4317',
      '/healthz': 'http://127.0.0.1:4317',
    },
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const hostOrigin = `http://127.0.0.1:${process.env.HBAR_E2E_HOST_PORT ?? 4317}`
const previewDist = process.env.HBAR_E2E_PREVIEW_DIST
if (previewDist && !/^artifacts\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)+$/.test(previewDist))
  throw new Error('HBAR_E2E_PREVIEW_DIST must name a nested directory under artifacts/')

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    outDir: previewDist ? fileURLToPath(new URL(`../../${previewDist}`, import.meta.url)) : '../../dist/web',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/rpc': { target: hostOrigin, ws: true },
      '/auth': hostOrigin,
      '/api': hostOrigin,
      '/healthz': hostOrigin,
    },
  },
})

import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const configuredWebPort = process.env.HBAR_WEB_PORT
const hostOrigin = process.env.HBAR_HOST_URL ?? `http://127.0.0.1:${process.env.HBAR_E2E_HOST_PORT ?? 4317}`
const previewDist = process.env.HBAR_E2E_PREVIEW_DIST
const devInstanceId = process.env.HBAR_DESKTOP_DEV === '1' ? process.env.HBAR_DEV_INSTANCE_ID : undefined
const desktopReadiness: Plugin = {
  name: 'hbar-desktop-dev-readiness',
  configureServer(server) {
    if (!devInstanceId) return
    server.middlewares.use((request, response, next) => {
      if (request.url !== '/__hbar_dev_ready') return next()
      response.setHeader('Content-Type', 'application/json')
      response.setHeader('Cache-Control', 'no-store')
      response.end(JSON.stringify({ instanceId: devInstanceId }))
    })
  },
}
if (previewDist && !/^artifacts\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)+$/.test(previewDist))
  throw new Error('HBAR_E2E_PREVIEW_DIST must name a nested directory under artifacts/')

export default defineConfig({
  clearScreen: false,
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), desktopReadiness],
  resolve: { dedupe: ['react', 'react-dom'] },
  define: {
    'import.meta.env.HBAR_NATIVE_HOST_ORIGIN': JSON.stringify(process.env.HBAR_DESKTOP_DEV === '1' ? hostOrigin : null),
  },
  build: {
    outDir: previewDist ? fileURLToPath(new URL(`../../${previewDist}`, import.meta.url)) : '../../dist/web',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    host: '127.0.0.1',
    port: configuredWebPort === undefined ? 0 : Number(configuredWebPort),
    strictPort: configuredWebPort !== undefined,
    watch: {
      ignored: ['**/src-tauri/**', '**/target/**', '**/dist/**', '**/artifacts/**', '**/.dev/**'],
    },
    proxy: {
      '/rpc': { target: hostOrigin, ws: true },
      '/auth': hostOrigin,
      '/api': hostOrigin,
      '/healthz': hostOrigin,
    },
  },
})

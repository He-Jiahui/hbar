import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const configuredWebPort = process.env.HBAR_WEB_PORT

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  build: { outDir: '../../dist/web', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  server: {
    host: '127.0.0.1',
    port: configuredWebPort === undefined ? 0 : Number(configuredWebPort),
    strictPort: configuredWebPort !== undefined,
    proxy: {
      '/rpc': { target: process.env.HBAR_HOST_URL ?? 'http://127.0.0.1:4317', ws: true },
      '/auth': process.env.HBAR_HOST_URL ?? 'http://127.0.0.1:4317',
      '/api': process.env.HBAR_HOST_URL ?? 'http://127.0.0.1:4317',
      '/healthz': process.env.HBAR_HOST_URL ?? 'http://127.0.0.1:4317',
    },
  },
})

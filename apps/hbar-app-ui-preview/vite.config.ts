import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const previewRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: previewRoot,
  plugins: [react()],
  server: { port: 5180, strictPort: true },
})

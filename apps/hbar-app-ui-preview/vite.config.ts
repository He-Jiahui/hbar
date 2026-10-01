import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const previewRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: previewRoot,
  plugins: [react()],
  server: { port: 5180, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        formControlsAudit: fileURLToPath(new URL('./form-controls-audit.html', import.meta.url)),
        promptAudit: fileURLToPath(new URL('./prompt-audit.html', import.meta.url)),
        visualLanguage: fileURLToPath(new URL('./visual-language.html', import.meta.url)),
      },
    },
  },
})

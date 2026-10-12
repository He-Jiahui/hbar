import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { previewCompatibilityAliases } from '../../scripts/preview-compatibility-aliases.ts'

const previewRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: previewRoot,
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'], alias: previewCompatibilityAliases },
  server: { port: 5180, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        formControlsAudit: fileURLToPath(new URL('./form-controls-audit.html', import.meta.url)),
        promptAudit: fileURLToPath(new URL('./prompt-audit.html', import.meta.url)),
        visualLanguage: fileURLToPath(new URL('./visual-language.html', import.meta.url)),
        componentGallery: fileURLToPath(new URL('./components.html', import.meta.url)),
        workbenchAcceptance: fileURLToPath(new URL('./workbench-acceptance.html', import.meta.url)),
        visualReport: fileURLToPath(new URL('./visual-report.html', import.meta.url)),
      },
    },
  },
})

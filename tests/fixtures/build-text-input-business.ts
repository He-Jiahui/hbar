import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { relative, resolve } from 'node:path'

const workspace = resolve(import.meta.dir, '../..')
const output = resolve(workspace, 'artifacts/text-input-padding/fixture')
if (
  resolve(process.cwd()).toLowerCase() !== workspace.toLowerCase() ||
  relative(workspace, output).replaceAll('\\', '/') !== 'artifacts/text-input-padding/fixture'
)
  throw new Error('Fixture build must stay inside its owned workspace artifact directory')

// Keep the actual Markdown/code renderers as lazy chunks instead of inlining
// the entire language catalog into every spacing fixture page.
await build({
  configFile: false,
  logLevel: 'silent',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    outDir: output,
    emptyOutDir: true,
    lib: {
      entry: 'tests/fixtures/text-input-business-browser.tsx',
      formats: ['es'],
      fileName: () => 'fixture.js',
      cssFileName: 'fixture',
    },
  },
})

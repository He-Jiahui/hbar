import { build } from 'vite'
import react from '@vitejs/plugin-react'

// Use the production bundler so CSS module names and styles match the rendered components.
const result = await build({
  configFile: false,
  logLevel: 'silent',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    write: false,
    lib: {
      entry: process.argv[2] ?? 'tests/fixtures/button-primitives-browser.tsx',
      formats: ['iife'],
      name: 'VisualFixture',
    },
  },
})
const output = Array.isArray(result) ? result[0] : result
if (!output || !('output' in output)) throw new Error('Expected a button fixture bundle')
let code = ''
let css = ''
for (const item of output.output) {
  if (item.type === 'chunk') code += item.code
  else if (item.fileName.endsWith('.css')) {
    css += typeof item.source === 'string' ? item.source : new TextDecoder().decode(item.source)
  }
}
if (!code || !css) throw new Error('The button fixture must include both JavaScript and CSS')
process.stdout.write(JSON.stringify({ code, css }))

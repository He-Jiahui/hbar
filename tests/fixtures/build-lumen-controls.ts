import { build } from 'vite'
import react from '@vitejs/plugin-react'

const result = await build({
  configFile: false,
  logLevel: 'silent',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    write: false,
    lib: {
      entry: process.argv[2] ?? 'tests/fixtures/lumen-controls-browser.tsx',
      formats: ['iife'],
      name: 'LumenControlsFixture',
    },
  },
})

const output = Array.isArray(result) ? result[0] : result
if (!output || !('output' in output)) throw new Error('Expected a Lumen controls fixture bundle')
let code = ''
let css = ''
for (const item of output.output) {
  if (item.type === 'chunk') code += item.code
  else if (item.fileName.endsWith('.css')) {
    css += typeof item.source === 'string' ? item.source : new TextDecoder().decode(item.source)
  }
}
if (!code || !css) throw new Error('The Lumen controls fixture must include both JavaScript and CSS')
process.stdout.write(JSON.stringify({ code, css }))

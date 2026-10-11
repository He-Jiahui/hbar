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
      entry: 'tests/fixtures/settings-usage-pagination-browser.tsx',
      formats: ['iife'],
      name: 'SettingsUsagePaginationFixture',
    },
  },
})
const output = Array.isArray(result) ? result[0] : result
if (!output || !('output' in output)) throw new Error('Expected a settings usage fixture bundle')
let code = '',
  css = ''
for (const item of output.output) {
  if (item.type === 'chunk') code += item.code
  else if (item.fileName.endsWith('.css'))
    css += typeof item.source === 'string' ? item.source : new TextDecoder().decode(item.source)
}
process.stdout.write(JSON.stringify({ code, css }))

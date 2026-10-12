import { defineConfig } from 'vite'
import { resolve } from 'node:path'

/** Keep the published workbench stylesheet independent of optional catalog entries. */
export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: { styles: resolve(import.meta.dirname, 'src/workbench-component-styles.ts') },
      formats: ['es'],
      cssFileName: 'workbench',
    },
  },
})

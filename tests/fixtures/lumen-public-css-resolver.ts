import type { BunPlugin } from 'bun'
import { fileURLToPath } from 'node:url'

/** Resolve the public catalog stylesheet for Bun's nested CSS fixture imports. */
export const publicLumenStylesheetPlugin: BunPlugin = {
  name: 'resolve-public-lumen-stylesheet',
  setup(build) {
    build.onResolve({ filter: /^@lumen\/app-ui\/catalog\/styles\.css$/ }, (args) => ({
      path: fileURLToPath(import.meta.resolve(args.path)),
    }))
  },
}

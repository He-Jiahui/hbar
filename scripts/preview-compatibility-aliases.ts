import { fileURLToPath } from 'node:url'
import manifest from '../packages/hbar-app-ui/package.json' with { type: 'json' }

/** The retired compatibility catalog is test tooling, outside production workspaces. */
export const previewCompatibilityAliases = Object.entries(manifest.exports).map(([entry, target]) => ({
  find: new RegExp(
    '^' + (entry === '.' ? 'hbar-app-ui' : `hbar-app-ui/${entry.slice(2)}`).replaceAll('.', '\\.') + '$',
  ),
  replacement: fileURLToPath(new URL(`../packages/hbar-app-ui/${target.slice(2)}`, import.meta.url)),
}))

import { fileURLToPath } from 'node:url'
import manifest from '../packages/hbar-app-ui/package.json' with { type: 'json' }
import lumenManifest from '../packages/lumen-app-ui/package.json' with { type: 'json' }

/** The retired compatibility catalog is test tooling, outside production workspaces. */
function sourceAliases(name: string, directory: string, exports: Readonly<Record<string, string>>) {
  return Object.entries(exports).map(([entry, target]) => ({
    find: new RegExp('^' + (entry === '.' ? name : `${name}/${entry.slice(2)}`).replaceAll('.', '\\.') + '$'),
    replacement: fileURLToPath(new URL(`../packages/${directory}/${target.slice(2)}`, import.meta.url)),
  }))
}

export const previewCompatibilityAliases = [
  ...sourceAliases('hbar-app-ui', 'hbar-app-ui', manifest.exports),
  ...sourceAliases('@lumen/app-ui', 'lumen-app-ui', lumenManifest.exports),
]

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type PublishedExport = string | Readonly<{ types: string; import: string }>
interface Manifest {
  readonly exports: Readonly<Record<string, string>>
  readonly publishConfig: { readonly exports: Readonly<Record<string, PublishedExport>> }
}
const directory = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8')) as Manifest
const sourceKeys = Object.keys(manifest.exports).sort()
const publishedKeys = Object.keys(manifest.publishConfig.exports).sort()
if (JSON.stringify(sourceKeys) !== JSON.stringify(publishedKeys)) {
  throw new Error('Source and published package exports differ')
}
for (const [entry, target] of Object.entries(manifest.publishConfig.exports)) {
  const paths = typeof target === 'string' ? [target] : [target.import, target.types]
  for (const path of paths) {
    if (!path.startsWith('./dist/') || !existsSync(resolve(directory, path))) {
      throw new Error(`Public package export ${entry} has no built artifact at ${path}`)
    }
  }
}
console.log(`Verified ${publishedKeys.length} public package exports and their built artifacts.`)

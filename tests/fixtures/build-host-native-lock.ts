import { copyFile, readFile, readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildHostBundle } from '../../scripts/build-host-bundle'
import { writeBuildArtifact } from '../../scripts/copy-build-artifact'

const rootArgument = Bun.argv[2]
if (!rootArgument) throw new Error('An isolated fixture directory is required')
const root = resolve(rootArgument)
const entry = join(root, 'entry.ts')
const output = join(root, 'output')
await copyFile(resolve(import.meta.dir, 'build-host-native-entry.ts'), entry)
await copyFile(
  resolve(import.meta.dir, '../../plugins/local-tools/native/hbar_workspace_query.node'),
  join(root, 'hbar_workspace_query.node'),
)
await buildHostBundle(entry, 'host.js', output)
const assets = (await readdir(output)).filter((name) => name.endsWith('.node'))
if (assets.length !== 1 || !assets[0]) throw new Error('Expected one bundled native asset')
const asset = join(output, assets[0])
const hostText = await readFile(join(output, 'host.js'), 'utf8')
if (!hostText.includes(`__require("./${assets[0]}")`))
  throw new Error('Host does not require its adjacent native asset')
const generated: unknown = await import(pathToFileURL(join(output, 'host.js')).href)
if (!generated || typeof generated !== 'object' || !('version' in generated) || typeof generated.version !== 'string')
  throw new Error('Bundled native module did not run')
const before = await stat(asset, { bigint: true })
const content = await readFile(asset)
await buildHostBundle(entry, 'host.js', output)
if ((await stat(asset, { bigint: true })).mtimeNs !== before.mtimeNs)
  throw new Error('Loaded native asset was rewritten')
if (!(await readFile(asset)).equals(content)) throw new Error('Loaded native asset content changed')
const changed = Buffer.from(content)
changed[changed.length - 1] = (changed[changed.length - 1] ?? 0) ^ 1
let changedWriteFailed = false
try {
  await writeBuildArtifact(changed, asset)
} catch (error) {
  if (!(
    error instanceof Error &&
    'code' in error &&
    (error.code === 'EBUSY' || error.code === 'EPERM' || error.code === 'EACCES')
  ))
    throw error
  changedWriteFailed = true
}
if (!changedWriteFailed) throw new Error('A changed loaded binary write must report its Windows lock error')
if (!(await readFile(asset)).equals(content)) throw new Error('Failed write corrupted the loaded native asset')
console.log(
  JSON.stringify({ version: generated.version, unchangedMtime: true, unchangedContent: true, changedWriteFailed }),
)

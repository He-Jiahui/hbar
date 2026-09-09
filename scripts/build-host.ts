import { cp, mkdir, copyFile, rm } from 'node:fs/promises'
import { resolve, join, relative } from 'node:path'
import './icons'

const project = resolve(import.meta.dir, '..')
const output = resolve(project, 'dist/desktop-resources')
// Playwright loads these optional BiDi mappers only for BiDi connections.
const external = [
  '@aws-sdk/client-s3',
  'chromium-bidi/lib/cjs/bidiMapper/BidiMapper',
  'chromium-bidi/lib/cjs/cdp/CdpConnection',
]
await mkdir(output, { recursive: true })
for (const [entry, name] of [
  ['apps/host/src/main.ts', 'host.js'],
  ['packages/storage/src/worker.ts', 'storage-worker.js'],
] as const) {
  const build = await Bun.build({
    entrypoints: [entry],
    outdir: output,
    naming: name,
    target: 'bun',
    packages: 'bundle',
    external,
    minify: false,
    sourcemap: 'external',
  })
  if (!build.success) throw new AggregateError(build.logs, `Failed to build ${entry}`)
}
await copyFile(process.execPath, join(output, process.platform === 'win32' ? 'bun.exe' : 'bun'))
const webOutput = join(output, 'web')
if (relative(output, webOutput) !== 'web') throw new Error('Invalid generated asset path')
await rm(webOutput, { recursive: true, force: true })
await cp(resolve(project, 'dist/web'), webOutput, { recursive: true })
console.log(`Standalone host resources: ${output}`)

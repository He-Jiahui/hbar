import { cp, mkdir, copyFile, rm, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve, join, relative } from 'node:path'
import './icons'
import './build-native-tools'
import { copyBuildArtifact } from './copy-build-artifact'
import { buildHostBundle } from './build-host-bundle'

const project = resolve(import.meta.dir, '..')
const output = resolve(project, 'dist/desktop-resources')
const nativeOutput = resolve(project, 'dist/native')
// Playwright loads these optional BiDi mappers only for BiDi connections.
await mkdir(output, { recursive: true })
for (const [entry, name] of [
  ['apps/host/src/main.ts', 'host.js'],
  ['packages/storage/src/worker.ts', 'storage-worker.js'],
] as const) {
  await buildHostBundle(entry, name, output)
}
const runtimePath = join(output, process.platform === 'win32' ? 'bun.exe' : 'bun')
const forceRuntimeCopy = process.env.HBAR_FORCE_RUNTIME_COPY === '1'
if (forceRuntimeCopy) {
  try {
    await copyFile(process.execPath, runtimePath)
  } catch (error) {
    if (isErrno(error, 'EBUSY'))
      throw new Error(
        `Bun runtime is locked at ${runtimePath}. Close the running hbar desktop app, then rerun the build without HBAR_FORCE_RUNTIME_COPY or after it exits.`,
        { cause: error },
      )
    throw error
  }
} else {
  try {
    await copyFile(process.execPath, runtimePath, constants.COPYFILE_EXCL)
  } catch (error) {
    if (!isErrno(error, 'EEXIST')) throw error
    const [sourceStat, targetStat] = await Promise.all([stat(process.execPath), stat(runtimePath)])
    if (sourceStat.size !== targetStat.size)
      throw new Error(
        `Bun runtime at ${runtimePath} is from a different build and is locked. Close the running hbar desktop app, then rerun the build (or set HBAR_FORCE_RUNTIME_COPY=1 after it exits).`,
        { cause: error },
      )
    console.log(`Reusing existing Bun runtime: ${runtimePath}`)
  }
}
await mkdir(nativeOutput, { recursive: true })
await copyBuildArtifact(
  resolve(project, 'plugins/local-tools/native/hbar_workspace_query.node'),
  join(nativeOutput, 'hbar_workspace_query.node'),
)
const webOutput = join(output, 'web')
if (relative(output, webOutput) !== 'web') throw new Error('Invalid generated asset path')
await rm(webOutput, { recursive: true, force: true })
await cp(resolve(project, 'dist/web'), webOutput, { recursive: true })
console.log(`Standalone host resources: ${output}`)

function isErrno(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

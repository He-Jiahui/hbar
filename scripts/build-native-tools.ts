import { mkdir } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { copyBuildArtifact } from './copy-build-artifact'
import { buildReadonlySqliteNative } from './build-readonly-sqlite-native'

const project = resolve(import.meta.dir, '..')
const manifest = join(project, 'plugins/local-tools/native/Cargo.toml')
const target = join(project, 'target/workspace-query')
const profile = Bun.argv.includes('--debug') ? 'debug' : 'release'
const command = [
  'cargo',
  'build',
  '--locked',
  '--manifest-path',
  manifest,
  '--target-dir',
  target,
  ...(profile === 'release' ? ['--release'] : []),
]
const child = Bun.spawn(command, { cwd: project, stdio: ['ignore', 'inherit', 'inherit'] })
if ((await child.exited) !== 0) process.exit(child.exitCode ?? 1)

const library = join(
  target,
  profile,
  process.platform === 'win32'
    ? 'hbar_workspace_query.dll'
    : process.platform === 'darwin'
      ? 'libhbar_workspace_query.dylib'
      : 'libhbar_workspace_query.so',
)
const output = join(project, 'plugins/local-tools/native/hbar_workspace_query.node')
await mkdir(resolve(output, '..'), { recursive: true })
await copyBuildArtifact(library, output)
console.log(`Native workspace query module: ${basename(output)}`)
const runtime = Bun.spawn(
  [process.execPath, join(project, 'scripts/build-runtime-native.ts'), ...(profile === 'debug' ? ['--debug'] : [])],
  {
    cwd: project,
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  },
)
if ((await runtime.exited) !== 0) process.exit(runtime.exitCode ?? 1)
await buildReadonlySqliteNative(project)

import { mkdir } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { copyBuildArtifact } from './copy-build-artifact'

const project = resolve(import.meta.dir, '..')
const manifest = join(project, 'plugins/local-tools/sandbox/Cargo.toml')
const target = join(project, 'target/sandbox-win')
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
    ? 'hbar_sandbox_win.dll'
    : process.platform === 'darwin'
      ? 'libhbar_sandbox_win.dylib'
      : 'libhbar_sandbox_win.so',
)
const output = join(project, 'plugins/local-tools/sandbox/hbar_sandbox_win.node')
await mkdir(resolve(output, '..'), { recursive: true })
await copyBuildArtifact(library, output)
console.log(`Native sandbox module: ${basename(output)}`)

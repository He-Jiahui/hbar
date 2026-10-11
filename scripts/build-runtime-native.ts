import { mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { copyBuildArtifact } from './copy-build-artifact'

const project = resolve(import.meta.dir, '..')
const target = join(project, 'target/runtime-native')
const profile = Bun.argv.includes('--debug') ? 'debug' : 'release'
const child = Bun.spawn(
  [
    'cargo',
    'build',
    '--locked',
    '--manifest-path',
    join(project, 'packages/runtime-native/native/Cargo.toml'),
    '--target-dir',
    target,
    ...(profile === 'release' ? ['--release'] : []),
  ],
  { cwd: project, stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true },
)
if ((await child.exited) !== 0) process.exit(child.exitCode ?? 1)
const library = join(
  target,
  profile,
  process.platform === 'win32'
    ? 'hbar_runtime_native.dll'
    : process.platform === 'darwin'
      ? 'libhbar_runtime_native.dylib'
      : 'libhbar_runtime_native.so',
)
const output = join(project, 'packages/runtime-native/native/hbar_runtime_native.node')
await mkdir(resolve(output, '..'), { recursive: true })
await copyBuildArtifact(library, output)
console.log('Native runtime process supervision module: hbar_runtime_native.node')

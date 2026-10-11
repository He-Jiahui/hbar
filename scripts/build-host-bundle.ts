import { lstat, mkdir } from 'node:fs/promises'
import { basename, relative, resolve } from 'node:path'
import { optionalBundleExternals } from './bundle-externals'
import { hostRuntimeDependencies } from './host-runtime-dependencies'
import { writeBuildArtifact } from './copy-build-artifact'

type BundleArtifact = Pick<Bun.BuildArtifact, 'path' | 'arrayBuffer'>

function artifactDestination(outputDirectory: string, artifactPath: string): string {
  const normalized = artifactPath.replaceAll('\\', '/')
  const name = normalized.startsWith('./') ? normalized.slice(2) : normalized
  // Host bundles are deliberately flat. Do not flatten an unexpected path:
  // reject it before writing anything, including drive-relative and ADS paths.
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name) || name.endsWith('.'))
    throw new Error(`Invalid bundle artifact path: ${artifactPath}`)
  const destination = resolve(outputDirectory, basename(name))
  if (relative(outputDirectory, destination) !== name)
    throw new Error(`Bundle artifact escapes output directory: ${artifactPath}`)
  return destination
}

export async function writeBundleArtifacts(
  outputDirectory: string,
  artifacts: readonly BundleArtifact[],
): Promise<void> {
  const output = resolve(outputDirectory)
  const destinations = artifacts.map((artifact) => artifactDestination(output, artifact.path))
  const identities = destinations.map((path) => (process.platform === 'win32' ? path.toLowerCase() : path))
  if (new Set(identities).size !== identities.length) throw new Error('Duplicate bundle artifact output')
  await mkdir(output, { recursive: true })
  for (const [index, artifact] of artifacts.entries()) {
    const destination = destinations[index]
    if (!destination) throw new Error('Bundle artifact output is missing')
    const existing = await lstat(destination).catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
      throw error
    })
    if (existing?.isSymbolicLink()) throw new Error(`Bundle artifact output is a symbolic link: ${destination}`)
    await writeBuildArtifact(new Uint8Array(await artifact.arrayBuffer()), destination)
  }
}

export async function buildHostBundle(entrypoint: string, name: string, outputDirectory: string, define: Readonly<Record<string, string>> = {}): Promise<void> {
  // No outdir: Bun otherwise unconditionally rewrites native assets, including
  // byte-identical DLLs loaded by a running Windows desktop Host (3897025).
  const build = await Bun.build({
    entrypoints: [entrypoint],
    naming: name,
    target: 'bun',
    packages: 'bundle',
    external: [...optionalBundleExternals, ...hostRuntimeDependencies],
    minify: false,
    sourcemap: 'external',
    define,
  })
  if (!build.success) throw new AggregateError(build.logs, `Failed to build ${entrypoint}`)
  await writeBundleArtifacts(outputDirectory, build.outputs)
}

import { cp, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { z } from 'zod'

// Playwright reads package-relative assets at runtime; bundling freezes __dirname.
export const hostRuntimeDependencies = ['playwright', 'playwright-core'] as const
type RuntimeDependency = { name: (typeof hostRuntimeDependencies)[number]; version: string }
export interface HostRuntimePublisherOperations {
  renameDirectory(source: string, destination: string): Promise<void>
  wait(milliseconds: number): Promise<void>
}
const publisherOperations: HostRuntimePublisherOperations = { renameDirectory: rename, wait: Bun.sleep }
const renameRetryDelaysMs = [100, 250, 500] as const
const transientRenameCodes = new Set(['EPERM', 'EBUSY', 'EACCES'])
const packageSchema = z.object({
  name: z.enum(hostRuntimeDependencies),
  version: z.string().min(1),
  dependencies: z.record(z.string(), z.string()).optional(),
})

async function plainDirectory(path: string, optional = false): Promise<boolean> {
  const entry = await lstat(path).catch((error: unknown) => {
    if (optional && error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  })
  if (!entry) return false
  if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error(`Runtime dependency output is not plain: ${path}`)
  return true
}

async function assertRuntimeOutput(output: string, staging: string): Promise<void> {
  if (dirname(staging) !== output || !relative(output, staging).startsWith('.runtime-dependencies-'))
    throw new Error('Runtime dependency staging escaped its build directory')
  await plainDirectory(output)
  await plainDirectory(staging)
}

async function renameRuntimeDirectory(
  output: string,
  staging: string,
  source: string,
  destination: string,
  operations: HostRuntimePublisherOperations,
  attempt = 0,
): Promise<void> {
  await assertRuntimeOutput(output, staging)
  for (const path of [source, destination]) {
    const local = relative(output, path)
    if (!local || local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local))
      throw new Error('Runtime dependency rename escaped its build directory')
  }
  await plainDirectory(source)
  if (await plainDirectory(destination, true)) throw new Error('Runtime dependency rename destination already exists')
  try {
    await operations.renameDirectory(source, destination)
  } catch (error) {
    const delay = renameRetryDelaysMs[attempt]
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
    if (delay === undefined || typeof code !== 'string' || !transientRenameCodes.has(code)) throw error
    await operations.wait(delay)
    await renameRuntimeDirectory(output, staging, source, destination, operations, attempt + 1)
  }
}

/** Publish complete runtime packages, including Playwright's browser metadata and driver assets. */
export async function syncHostRuntimeDependencies(
  projectDirectory: string,
  outputDirectory: string,
): Promise<RuntimeDependency[]> {
  return syncRuntimeDependencies(projectDirectory, outputDirectory, publisherOperations)
}

/** Inject directory operations without changing the production publisher's two-argument contract. */
export function createHostRuntimeDependencyPublisher(
  operations: HostRuntimePublisherOperations,
): typeof syncHostRuntimeDependencies {
  return (projectDirectory, outputDirectory) => syncRuntimeDependencies(projectDirectory, outputDirectory, operations)
}

async function syncRuntimeDependencies(
  projectDirectory: string,
  outputDirectory: string,
  operations: HostRuntimePublisherOperations,
): Promise<RuntimeDependency[]> {
  // createRequire can resolve through fallback locations even when this project does not exist.
  const project = await realpath(resolve(projectDirectory))
  const output = resolve(outputDirectory)
  const browserRequire = createRequire(join(project, 'plugins/browser-use/package.json'))
  const playwrightManifest = browserRequire.resolve('playwright/package.json')
  const coreManifest = createRequire(playwrightManifest).resolve('playwright-core/package.json')
  const packages = []
  for (const [name, manifest] of [
    ['playwright', playwrightManifest],
    ['playwright-core', coreManifest],
  ] as const) {
    const metadata = packageSchema.parse(JSON.parse(await readFile(manifest, 'utf8')))
    if (metadata.name !== name) throw new Error(`Unexpected runtime package: ${metadata.name}`)
    packages.push({ ...metadata, source: await realpath(dirname(manifest)) })
  }
  const playwright = packages.find((entry) => entry.name === 'playwright')
  const core = packages.find((entry) => entry.name === 'playwright-core')
  if (!playwright || !core || playwright.dependencies?.['playwright-core'] !== core.version)
    throw new Error('Playwright and playwright-core versions do not match')

  await mkdir(output, { recursive: true })
  await plainDirectory(output)
  const target = join(output, 'node_modules')
  await plainDirectory(target, true)
  const staging = await mkdtemp(join(output, '.runtime-dependencies-'))
  if (dirname(staging) !== output || !relative(output, staging).startsWith('.runtime-dependencies-'))
    throw new Error('Runtime dependency staging escaped its build directory')
  const next = join(staging, 'next')
  const previous = join(staging, 'previous')
  let mayClean = true
  try {
    await mkdir(next)
    for (const entry of packages) {
      await cp(entry.source, join(next, entry.name), {
        recursive: true,
        dereference: true,
        filter: (path) =>
          !relative(entry.source, path)
            .split(sep)
            .some((part) => ['node_modules', '.local-browsers'].includes(part)),
      })
    }
    const hadPrevious = await plainDirectory(target, true)
    if (hadPrevious) await renameRuntimeDirectory(output, staging, target, previous, operations)
    mayClean = false
    try {
      await renameRuntimeDirectory(output, staging, next, target, operations)
      mayClean = true
    } catch (error) {
      if (hadPrevious) {
        try {
          await renameRuntimeDirectory(output, staging, previous, target, operations)
          mayClean = true
        } catch (restoreError) {
          throw new AggregateError(
            [error, restoreError],
            `Runtime publish/restore failed; previous packages retained at ${previous}`,
            { cause: restoreError },
          )
        }
      } else mayClean = true
      throw error
    }
    return packages.map(({ name, version }) => ({ name, version }))
  } finally {
    if (mayClean) {
      await assertRuntimeOutput(output, staging)
      await rm(staging, { recursive: true, force: true })
    }
  }
}

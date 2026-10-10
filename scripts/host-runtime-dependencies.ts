import { cp, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { z } from 'zod'

// Playwright reads package-relative assets at runtime; bundling freezes __dirname.
export const hostRuntimeDependencies = ['playwright', 'playwright-core'] as const
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

/** Publish complete runtime packages, including Playwright's browser metadata and driver assets. */
export async function syncHostRuntimeDependencies(
  projectDirectory: string,
  outputDirectory: string,
): Promise<Array<{ name: (typeof hostRuntimeDependencies)[number]; version: string }>> {
  const project = resolve(projectDirectory)
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
    if (hadPrevious) await rename(target, previous)
    mayClean = false
    try {
      await rename(next, target)
      mayClean = true
    } catch (error) {
      if (hadPrevious) {
        try {
          await rename(previous, target)
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
    if (mayClean) await rm(staging, { recursive: true, force: true })
  }
}

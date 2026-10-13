import { cp, lstat, mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, relative, resolve } from 'node:path'
import { verifyWebBuildProvenance } from './web-build-provenance'

async function plainDirectory(path: string, optional = false): Promise<boolean> {
  const entry = await lstat(path).catch((error: unknown) => {
    if (optional && error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  })
  if (!entry) return false
  if (!entry.isDirectory() || entry.isSymbolicLink())
    throw new Error(`Generated Web resource directory is not plain: ${path}`)
  return true
}

/** Publish Web resources independently of Host/native rebuilds; never mix two bundles. */
export async function syncDesktopWebResources(
  projectDirectory: string,
  copyDirectory: typeof cp = cp,
): Promise<string> {
  const project = resolve(projectDirectory)
  const dist = join(project, 'dist')
  const source = join(dist, 'web')
  const output = join(dist, 'desktop-resources')
  const target = join(output, 'web')
  await plainDirectory(dist)
  await plainDirectory(source)
  await plainDirectory(output, true)
  await plainDirectory(target, true)
  const initialProof = await verifyWebBuildProvenance(project, source)
  const entry = await readFile(join(source, 'index.html'))
  await mkdir(output, { recursive: true })
  const staging = await mkdtemp(join(output, '.web-sync-'))
  if (dirname(staging) !== output || !relative(output, staging).startsWith('.web-sync-'))
    throw new Error('Desktop Web staging escaped its generated resource directory')
  const next = join(staging, 'next')
  const previous = join(staging, 'previous')
  let mayClean = true
  try {
    await copyDirectory(source, next, { recursive: true, errorOnExist: true, force: false })
    const [copied, current, stagedProof] = await Promise.all([
      readFile(join(next, 'index.html')),
      verifyWebBuildProvenance(project, source),
      verifyWebBuildProvenance(project, next),
    ])
    if (
      !entry.equals(copied) ||
      !entry.equals(await readFile(join(source, 'index.html'))) ||
      !Buffer.from(initialProof.bytes).equals(Buffer.from(stagedProof.bytes)) ||
      !Buffer.from(initialProof.bytes).equals(Buffer.from(current.bytes))
    )
      throw new Error('Web build changed during desktop resource synchronization; retry after the build finishes')
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
            `Desktop Web publish/restore failed; previous bundle retained at ${previous}`,
            { cause: restoreError },
          )
        }
      } else mayClean = true
      throw error
    }
    return createHash('sha256').update(entry).digest('hex')
  } finally {
    if (mayClean) await rm(staging, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  const entryHash = await syncDesktopWebResources(resolve(import.meta.dir, '..'))
  console.log(`Desktop Web resources synchronized (entry sha256 ${entryHash})`)
}

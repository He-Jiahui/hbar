import { realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname } from 'node:path'

/** Windows can retain an exited fixture's SQLite handles briefly. Only remove our exact temp root. */
export async function removeOwnedFixtureDirectory(root: string, prefix: string): Promise<void> {
  const target = await realpath(root)
  if (
    dirname(target).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(target).startsWith(prefix)
  )
    throw new Error('Refusing to remove an unowned fixture directory')
  await rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
}

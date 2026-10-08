import { lstat, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'

/** Call after stopping the owning Host; reject aliases, nested paths and unrelated temp data. */
export async function removeOwnedTempDirectory(root: string, prefix: string): Promise<void> {
  const stat = await lstat(root)
  const target = await realpath(root)
  if (
    !/^hbar-[a-z0-9-]+-$/.test(prefix) ||
    stat.isSymbolicLink() ||
    !stat.isDirectory() ||
    target !== resolve(root) ||
    dirname(target) !== (await realpath(tmpdir())) ||
    !basename(target).startsWith(prefix)
  ) {
    throw new Error('Invalid owned temporary fixture cleanup')
  }
  await rm(target, { recursive: true, force: true })
}

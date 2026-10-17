import { realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'

/** Test cleanup must never follow a replaced directory or remove an unrelated temporary root. */
export async function removeOwnedTestDirectory(root: string, prefix: string): Promise<void> {
  const [actual, temporary] = await Promise.all([realpath(root), realpath(tmpdir())])
  const same = (left: string, right: string) =>
    process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
  if (!same(dirname(actual), temporary) || !same(actual, resolve(root)) || !basename(actual).startsWith(prefix))
    throw new Error('Refusing to remove an unowned test directory')
  await rm(actual, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}

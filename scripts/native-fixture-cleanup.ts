import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'

/** WebView2 releases its profile asynchronously after the native window exits. */
export async function cleanupNativeSessionFixture(
  root: string,
  dependencies: {
    remove?: (path: string) => Promise<void>
    delay?: () => Promise<void>
  } = {},
): Promise<void> {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-native-session-'))
    throw new Error('Refusing to clean a path outside an owned native Session fixture')
  const remove = dependencies.remove ?? ((path: string) => rm(path, { recursive: true, force: true }))
  const delay = dependencies.delay ?? (() => Bun.sleep(250))
  for (let attempt = 0; ; attempt++) {
    try {
      await remove(target)
      return
    } catch (error) {
      const retryable =
        error instanceof Error && 'code' in error && ['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(String(error.code))
      if (!retryable || attempt === 40) throw error
      await delay()
    }
  }
}

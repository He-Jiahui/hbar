import { realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'

const prefixes = [
  'hbar-session-archive-',
  'hbar-archive-pages-',
  'hbar-archive-tabs-',
  'hbar-archive-workbench-',
  'hbar-external-active-archive-',
  'hbar-current-archive-reload-',
] as const

export async function cleanupOwnedArchiveFixture(root: string): Promise<void> {
  const owned = await realpath(root)
  if (
    owned !== resolve(root) ||
    dirname(owned) !== (await realpath(tmpdir())) ||
    !prefixes.some((prefix) => basename(owned).startsWith(prefix))
  )
    throw new Error('Unexpected owned archive fixture root')
  await rm(owned, { recursive: true, force: true })
}

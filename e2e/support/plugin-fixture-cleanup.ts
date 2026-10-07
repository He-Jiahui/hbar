import { realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'
export async function removeOwnedPluginFixture(
  root: string,
  prefix: 'hbar-plugin-detail-' | 'hbar-plugin-actions-',
): Promise<void> {
  const owned = await realpath(root)
  if (owned !== resolve(root) || dirname(owned) !== (await realpath(tmpdir())) || !basename(owned).startsWith(prefix))
    throw new Error('Unowned Plugin fixture directory')
  await rm(owned, { recursive: true, force: true })
}

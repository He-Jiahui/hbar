import { realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'

type PermissionFixturePrefix =
  | 'hbar-composer-permission-'
  | 'hbar-plan-exit-'
  | 'hbar-plan-direct-choice-'
  | 'hbar-durable-plan-recovery-'
  | 'hbar-composer-intent-'
  | 'hbar-language-session-controls-'
  | 'hbar-language-command-filter-'

export async function cleanupOwnedPermissionFixture(root: string, prefix: PermissionFixturePrefix): Promise<void> {
  const owned = await realpath(root)
  if (owned !== resolve(root) || dirname(owned) !== (await realpath(tmpdir())) || !basename(owned).startsWith(prefix))
    throw new Error('Unexpected owned permission fixture root')
  await rm(owned, { recursive: true, force: true })
}

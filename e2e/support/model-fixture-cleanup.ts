import { realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname } from 'node:path'

export async function cleanupOwnedModelFixture(
  root: string,
  prefix: 'hbar-composer-model-' | 'hbar-running-model-e2e-' | 'hbar-model-touch-' | 'hbar-empty-hero-',
): Promise<void> {
  const owned = await realpath(root)
  if (dirname(owned) !== (await realpath(tmpdir())) || !basename(owned).startsWith(prefix))
    throw new Error('Unexpected owned model fixture root')
  await rm(owned, { recursive: true, force: true })
}

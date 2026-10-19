import { HbarError } from '@hbar/contracts'

/** Only a closed, typed schema incompatibility admits the existing migration path. */
export async function startupStorageMigrationRequired(
  verify: (allowMigration: boolean) => Promise<void>,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted()
  try {
    await verify(false)
  } catch (error) {
    signal.throwIfAborted()
    if (!(error instanceof HbarError) || error.code !== 'RUNTIME_RESTART_REQUIRED') throw error
    await verify(true)
    signal.throwIfAborted()
    return true
  }
  signal.throwIfAborted()
  return false
}

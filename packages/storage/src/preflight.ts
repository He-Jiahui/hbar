import { HbarError } from '@hbar/contracts'
import type { StorageMethods } from './types'

/** Candidate construction reads metadata and canonical context through the unique live writer. */
export const STORAGE_PREFLIGHT_METHODS: ReadonlySet<keyof StorageMethods> = new Set([
  'ready',
  'getSetting',
  'sessions',
  'events',
  'plugins',
])
export function assertStoragePreflightMethod(method: keyof StorageMethods): void {
  if (!STORAGE_PREFLIGHT_METHODS.has(method))
    throw new HbarError('RUNTIME_PREPARING', 'Candidate construction cannot write or acquire execution authority')
}

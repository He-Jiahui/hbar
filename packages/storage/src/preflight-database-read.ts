import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import { HbarError } from '@hbar/contracts'

/** Read with one fixed buffer before SQLite traverses the complete database for preflight. */
export function readPreflightDatabaseSequentially(path: string): void {
  const handle = openSync(path, 'r')
  try {
    const before = fstatSync(handle)
    const buffer = Buffer.allocUnsafe(1_048_576)
    let offset = 0
    while (offset < before.size) {
      const length = readSync(handle, buffer, 0, Math.min(buffer.byteLength, before.size - offset), null)
      if (length === 0)
        throw new HbarError('STORAGE_INTEGRITY_UNKNOWN', 'Readonly database preflight reached an unexpected end')
      offset += length
    }
    const after = fstatSync(handle)
    if (
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ino !== after.ino ||
      before.dev !== after.dev
    )
      throw new HbarError('STORAGE_INTEGRITY_UNKNOWN', 'Database changed during the readonly preflight read')
  } finally {
    closeSync(handle)
  }
}

import { Database, constants } from 'bun:sqlite'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { HbarError } from '@hbar/contracts/errors'
import { z } from 'zod'
import { materializeReadonlySqliteExtension } from './readonly-sqlite-asset'

const integerResult = z.object({ value: z.number().int().nonnegative().safe() })
const nameResult = z.object({ value: z.string().regex(/^hbar_readonly_v1_[0-9]+$/) })

export interface ReadonlySqliteScanStatistics {
  readonly activeFiles: number
  readonly directReads: number
  readonly activeDirectHandles: number
  readonly activeDirectBuffers: number
  readonly sequentialScans: number
  readonly sequentialBytes: number
  readonly directIoPriorityHints: number
  readonly globalOwners: number
  readonly globalRegistered: number
  readonly globalFiles: number
}

/** Fixed operations only. The Storage business connection keeps its existing strict bindings. */
export interface ReadonlySqliteScan {
  readSequentially(): number
  quickCheck(): boolean
  statistics(): ReadonlySqliteScanStatistics
  close(): void
}

/** Resolve embedded or emitted bytes into the caller's short physical native directory. */
export function readonlySqliteExtensionPath(nativeDirectory: string): string {
  return materializeReadonlySqliteExtension(nativeDirectory)
}

/** Windows direct reads require the existing file to resolve to a fixed local NTFS volume. */
export function openReadonlySqliteScan(inputPath: string, nativeDirectory: string): ReadonlySqliteScan {
  if (process.platform !== 'win32' || process.arch !== 'x64')
    throw new HbarError('RUNTIME_READONLY_IO_UNAVAILABLE', 'This native readonly scan requires Windows x64')
  const path = resolve(z.string().min(1).max(4_000).parse(inputPath))
  const bootstrap = new Database(':memory:', { strict: true })
  let reader: Database | undefined
  let closed = false
  const stat = (key: string): number =>
    integerResult.parse(bootstrap.query('SELECT hbar_readonly_stat(?) AS value').get(key)).value
  const assertOpen = (): void => {
    if (closed) throw new HbarError('RUNTIME_RESOURCE_CLOSED', 'Readonly scan is closed')
  }
  try {
    bootstrap.loadExtension(readonlySqliteExtensionPath(nativeDirectory), 'sqlite3_hbarreadonly_init')
    if (integerResult.parse(bootstrap.query('SELECT hbar_readonly_scope(?) AS value').get(dirname(path))).value !== 1)
      throw new HbarError('RUNTIME_READONLY_IO_UNCONFIRMED', 'Readonly scan scope was not confirmed')
    const name = nameResult.parse(bootstrap.query('SELECT hbar_readonly_stat(?) AS value').get('name')).value
    // Bun's object options cannot also set SQLITE_OPEN_URI. This private connection
    // runs only the fixed, argument-free statements below; no business SQL is exposed.
    const database = new Database(
      pathToFileURL(path).href + '?mode=ro&vfs=' + name,
      constants.SQLITE_OPEN_READONLY | constants.SQLITE_OPEN_URI,
    )
    reader = database
    database.exec('PRAGMA busy_timeout=5000; PRAGMA mmap_size=2147418112')
    if (stat('active') !== 1 || stat('directActiveHandles') !== 1 || stat('defaultUnchanged') !== 1)
      throw new HbarError('RUNTIME_READONLY_IO_UNCONFIRMED', 'Readonly direct connection was not confirmed')
    return {
      readSequentially() {
        assertOpen()
        return integerResult.parse(bootstrap.query('SELECT hbar_readonly_scan(?) AS value').get(path)).value
      },
      quickCheck() {
        assertOpen()
        return z.object({ quick_check: z.literal('ok') }).safeParse(database.query('PRAGMA quick_check(1)').get())
          .success
      },
      statistics() {
        assertOpen()
        return {
          activeFiles: stat('active'),
          directReads: stat('directReads'),
          activeDirectHandles: stat('directActiveHandles'),
          activeDirectBuffers: stat('directActiveBuffers'),
          sequentialScans: stat('sequentialReads'),
          sequentialBytes: stat('sequentialReadBytes'),
          directIoPriorityHints: stat('directIoPriorityHints'),
          globalOwners: stat('globalOwners'),
          globalRegistered: stat('globalRegistered'),
          globalFiles: stat('globalFiles'),
        }
      },
      close() {
        if (closed) return
        closed = true
        const failures: unknown[] = []
        try {
          database.close(true)
        } catch (error) {
          failures.push(error)
        }
        try {
          if (integerResult.parse(bootstrap.query('SELECT hbar_readonly_unregister() AS value').get()).value !== 0)
            throw new HbarError('RUNTIME_READONLY_IO_UNCONFIRMED', 'Readonly scan registration did not close')
        } catch (error) {
          failures.push(error)
        }
        try {
          bootstrap.close(true)
        } catch (error) {
          failures.push(error)
        }
        if (failures.length) throw new AggregateError(failures, 'Readonly scan cleanup did not complete')
      },
    }
  } catch (cause) {
    const failures: unknown[] = [cause]
    try {
      reader?.close(true)
    } catch (error) {
      failures.push(error)
    }
    try {
      bootstrap.close(true)
    } catch (error) {
      failures.push(error)
    }
    throw new HbarError('RUNTIME_READONLY_IO_UNCONFIRMED', 'Readonly scan could not open its owned connection', {
      cause: failures.length === 1 ? cause : new AggregateError(failures),
    })
  }
}

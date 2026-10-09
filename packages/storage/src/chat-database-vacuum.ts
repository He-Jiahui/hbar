import { Database } from 'bun:sqlite'
import { lstatSync } from 'node:fs'
import { dirname } from 'node:path'
import { HbarError } from '@hbar/contracts'
import { createChatDatabaseVacuumRecords, type ChatDatabaseVacuumRecord } from './chat-database-vacuum-record'
import { isMissingResource, verifyResourcePathSync } from './chat-database-resource-paths'

export interface ChatDatabaseVacuumInput {
  path: string
  sessionsRoot: string
  operationId: string
  mode: 'run' | 'verify'
  flags: SharedArrayBuffer
}
/** Runs only in the managed maintenance Worker; primary Storage gates writes and resets ROWID discovery first. */
export async function runChatDatabaseVacuum(
  input: ChatDatabaseVacuumInput,
  beforeVacuum?: () => Promise<void>,
): Promise<ChatDatabaseVacuumRecord> {
  const records = createChatDatabaseVacuumRecords(input.sessionsRoot)
  const flags = new Int32Array(input.flags)
  const cancelled = () => Atomics.load(flags, 0) === 1 || records.cancelled(input.operationId)
  const bytes = () =>
    ['', '-wal', '-shm'].reduce((total, suffix) => {
      const path = `${input.path}${suffix}`
      verifyResourcePathSync(dirname(input.path), path, true)
      try {
        const info = lstatSync(path)
        if (!info.isFile()) throw new HbarError('PATH_REDIRECTED', 'Database file is redirected')
        return total + info.size
      } catch (reason) {
        if (isMissingResource(reason) && suffix) return total
        throw reason
      }
    }, 0)
  verifyResourcePathSync(dirname(input.path), input.path)
  const db = new Database(input.path, { strict: true })
  db.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;')
  const schemaRevision = () =>
    db.query<{ schema_version: number }, []>('PRAGMA schema_version').get()?.schema_version ?? 0
  let record = records.read(input.operationId) ?? {
    schemaVersion: 1 as const,
    operationId: input.operationId,
    stage: 'pending' as const,
    status: 'running' as const,
    beforeBytes: bytes(),
    afterBytes: null,
    reclaimedBytes: 0,
    schemaRevision: schemaRevision(),
    didVacuum: false,
    integrityVerified: false,
    cancellationRequested: false,
    updatedAt: Date.now(),
    error: null,
  }
  function update(patch: Partial<ChatDatabaseVacuumRecord>): void {
    record = { ...record, ...patch, cancellationRequested: cancelled(), updatedAt: Date.now() }
    records.write(record)
  }
  function checkpoint(): void {
    db.clearQueryCache()
    const result = db.query<{ busy: number }, []>('PRAGMA wal_checkpoint(TRUNCATE)').get()
    if (!result || result.busy)
      throw new HbarError('DATABASE_BUSY', 'Database checkpoint is blocked by another connection')
  }
  function verify(): void {
    const result = db.query<{ quick_check: string }, []>('PRAGMA quick_check').all()
    if (result.length !== 1 || result[0]?.quick_check !== 'ok')
      throw new HbarError('DATABASE_INTEGRITY', 'Database integrity could not be verified')
  }
  try {
    if (record.integrityVerified && ['completed', 'cancelled'].includes(record.status)) return record
    update({ status: 'running', stage: 'checkpoint' })
    Atomics.store(flags, 1, 1)
    if (input.mode === 'run' && !cancelled()) {
      checkpoint()
      await beforeVacuum?.()
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      if (!cancelled() && !record.didVacuum && schemaRevision() === record.schemaRevision) {
        update({ stage: 'vacuum' })
        Atomics.store(flags, 1, 2)
        db.clearQueryCache()
        db.exec('VACUUM')
        update({ didVacuum: true })
      }
    }
    update({ stage: 'verifying' })
    Atomics.store(flags, 1, 3)
    verify()
    checkpoint()
    const didVacuum = record.didVacuum || schemaRevision() > record.schemaRevision
    const afterBytes = bytes()
    update({
      stage: 'finished',
      status: didVacuum ? 'completed' : cancelled() ? 'cancelled' : 'unknown',
      didVacuum,
      integrityVerified: true,
      afterBytes,
      reclaimedBytes: Math.max(0, record.beforeBytes - afterBytes),
      error: didVacuum || cancelled() ? null : 'DATABASE_RESULT_UNKNOWN',
    })
    Atomics.store(flags, 1, 4)
    return record
  } catch (reason) {
    console.error('Chat database maintenance failed', record.stage, reason)
    let integrityVerified = false
    try {
      verify()
      integrityVerified = true
    } catch {
      /* Preserve the maintenance gate when recovery cannot verify the file. */
    }
    update({
      stage: 'finished',
      status: 'unknown',
      integrityVerified,
      afterBytes: integrityVerified ? bytes() : null,
      error: reason instanceof HbarError ? reason.code : 'DATABASE_MAINTENANCE_FAILED',
    })
    return record
  } finally {
    db.close()
  }
}

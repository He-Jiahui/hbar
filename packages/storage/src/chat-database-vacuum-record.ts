import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { verifyResourcePathSync } from './chat-database-resource-paths'

const count = z.number().int().nonnegative().safe()
export const chatDatabaseVacuumRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  operationId: z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/),
  stage: z.enum(['pending', 'checkpoint', 'vacuum', 'verifying', 'finished']),
  status: z.enum(['running', 'completed', 'cancelled', 'unknown']),
  beforeBytes: count,
  afterBytes: count.nullable(),
  reclaimedBytes: count,
  schemaRevision: count,
  didVacuum: z.boolean(),
  integrityVerified: z.boolean(),
  cancellationRequested: z.boolean(),
  updatedAt: count,
  error: z.string().max(160).nullable(),
})
export type ChatDatabaseVacuumRecord = z.output<typeof chatDatabaseVacuumRecordSchema>
export function createChatDatabaseVacuumRecords(
  sessionsRoot: string,
  publication: { rename?: (source: string, target: string) => void } = {},
) {
  const root = join(sessionsRoot, '.maintenance', 'database-maintenance')
  const path = (id: string, suffix = '.json') => {
    chatDatabaseVacuumRecordSchema.shape.operationId.parse(id)
    return join(root, `${id}${suffix}`)
  }
  function read(id: string): ChatDatabaseVacuumRecord | null {
    const target = path(id)
    verifyResourcePathSync(sessionsRoot, target, true)
    if (!existsSync(target)) return null
    if (!lstatSync(target).isFile() || lstatSync(target).size > 16 * 1024)
      throw new HbarError('INVALID_STATE', 'Database maintenance receipt is invalid')
    const record = chatDatabaseVacuumRecordSchema.parse(JSON.parse(readFileSync(target, 'utf8')))
    if (record.operationId !== id) throw new HbarError('INVALID_STATE', 'Database maintenance receipt identity changed')
    return record
  }
  function writeFile(target: string, value: unknown): void {
    verifyResourcePathSync(sessionsRoot, target, true)
    mkdirSync(root, { recursive: true, mode: 0o700 })
    verifyResourcePathSync(sessionsRoot, target, true)
    const temporary = `${target}.${crypto.randomUUID()}.pending`
    writeFileSync(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 })
    const descriptor = openSync(temporary, 'r+')
    try {
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }
    // On Windows a simultaneous short-lived receipt reader can deny replacement.
    // Keep the fsynced original and pending file intact, and retry only sharing errors.
    const waiter = new Int32Array(new SharedArrayBuffer(4))
    for (let attempt = 0; ; attempt++) {
      verifyResourcePathSync(sessionsRoot, target, true)
      try {
        const replace = publication.rename ?? renameSync
        replace(temporary, target)
        break
      } catch (reason) {
        const sharingError =
          process.platform === 'win32' &&
          reason instanceof Error &&
          'code' in reason &&
          ['EPERM', 'EACCES', 'EBUSY'].includes(String(reason.code))
        if (!sharingError || attempt >= 9) throw reason
        Atomics.wait(waiter, 0, 0, 10)
      }
    }
    if (process.platform !== 'win32') {
      const directory = openSync(root, 'r')
      try {
        fsyncSync(directory)
      } finally {
        closeSync(directory)
      }
    }
  }
  return {
    read,
    write: (record: ChatDatabaseVacuumRecord) =>
      writeFile(path(record.operationId), chatDatabaseVacuumRecordSchema.parse(record)),
    cancel(id: string, identity?: { actorId: string; idempotencyKey: string }): void {
      if (identity) {
        const receipt = path(
          `cancel-${createHash('sha256').update(`${identity.actorId}/${identity.idempotencyKey}`).digest('hex')}`,
        )
        verifyResourcePathSync(sessionsRoot, receipt, true)
        if (existsSync(receipt)) {
          const prior = z.strictObject({ operationId: z.string() }).parse(JSON.parse(readFileSync(receipt, 'utf8')))
          if (prior.operationId !== id)
            throw new HbarError('IDEMPOTENCY_CONFLICT', 'Database cancellation key was used for another operation')
        } else writeFile(receipt, { operationId: id })
      }
      writeFile(path(id, '.cancel.json'), { schemaVersion: 1, operationId: id })
    },
    cancelled(id: string): boolean {
      const target = path(id, '.cancel.json')
      verifyResourcePathSync(sessionsRoot, target, true)
      return existsSync(target)
    },
  }
}

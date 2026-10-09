import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  opendirSync,
  truncateSync,
} from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { HbarError, artifactSchema } from '@hbar/contracts'
import {
  chatDatabaseDraftOwnerSchema,
  chatDatabaseInventorySchema,
  chatDatabaseInventoryBeginInputSchema,
  chatDatabaseInventoryFinishInputSchema,
  chatDatabaseDraftSyncInputSchema,
} from '@hbar/contracts/commands/chat-database'

const identity = z.strictObject({ actorId: z.string().min(1).max(160), idempotencyKey: z.string().min(1).max(200) })
export const chatDatabaseDraftJournalRecordSchema = z.discriminatedUnion('commandId', [
  z.strictObject({
    commandId: z.literal('chatDatabase.draft.sync'),
    identity,
    input: chatDatabaseDraftSyncInputSchema,
    result: chatDatabaseDraftOwnerSchema,
  }),
  z.strictObject({
    commandId: z.literal('chatDatabase.inventory.begin'),
    identity,
    input: chatDatabaseInventoryBeginInputSchema,
    result: chatDatabaseInventorySchema,
  }),
  z.strictObject({
    commandId: z.literal('chatDatabase.inventory.finish'),
    identity,
    input: chatDatabaseInventoryFinishInputSchema,
    result: chatDatabaseInventorySchema,
  }),
  z.strictObject({
    commandId: z.literal('device.unknown'),
    legacyRequired: z.boolean().default(true),
    deviceId: z.string().min(1).max(160),
    updatedAt: z.number().int().nonnegative().safe(),
  }),
  z.strictObject({
    commandId: z.enum(['artifact.uploadReserved', 'artifact.uploadReleased']),
    revision: z.number().int().positive().safe(),
    reservation: z.strictObject({
      artifactId: z.string().regex(/^[a-f0-9]{64}$/),
      deviceId: z.string().min(1).max(160),
      ownerId: z.string().min(1).max(200),
      clientRevision: z.number().int().nonnegative().safe().optional(),
      artifact: artifactSchema.optional(),
      replacesOperationId: z.string().min(1).max(160).nullable().optional(),
    }),
    updatedAt: z.number().int().nonnegative().safe(),
  }),
  z.strictObject({
    commandId: z.literal('artifact.uploadCompleted'),
    revision: z.number().int().positive().safe(),
    artifact: artifactSchema,
    deviceId: z.string().min(1).max(160),
    updatedAt: z.number().int().nonnegative().safe(),
  }),
])
export type ChatDatabaseDraftJournalRecord = z.output<typeof chatDatabaseDraftJournalRecordSchema>
const MAX_RECORD_BYTES = 256 * 1024
const CHUNK_BYTES = 64 * 1024
const fileId = (deviceId: string) => createHash('sha256').update(deviceId).digest('hex')
const deviceOf = (record: ChatDatabaseDraftJournalRecord) =>
  'identity' in record
    ? record.identity.actorId
    : 'reservation' in record
      ? record.reservation.deviceId
      : record.deviceId

/** Device declarations are canonical outside SQLite, just like the session log. */
export function createChatDatabaseDraftJournal(sessionsRoot: string) {
  const root = join(sessionsRoot, '.maintenance', 'artifact-drafts')
  let files: string[] | null = null
  let fileIndex = 0
  let offset = 0
  let healthy = true
  const issues: string[] = []
  const fail = (code: string) => {
    healthy = false
    if (issues.length < 32 && !issues.includes(code)) issues.push(code)
  }
  function verify(): void {
    for (const path of [sessionsRoot, join(sessionsRoot, '.maintenance'), root]) {
      try {
        if (lstatSync(path).isSymbolicLink())
          throw new HbarError('PATH_REDIRECTED', 'Draft reference journal is a redirected path')
      } catch (reason) {
        if (!(reason instanceof Error && 'code' in reason && reason.code === 'ENOENT')) throw reason
      }
    }
  }
  function append(value: ChatDatabaseDraftJournalRecord): void {
    const record = chatDatabaseDraftJournalRecordSchema.parse(value)
    verify()
    mkdirSync(root, { recursive: true })
    verify()
    const deviceId = deviceOf(record)
    const path = join(root, `${fileId(deviceId)}.jsonl`)
    if (existsSync(path) && lstatSync(path).isSymbolicLink())
      throw new HbarError('PATH_REDIRECTED', 'Draft reference journal is a link')
    const bytes = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8')
    if (bytes.length > MAX_RECORD_BYTES)
      throw new HbarError('REFERENCE_LIMIT', 'Draft reference record exceeds its byte budget')
    const descriptor = openSync(path, 'a', 0o600)
    try {
      appendFileSync(descriptor, bytes)
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }
  }
  function reset(): void {
    files = null
    fileIndex = 0
    offset = 0
    healthy = true
    issues.length = 0
  }
  function backfill(
    limit: number,
    apply: (record: ChatDatabaseDraftJournalRecord) => void,
  ): { done: boolean; healthy: boolean; issues: string[] } {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new HbarError('INVALID_INPUT', 'Draft journal batch limit is invalid')
    try {
      verify()
      if (!files) {
        files = []
        if (existsSync(root)) {
          const directory = opendirSync(root)
          try {
            let entries = 0
            let entry = directory.readSync()
            while (entry) {
              if (++entries > 1000) {
                fail('JOURNAL_FILE_LIMIT')
                break
              }
              if (!/^[a-f0-9]{64}\.jsonl$/.test(entry.name)) fail('UNKNOWN_JOURNAL_FILE')
              else if (!entry.isFile() || entry.isSymbolicLink()) fail('PATH_REDIRECTED')
              else files.push(entry.name)
              entry = directory.readSync()
            }
          } finally {
            directory.closeSync()
          }
        }
        files.sort()
      }
      let count = 0
      while (fileIndex < files.length && count < limit) {
        const name = files[fileIndex]!
        const path = join(root, name)
        if (lstatSync(path).isSymbolicLink()) {
          fail('PATH_REDIRECTED')
          fileIndex++
          offset = 0
          continue
        }
        const descriptor = openSync(path, 'r')
        let readOffset = offset
        let pending = Buffer.alloc(0)
        let end = false
        try {
          while (count < limit && !end) {
            const chunk = Buffer.allocUnsafe(CHUNK_BYTES)
            const length = readSync(descriptor, chunk, 0, chunk.length, readOffset)
            if (length === 0) {
              if (pending.length) {
                truncateSync(path, offset)
                fail('DRAFT_JOURNAL_TRUNCATED')
              }
              if (offset === 0) fail('EMPTY_DRAFT_JOURNAL')
              end = true
              break
            }
            readOffset += length
            pending = Buffer.concat([pending, chunk.subarray(0, length)])
            let newline = pending.indexOf(10)
            while (newline >= 0 && count < limit) {
              const bytes = pending.subarray(0, newline)
              if (bytes.length > MAX_RECORD_BYTES)
                throw new HbarError('REFERENCE_LIMIT', 'Draft journal record is oversized')
              const record = chatDatabaseDraftJournalRecordSchema.parse(JSON.parse(bytes.toString('utf8')))
              const deviceId = deviceOf(record)
              if (name !== `${fileId(deviceId)}.jsonl`)
                throw new HbarError('INVALID_STATE', 'Draft journal identity mismatch')
              apply(record)
              offset += newline + 1
              count++
              pending = pending.subarray(newline + 1)
              newline = pending.indexOf(10)
            }
            if (pending.length > MAX_RECORD_BYTES)
              throw new HbarError('REFERENCE_LIMIT', 'Draft journal record is oversized')
          }
        } catch (reason) {
          fail(reason instanceof HbarError ? reason.code : 'DRAFT_JOURNAL_INVALID')
          end = true
        } finally {
          closeSync(descriptor)
        }
        if (end) {
          fileIndex++
          offset = 0
        }
      }
      return { done: fileIndex >= files.length, healthy, issues: [...issues] }
    } catch (reason) {
      fail(reason instanceof HbarError ? reason.code : 'DRAFT_JOURNAL_READ_FAILED')
      return { done: true, healthy: false, issues: [...issues] }
    }
  }
  function hasDevice(deviceId: string): boolean {
    verify()
    const path = join(root, `${fileId(deviceId)}.jsonl`)
    if (!existsSync(path)) return false
    const info = lstatSync(path)
    return info.isFile() && !info.isSymbolicLink() && info.size > 0
  }
  return { append, reset, backfill, hasDevice }
}

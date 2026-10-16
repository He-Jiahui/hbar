import { createHash } from 'node:crypto'
import { HbarError, artifactSchema, type ArtifactRef } from '@hbar/contracts'
import {
  COMMAND_RECEIPT_INLINE_BYTES,
  commandReceiptPayloadSchema,
  type CommandReceiptPayload,
  type CommandExecutionIdentity,
} from '@hbar/contracts/command-execution'
import { encodeCommandResult } from '@hbar/commands/jobs'

export interface CommandPayloadSource extends CommandExecutionIdentity {
  readonly channel?: 'logical' | 'physical'
}
export interface CommandPayloadArtifactPort {
  write(source: CommandPayloadSource, index: number, bytes: Uint8Array): Promise<ArtifactRef>
  read(artifact: ArtifactRef): Promise<Uint8Array>
  release?(source: CommandPayloadSource, artifact: ArtifactRef): Promise<void>
}
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const chunkBytes = 10_485_760

/** Complete JSON, bounded upload chunks, and verified reads. The normal artifact ledger owns retention. */
export class CommandResultPayloads {
  private active = 0
  private readonly waiting = new Set<{ start(): void }>()
  constructor(private readonly artifacts: CommandPayloadArtifactPort) {}
  async save(value: unknown, source: CommandPayloadSource): Promise<CommandReceiptPayload> {
    return this.withCapacity(async () => {
      let json: string
      try {
        json = encodeCommandResult(value)
      } catch {
        return {
          kind: 'unavailable',
          error: {
            code: 'COMMAND_RESULT_UNAVAILABLE',
            message: 'The complete command result exceeds its JSON or byte capacity',
          },
        }
      }
      const bytes = new TextEncoder().encode(json)
      if (bytes.byteLength <= COMMAND_RECEIPT_INLINE_BYTES)
        return commandReceiptPayloadSchema.parse({ kind: 'inline', json })
      const chunks: ArtifactRef[] = []
      for (let offset = 0; offset < bytes.byteLength; offset += chunkBytes) {
        const data = bytes.subarray(offset, Math.min(offset + chunkBytes, bytes.byteLength))
        const artifact = artifactSchema.parse(await this.artifacts.write(source, chunks.length, data))
        if (
          artifact.id !== sha256(data) ||
          artifact.size !== data.byteLength ||
          artifact.mime !== 'application/octet-stream'
        )
          throw new HbarError('COMMAND_RECEIPT_ARTIFACT', 'Saved command result differs from its committed attachment')
        chunks.push(artifact)
      }
      return commandReceiptPayloadSchema.parse({
        kind: 'artifacts',
        sha256: sha256(bytes),
        bytes: bytes.byteLength,
        chunks,
      })
    })
  }
  async release(payload: CommandReceiptPayload, source: CommandPayloadSource): Promise<void> {
    if (payload.kind !== 'artifacts' || !this.artifacts.release) return
    for (const artifact of payload.chunks) await this.artifacts.release(source, artifact)
  }
  async read(raw: CommandReceiptPayload): Promise<unknown> {
    return this.withCapacity(async () => {
      const payload = commandReceiptPayloadSchema.parse(raw)
      if (payload.kind === 'unavailable') throw new HbarError(payload.error.code, payload.error.message)
      if (payload.kind === 'inline') return JSON.parse(payload.json) as unknown
      const parts: Uint8Array[] = []
      const hash = createHash('sha256')
      let size = 0
      for (const artifact of payload.chunks) {
        const bytes = await this.artifacts.read(artifact)
        if (bytes.byteLength !== artifact.size || sha256(bytes) !== artifact.id)
          throw new HbarError('COMMAND_RECEIPT_ARTIFACT', 'Command result attachment failed its content check')
        size += bytes.byteLength
        if (size > payload.bytes)
          throw new HbarError('COMMAND_RECEIPT_ARTIFACT', 'Command result exceeds its saved size')
        hash.update(bytes)
        parts.push(bytes)
      }
      if (size !== payload.bytes || hash.digest('hex') !== payload.sha256)
        throw new HbarError('COMMAND_RECEIPT_ARTIFACT', 'Command result attachments differ from their saved manifest')
      const joined = new Uint8Array(size)
      let offset = 0
      for (const part of parts) {
        joined.set(part, offset)
        offset += part.byteLength
      }
      try {
        const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined))
        encodeCommandResult(value)
        return value
      } catch {
        throw new HbarError('COMMAND_RECEIPT_ARTIFACT', 'Command result attachment is not complete UTF-8 JSON')
      }
    })
  }
  private async withCapacity<Result>(action: () => Promise<Result>): Promise<Result> {
    if (this.active >= 2) {
      if (this.waiting.size >= 128) throw new HbarError('BUSY', 'Command result persistence queue is full')
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.waiting.delete(waiter)
          reject(new HbarError('BUSY', 'Command result persistence queue timed out'))
        }, 30_000)
        const waiter = {
          start: () => {
            clearTimeout(timer)
            this.waiting.delete(waiter)
            this.active++
            resolve()
          },
        }
        this.waiting.add(waiter)
      })
    } else this.active++
    try {
      return await action()
    } finally {
      this.active--
      this.waiting.values().next().value?.start()
    }
  }
}

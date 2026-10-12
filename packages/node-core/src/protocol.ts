import { createHash } from 'node:crypto'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { NODE_LIMITS, nodeWorkspaceMethods } from '@hbar/contracts/node'
import { canonicalSandboxJSON } from '@hbar/sandbox'
import { toolFileChangeSchema } from '@hbar/contracts/run-file-changes'
import { boundedNodeResult } from '@hbar/contracts/node-output'
import type { WorkspaceNodeService } from './service'

interface Transfer {
  metadata: string
  bytes: Buffer
  offset: number
  lastAt: number
}
/** B-side allowlisted methods. Partial transfers never write a file. */
export class WorkspaceNodeProtocol {
  private readonly transfers = new Map<string, Transfer>()
  private transferBytes = 0
  private closed = false
  private readonly reaper = setInterval(() => this.prune(), 5_000)
  constructor(private readonly node: WorkspaceNodeService) {}
  private prune(): void {
    for (const [key, transfer] of this.transfers) if (transfer.lastAt < Date.now() - 30_000) this.remove(key)
  }
  private remove(key: string): void {
    const transfer = this.transfers.get(key)
    if (transfer) this.transferBytes -= transfer.bytes.length
    this.transfers.delete(key)
  }
  private chunk(data: Uint8Array, offset: number, limit: number, expectedRevision?: string) {
    if (data.byteLength > NODE_LIMITS.fileBytes) throw new HbarError('FILE_LIMIT', 'Node read exceeds two MiB')
    if (offset > data.byteLength)
      throw new HbarError('NODE_TRANSFER_OFFSET', 'Node read offset exceeds the file length')
    const revision = createHash('sha256').update(data).digest('hex')
    if (expectedRevision && revision !== expectedRevision)
      throw new HbarError('FILE_CONFLICT', 'File changed during chunked reading')
    const bytes = data.subarray(offset, offset + limit)
    return {
      offset,
      totalBytes: data.byteLength,
      data: Buffer.from(bytes).toString('base64'),
      revision,
      done: offset + bytes.byteLength === data.byteLength,
    }
  }
  private async write(value: unknown) {
    const input = nodeWorkspaceMethods['fs.write'].input.parse(value)
    this.prune()
    await this.node.checkFile(input.rootId, input.path, input.authority, true)
    const metadata = canonicalSandboxJSON({
      rootId: input.rootId,
      path: input.path,
      authority: input.authority,
      totalBytes: input.totalBytes,
      expectedRevision: input.expectedRevision ?? null,
    })
    const bytes = Buffer.from(input.data, 'base64')
    if (bytes.length > NODE_LIMITS.chunkBytes || input.offset + bytes.length > input.totalBytes)
      throw new HbarError('NODE_TRANSFER_OFFSET', 'Write chunk exceeds its declared size')
    if (input.final && input.offset + bytes.length !== input.totalBytes)
      throw new HbarError('NODE_TRANSFER_OFFSET', 'Final chunk must end at the declared file size')
    let transfer = this.transfers.get(input.operationId)
    if (!transfer) {
      if (input.offset !== 0)
        throw new HbarError('NODE_TRANSFER_OFFSET', 'Restart the transfer at offset zero or reconcile its file receipt')
      if (this.transfers.size >= 32 || this.transferBytes + input.totalBytes > 16 * 1024 * 1024)
        throw new HbarError('NODE_BUSY', 'Node file transfer capacity reached')
      transfer = { metadata, bytes: Buffer.alloc(input.totalBytes), offset: 0, lastAt: Date.now() }
      this.transfers.set(input.operationId, transfer)
      this.transferBytes += transfer.bytes.length
    }
    if (transfer.metadata !== metadata)
      throw new HbarError('IDEMPOTENCY_CONFLICT', 'Transfer parameters changed for this operation')
    if (input.offset < transfer.offset) {
      if (
        input.offset + bytes.length > transfer.offset ||
        !transfer.bytes.subarray(input.offset, input.offset + bytes.length).equals(bytes)
      )
        throw new HbarError('IDEMPOTENCY_CONFLICT', 'Repeated file chunk contains different bytes')
      if (!input.final || transfer.offset !== input.totalBytes)
        return { state: 'buffered', nextOffset: transfer.offset }
    } else {
      if (input.offset !== transfer.offset)
        throw new HbarError('NODE_TRANSFER_OFFSET', 'Write chunks must be contiguous')
      bytes.copy(transfer.bytes, transfer.offset)
      transfer.offset += bytes.length
    }
    transfer.lastAt = Date.now()
    if (!input.final) return { state: 'buffered', nextOffset: transfer.offset }
    if (transfer.offset !== input.totalBytes)
      throw new HbarError('NODE_TRANSFER_OFFSET', 'Final chunk does not complete the transfer')
    this.remove(input.operationId)
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(transfer.bytes)
    } catch {
      throw new HbarError('INVALID_INPUT', 'Node file writes require valid UTF-8 text')
    }
    const versions = await this.node.write(
      input.rootId,
      input.path,
      text,
      input.operationId,
      input.authority,
      input.expectedRevision,
    )
    return { state: 'settled', path: versions.path, revision: versions.revision, created: versions.created }
  }
  async invoke(method: string, value: unknown, signal: AbortSignal): Promise<unknown> {
    if (this.closed) throw new HbarError('NODE_OFFLINE', 'Node protocol is closed')
    signal.throwIfAborted()
    let result: unknown
    switch (method) {
      case 'node.capabilities':
        nodeWorkspaceMethods[method].input.parse(value)
        result = this.node.capabilities()
        break
      case 'node.ping':
        result = nodeWorkspaceMethods[method].input.parse(value)
        break
      case 'sandbox.put': {
        const input = nodeWorkspaceMethods[method].input.parse(value)
        this.node.putSnapshot(input.ref, input.profile)
        result = { accepted: true }
        break
      }
      case 'fs.canonicalize': {
        const input = nodeWorkspaceMethods[method].input.parse(value)
        result = await this.node.canonicalize(input.rootId, input.paths)
        break
      }
      case 'fs.list': {
        const input = nodeWorkspaceMethods[method].input.parse(value)
        result = await this.node.list(input.rootId, input.path, input.authority)
        break
      }
      case 'fs.readBytes': {
        const input = nodeWorkspaceMethods[method].input.parse(value)
        result = this.chunk(
          await this.node.read(input.rootId, input.path, input.authority),
          input.offset,
          input.limit,
          input.expectedRevision,
        )
        break
      }
      case 'fs.write':
        result = await this.write(value)
        break
      case 'fs.receipt.chunk': {
        const input = nodeWorkspaceMethods[method].input.parse(value)
        result = this.chunk(
          await this.node.fileVersion(input.rootId, input.operationId, input.version),
          input.offset,
          input.limit,
        )
        break
      }
      case 'fs.restore': {
        const input = nodeWorkspaceMethods[method].input.parse(value)
        const changes = input.changes.map((change) =>
          toolFileChangeSchema.parse({
            path: change.path,
            before: change.created ? null : change.before,
            after: change.after,
          }),
        )
        await this.node.restore(input.rootId, input.operationId, input.authority, changes, signal)
        result = { accepted: true }
        break
      }
      case 'query.search': {
        const input = nodeWorkspaceMethods[method].input.parse(value)
        result = await this.node.search(input.rootId, input.query, input.authority, signal)
        break
      }
      case 'query.find': {
        const input = nodeWorkspaceMethods[method].input.parse(value)
        result = await this.node.find(input.rootId, input.query, input.authority, signal)
        break
      }
      case 'query.readRange': {
        const input = nodeWorkspaceMethods[method].input.parse(value)
        result = await this.node.readRange(
          input.rootId,
          input.path,
          input.authority,
          input.startLine,
          input.lineCount,
          signal,
        )
        break
      }
      case 'query.invalidate': {
        const input = nodeWorkspaceMethods[method].input.parse(value)
        await this.node.invalidate(input.rootId, input.path)
        result = { accepted: true }
        break
      }
      case 'exec.start':
        result = await this.node.start(value)
        break
      case 'exec.cancel':
        result = await this.node.cancel(nodeWorkspaceMethods[method].input.parse(value).operationId)
        break
      case 'exec.receipt':
        result = await this.node.receipt(nodeWorkspaceMethods[method].input.parse(value).operationId)
        break
      default:
        throw new HbarError('METHOD_NOT_FOUND', 'Method is absent from the workspace-node catalog')
    }
    const table: Readonly<Record<string, { output: z.ZodType }>> = nodeWorkspaceMethods
    const schema = table[method]?.output
    if (!schema) throw new HbarError('METHOD_NOT_FOUND', 'No node response schema')
    return boundedNodeResult(schema.parse(result))
  }
  resetTransfers(): void {
    this.transfers.clear()
    this.transferBytes = 0
  }
  dispose(): void {
    this.closed = true
    clearInterval(this.reaper)
    this.resetTransfers()
  }
}

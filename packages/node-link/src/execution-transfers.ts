import { createHash } from 'node:crypto'
import { HbarError } from '@hbar/contracts'
import { NODE_LIMITS, nodeWorkspaceMethods, nodeRestoreChangesSchema } from '@hbar/contracts/node'
import type { ToolFileChange } from '@hbar/contracts/run-file-changes'
import { nodeOperationKey, nodeTargetBinding, type NodeExecutionPort, type NodeExecutionTarget } from './execution-port'

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    throw new HbarError('UNSUPPORTED_TYPE', 'The node file is not valid UTF-8 text')
  }
}
/** Every chunk is contiguous, revision-pinned and bounded before allocating the full file. */
async function readChunks(
  read: (offset: number, revision: string | undefined) => Promise<unknown>,
): Promise<{ bytes: Buffer; revision: string }> {
  let offset = 0,
    bytes: Buffer | undefined,
    revision: string | undefined
  for (let index = 0; index <= Math.ceil(NODE_LIMITS.fileBytes / NODE_LIMITS.chunkBytes); index++) {
    const chunk = nodeWorkspaceMethods['fs.readBytes'].output.parse(await read(offset, revision))
    const data = Buffer.from(chunk.data, 'base64')
    if (
      chunk.offset !== offset ||
      (revision && revision !== chunk.revision) ||
      (bytes && bytes.length !== chunk.totalBytes) ||
      offset + data.length > chunk.totalBytes ||
      chunk.done !== (offset + data.length === chunk.totalBytes) ||
      (!chunk.done && !data.length)
    )
      throw new HbarError('NODE_TRANSFER_INVALID', 'Node file chunks do not describe one contiguous version')
    bytes ??= Buffer.alloc(chunk.totalBytes)
    revision ??= chunk.revision
    data.copy(bytes, offset)
    offset += data.length
    if (chunk.done) {
      if (digest(bytes) !== revision)
        throw new HbarError('NODE_TRANSFER_DIGEST', 'Node file bytes do not match their revision')
      return { bytes, revision }
    }
  }
  throw new HbarError('NODE_TRANSFER_INVALID', 'Node file reading exceeded its bounded chunk count')
}
export async function readNodeFile(port: NodeExecutionPort, target: NodeExecutionTarget, path: string) {
  return readChunks((offset, revision) =>
    port.call(
      target.location.nodeId,
      'fs.readBytes',
      {
        ...nodeTargetBinding(target),
        path,
        authority: target.authority,
        offset,
        limit: NODE_LIMITS.chunkBytes,
        ...(revision ? { expectedRevision: revision } : {}),
      },
      target.signal,
    ),
  )
}
async function fileVersion(port: NodeExecutionPort, target: NodeExecutionTarget, version: 'before' | 'after') {
  return readChunks((offset) =>
    port.call(
      target.location.nodeId,
      'fs.receipt.chunk',
      {
        ...nodeTargetBinding(target),
        operationId: nodeOperationKey(target.authority),
        version,
        offset,
        limit: NODE_LIMITS.chunkBytes,
      },
      target.signal,
    ),
  )
}
export async function writeNodeFile(
  port: NodeExecutionPort,
  target: NodeExecutionTarget,
  path: string,
  text: string,
  expectedRevision?: string,
) {
  const bytes = Buffer.from(text)
  if (bytes.length > NODE_LIMITS.fileBytes) throw new HbarError('FILE_LIMIT', 'Node file write exceeds two MiB')
  // Refuse unpaired UTF-16 surrogates instead of silently replacing the caller's text during encoding.
  if (decode(bytes) !== text) throw new HbarError('INVALID_INPUT', 'Node file writes require exact UTF-8 text')
  for (let offset = 0; offset === 0 || offset < bytes.length; offset += NODE_LIMITS.chunkBytes) {
    const data = bytes.subarray(offset, offset + NODE_LIMITS.chunkBytes)
    const final = offset + data.length === bytes.length
    const receipt = nodeWorkspaceMethods['fs.write'].output.parse(
      await port.call(
        target.location.nodeId,
        'fs.write',
        {
          ...nodeTargetBinding(target),
          path,
          authority: target.authority,
          operationId: nodeOperationKey(target.authority),
          totalBytes: bytes.length,
          offset,
          data: data.toString('base64'),
          final,
          ...(expectedRevision ? { expectedRevision } : {}),
        },
        target.signal,
      ),
    )
    if (receipt.state === 'buffered') {
      if (final || receipt.nextOffset !== offset + data.length)
        throw new HbarError('NODE_TRANSFER_INVALID', 'Node write acknowledgement has an unexpected offset')
      continue
    }
    if (!final || receipt.path !== path || receipt.revision !== digest(bytes))
      throw new HbarError('EFFECT_UNKNOWN', 'Node write acknowledgement does not match the admitted file')
    const before = await fileVersion(port, target, 'before'),
      after = await fileVersion(port, target, 'after')
    if (after.revision !== receipt.revision || !after.bytes.equals(bytes))
      throw new HbarError('EFFECT_UNKNOWN', 'The durable node write version differs from the admitted text')
    return {
      before: decode(before.bytes),
      after: decode(after.bytes),
      path: receipt.path,
      revision: receipt.revision,
      created: receipt.created,
    }
  }
  throw new HbarError('EFFECT_UNKNOWN', 'The node file transfer has no completed write receipt')
}
export async function restoreNodeFiles(
  port: NodeExecutionPort,
  target: NodeExecutionTarget,
  changes: readonly ToolFileChange[],
): Promise<void> {
  const checked = nodeRestoreChangesSchema.parse(changes)
  const bytes = Buffer.from(JSON.stringify(checked))
  if (bytes.length > NODE_LIMITS.restoreBytes) throw new HbarError('FILE_LIMIT', 'Node restore exceeds 32 MiB')
  const contentDigest = digest(bytes)
  for (let offset = 0; offset < bytes.length; offset += NODE_LIMITS.chunkBytes) {
    const data = bytes.subarray(offset, offset + NODE_LIMITS.chunkBytes),
      final = offset + data.length === bytes.length
    const receipt = nodeWorkspaceMethods['fs.restore.chunk'].output.parse(
      await port.call(
        target.location.nodeId,
        'fs.restore.chunk',
        {
          ...nodeTargetBinding(target),
          authority: target.authority,
          operationId: nodeOperationKey(target.authority),
          contentDigest,
          totalBytes: bytes.length,
          offset,
          data: data.toString('base64'),
          final,
        },
        target.signal,
      ),
    )
    if (receipt.state === 'settled') {
      if (!final) throw new HbarError('EFFECT_UNKNOWN', 'Node restore settled before all versions were transmitted')
      return
    }
    if (final || receipt.nextOffset !== offset + data.length)
      throw new HbarError('NODE_TRANSFER_INVALID', 'Node restore acknowledgement has an unexpected offset')
  }
  throw new HbarError('EFFECT_UNKNOWN', 'The node restore transfer has no completed receipt')
}
export const decodeNodeFileText = decode

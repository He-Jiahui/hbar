import { createHash } from 'node:crypto'
import { HbarError, type ArtifactRef } from '@hbar/contracts'
import {
  commandResultPageSchema,
  type CommandReceiptPayload,
  type CommandResultPage,
  type CommandResultPageInput,
} from '@hbar/contracts/command-execution'

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const badArtifact = () => new HbarError('COMMAND_RECEIPT_ARTIFACT', 'Command result is not valid committed UTF-8 data')
const continuation = (byte: number) => byte >= 0x80 && byte <= 0xbf
function sequenceBytes(byte: number) {
  if (byte <= 0x7f) return 1
  if (byte >= 0xc2 && byte <= 0xdf) return 2
  if (byte >= 0xe0 && byte <= 0xef) return 3
  if (byte >= 0xf0 && byte <= 0xf4) return 4
  return 0
}

/** The owner validates the payload/request before capacity admission. Only selected chunks are verified here. */
export async function readValidatedCommandResultPage(
  payload: CommandReceiptPayload,
  input: CommandResultPageInput,
  read: (artifact: ArtifactRef) => Promise<Uint8Array>,
  signal?: AbortSignal,
): Promise<CommandResultPage> {
  signal?.throwIfAborted()
  if (payload.kind === 'unavailable') throw new HbarError(payload.error.code, payload.error.message)
  const inline = payload.kind === 'inline' ? new TextEncoder().encode(payload.json) : undefined
  const totalBytes = inline?.byteLength ?? (payload.kind === 'artifacts' ? payload.bytes : 0)
  const sha256 = inline ? hash(inline) : payload.kind === 'artifacts' ? payload.sha256 : ''
  if (input.expectedSha256 !== undefined && input.expectedSha256 !== sha256)
    throw new HbarError('COMMAND_RESULT_VIEW_CHANGED', 'The result view changed; read again from offset zero')
  if (input.offset > totalBytes)
    throw new HbarError('COMMAND_RESULT_OFFSET_INVALID', 'The result offset exceeds its complete byte length')
  const end = Math.min(totalBytes, input.offset + input.limit)
  const bytes = inline ? inline.subarray(input.offset, end) : new Uint8Array(end - input.offset)
  if (payload.kind === 'artifacts' && bytes.byteLength > 0) {
    let chunkStart = 0
    let filled = 0
    for (const artifact of payload.chunks) {
      const chunkEnd = chunkStart + artifact.size
      if (chunkEnd > input.offset && chunkStart < end) {
        signal?.throwIfAborted()
        const { id, size } = artifact
        const data = await read(artifact)
        signal?.throwIfAborted()
        if (data.byteLength !== size || hash(data) !== id) throw badArtifact()
        const start = Math.max(0, input.offset - chunkStart)
        const stop = Math.min(size, end - chunkStart)
        bytes.set(data.subarray(start, stop), filled)
        filled += stop - start
      }
      chunkStart = chunkEnd
    }
    if (filled !== bytes.byteLength) throw badArtifact()
  }
  const first = bytes[0]
  if (first !== undefined && continuation(first)) {
    if (input.offset === 0) throw badArtifact()
    throw new HbarError('COMMAND_RESULT_OFFSET_INVALID', 'Use an offset returned by the previous UTF-8 page')
  }
  let length = bytes.byteLength
  if (end < totalBytes && length > 0) {
    let start = length - 1
    while (start > 0 && continuation(bytes[start] ?? 0)) start--
    const lead = bytes[start]
    if (lead === undefined) throw badArtifact()
    const expected = sequenceBytes(lead)
    if (!expected) throw badArtifact()
    if (length - start < expected) length = start
  }
  if (length === 0 && input.offset < totalBytes) throw badArtifact()
  let content: string
  try {
    // Preserve a literal U+FEFF at a page boundary; decoder BOM handling must not remove result bytes.
    content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, length))
  } catch {
    throw badArtifact()
  }
  signal?.throwIfAborted()
  const next = input.offset + length
  return commandResultPageSchema.parse({
    encoding: 'utf8',
    integrity: inline ? 'inline' : 'selected_chunks',
    offset: input.offset,
    nextOffset: next < totalBytes ? next : null,
    totalBytes,
    sha256,
    content,
  })
}

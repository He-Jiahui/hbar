import { createHash } from 'node:crypto'
import { lstat, open } from 'node:fs/promises'
import { join } from 'node:path'
import { HbarError, artifactSchema } from '@hbar/contracts'
import type { KernelControllerPort } from '@hbar/kernel/controller'
import { CommandResultPayloads, type CommandPayloadSource } from './command-result-payloads'

const uploadOwnerId = (source: CommandPayloadSource): string =>
  `command-${createHash('sha256')
    .update(JSON.stringify([source.sessionId, source.operationKey, source.channel ?? 'result']))
    .digest('hex')}`

/** Stable Host composition uses the normal upload ledger and bounded, non-redirected attachment reads. */
export function createHostCommandResultPayloads(
  kernel: Pick<KernelControllerPort, 'upload' | 'storage' | 'options'>,
): CommandResultPayloads {
  return new CommandResultPayloads({
    write: (source, index, bytes) =>
      kernel.upload(`command-result-${index + 1}.json`, 'application/octet-stream', bytes, {
        actorId: source.actorId,
        owner: { kind: 'preSession', id: uploadOwnerId(source), clientRevision: 0 },
        sha256: createHash('sha256').update(bytes).digest('hex'),
      }),
    release: (source, artifact) =>
      kernel.storage.call('chatDatabaseArtifactReleaseUpload', {
        artifactId: artifact.id,
        deviceId: source.actorId,
        ownerId: `preSession:${uploadOwnerId(source)}`,
      }),
    read: async (value) => {
      const artifact = artifactSchema.parse(value)
      if (artifact.size < 1 || artifact.size > 10_485_760 || artifact.mime !== 'application/octet-stream')
        throw new HbarError('COMMAND_RECEIPT_ARTIFACT', 'Command result attachment metadata is invalid')
      const saved = await kernel.storage.call('artifact', artifact.id)
      if (saved.id !== artifact.id || saved.size !== artifact.size || saved.mime !== artifact.mime)
        throw new HbarError('COMMAND_RECEIPT_ARTIFACT', 'Command result attachment differs from stored metadata')
      const root = kernel.options.layout.artifacts,
        path = join(root, artifact.id)
      const rootInfo = await lstat(root),
        info = await lstat(path)
      if (
        !rootInfo.isDirectory() ||
        rootInfo.isSymbolicLink() ||
        !info.isFile() ||
        info.isSymbolicLink() ||
        info.size !== artifact.size
      )
        throw new HbarError('COMMAND_RECEIPT_ARTIFACT', 'Command result attachment path is redirected or incomplete')
      const file = await open(path, 'r')
      try {
        const opened = await file.stat()
        if (opened.dev !== info.dev || opened.ino !== info.ino || opened.size !== artifact.size)
          throw new HbarError('COMMAND_RECEIPT_ARTIFACT', 'Command result attachment changed before reading')
        const bytes = new Uint8Array(artifact.size)
        let offset = 0
        while (offset < bytes.byteLength) {
          const read = await file.read(bytes, offset, bytes.byteLength - offset, offset)
          if (!read.bytesRead)
            throw new HbarError('COMMAND_RECEIPT_ARTIFACT', 'Command result attachment is incomplete')
          offset += read.bytesRead
        }
        const after = await file.stat(),
          rootAfter = await lstat(root)
        if (
          after.size !== artifact.size ||
          rootAfter.isSymbolicLink() ||
          rootAfter.dev !== rootInfo.dev ||
          rootAfter.ino !== rootInfo.ino
        )
          throw new HbarError('COMMAND_RECEIPT_ARTIFACT', 'Command result attachment changed while reading')
        return bytes
      } finally {
        await file.close()
      }
    },
  })
}

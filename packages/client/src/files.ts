import { CommandError, CommandRegistry, createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { HbarError, type ArtifactRef } from '@hbar/contracts'
import { attachmentCommands, fileCommands } from '@hbar/contracts/commands/files'
import type { AttachmentUploadInput } from '@hbar/contracts/commands/files'
import type { ClientTransport } from './transport'

export function createFileCommandClient(client: ClientTransport) {
  return createCommandClient(fileCommands, {
    execute(commandId, input, options) {
      return client.call('command.execute', {
        protocol: COMMAND_PROTOCOL_VERSION,
        requestId: options?.requestId ?? crypto.randomUUID(),
        commandId,
        commandVersion: options?.version ?? 1,
        input,
      })
    },
  })
}

export interface AttachmentUploadTransport {
  upload(file: File, signal?: AbortSignal): Promise<ArtifactRef>
}

export interface AttachmentSourcePort {
  resolve(sourceId: string, signal: AbortSignal): File | Promise<File>
}

const normalizedMime = (mime: string): string => mime.trim().split(';', 1)[0]!.toLowerCase()

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function createAttachmentSourceDescriptor(sourceId: string, file: File): Promise<AttachmentUploadInput> {
  return {
    sourceId,
    sha256: await sha256(file),
    name: file.name,
    mime: normalizedMime(file.type) || 'application/octet-stream',
    size: file.size,
  }
}

export function createAttachmentCommandClient(transport: AttachmentUploadTransport, sources: AttachmentSourcePort) {
  const registry = new CommandRegistry({ execution: 'client', maxConcurrent: 4 })
  registry.register(
    attachmentCommands['attachment.upload'],
    async (input, context) => {
      const file = await sources.resolve(input.sourceId, context.signal)
      context.signal.throwIfAborted()
      if (
        file.name !== input.name ||
        file.size !== input.size ||
        (normalizedMime(file.type) || 'application/octet-stream') !== input.mime
      )
        throw new CommandError('SOURCE_CHANGED', 'Attachment source metadata changed before upload')
      if ((await sha256(file)) !== input.sha256)
        throw new CommandError('SOURCE_CHANGED', 'Attachment source content changed before upload')
      context.signal.throwIfAborted()
      const artifact = await transport.upload(file, context.signal).catch((error: unknown) => {
        // The command registry deliberately hides arbitrary errors; preserve the
        // authenticated transport's typed rejection/unknown code at this boundary.
        if (error instanceof HbarError) throw new CommandError(error.code, error.message)
        throw error
      })
      if (artifact.id !== input.sha256 || artifact.size !== input.size)
        throw new CommandError('CONTENT_MISMATCH', 'Uploaded artifact does not match the selected source')
      return artifact
    },
    { durable: true },
  )
  return {
    ...createCommandClient(attachmentCommands, {
      execute(name, input, options) {
        return registry.execute(name, input, { ...options, actorId: 'local-client' })
      },
    }),
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 100 }),
    dispose: () => registry.dispose(),
  }
}

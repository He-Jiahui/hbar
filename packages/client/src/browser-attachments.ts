import { CommandError } from '@hbar/commands'
import { attachmentUploadInputSchema, type AttachmentUploadInput } from '@hbar/contracts/commands/files'
import {
  createAttachmentCommandClient,
  createAttachmentSourceDescriptor,
  type AttachmentUploadTransport,
} from './files'

const DEFAULT_MAX_SOURCES = 12
const DEFAULT_MAX_BYTES = 120 * 1024 * 1024
const DEFAULT_SOURCE_TTL_MS = 5 * 60_000

interface SourceEntry {
  readonly file: File
  readonly expiresAt: number
}

export interface BrowserAttachmentSelection {
  readonly kind: 'image' | 'file'
  readonly upload: AttachmentUploadInput
  release(): void
}

export interface BrowserAttachmentControllerOptions {
  readonly maxSources?: number
  readonly maxBytes?: number
  readonly sourceTtlMs?: number
  readonly now?: () => number
}

/**
 * Holds browser-selected File objects behind short-lived opaque IDs. Commands only
 * receive the serializable descriptor and can never confuse a client path with a Host path.
 */
export function createBrowserAttachmentController(
  transport: AttachmentUploadTransport,
  options: BrowserAttachmentControllerOptions = {},
) {
  const maxSources = options.maxSources ?? DEFAULT_MAX_SOURCES
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const sourceTtlMs = options.sourceTtlMs ?? DEFAULT_SOURCE_TTL_MS
  const now = options.now ?? Date.now
  const sources = new Map<string, SourceEntry>()
  let sourceBytes = 0
  let disposed = false

  if (!Number.isInteger(maxSources) || maxSources < 1 || maxSources > 100)
    throw new CommandError('INVALID_INPUT', 'Browser attachment source capacity is invalid')
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
    throw new CommandError('INVALID_INPUT', 'Browser attachment byte capacity is invalid')
  if (!Number.isSafeInteger(sourceTtlMs) || sourceTtlMs < 1)
    throw new CommandError('INVALID_INPUT', 'Browser attachment source lifetime is invalid')

  const release = (sourceId: string): void => {
    const entry = sources.get(sourceId)
    if (!entry) return
    sources.delete(sourceId)
    sourceBytes -= entry.file.size
  }
  const purgeExpired = (): void => {
    const timestamp = now()
    for (const [sourceId, entry] of sources) if (entry.expiresAt <= timestamp) release(sourceId)
  }
  const assertActive = (): void => {
    if (disposed) throw new CommandError('DISPOSED', 'Browser attachment controller is disposed')
  }

  const commands = createAttachmentCommandClient(transport, {
    resolve(sourceId, signal) {
      assertActive()
      signal.throwIfAborted()
      purgeExpired()
      const entry = sources.get(sourceId)
      if (!entry) throw new CommandError('SOURCE_NOT_FOUND', 'Browser attachment source expired')
      return entry.file
    },
  })

  return {
    commands,
    async prepare(file: File): Promise<BrowserAttachmentSelection> {
      assertActive()
      purgeExpired()
      if (sources.size >= maxSources || sourceBytes + file.size > maxBytes)
        throw new CommandError('BUSY', 'Browser attachment source capacity is reached')
      const sourceId = crypto.randomUUID()
      sources.set(sourceId, { file, expiresAt: now() + sourceTtlMs })
      sourceBytes += file.size
      try {
        const parsed = attachmentUploadInputSchema.safeParse(await createAttachmentSourceDescriptor(sourceId, file))
        if (!parsed.success) throw new CommandError('INVALID_INPUT', 'Selected attachment is unsupported')
        return {
          kind: parsed.data.mime.startsWith('image/') ? 'image' : 'file',
          upload: parsed.data,
          release: () => release(sourceId),
        }
      } catch (error) {
        release(sourceId)
        throw error
      }
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      commands.dispose()
      sources.clear()
      sourceBytes = 0
    },
  }
}

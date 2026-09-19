import { CommandError } from '@hbar/commands'
import type { ResourceKind, ResourcePickerPort, ResourcePickerSelection, ResourceReference } from '@hbar/schema-core'
import { createBrowserAttachmentController } from './browser-attachments'
import type { AttachmentUploadTransport } from './files'

const MAX_DIRECTORY_FILES = 100
const MAX_DIRECTORY_BYTES = 120 * 1024 * 1024

export interface BrowserFileSelectionPort {
  select(kind: ResourceKind, signal: AbortSignal): Promise<readonly File[] | null>
}

export interface BrowserResourcePickerOptions {
  readonly files?: BrowserFileSelectionPort
  readonly maxDirectoryFiles?: number
  readonly maxDirectoryBytes?: number
}

function domFileSelection(): BrowserFileSelectionPort {
  return {
    select(kind, signal) {
      if (typeof document === 'undefined')
        return Promise.reject(new CommandError('CAPABILITY_UNAVAILABLE', 'Browser file selection is unavailable'))
      signal.throwIfAborted()
      return new Promise((resolve, reject) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.hidden = true
        input.multiple = kind === 'directory'
        if (kind === 'directory') input.setAttribute('webkitdirectory', '')
        const cleanup = () => {
          signal.removeEventListener('abort', aborted)
          input.remove()
        }
        const completed = () => {
          const files = input.files ? Array.from(input.files) : []
          cleanup()
          resolve(files.length ? files : null)
        }
        const cancelled = () => {
          cleanup()
          resolve(null)
        }
        const aborted = () => {
          cleanup()
          reject(new CommandError('CANCELLED', 'Resource selection was cancelled'))
        }
        input.addEventListener('change', completed, { once: true })
        input.addEventListener('cancel', cancelled, { once: true })
        signal.addEventListener('abort', aborted, { once: true })
        document.body.append(input)
        input.click()
      })
    },
  }
}

function directoryPath(file: File): string {
  const path = (file.webkitRelativePath || file.name).replaceAll('\\', '/')
  if (!path || path.startsWith('/') || path.split('/').includes('..'))
    throw new CommandError('INVALID_INPUT', 'Selected directory contains an invalid relative path')
  return path
}

export function createBrowserResourcePicker(
  transport: AttachmentUploadTransport,
  options: BrowserResourcePickerOptions = {},
): ResourcePickerPort & { dispose(): void } {
  const files = options.files ?? domFileSelection()
  const maxDirectoryFiles = options.maxDirectoryFiles ?? MAX_DIRECTORY_FILES
  const maxDirectoryBytes = options.maxDirectoryBytes ?? MAX_DIRECTORY_BYTES
  const attachments = createBrowserAttachmentController(transport)
  let disposed = false

  if (!Number.isInteger(maxDirectoryFiles) || maxDirectoryFiles < 1 || maxDirectoryFiles > 1_000)
    throw new CommandError('INVALID_INPUT', 'Directory file capacity is invalid')
  if (!Number.isSafeInteger(maxDirectoryBytes) || maxDirectoryBytes < 1)
    throw new CommandError('INVALID_INPUT', 'Directory byte capacity is invalid')

  const upload = async (file: File, signal: AbortSignal) => {
    const selected = await attachments.prepare(file)
    try {
      return await attachments.commands.execute('attachment.upload', selected.upload, { signal })
    } finally {
      selected.release()
    }
  }

  return {
    async select(request, signal): Promise<ResourcePickerSelection | null> {
      if (disposed) throw new CommandError('DISPOSED', 'Browser resource picker is disposed')
      if (request.resource.location !== 'client-local')
        throw new CommandError('CAPABILITY_UNAVAILABLE', 'Browser resource picker only selects client-local resources')
      const selected = await files.select(request.resource.kind, signal)
      signal.throwIfAborted()
      if (!selected) return null
      if (request.resource.kind === 'file') {
        if (selected.length !== 1) throw new CommandError('INVALID_INPUT', 'File picker requires exactly one file')
        const file = selected[0]!
        const artifact = await upload(file, signal)
        const reference: ResourceReference = {
          kind: 'artifact',
          resourceKind: 'file',
          artifactId: artifact.id,
          name: file.name,
        }
        return { reference, label: file.name }
      }
      if (selected.length > maxDirectoryFiles)
        throw new CommandError('INVALID_INPUT', 'Selected directory contains too many files')
      const totalBytes = selected.reduce((total, file) => total + file.size, 0)
      if (totalBytes > maxDirectoryBytes)
        throw new CommandError('INVALID_INPUT', 'Selected directory exceeds the byte limit')
      const entries = []
      const paths = new Set<string>()
      for (const file of selected) {
        signal.throwIfAborted()
        const path = directoryPath(file)
        if (paths.has(path)) throw new CommandError('INVALID_INPUT', 'Selected directory contains duplicate paths')
        paths.add(path)
        entries.push({ path, artifact: await upload(file, signal) })
      }
      entries.sort((left, right) => left.path.localeCompare(right.path))
      const root = entries[0]?.path.split('/', 1)[0] ?? 'directory'
      const manifest = new File(
        [JSON.stringify({ version: 1, kind: 'directory', root, entries })],
        `${root}.hbar-directory.json`,
        { type: 'application/vnd.hbar.directory+json' },
      )
      const artifact = await upload(manifest, signal)
      return {
        reference: { kind: 'artifact', resourceKind: 'directory', artifactId: artifact.id, name: root },
        label: root,
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      attachments.dispose()
    },
  }
}

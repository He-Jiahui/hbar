import { CommandError, createCommandClient, type CommandExecutor } from '@hbar/commands'
import { fileCommands } from '@hbar/contracts/commands/files'
import type { FileWorkspaceDocumentState } from './types'

export const MAX_CACHED_FILE_DOCUMENTS = 32
const MAX_CACHED_CHARACTERS = 8 * 1024 * 1024
const UNKNOWN_WRITE_CODES = new Set([
  'RESULT_UNKNOWN',
  'DISCONNECTED',
  'CONNECTION_CLOSED',
  // Generic Host/transport failure can occur after the file has been replaced
  // (for example, while invalidating the workspace index). It is not rejection proof.
  'EXECUTION_FAILED',
  'RPC_ERROR',
  'TIMEOUT',
  'TIMED_OUT',
  'CANCELLED',
  'INVALID_OUTPUT',
])
type Document = Readonly<FileWorkspaceDocumentState>
type CachedDocument = {
  readonly workspaceId: string
  readonly path: string
  document: Document
  read: Promise<Document> | null
  /** Correlation only: file.write has no durable idempotency/receipt contract. Never replay an unknown write. */
  requestId: string | null
}

function errorCode(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}
export function canonicalFilePath(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  if (normalized.startsWith('/') || /^[a-z]:/i.test(normalized))
    throw new CommandError('INVALID_INPUT', 'File documents require workspace-relative paths')
  const parts: string[] = []
  for (const part of normalized.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (!parts.length) throw new CommandError('INVALID_INPUT', 'File path leaves its workspace')
      parts.pop()
    } else parts.push(part)
  }
  if (!parts.length) throw new CommandError('INVALID_INPUT', 'A document requires a file path')
  return parts.join('/')
}
export const fileDocumentKey = (workspaceId: string, path: string): string =>
  JSON.stringify([workspaceId, canonicalFilePath(path)])
const cost = (document: Document) =>
  document.baseline.length + document.draft.length + (document.pendingText?.length ?? 0)
const protectedDocument = (document: Document) =>
  document.draft !== document.baseline ||
  document.status === 'unknown' ||
  document.status === 'submitting' ||
  document.status === 'loading'

/** One document fact per workspace/path; panel entries only reference these immutable snapshots. */
export class FileWorkspaceDocuments {
  private readonly documents = new Map<string, CachedDocument>()
  private readonly client: ReturnType<typeof createCommandClient<typeof fileCommands>> | null
  private disposed = false

  constructor(
    port: CommandExecutor | undefined,
    private readonly attached: (key: string) => boolean,
    private readonly changed: (key: string, document: Document | null) => void,
  ) {
    this.client = port ? createCommandClient(fileCommands, port) : null
  }

  get(workspaceId: string, path: string): Document | undefined {
    return this.documents.get(fileDocumentKey(workspaceId, path))?.document
  }
  private requireClient() {
    if (!this.client) throw new CommandError('CAPABILITY_UNAVAILABLE', 'File commands are unavailable')
    return this.client
  }
  private current(workspaceId: string, path: string): CachedDocument {
    const cached = this.documents.get(fileDocumentKey(workspaceId, path))
    if (!cached) throw new CommandError('RESULT_UNKNOWN', 'Open the file document first')
    return cached
  }
  private reserve(key: string, document: Document) {
    let count = this.documents.size + (this.documents.has(key) ? 0 : 1)
    let characters = cost(document)
    for (const [otherKey, cached] of this.documents) if (otherKey !== key) characters += cost(cached.document)
    for (const [otherKey, cached] of this.documents) {
      if (count <= MAX_CACHED_FILE_DOCUMENTS && characters <= MAX_CACHED_CHARACTERS) break
      if (otherKey === key || protectedDocument(cached.document) || cached.read || this.attached(otherKey)) continue
      this.documents.delete(otherKey)
      count -= 1
      characters -= cost(cached.document)
      this.changed(otherKey, null)
    }
    if (count > MAX_CACHED_FILE_DOCUMENTS || characters > MAX_CACHED_CHARACTERS)
      throw new CommandError(
        'BUSY',
        'Save or explicitly discard an existing draft before opening or enlarging another document',
      )
  }
  private publish(cached: CachedDocument, document: Document): Document {
    if (this.disposed) return cached.document
    const key = fileDocumentKey(cached.workspaceId, cached.path)
    this.reserve(key, document)
    cached.document = Object.freeze(document)
    this.changed(key, cached.document)
    return cached.document
  }

  async open(workspaceId: string, rawPath: string, discard = false): Promise<Document> {
    const path = canonicalFilePath(rawPath)
    const key = fileDocumentKey(workspaceId, path)
    let cached = this.documents.get(key)
    if (cached?.read) return cached.read
    if (cached && protectedDocument(cached.document) && !discard) return cached.document
    if (!cached) {
      const document: Document = Object.freeze({
        path,
        status: 'loading',
        baseline: '',
        draft: '',
        sha256: null,
        pendingText: null,
        error: null,
      })
      this.reserve(key, document)
      cached = { workspaceId, path, document, read: null, requestId: null }
      this.documents.set(key, cached)
    }
    const target = cached
    const previous = target.document
    this.publish(target, { ...previous, status: 'loading', error: null })
    const read = (async () => {
      try {
        const file = await this.requireClient().execute('file.read', { workspaceId, path })
        if (file.workspaceId !== workspaceId || canonicalFilePath(file.path) !== path)
          throw new CommandError('INVALID_OUTPUT', 'File response target mismatch')
        return this.publish(target, {
          path,
          status: 'ready',
          baseline: file.text,
          draft: file.text,
          sha256: file.sha256,
          pendingText: null,
          error: null,
        })
      } catch (reason) {
        this.publish(target, { ...previous, status: 'failed', error: errorCode(reason) })
        throw reason
      } finally {
        target.read = null
      }
    })()
    target.read = read
    return read
  }

  edit(workspaceId: string, path: string, text: string): Document {
    const cached = this.current(workspaceId, path)
    const document = cached.document
    if (document.status === 'unknown' || document.status === 'loading' || document.sha256 === null)
      throw new CommandError('BUSY', 'File document is not editable')
    return this.publish(cached, {
      ...document,
      draft: text,
      status: document.status === 'submitting' ? 'submitting' : 'ready',
      error: null,
    })
  }

  async save(workspaceId: string, path: string): Promise<Document> {
    const cached = this.current(workspaceId, path)
    const document = cached.document
    if (['submitting', 'unknown', 'loading'].includes(document.status) || document.sha256 === null)
      throw new CommandError('BUSY', 'File document is not ready to save')
    if (document.draft === document.baseline) return document
    const submitted = document.draft
    const requestId = crypto.randomUUID()
    this.publish(cached, { ...document, status: 'submitting', pendingText: submitted, error: null })
    cached.requestId = requestId
    try {
      const receipt = await this.requireClient().execute(
        'file.write',
        {
          workspaceId,
          path: cached.path,
          text: submitted,
          expectedSha256: document.sha256,
        },
        { requestId },
      )
      if (receipt.workspaceId !== workspaceId || canonicalFilePath(receipt.path) !== cached.path)
        throw new CommandError('INVALID_OUTPUT', 'File write response target mismatch')
      cached.requestId = null
      return this.publish(cached, {
        ...cached.document,
        status: 'succeeded',
        baseline: submitted,
        sha256: receipt.afterSha256,
        pendingText: null,
        error: null,
      })
    } catch (reason) {
      const error = errorCode(reason)
      const unknown = UNKNOWN_WRITE_CODES.has(error)
      if (!unknown) cached.requestId = null
      this.publish(cached, {
        ...cached.document,
        status: unknown ? 'unknown' : 'failed',
        pendingText: unknown ? submitted : null,
        error,
      })
      throw reason
    }
  }

  async reconcile(workspaceId: string, path: string): Promise<Document> {
    const cached = this.current(workspaceId, path)
    const document = cached.document
    if (document.status !== 'unknown' || document.pendingText === null || cached.requestId === null)
      throw new CommandError('INVALID_INPUT', 'File save does not require reconciliation')
    const requestId = cached.requestId
    const file = await this.requireClient().execute('file.read', { workspaceId, path: cached.path })
    if (file.workspaceId !== workspaceId || canonicalFilePath(file.path) !== cached.path)
      throw new CommandError('INVALID_OUTPUT', 'File reconciliation target mismatch')
    if (cached.requestId !== requestId || cached.document.status !== 'unknown') return cached.document
    if (file.text !== document.pendingText) {
      // An absent result is not evidence that the durable write was never accepted.
      // Keep its original request, baseline and expected hash; never enable blind replay.
      return this.publish(cached, {
        ...document,
        error: file.sha256 === document.sha256 ? 'RESULT_UNKNOWN' : 'FILE_CONFLICT',
      })
    }
    cached.requestId = null
    return this.publish(cached, {
      ...document,
      status: 'succeeded',
      baseline: file.text,
      sha256: file.sha256,
      pendingText: null,
      error: null,
    })
  }

  discardAndReload(
    workspaceId: string,
    path: string,
    expectedDraft: string,
    expectedSha256: string | null,
  ): Promise<Document> {
    const cached = this.current(workspaceId, path)
    if (['submitting', 'unknown', 'loading'].includes(cached.document.status))
      throw new CommandError('BUSY', 'Reconcile the pending file operation before discarding')
    if (cached.document.draft !== expectedDraft || cached.document.sha256 !== expectedSha256)
      throw new CommandError('VERSION_CONFLICT', 'The draft changed after the discard confirmation opened')
    return this.open(workspaceId, path, true)
  }

  dispose() {
    this.disposed = true
    this.documents.clear()
  }
}

import { z } from 'zod'
import { CommandError, createCommandClient, type CommandExecutor } from '@hbar/commands'
import { collectArtifactReferenceIds } from '@hbar/contracts'
import {
  chatDatabaseCommands,
  chatDatabaseDraftOwnerInputSchema,
  chatDatabaseDraftSyncInputSchema,
  chatDatabaseDraftPageSchema,
  type ChatDatabaseDraftOwnerInput,
  type ChatDatabaseDraftOwner,
  type ChatDatabaseUploadOwner,
} from '@hbar/contracts/commands/chat-database'
import type { AttachmentUploadInput } from '@hbar/contracts/commands/files'
import type { AttachmentOwnerSnapshot } from './draft-attachments'
import { createState, type StateReader } from './state'

const pendingSchema = z.strictObject({
  input: chatDatabaseDraftSyncInputSchema,
  idempotencyKey: z.string().uuid(),
  requestId: z.string().uuid(),
})
const ownerSchema = z.strictObject({
  targetId: z.string().min(1).max(1000),
  desired: chatDatabaseDraftOwnerInputSchema,
  serverRevision: z.number().int().nonnegative().safe(),
  syncedClientRevision: z.number().int().nonnegative().safe(),
  pending: pendingSchema.nullable(),
})
const journalSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    namespace: z.string().uuid(),
    legacyComplete: z.boolean().nullable(),
    owners: z.array(ownerSchema).max(300),
  })
  .refine(
    (value) =>
      new Set(value.owners.map((owner) => `${owner.desired.kind}:${owner.targetId}`)).size === value.owners.length &&
      new Set(value.owners.map((owner) => owner.desired.id)).size === value.owners.length,
  )
export type DraftArtifactReferenceJournal = z.output<typeof journalSchema>
export interface DraftArtifactReferenceJournalPort {
  read(): unknown
  write(journal: DraftArtifactReferenceJournal): void
}
export interface DraftArtifactReferenceState {
  readonly status: 'idle' | 'syncing' | 'failed'
  readonly error: string | null
  readonly inventoryComplete: boolean
}
export interface DraftArtifactReferencePort {
  prepareUpload(
    kind: ChatDatabaseDraftOwnerInput['kind'],
    targetId: string,
    snapshot: AttachmentOwnerSnapshot,
    upload: AttachmentUploadInput,
    signal: AbortSignal,
  ): Promise<ChatDatabaseUploadOwner>
}
const errorCode = (reason: unknown) => (reason instanceof CommandError ? reason.code : 'REFERENCE_SYNC_FAILED')
const sameRefs = (left: ChatDatabaseDraftOwnerInput, right: ChatDatabaseDraftOwnerInput) =>
  JSON.stringify([left.artifactIds, left.pendingArtifactIds]) ===
  JSON.stringify([right.artifactIds, right.pendingArtifactIds])

/** A window's declarations survive disposal. Only observed content edits can release its references. */
export function createDraftArtifactReferences(options: {
  readonly commands: CommandExecutor
  readonly namespace: string
  readonly journal: DraftArtifactReferenceJournalPort
  readonly onSubscriberError: (reason: unknown) => void
}) {
  const client = createCommandClient(chatDatabaseCommands, {
    execute(id, input, execution) {
      const deadline = new AbortController()
      const signal = AbortSignal.any([
        controller.signal,
        deadline.signal,
        ...(execution?.signal ? [execution.signal] : []),
      ])
      const timer = setTimeout(
        () => deadline.abort(new CommandError('TIMEOUT', 'Reference request acknowledgement timed out')),
        30_000,
      )
      timer.unref?.()
      return new Promise<unknown>((resolve, reject) => {
        const aborted = () => reject(signal.reason)
        if (signal.aborted) {
          aborted()
          return
        }
        signal.addEventListener('abort', aborted, { once: true })
        // Ending observation is not proof that the Host mutation stopped. Pending
        // identity remains durable and the original idempotent receipt is retried.
        options.commands
          .execute(id, input, { ...execution, signal })
          .then(resolve, reject)
          .finally(() => signal.removeEventListener('abort', aborted))
          .catch(() => undefined)
      }).finally(() => clearTimeout(timer))
    },
  })
  const state = createState<DraftArtifactReferenceState>(
    { status: 'idle', error: null, inventoryComplete: false },
    options.onSubscriberError,
  )
  let journal: DraftArtifactReferenceJournal = {
    schemaVersion: 1,
    namespace: options.namespace,
    legacyComplete: null,
    owners: [],
  }
  let restoreError: string | null = null
  try {
    const saved = options.journal.read()
    if (saved !== null && saved !== undefined) journal = journalSchema.parse(saved)
    if (journal.namespace !== options.namespace) throw new Error('Reference journal belongs to another window')
  } catch {
    restoreError = 'REFERENCE_JOURNAL_INVALID'
  }
  let disposed = false
  let connected = false
  let draining: Promise<void> | null = null
  const subscriptions: Array<() => void> = []
  const controller = new AbortController()
  let inventoryDirty = true
  const owners = new Map(journal.owners.map((owner) => [`${owner.desired.kind}:${owner.targetId}`, owner]))
  function persist() {
    if (disposed) throw new CommandError('DISPOSED', 'Reference owner is disposed')
    if (restoreError) throw new CommandError(restoreError, 'Cannot replace an invalid reference journal')
    try {
      options.journal.write(journalSchema.parse({ ...journal, owners: [...owners.values()] }))
    } catch {
      throw new CommandError('REFERENCE_JOURNAL_WRITE_FAILED', 'Could not persist attachment ownership')
    }
  }
  function declare(
    kind: ChatDatabaseDraftOwnerInput['kind'],
    targetId: string,
    artifactIds: string[],
    pendingArtifactIds: string[],
  ) {
    if (disposed || restoreError) return null
    const key = `${kind}:${targetId}`
    const current = owners.get(key)
    if (!current && artifactIds.length + pendingArtifactIds.length === 0) return null
    const desired = chatDatabaseDraftOwnerInputSchema.parse({
      id: current?.desired.id ?? `${options.namespace}:${crypto.randomUUID()}`,
      kind,
      artifactIds: [...new Set(artifactIds)].sort(),
      pendingArtifactIds: [...new Set(pendingArtifactIds)].filter((id) => !artifactIds.includes(id)).sort(),
      clientRevision: (current?.desired.clientRevision ?? 0) + 1,
    })
    if (current && sameRefs(current.desired, desired)) return current
    if (!current && owners.size >= 300)
      throw new CommandError('REFERENCE_OWNER_LIMIT', 'Too many retained attachment owners')
    const value = {
      targetId,
      desired,
      serverRevision: current?.serverRevision ?? 0,
      syncedClientRevision: current?.syncedClientRevision ?? 0,
      pending: current?.pending ?? null,
    }
    owners.set(key, value)
    try {
      persist()
    } catch (reason) {
      if (current) owners.set(key, current)
      else owners.delete(key)
      throw reason
    }
    inventoryDirty = true
    return value
  }
  const attachmentRefs = (snapshot: Pick<AttachmentOwnerSnapshot, 'attachments' | 'attachmentTransfers'>) => {
    const artifacts = snapshot.attachments.map((item) => item.artifact.id)
    const pending: string[] = []
    for (const transfer of snapshot.attachmentTransfers) {
      if (transfer.confirmed) artifacts.push(transfer.confirmed.artifact.id)
      else if (transfer.upload) pending.push(transfer.upload.sha256)
    }
    return { artifacts, pending }
  }
  async function remoteOwners(): Promise<Map<string, ChatDatabaseDraftOwner>> {
    const result = new Map<string, ChatDatabaseDraftOwner>()
    let after: string | null = null
    for (let page = 0; page < 10; page++) {
      const data: z.output<typeof chatDatabaseDraftPageSchema> = await client.execute(
        'chatDatabase.draft.list',
        { after, limit: 100 },
        { signal: controller.signal },
      )
      controller.signal.throwIfAborted()
      for (const owner of data.items) {
        const key = `${owner.kind}:${owner.id}`
        if (result.has(key)) throw new CommandError('INVALID_OUTPUT', 'Duplicate remote reference owner')
        result.set(key, owner)
      }
      if (!data.next) return result
      if (data.next === after) throw new CommandError('INVALID_OUTPUT', 'Reference cursor did not advance')
      after = data.next
    }
    throw new CommandError('REFERENCE_OWNER_LIMIT', 'Device reference inventory exceeds its bound')
  }
  async function synchronize(owner: z.output<typeof ownerSchema>) {
    const key = `${owner.desired.kind}:${owner.targetId}`
    // Retry an uncertain mutation with its original identity before newer content.
    for (let attempt = 0; attempt < 8; attempt++) {
      const current = owners.get(key)
      if (!current || (!current.pending && current.syncedClientRevision === current.desired.clientRevision)) return
      if (!current.pending) {
        current.pending = {
          input: { owner: current.desired, expectedRevision: current.serverRevision },
          idempotencyKey: crypto.randomUUID(),
          requestId: crypto.randomUUID(),
        }
        try {
          persist()
        } catch (reason) {
          current.pending = null
          throw reason
        }
      }
      const pending = current.pending
      let accepted: ChatDatabaseDraftOwner
      try {
        accepted = await client.execute('chatDatabase.draft.sync', pending.input, {
          ...pending,
          signal: controller.signal,
        })
      } catch (reason) {
        controller.signal.throwIfAborted()
        if (errorCode(reason) !== 'COMMAND_CONFLICT') throw reason
        const remote = (await remoteOwners()).get(`${current.desired.kind}:${current.desired.id}`)
        if (remote && remote.clientRevision > current.desired.clientRevision)
          throw new CommandError('REFERENCE_OWNER_CONFLICT', 'Another runtime owns a newer reference generation')
        const latest = owners.get(key)
        if (!latest) throw new CommandError('REFERENCE_JOURNAL_INVALID', 'Conflicted owner disappeared')
        latest.serverRevision = remote?.revision ?? 0
        latest.pending = null
        persist()
        continue
      }
      controller.signal.throwIfAborted()
      if (disposed) return
      const latest = owners.get(key)
      if (!latest) throw new CommandError('REFERENCE_JOURNAL_INVALID', 'Accepted owner disappeared')
      const before = { ...latest }
      latest.serverRevision = accepted.revision
      latest.syncedClientRevision = accepted.clientRevision
      latest.pending = null
      try {
        persist()
      } catch (reason) {
        owners.set(key, before)
        throw reason
      }
    }
    throw new CommandError('BUSY', 'Reference content changed too frequently to confirm')
  }
  async function inventory() {
    if (!inventoryDirty) return
    const version = JSON.stringify(
      [...owners.values()].map((owner) => [owner.desired.id, owner.serverRevision, owner.desired.clientRevision]),
    )
    // Preserve all other windows, including offline owners. An older unknown device
    // cannot become complete merely because this window has an empty local store.
    if (!journal.legacyComplete) {
      inventoryDirty = false
      return
    }
    const remote = await remoteOwners()
    for (const owner of owners.values()) {
      if (owner.pending || owner.syncedClientRevision !== owner.desired.clientRevision) return
      const found = remote.get(`${owner.desired.kind}:${owner.desired.id}`)
      if (!found || found.revision !== owner.serverRevision) return
    }
    const inventoryId = crypto.randomUUID()
    await client.execute(
      'chatDatabase.inventory.begin',
      { inventoryId, ownerIds: [...remote.keys()] },
      { idempotencyKey: crypto.randomUUID(), signal: controller.signal },
    )
    controller.signal.throwIfAborted()
    const result = await client.execute(
      'chatDatabase.inventory.finish',
      {
        inventoryId,
        ownerRevisions: Object.fromEntries([...remote].map(([key, owner]) => [key, owner.revision])),
      },
      { idempotencyKey: crypto.randomUUID(), signal: controller.signal },
    )
    controller.signal.throwIfAborted()
    if (
      version ===
      JSON.stringify(
        [...owners.values()].map((owner) => [owner.desired.id, owner.serverRevision, owner.desired.clientRevision]),
      )
    )
      inventoryDirty = false
    state.replace({ ...state.reader.getSnapshot(), inventoryComplete: result.complete })
  }
  function flush(): Promise<void> {
    if (draining) return draining
    if (!connected || disposed)
      return Promise.reject(new CommandError('DISCONNECTED', 'Reference Host is disconnected'))
    if (restoreError) return Promise.reject(new CommandError(restoreError, 'Reference journal could not be restored'))
    state.replace({ ...state.reader.getSnapshot(), status: 'syncing', error: null })
    const task = (async () => {
      if (!journal.legacyComplete) {
        const known = await client.execute('chatDatabase.inventory.get', {}, { signal: controller.signal })
        controller.signal.throwIfAborted()
        journal.legacyComplete = known.complete || known.inventoryId !== null || !known.legacyRequired
        persist()
      }
      // At most 300 owners; each owner serializes its own revisions and RPC identity.
      for (let batch = 0; batch < 8; batch++) {
        const dirty = [...owners.values()].filter(
          (owner) => owner.pending || owner.syncedClientRevision !== owner.desired.clientRevision,
        )
        for (const owner of dirty) await synchronize(owner)
        try {
          await inventory()
        } catch (reason) {
          if (errorCode(reason) !== 'COMMAND_CONFLICT') throw reason
        }
        if (
          ![...owners.values()].some(
            (owner) => owner.pending || owner.syncedClientRevision !== owner.desired.clientRevision,
          )
        )
          break
      }
      state.replace({ ...state.reader.getSnapshot(), status: 'idle', error: null })
    })()
      .catch((reason: unknown) => {
        if (!disposed) state.replace({ ...state.reader.getSnapshot(), status: 'failed', error: errorCode(reason) })
        throw reason
      })
      .finally(() => {
        if (draining === task) draining = null
      })
    draining = task
    return task
  }
  const schedule = () => {
    if (
      connected &&
      !disposed &&
      (inventoryDirty ||
        [...owners.values()].some(
          (owner) => owner.pending || owner.syncedClientRevision !== owner.desired.clientRevision,
        ))
    )
      void flush().catch(() => undefined)
  }
  function observe<Value extends object>(
    kind: ChatDatabaseDraftOwnerInput['kind'],
    reader: StateReader<Value>,
    snapshots: (value: Value) => Readonly<Record<string, { readonly artifacts: string[]; readonly pending: string[] }>>,
  ) {
    let seen = new Set<string>()
    const changed = () => {
      if (disposed || restoreError) return
      try {
        const current = snapshots(reader.getSnapshot())
        for (const [id, refs] of Object.entries(current)) declare(kind, id, refs.artifacts, refs.pending)
        for (const missing of seen) if (!Object.hasOwn(current, missing)) declare(kind, missing, [], [])
        seen = new Set(Object.keys(current))
        schedule()
      } catch (reason) {
        state.replace({ ...state.reader.getSnapshot(), status: 'failed', error: errorCode(reason) })
      }
    }
    subscriptions.push(reader.subscribe(changed))
    changed()
  }
  return {
    reader: state.reader,
    observeAttachments<Value extends object>(
      kind: 'session' | 'preSession',
      reader: StateReader<Value>,
      snapshot: (
        value: Value,
      ) => Readonly<Record<string, Pick<AttachmentOwnerSnapshot, 'attachments' | 'attachmentTransfers'>>>,
    ) {
      observe(kind, reader, (value) =>
        Object.fromEntries(Object.entries(snapshot(value)).map(([id, content]) => [id, attachmentRefs(content)])),
      )
    },
    observeAppearance<Value extends object>(
      reader: StateReader<Value>,
      snapshot: (value: Value) => Readonly<Record<string, unknown>>,
    ) {
      observe('appearance', reader, (value) =>
        Object.fromEntries(
          Object.entries(snapshot(value)).map(([id, content]) => {
            const references = collectArtifactReferenceIds(content)
            if (!references.complete)
              throw new CommandError('REFERENCE_SCAN_INCOMPLETE', 'Appearance reference scan is incomplete')
            return [id, { artifacts: references.ids, pending: [] }]
          }),
        ),
      )
    },
    async prepareUpload(
      kind: ChatDatabaseDraftOwnerInput['kind'],
      targetId: string,
      snapshot: AttachmentOwnerSnapshot,
      upload: AttachmentUploadInput,
      signal: AbortSignal,
    ): Promise<ChatDatabaseUploadOwner> {
      if (restoreError) throw new CommandError(restoreError, 'Attachment protection cannot be established')
      const refs = attachmentRefs(snapshot)
      const owner = declare(kind, targetId, refs.artifacts, [...refs.pending, upload.sha256])
      if (!owner) throw new CommandError('REFERENCE_JOURNAL_INVALID', 'Missing upload reference owner')
      signal.throwIfAborted()
      await flush()
      signal.throwIfAborted()
      const latest = owners.get(`${kind}:${targetId}`)
      if (
        !latest ||
        latest.pending ||
        latest.syncedClientRevision !== latest.desired.clientRevision ||
        ![...latest.desired.artifactIds, ...latest.desired.pendingArtifactIds].includes(upload.sha256)
      )
        throw new CommandError('STALE_TARGET', 'Upload reference belongs to a superseded draft')
      return { id: latest.desired.id, kind, clientRevision: latest.desired.clientRevision }
    },
    flush,
    setConnected(value: boolean) {
      connected = value
      if (value) {
        inventoryDirty = true
        schedule()
      }
    },
    dispose() {
      disposed = true
      controller.abort()
      for (const off of subscriptions.splice(0)) off()
      state.dispose()
    },
  }
}

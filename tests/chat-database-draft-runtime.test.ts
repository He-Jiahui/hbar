import { afterEach, expect, test } from 'bun:test'
import { createStore } from 'zustand/vanilla'
import { CommandError, type CommandExecutor, type ExecuteOptions } from '@hbar/commands'
import {
  createAppRuntime,
  createDraftArtifactReferences,
  type DraftArtifactReferenceJournal,
  type SessionDraftState,
} from '@hbar/app-runtime'
import { chatDatabaseCommands, type ChatDatabaseDraftOwner } from '@hbar/contracts/commands/chat-database'
import { attachmentUploadInputSchema } from '@hbar/contracts/commands/files'

const disposers: Array<() => void> = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})
const hash = 'a'.repeat(64)
const upload = attachmentUploadInputSchema.parse({
  sourceId: 'selected-file',
  sha256: hash,
  name: 'draft.txt',
  mime: 'text/plain',
  size: 4,
})
const snapshot: Pick<
  SessionDraftState,
  'revision' | 'attachments' | 'attachmentTransfers' | 'uploading' | 'uploadError'
> = { revision: 1, attachments: [], attachmentTransfers: [], uploading: 0, uploadError: null }
function fixture(
  options: { old?: boolean; hook?: (id: string, input: unknown, execution?: ExecuteOptions) => Promise<unknown> } = {},
) {
  const owners = new Map<string, ChatDatabaseDraftOwner>()
  const receipts = new Map<string, ChatDatabaseDraftOwner>()
  const calls: Array<{ id: string; input: unknown; execution: ExecuteOptions | undefined }> = []
  let journal: DraftArtifactReferenceJournal | null = null
  let failing = false
  const commands: CommandExecutor = {
    async execute(id, input, execution) {
      calls.push({ id, input, execution })
      if (options.hook) {
        const value = await options.hook(id, input, execution)
        if (value !== undefined) return value
      }
      if (id === 'chatDatabase.inventory.get')
        return {
          schemaVersion: 1,
          complete: false,
          legacyRequired: Boolean(options.old),
          inventoryId: null,
          revision: 0,
          updatedAt: options.old ? 1 : 0,
        }
      if (id === 'chatDatabase.draft.list') return { items: [...owners.values()], next: null }
      if (id === 'chatDatabase.draft.sync') {
        const value = chatDatabaseCommands[id].input.parse(input)
        const receipt = receipts.get(execution?.idempotencyKey ?? '')
        if (receipt) return receipt
        const current = owners.get(`${value.owner.kind}:${value.owner.id}`)
        if ((current?.revision ?? 0) !== value.expectedRevision) throw new CommandError('COMMAND_CONFLICT', 'changed')
        const result = { ...value.owner, revision: value.expectedRevision + 1, updatedAt: Date.now() }
        owners.set(`${result.kind}:${result.id}`, result)
        receipts.set(execution?.idempotencyKey ?? '', result)
        return result
      }
      if (id === 'chatDatabase.inventory.begin' || id === 'chatDatabase.inventory.finish')
        return {
          schemaVersion: 1,
          complete: id.endsWith('finish'),
          inventoryId: crypto.randomUUID(),
          revision: 1,
          updatedAt: Date.now(),
        }
      throw new Error(`Unexpected reference command ${id}`)
    },
  }
  const namespace = crypto.randomUUID()
  const port = {
    read: () => journal,
    write(value: DraftArtifactReferenceJournal) {
      if (failing) throw new Error('disk full')
      journal = structuredClone(value)
    },
  }
  const references = createDraftArtifactReferences({
    commands,
    namespace,
    journal: port,
    onSubscriberError: () => undefined,
  })
  disposers.push(references.dispose)
  return {
    references,
    commands,
    namespace,
    port,
    owners,
    receipts,
    calls,
    journal: () => journal,
    fail: () => {
      failing = true
    },
  }
}
test('upload protection persists its hash before dispatch and returns the acknowledged owner generation', async () => {
  const f = fixture({
    hook: async (id) => {
      if (id === 'chatDatabase.draft.sync')
        expect(f.journal()?.owners[0]?.pending?.input.owner.pendingArtifactIds).toContain(hash)
      return undefined
    },
  })
  f.references.setConnected(true)
  const owner = await f.references.prepareUpload('session', 'chat', snapshot, upload, new AbortController().signal)
  expect(owner.kind).toBe('session')
  expect([...f.owners.values()][0]).toMatchObject({
    id: owner.id,
    clientRevision: owner.clientRevision,
    pendingArtifactIds: [hash],
  })
  expect(f.journal()?.owners[0]?.pending).toBeNull()
})

test('unavailable local durability prevents reference dispatch and upload admission', async () => {
  const f = fixture()
  f.fail()
  await expect(
    f.references.prepareUpload('preSession', 'new-chat', snapshot, upload, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'REFERENCE_JOURNAL_WRITE_FAILED' })
  expect(f.calls).toHaveLength(0)
})

test('a lost declaration response is retried with its original request and key after recreation', async () => {
  let lose = true
  const f = fixture({
    hook: async (id, input, execution) => {
      if (id === 'chatDatabase.draft.sync' && lose) {
        lose = false
        const value = chatDatabaseCommands[id].input.parse(input)
        const accepted = { ...value.owner, revision: value.expectedRevision + 1, updatedAt: Date.now() }
        f.owners.set(`${accepted.kind}:${accepted.id}`, accepted)
        f.receipts.set(execution?.idempotencyKey ?? '', accepted)
        throw new CommandError('DISCONNECTED', 'real declaration accepted but ack lost')
      }
      return undefined
    },
  })
  f.references.setConnected(true)
  await expect(
    f.references.prepareUpload('session', 'chat', snapshot, upload, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'DISCONNECTED' })
  expect(f.journal()?.owners[0]?.pending).not.toBeNull()
  f.references.dispose()
  const restored = createDraftArtifactReferences({
    commands: f.commands,
    namespace: f.namespace,
    journal: f.port,
    onSubscriberError: () => undefined,
  })
  disposers.push(restored.dispose)
  restored.setConnected(true)
  await restored.flush()
  const attempts = f.calls.filter((call) => call.id === 'chatDatabase.draft.sync')
  expect(attempts).toHaveLength(2)
  expect(attempts[0]?.execution?.idempotencyKey).toBe(attempts[1]?.execution?.idempotencyKey)
  expect(attempts[0]?.execution?.requestId).toBe(attempts[1]?.execution?.requestId)
  expect(f.journal()?.owners[0]?.pending).toBeNull()
})

test('inventory includes an offline other-window owner and never silently certifies an unknown legacy device', async () => {
  const f = fixture()
  const offline: ChatDatabaseDraftOwner = {
    id: 'offline-window',
    kind: 'appearance',
    artifactIds: [hash],
    pendingArtifactIds: [],
    clientRevision: 9,
    revision: 7,
    updatedAt: 1,
  }
  f.owners.set('appearance:offline-window', offline)
  f.references.setConnected(true)
  await f.references.flush()
  const finish = f.calls.find((call) => call.id === 'chatDatabase.inventory.finish')
  expect(finish?.input).toMatchObject({ ownerRevisions: { 'appearance:offline-window': 7 } })
  expect(f.owners.get('appearance:offline-window')).toEqual(offline)
  const old = fixture({ old: true })
  old.references.setConnected(true)
  await old.references.flush()
  expect(old.calls.some((call) => call.id === 'chatDatabase.inventory.finish')).toBe(false)
  expect(old.references.reader.getSnapshot().inventoryComplete).toBe(false)
})

test('explicit edits release references while closing a runtime and absent restored owners preserve them', async () => {
  const f = fixture()
  const content = createStore<Record<string, typeof snapshot>>(() => ({
    chat: {
      ...snapshot,
      attachments: [{ kind: 'file', artifact: { id: hash, name: 'draft.txt', mime: 'text/plain', size: 4 } }],
    },
  }))
  const reader = { getSnapshot: content.getState, subscribe: (listener: () => void) => content.subscribe(listener) }
  f.references.observeAttachments('session', reader, (value) => value)
  f.references.setConnected(true)
  await f.references.flush()
  expect([...f.owners.values()][0]?.artifactIds).toEqual([hash])
  f.references.dispose()
  const restored = createDraftArtifactReferences({
    commands: f.commands,
    namespace: f.namespace,
    journal: f.port,
    onSubscriberError: () => undefined,
  })
  disposers.push(restored.dispose)
  const empty = createStore<Record<string, typeof snapshot>>(() => ({}))
  restored.observeAttachments(
    'session',
    { getSnapshot: empty.getState, subscribe: (listener) => empty.subscribe(listener) },
    (value) => value,
  )
  restored.setConnected(true)
  await restored.flush()
  expect([...f.owners.values()][0]?.artifactIds).toEqual([hash])
  empty.setState({ chat: snapshot }, true)
  await restored.flush()
  expect([...f.owners.values()][0]?.artifactIds).toEqual([])
})

test('runtime session uploads establish durable reference owners and release after removing the confirmed attachment', async () => {
  const f = fixture()
  const runtime = createAppRuntime({
    instanceId: 'references-runtime',
    hostId: 'host',
    directory: {
      execute: () =>
        Promise.resolve({
          id: 'chat',
          workspaceId: 'workspace',
          title: 'Chat',
          archived: false,
          parentId: null,
          createdAt: 1,
          updatedAt: 1,
          seq: 0,
        }),
    },
    draftArtifactReferences: {
      commands: f.commands,
      namespace: f.namespace,
      journal: f.port,
      onConnection(listener) {
        listener(true)
        return () => undefined
      },
    },
    attachments: {
      async execute(_id, input) {
        const descriptor = attachmentUploadInputSchema.parse(input)
        expect(
          [...f.owners.values()].some(
            (owner) => owner.id === descriptor.owner?.id && owner.pendingArtifactIds.includes(hash),
          ),
        ).toBe(true)
        return { id: hash, name: upload.name, mime: upload.mime, size: upload.size }
      },
    },
  })
  disposers.push(runtime.dispose)
  await runtime.view.commands.execute('draft.setText', { sessionId: 'chat', text: 'draft' })
  await runtime.view.commands.execute('draft.addAttachment', { sessionId: 'chat', kind: 'file', upload })
  await new Promise<void>((resolve) => setTimeout(resolve, 10))
  const draft: SessionDraftState | undefined = runtime.view.state.drafts.getSnapshot().chat
  if (!draft) throw new Error('Missing runtime draft')
  expect(draft.attachments[0]?.artifact.id).toBe(hash)
  await runtime.view.commands.execute('draft.removeAttachment', {
    sessionId: 'chat',
    expectedRevision: draft.revision,
    kind: 'file',
    artifactId: hash,
  })
  await new Promise<void>((resolve) => setTimeout(resolve, 10))
  expect([...f.owners.values()][0]?.artifactIds).toEqual([])
})

test('new-chat upload and explicit discard use a separate persistent pre-session owner', async () => {
  const f = fixture()
  const runtime = createAppRuntime({
    instanceId: 'pre-references',
    hostId: 'host',
    directory: { execute: () => Promise.reject(new Error('No directory expected')) },
    draftArtifactReferences: {
      commands: f.commands,
      namespace: f.namespace,
      journal: f.port,
      onConnection(listener) {
        listener(true)
        return () => undefined
      },
    },
    attachments: {
      execute: () => Promise.resolve({ id: hash, name: upload.name, mime: upload.mime, size: upload.size }),
    },
  })
  disposers.push(runtime.dispose)
  const created = await runtime.view.commands.execute('preSessionDraft.open', { workspaceId: null })
  const reserved = await runtime.view.commands.execute('preSessionDraft.reserveAttachments', {
    draftId: created.draftId,
    expectedRevision: created.revision,
    files: [{ name: upload.name, mime: upload.mime, size: upload.size }],
  })
  const reservation = reserved.reservations[0]
  if (!reservation) throw new Error('Missing pre-session reservation')
  await runtime.view.commands.execute('preSessionDraft.uploadAttachment', {
    draftId: created.draftId,
    reservationId: reservation.reservationId,
    ownerRevision: reservation.ownerRevision,
    kind: 'file',
    upload,
  })
  await new Promise<void>((resolve) => setTimeout(resolve, 10))
  expect([...f.owners.values()][0]).toMatchObject({ kind: 'preSession', artifactIds: [hash] })
  await runtime.view.commands.execute('preSessionDraft.close', { draftId: created.draftId })
  await new Promise<void>((resolve) => setTimeout(resolve, 10))
  expect([...f.owners.values()][0]?.artifactIds).toEqual([])
})

test('appearance edits retain background references until their owning form saves or discards them', async () => {
  const f = fixture()
  const forms = createStore<Record<string, unknown>>(() => ({ original: { backgroundAsset: hash } }))
  f.references.observeAppearance(
    { getSnapshot: forms.getState, subscribe: (listener) => forms.subscribe(listener) },
    (value) => value,
  )
  f.references.setConnected(true)
  await f.references.flush()
  expect([...f.owners.values()][0]).toMatchObject({ kind: 'appearance', artifactIds: [hash] })
  forms.setState({ original: null }, true)
  await f.references.flush()
  expect([...f.owners.values()][0]?.artifactIds).toEqual([])
})

test('disposal ends observation without releasing references or letting an ignored-abort response overwrite the journal', async () => {
  let acknowledge: ((owner: ChatDatabaseDraftOwner) => void) | undefined
  const f = fixture({
    hook: async (id) =>
      id === 'chatDatabase.draft.sync'
        ? new Promise<ChatDatabaseDraftOwner>((resolve) => {
            acknowledge = resolve
          })
        : undefined,
  })
  f.references.setConnected(true)
  const pending = f.references.prepareUpload('session', 'chat', snapshot, upload, new AbortController().signal)
  for (let tries = 0; tries < 100 && !acknowledge; tries++) await new Promise<void>((resolve) => setTimeout(resolve, 1))
  const record = f.journal()?.owners[0]
  if (!record?.pending || !acknowledge) throw new Error('Missing pending declaration fixture')
  f.references.dispose()
  await expect(pending).rejects.toBeDefined()
  const before = structuredClone(f.journal())
  acknowledge({ ...record.pending.input.owner, revision: 1, updatedAt: Date.now() })
  await new Promise<void>((resolve) => setTimeout(resolve, 1))
  expect(f.journal()).toEqual(before)
  expect(f.journal()?.owners[0]?.desired.pendingArtifactIds).toContain(hash)
})

test('an explicit removal made while a declaration is in flight is confirmed after its original receipt', async () => {
  let acknowledge: (() => void) | undefined
  let first = true
  const f = fixture({
    hook: async (id, input) => {
      if (id !== 'chatDatabase.draft.sync' || !first) return undefined
      first = false
      const value = chatDatabaseCommands[id].input.parse(input)
      return new Promise<ChatDatabaseDraftOwner>((resolve) => {
        acknowledge = () => {
          const accepted = { ...value.owner, revision: 1, updatedAt: Date.now() }
          f.owners.set(`${accepted.kind}:${accepted.id}`, accepted)
          resolve(accepted)
        }
      })
    },
  })
  const forms = createStore<Record<string, unknown>>(() => ({ original: { backgroundAsset: hash } }))
  f.references.observeAppearance(
    { getSnapshot: forms.getState, subscribe: (listener) => forms.subscribe(listener) },
    (value) => value,
  )
  f.references.setConnected(true)
  for (let tries = 0; tries < 100 && !acknowledge; tries++) await new Promise<void>((resolve) => setTimeout(resolve, 1))
  forms.setState({ original: null }, true)
  if (!acknowledge) throw new Error('Missing delayed declaration')
  acknowledge()
  await f.references.flush()
  expect([...f.owners.values()][0]?.artifactIds).toEqual([])
  expect(f.journal()?.owners[0]?.syncedClientRevision).toBe(2)
})

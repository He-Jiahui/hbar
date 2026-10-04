import {
  CommandError,
  createCommandClient,
  defineCommand,
  type CommandExecutor,
  type CommandRegistry,
} from '@hbar/commands'
import {
  sandboxCommands,
  type SandboxProfileDetail,
  type SandboxProfileSummary,
} from '@hbar/contracts/commands/sandbox'
import {
  sandboxDecisionSchema,
  sandboxEscalationSchema,
  sandboxPathAccessSchema,
  sandboxProfileIdSchema,
  type ResolvedSandboxProfile,
  type SandboxProfileDeleteInput,
  type SandboxProfileId,
  type SandboxProfileSaveInput,
} from '@hbar/contracts/sandbox'
import { z } from 'zod'
import {
  applySandboxDraftEdit,
  emptySandboxDraft,
  sameSandboxDraft,
  sandboxDraftFromProfile,
  sandboxDraftToSaveInput,
  validateSandboxDraft,
  type SandboxDraftIssue,
  type SandboxProfileDraft,
} from './sandbox-profile-draft'
import { createState } from './state'

const READ_TIMEOUT_MS = 15_000
const WRITE_TIMEOUT_MS = 15_000
/** Transport outcomes where the Host may have committed the write; the original key must be reconciled. */
const UNKNOWN_CODES = new Set([
  'RESULT_UNKNOWN',
  'CONNECTION_CLOSED',
  'DISCONNECTED',
  'TIMEOUT',
  'EXECUTION_FAILED',
  'INVALID_OUTPUT',
  'ABORTED',
  'CANCELLED',
])

const section = z.enum(['grants', 'commands', 'tools', 'environment'])
const editSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('text'),
    field: z.enum(['id', 'name', 'description']),
    value: z.string().max(4_096),
  }),
  z.strictObject({ kind: z.literal('extends'), value: sandboxProfileIdSchema.nullable() }),
  z.strictObject({ kind: z.literal('escalation'), value: sandboxEscalationSchema.nullable() }),
  z.strictObject({ kind: z.literal('fileDefault'), value: sandboxPathAccessSchema.nullable() }),
  z.strictObject({ kind: z.literal('network'), value: z.boolean().nullable() }),
  z.strictObject({ kind: z.literal('add'), section }),
  z.strictObject({ kind: z.literal('remove'), section, rowId: z.string().min(1).max(80) }),
  z.strictObject({
    kind: z.literal('grant'),
    rowId: z.string().min(1).max(80),
    path: z.string().max(4_096).optional(),
    access: sandboxPathAccessSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal('command'),
    rowId: z.string().min(1).max(80),
    pattern: z.string().max(4_096).optional(),
    decision: sandboxDecisionSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal('tool'),
    rowId: z.string().min(1).max(80),
    tool: z.string().max(4_096).optional(),
    decision: sandboxDecisionSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal('environment'),
    rowId: z.string().min(1).max(80),
    name: z.string().max(4_096).optional(),
    value: z.string().max(8_192).optional(),
  }),
])
const editorId = z.string().uuid()
const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.app-runtime',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  scope: 'client' as const,
  category: 'run.approval',
  visibility: 'internal' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as ('api' | 'palette' | 'cli' | 'tui')[],
})

export const sandboxProfileEditorCommands = {
  'sandboxProfiles.refresh': defineCommand(
    metadata('sandboxProfiles.refresh'),
    z.strictObject({}),
    z.strictObject({ count: z.number().int().nonnegative() }),
  ),
  'sandboxProfiles.open': defineCommand(
    metadata('sandboxProfiles.open'),
    z.strictObject({
      target: z.discriminatedUnion('kind', [
        z.strictObject({ kind: z.literal('existing'), id: sandboxProfileIdSchema }),
        z.strictObject({ kind: z.literal('new'), basedOn: sandboxProfileIdSchema.nullable() }),
      ]),
      /** Required to replace an editor with unsaved changes, so a stray click cannot drop a draft. */
      discardDraft: z.literal(true).optional(),
    }),
    z.strictObject({ editorId }),
  ),
  'sandboxProfiles.edit': defineCommand(
    metadata('sandboxProfiles.edit'),
    z.strictObject({ editorId, edit: editSchema }),
    z.strictObject({ dirty: z.boolean() }),
  ),
  'sandboxProfiles.discard': defineCommand(
    metadata('sandboxProfiles.discard'),
    z.strictObject({ editorId }),
    z.strictObject({ editorId }),
  ),
  'sandboxProfiles.save': defineCommand(
    metadata('sandboxProfiles.save'),
    z.strictObject({ editorId }),
    z.strictObject({ id: sandboxProfileIdSchema, revision: z.number().int().nonnegative() }),
  ),
  'sandboxProfiles.reconcile': defineCommand(
    metadata('sandboxProfiles.reconcile'),
    z.strictObject({ editorId }),
    z.strictObject({ committed: z.boolean() }),
  ),
  'sandboxProfiles.delete': defineCommand(
    metadata('sandboxProfiles.delete'),
    z.strictObject({ editorId, confirm: z.literal(true) }),
    z.strictObject({ deleted: z.boolean() }),
  ),
  'sandboxProfiles.close': defineCommand(
    metadata('sandboxProfiles.close'),
    z.strictObject({ editorId, discardDraft: z.literal(true).optional() }),
    z.strictObject({ closed: z.boolean() }),
  ),
}

export interface SandboxProfileEditorState {
  readonly editorId: string
  /** `readonly` for built-in profiles, which can only be used as a parent. */
  readonly mode: 'create' | 'edit' | 'readonly'
  readonly profileId: SandboxProfileId | null
  /** Revision the next save must match; `null` while creating. */
  readonly revision: number | null
  readonly status: 'loading' | 'ready' | 'saving' | 'deleting' | 'unknown' | 'conflict' | 'failed' | 'missing'
  /** Write that is still unresolved when `status` is `unknown`. */
  readonly pending: 'save' | 'delete' | null
  readonly error: string | null
  readonly draft: SandboxProfileDraft
  readonly baseline: SandboxProfileDraft
  readonly dirty: boolean
  readonly issues: readonly SandboxDraftIssue[]
  /** Effective rules of the stored profile, refreshed after each load or save. */
  readonly resolved: Readonly<ResolvedSandboxProfile> | null
  readonly resolveError: { readonly code: string; readonly message: string } | null
  /** The last write in this editor was confirmed by the Host. */
  readonly saved: boolean
}

export interface SandboxProfilesState {
  readonly available: boolean
  readonly list: {
    readonly status: 'idle' | 'loading' | 'ready' | 'error'
    readonly items: readonly SandboxProfileSummary[]
    readonly error: string | null
  }
  readonly editor: SandboxProfileEditorState | null
}

export interface SandboxProfilesOptions {
  readonly sandbox?: CommandExecutor | undefined
  /** `host.changed` hints for profile changes; they trigger a list refresh, never a write acknowledgement. */
  readonly events?:
    | {
        subscribe(listener: () => void): () => void
        onConnection?(listener: (connected: boolean) => void): () => void
      }
    | undefined
  readonly onSubscriberError: (error: unknown) => void
  readonly isDisposed: () => boolean
}

interface SaveWrite {
  readonly action: 'save'
  readonly key: string
  readonly input: SandboxProfileSaveInput
}
interface DeleteWrite {
  readonly action: 'delete'
  readonly key: string
  readonly input: SandboxProfileDeleteInput
}
type PendingWrite = SaveWrite | DeleteWrite

function errorCode(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

async function bounded<Value>(timeoutMs: number, run: (signal: AbortSignal) => Promise<Value>): Promise<Value> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let stop = () => {}
  const timedOut = new Promise<never>((_resolve, reject) => {
    const onAbort = () => reject(new CommandError('TIMEOUT', 'Sandbox profile request timed out'))
    controller.signal.addEventListener('abort', onAbort, { once: true })
    stop = () => controller.signal.removeEventListener('abort', onAbort)
  })
  try {
    return await Promise.race([run(controller.signal), timedOut])
  } finally {
    clearTimeout(timer)
    stop()
  }
}

export function createSandboxProfiles(local: CommandRegistry, options: SandboxProfilesOptions) {
  const state = createState<SandboxProfilesState>(
    { available: Boolean(options.sandbox), list: { status: 'idle', items: [], error: null }, editor: null },
    options.onSubscriberError,
  )
  const client = options.sandbox ? createCommandClient(sandboxCommands, options.sandbox) : null
  let disposed = false
  let listGeneration = 0
  let editorGeneration = 0
  let pending: { readonly editorId: string; readonly write: PendingWrite } | null = null
  const rowId = () => crypto.randomUUID()

  const live = () => !disposed && !options.isDisposed()
  const host = () => {
    if (!live()) throw new CommandError('DISPOSED', 'Sandbox profile runtime is disposed')
    if (!client) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Host sandbox profiles are unavailable')
    return client
  }
  const snapshot = () => state.reader.getSnapshot()
  const setList = (list: SandboxProfilesState['list']) => {
    if (live()) state.replace({ ...snapshot(), list })
  }
  const setEditor = (editor: SandboxProfileEditorState | null) => {
    if (live()) state.replace({ ...snapshot(), editor })
  }
  /** Replace the editor only if it is still the one the operation started for. */
  const updateEditor = (id: string, patch: (editor: SandboxProfileEditorState) => SandboxProfileEditorState) => {
    const current = snapshot().editor
    if (current?.editorId === id) setEditor(patch(current))
  }
  const editorFor = (id: string) => {
    const current = snapshot().editor
    if (!current || current.editorId !== id)
      throw new CommandError('STALE_TARGET', 'The sandbox profile editor was replaced')
    return current
  }
  const withDraft = (editor: SandboxProfileEditorState, draft: SandboxProfileDraft): SandboxProfileEditorState => ({
    ...editor,
    draft,
    dirty: !sameSandboxDraft(draft, editor.baseline),
    issues: editor.mode === 'readonly' ? [] : validateSandboxDraft(draft),
    saved: false,
  })
  const loaded = (id: string, detail: SandboxProfileDetail): SandboxProfileEditorState => {
    const draft = sandboxDraftFromProfile(detail.profile, rowId)
    return {
      editorId: id,
      mode: detail.profile.builtin ? 'readonly' : 'edit',
      profileId: detail.profile.id,
      revision: detail.profile.revision,
      status: 'ready',
      pending: null,
      error: null,
      draft,
      baseline: draft,
      dirty: false,
      issues: [],
      resolved: detail.resolved,
      resolveError: detail.resolveError,
      saved: false,
    }
  }

  async function refresh(): Promise<number> {
    const generation = ++listGeneration
    const previous = snapshot().list
    setList({ status: 'loading', items: previous.items, error: null })
    try {
      const result = await bounded(READ_TIMEOUT_MS, (signal) => host().execute('sandbox.list', {}, { signal }))
      if (generation === listGeneration) setList({ status: 'ready', items: result.items, error: null })
      return result.items.length
    } catch (reason) {
      if (generation === listGeneration) setList({ status: 'error', items: previous.items, error: errorCode(reason) })
      throw reason
    }
  }

  async function load(id: string, profileId: SandboxProfileId, generation: number): Promise<void> {
    try {
      const detail = await bounded(READ_TIMEOUT_MS, (signal) =>
        host().execute('sandbox.get', { id: profileId }, { signal }),
      )
      if (generation !== editorGeneration) return
      if (!detail) updateEditor(id, (editor) => ({ ...editor, status: 'missing', error: 'NOT_FOUND' }))
      else updateEditor(id, () => loaded(id, detail))
    } catch (reason) {
      if (generation === editorGeneration)
        updateEditor(id, (editor) => ({ ...editor, status: 'failed', error: errorCode(reason) }))
      throw reason
    }
  }

  function assertReplaceable(discardDraft: boolean | undefined) {
    const current = snapshot().editor
    if (!current) return
    if (current.status === 'saving' || current.status === 'deleting' || current.status === 'unknown')
      throw new CommandError('SUBMISSION_PENDING', 'Resolve the pending sandbox profile write first')
    if (current.dirty && !discardDraft) throw new CommandError('DRAFT_DIRTY', 'The sandbox profile has unsaved changes')
  }

  async function settleSave(id: string, write: SaveWrite, profileId: SandboxProfileId) {
    if (pending?.editorId === id && pending.write === write) pending = null
    const generation = ++editorGeneration
    updateEditor(id, (editor) => ({
      ...editor,
      mode: 'edit',
      profileId,
      status: 'loading',
      pending: null,
      error: null,
      saved: true,
    }))
    await Promise.allSettled([refresh(), load(id, profileId, generation)])
    updateEditor(id, (editor) => ({ ...editor, saved: true }))
  }

  async function settleDelete(id: string, write: DeleteWrite) {
    if (pending?.editorId === id && pending.write === write) pending = null
    if (snapshot().editor?.editorId === id) setEditor(null)
    await refresh().catch(() => undefined)
  }

  function fail(id: string, write: PendingWrite, reason: unknown) {
    const code = errorCode(reason)
    if (UNKNOWN_CODES.has(code)) {
      updateEditor(id, (editor) => ({ ...editor, status: 'unknown', pending: write.action, error: code }))
      return
    }
    if (pending?.editorId === id && pending.write === write) pending = null
    updateEditor(id, (editor) => ({
      ...editor,
      status: code === 'COMMAND_CONFLICT' ? 'conflict' : 'failed',
      pending: null,
      error: code,
    }))
  }

  function begin(id: string, write: PendingWrite) {
    pending = { editorId: id, write }
    updateEditor(id, (editor) => ({
      ...editor,
      status: write.action === 'save' ? 'saving' : 'deleting',
      pending: null,
      error: null,
      saved: false,
    }))
  }

  async function sendSave(id: string, write: SaveWrite): Promise<{ id: SandboxProfileId; revision: number }> {
    begin(id, write)
    try {
      const saved = await bounded(WRITE_TIMEOUT_MS, (signal) =>
        host().execute('sandbox.save', write.input, { idempotencyKey: write.key, signal }),
      )
      await settleSave(id, write, saved.id)
      return { id: saved.id, revision: saved.revision }
    } catch (reason) {
      fail(id, write, reason)
      throw reason
    }
  }

  async function sendDelete(id: string, write: DeleteWrite): Promise<{ deleted: boolean }> {
    begin(id, write)
    try {
      const result = await bounded(WRITE_TIMEOUT_MS, (signal) =>
        host().execute('sandbox.delete', write.input, { idempotencyKey: write.key, signal }),
      )
      await settleDelete(id, write)
      return result
    } catch (reason) {
      fail(id, write, reason)
      throw reason
    }
  }

  local.register(sandboxProfileEditorCommands['sandboxProfiles.refresh'], async () => ({ count: await refresh() }))

  local.register(sandboxProfileEditorCommands['sandboxProfiles.open'], ({ target, discardDraft }) => {
    host()
    assertReplaceable(discardDraft)
    const id = crypto.randomUUID()
    const generation = ++editorGeneration
    if (target.kind === 'new') {
      const draft = emptySandboxDraft(target.basedOn)
      setEditor({
        editorId: id,
        mode: 'create',
        profileId: null,
        revision: null,
        status: 'ready',
        pending: null,
        error: null,
        draft,
        baseline: draft,
        dirty: false,
        issues: validateSandboxDraft(draft),
        resolved: null,
        resolveError: null,
        saved: false,
      })
      return { editorId: id }
    }
    const draft = emptySandboxDraft(null)
    setEditor({
      editorId: id,
      mode: 'readonly',
      profileId: target.id,
      revision: null,
      status: 'loading',
      pending: null,
      error: null,
      draft,
      baseline: draft,
      dirty: false,
      issues: [],
      resolved: null,
      resolveError: null,
      saved: false,
    })
    // The editor reports its own load failure; the open itself succeeded.
    load(id, target.id, generation).catch(() => undefined)
    return { editorId: id }
  })

  local.register(sandboxProfileEditorCommands['sandboxProfiles.edit'], ({ editorId: id, edit }) => {
    const editor = editorFor(id)
    if (editor.mode === 'readonly') throw new CommandError('FORBIDDEN', 'Built-in sandbox profiles are read-only')
    if (!['ready', 'failed', 'conflict'].includes(editor.status))
      throw new CommandError('SUBMISSION_PENDING', 'The sandbox profile cannot change right now')
    if (editor.mode === 'edit' && edit.kind === 'text' && edit.field === 'id')
      throw new CommandError('FORBIDDEN', 'A saved profile keeps its id')
    const next = withDraft(editor, applySandboxDraftEdit(editor.draft, edit, rowId))
    setEditor(next)
    return { dirty: next.dirty }
  })

  local.register(sandboxProfileEditorCommands['sandboxProfiles.discard'], ({ editorId: id }) => {
    const editor = editorFor(id)
    if (editor.status === 'saving' || editor.status === 'deleting' || editor.status === 'unknown')
      throw new CommandError('SUBMISSION_PENDING', 'Resolve the pending sandbox profile write first')
    setEditor({
      ...withDraft(editor, editor.baseline),
      status: editor.status === 'missing' ? 'missing' : 'ready',
      error: null,
    })
    return { editorId: id }
  })

  local.register(sandboxProfileEditorCommands['sandboxProfiles.save'], async ({ editorId: id }) => {
    host()
    const editor = editorFor(id)
    if (editor.mode === 'readonly') throw new CommandError('FORBIDDEN', 'Built-in sandbox profiles are read-only')
    if (editor.status === 'saving' || editor.status === 'deleting')
      throw new CommandError('SUBMISSION_PENDING', 'A sandbox profile write is already pending')
    // An unknown save is retried with its original key and input, which the Host replays safely.
    if (editor.status === 'unknown') {
      const write = pending?.editorId === id ? pending.write : null
      if (write?.action !== 'save')
        throw new CommandError('SUBMISSION_PENDING', 'Check the pending delete before saving')
      return sendSave(id, write)
    }
    if (editor.issues.length) throw new CommandError('INVALID_INPUT', 'Fix the highlighted fields first')
    return sendSave(id, {
      action: 'save',
      key: crypto.randomUUID(),
      input: sandboxDraftToSaveInput(editor.draft, editor.mode === 'create' ? null : editor.revision),
    })
  })

  local.register(sandboxProfileEditorCommands['sandboxProfiles.reconcile'], async ({ editorId: id }) => {
    host()
    const editor = editorFor(id)
    const write = pending?.editorId === id ? pending.write : null
    if (editor.status !== 'unknown' || !write)
      throw new CommandError('INVALID_STATE', 'There is no unresolved sandbox profile write')
    try {
      const receipt = await bounded(READ_TIMEOUT_MS, (signal) =>
        host().execute(
          'sandbox.receipt',
          {
            commandId: write.action === 'save' ? 'sandbox.save' : 'sandbox.delete',
            input: write.input,
            idempotencyKey: write.key,
          },
          { signal },
        ),
      )
      if (receipt === null) {
        // No committed result for this key: the write did not happen and may be edited and sent again.
        if (pending?.write === write) pending = null
        updateEditor(id, (current) => ({ ...current, status: 'failed', pending: null, error: 'NOT_COMMITTED' }))
        return { committed: false }
      }
      if (write.action === 'delete') await settleDelete(id, write)
      else if ('id' in receipt) await settleSave(id, write, receipt.id)
      else throw new CommandError('INVALID_OUTPUT', 'The save receipt does not describe a profile')
      return { committed: true }
    } catch (reason) {
      updateEditor(id, (current) => ({ ...current, error: errorCode(reason) }))
      throw reason
    }
  })

  local.register(sandboxProfileEditorCommands['sandboxProfiles.delete'], async ({ editorId: id }) => {
    host()
    const editor = editorFor(id)
    if (editor.mode !== 'edit' || editor.profileId === null || editor.revision === null)
      throw new CommandError('FORBIDDEN', 'Only a saved user profile can be deleted')
    if (editor.status === 'saving' || editor.status === 'deleting' || editor.status === 'unknown')
      throw new CommandError('SUBMISSION_PENDING', 'A sandbox profile write is already pending')
    return sendDelete(id, {
      action: 'delete',
      key: crypto.randomUUID(),
      input: { id: editor.profileId, expectedRevision: editor.revision },
    })
  })

  local.register(sandboxProfileEditorCommands['sandboxProfiles.close'], ({ editorId: id, discardDraft }) => {
    if (snapshot().editor?.editorId !== id) return { closed: false }
    assertReplaceable(discardDraft)
    editorGeneration++
    setEditor(null)
    return { closed: true }
  })

  const unsubscribe = options.events?.subscribe(() => {
    if (snapshot().list.status !== 'idle') refresh().catch(() => undefined)
  })
  const unsubscribeConnection = options.events?.onConnection?.((connected) => {
    if (connected && snapshot().list.status === 'error') refresh().catch(() => undefined)
  })

  return {
    reader: state.reader,
    dispose() {
      disposed = true
      unsubscribe?.()
      unsubscribeConnection?.()
      pending = null
      state.dispose()
    },
  }
}

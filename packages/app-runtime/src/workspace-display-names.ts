import { z } from 'zod'
import {
  CommandError,
  defineCommand,
  type CommandExecutor,
  type CommandRegistry,
  type ExecuteOptions,
} from '@hbar/commands'
import { idSchema } from '@hbar/contracts'
import {
  WORKSPACE_DISPLAY_NAMES_MAX_ENTRIES,
  workspaceDisplayNameSchema,
  workspaceDisplayNamesApplyInputSchema,
  workspaceDisplayNamesReceiptSchema,
  workspaceDisplayNamesRequestsEqual,
  workspaceDisplayNamesSnapshotSchema,
  type WorkspaceDisplayNamesApplyInput,
  type WorkspaceDisplayNamesReceipt,
} from '@hbar/contracts/commands/workspace-display-names'
import { createState, type StateReader } from './state'

const statusSchema = z.enum(['unavailable', 'loading', 'ready', 'error', 'offline'])
const actionStatusSchema = z.enum(['idle', 'submitting', 'succeeded', 'failed', 'unknown', 'reconciling'])
const output = z.strictObject({ status: statusSchema, actionStatus: actionStatusSchema, error: z.string().nullable() })
const revision = z.number().int().nonnegative().safe()
const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.workspace-display-names',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  category: 'workspace.organization',
  scope: 'client' as const,
  visibility: 'internal' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as 'api'[],
})

const editorTarget = z.strictObject({ workspaceId: idSchema, revision })
export const workspaceDisplayNamesClientCommands = {
  'workspaceAlias.open': defineCommand(
    metadata('workspaceAlias.open'),
    z.strictObject({ workspaceId: idSchema }),
    output,
  ),
  'workspaceAlias.edit': defineCommand(
    metadata('workspaceAlias.edit'),
    editorTarget.extend({ draft: z.string().max(4_096) }),
    output,
  ),
  'workspaceAlias.close': defineCommand(
    metadata('workspaceAlias.close'),
    z.strictObject({ workspaceId: idSchema }),
    output,
  ),
  'workspaceAlias.save': defineCommand(metadata('workspaceAlias.save'), editorTarget, output),
  'workspaceAlias.reset': defineCommand(metadata('workspaceAlias.reset'), editorTarget, output),
  'workspaceAlias.rebase': defineCommand(metadata('workspaceAlias.rebase'), editorTarget, output),
  'workspaceAlias.refresh': defineCommand(metadata('workspaceAlias.refresh'), z.strictObject({}), output),
  'workspaceAlias.reconcile': defineCommand(metadata('workspaceAlias.reconcile'), z.strictObject({}), output),
}

export interface WorkspaceDisplayNamesSnapshot {
  readonly schemaVersion: 1
  readonly revision: number
  readonly entries: readonly { readonly workspaceId: string; readonly displayName: string }[]
}
export interface WorkspaceDisplayNameEditor {
  readonly open: boolean
  readonly workspaceId: string
  readonly canonicalName: string
  readonly path: string
  readonly draft: string
  readonly revision: number
  readonly validation: 'required' | 'tooLong' | 'invalid' | null
  readonly expectedRevision: number
  readonly expectedDisplayName: string | null
  readonly conflict: boolean
  readonly baseLoaded: boolean
  readonly pristine: boolean
}
export function workspaceDisplayName(
  workspace: Readonly<{ id: string; name: string }>,
  snapshot: WorkspaceDisplayNamesSnapshot | null,
): string {
  return snapshot?.entries.find((entry) => entry.workspaceId === workspace.id)?.displayName ?? workspace.name
}

export interface WorkspaceDisplayNamesAction {
  readonly status: z.infer<typeof actionStatusSchema>
  readonly operation: 'save' | 'reset' | null
  readonly request: Readonly<WorkspaceDisplayNamesApplyInput> | null
  readonly key: string | null
  readonly receipt: Readonly<WorkspaceDisplayNamesReceipt> | null
  readonly error: string | null
}
export interface WorkspaceDisplayNamesState {
  readonly snapshot: WorkspaceDisplayNamesSnapshot | null
  readonly editor: WorkspaceDisplayNameEditor | null
  readonly status: z.infer<typeof statusSchema>
  readonly error: string | null
  readonly action: WorkspaceDisplayNamesAction
  /** Physical write/receipt slot, retained even after logical cancellation or timeout. */
  readonly requestInFlight: boolean
}
export interface WorkspaceDisplayNamesOptions {
  /** Supplied only after Host identity is confirmed. No device-local fallback. */
  readonly host?: CommandExecutor
  readonly events?: {
    subscribe(listener: () => void): () => void
    onConnection?(listener: (connected: boolean) => void): () => void
  }
  readonly onSubscriberError: (error: unknown) => void
  readonly isDisposed: () => boolean
  readonly resolveWorkspace: (workspaceId: string) => Readonly<{ id: string; name: string; path: string }> | undefined
}
export interface WorkspaceDisplayNames {
  readonly reader: StateReader<WorkspaceDisplayNamesState>
  readonly ready: Promise<void>
  readonly snapshotReader: StateReader<WorkspaceDisplayNamesSnapshot | null>
  dispose(): void
}

const TIMEOUT_MS = 30_000
const rejectedCodes = new Set([
  'COMMAND_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'INVALID_INPUT',
  'NOT_FOUND',
  'INPUT_TOO_LARGE',
  'VERSION_MISMATCH',
  'INVALID_STATE',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'CAPABILITY_UNAVAILABLE',
  'BUSY',
])
const safeCodes = new Set([
  ...rejectedCodes,
  'RESULT_UNKNOWN',
  'DISCONNECTED',
  'CONNECTION_CLOSED',
  'TIMEOUT',
  'TIMED_OUT',
  'CANCELLED',
  'EXECUTION_FAILED',
  'INVALID_OUTPUT',
  'QUERY_SUPERSEDED',
  'DISPOSED',
])
function code(error: unknown): string {
  return error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string' &&
    safeCodes.has(error.code)
    ? error.code
    : 'EXECUTION_FAILED'
}
const idle: WorkspaceDisplayNamesAction = {
  status: 'idle',
  operation: null,
  request: null,
  key: null,
  receipt: null,
  error: null,
}

/** One confirmed Host projection and one unresolved write. Navigation and directory facts are not owned here. */
export function createWorkspaceDisplayNames(
  local: CommandRegistry,
  options: WorkspaceDisplayNamesOptions,
): WorkspaceDisplayNames {
  const state = createState<WorkspaceDisplayNamesState>(
    {
      snapshot: null,
      editor: null,
      status: options.host ? 'loading' : 'unavailable',
      error: null,
      action: idle,
      requestInFlight: false,
    },
    options.onSubscriberError,
  )
  let disposed = false
  let connected = Boolean(options.host)
  let epoch = 0
  let lowerBound = 0
  let editorRevision = 0
  let queuedRead = false
  let readTask: { readonly promise: Promise<void>; cancel(error: string): void } | null = null
  let actionTask: { cancel(error: string): void } | null = null
  const current = () => state.reader.getSnapshot()
  const alive = () => !disposed && !options.isDisposed()
  const publish = (patch: Partial<WorkspaceDisplayNamesState>) => {
    if (!alive()) return
    const next = { ...current(), ...patch, requestInFlight: actionTask !== null }
    if (patch.snapshot && next.editor) {
      const alias =
        patch.snapshot.entries.find((entry) => entry.workspaceId === next.editor?.workspaceId)?.displayName ?? null
      next.editor = next.editor.baseLoaded
        ? {
            ...next.editor,
            conflict:
              next.editor.expectedRevision !== patch.snapshot.revision || next.editor.expectedDisplayName !== alias,
          }
        : {
            ...next.editor,
            baseLoaded: true,
            revision: ++editorRevision,
            draft: next.editor.pristine ? (alias ?? next.editor.canonicalName) : next.editor.draft,
            expectedRevision: patch.snapshot.revision,
            expectedDisplayName: alias,
            conflict: false,
          }
    }
    state.replace(next)
  }
  const summary = () => ({
    status: current().status,
    actionStatus: current().action.status,
    error: current().action.error ?? current().error,
  })
  const locked = () => actionTask !== null || ['submitting', 'unknown', 'reconciling'].includes(current().action.status)
  const check = (execution?: ExecuteOptions) => {
    if (!alive()) throw new CommandError('DISPOSED', 'Workspace display names owner was disposed')
    if (execution?.signal?.aborted) throw new CommandError('CANCELLED', 'Workspace display names request was cancelled')
    if (!options.host) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Workspace display names is unavailable')
    if (!connected) throw new CommandError('DISCONNECTED', 'Workspace display names is offline')
  }

  // A cancelled/timed-out consumer settles promptly, but the physical slot is held
  // until its adapter actually settles. Notifications retain only one follow-up.
  function refresh(followup = false, allowFollowup = true): Promise<void> {
    if (!alive() || !options.host || !connected) return Promise.resolve()
    if (readTask) {
      if (followup) queuedRead = true
      return readTask.promise
    }
    queuedRead = false
    const capturedEpoch = epoch
    const controller = new AbortController()
    let finished = false
    let resolve!: () => void
    const promise = new Promise<void>((done) => {
      resolve = done
    })
    const task = {
      promise,
      cancel(error: string) {
        if (finished) return
        finished = true
        controller.abort()
        clearTimeout(timer)
        if (alive() && epoch === capturedEpoch) publish({ status: connected ? 'error' : 'offline', error })
        resolve()
      },
    }
    const timer = setTimeout(() => task.cancel('TIMEOUT'), TIMEOUT_MS)
    readTask = task
    publish({ status: 'loading', error: null })
    const host = options.host
    void Promise.resolve()
      .then(() => {
        if (controller.signal.aborted || !alive() || epoch !== capturedEpoch)
          throw new CommandError('CANCELLED', 'Read was cancelled before dispatch')
        return host.execute('workspaceDisplayNames.get', {}, { signal: controller.signal })
      })
      .then(
        (value) => {
          if (finished || !alive() || epoch !== capturedEpoch || !connected) return
          const parsed = workspaceDisplayNamesSnapshotSchema.safeParse(value)
          if (!parsed.success) {
            publish({ status: 'error', error: 'INVALID_OUTPUT' })
            return
          }
          if (parsed.data.revision < Math.max(lowerBound, current().snapshot?.revision ?? 0)) {
            publish({ status: 'error', error: 'QUERY_SUPERSEDED' })
            return
          }
          const previous = current().snapshot
          if (
            previous?.revision === parsed.data.revision &&
            (previous.entries.length !== parsed.data.entries.length ||
              previous.entries.some(
                (entry, index) =>
                  parsed.data.entries[index]?.workspaceId !== entry.workspaceId ||
                  parsed.data.entries[index]?.displayName !== entry.displayName,
              ))
          ) {
            publish({ status: 'error', error: 'INVALID_OUTPUT' })
            return
          }
          lowerBound = parsed.data.revision
          publish({
            snapshot: previous?.revision === parsed.data.revision ? previous : parsed.data,
            status: queuedRead ? 'loading' : 'ready',
            error: null,
          })
        },
        (error: unknown) => {
          if (!finished && alive() && epoch === capturedEpoch && connected)
            publish({ status: 'error', error: code(error) })
        },
      )
      .then(async () => {
        finished = true
        clearTimeout(timer)
        if (readTask === task) readTask = null
        const again = queuedRead
        queuedRead = false
        if (alive() && connected && again) {
          if (allowFollowup) await refresh(false, false)
          else publish({ status: 'error', error: 'QUERY_SUPERSEDED' })
        }
        resolve()
      })
      .catch((error: unknown) => {
        // Subscriber failures are caught by createState; this is a final internal guard.
        if (readTask === task) readTask = null
        clearTimeout(timer)
        if (alive()) publish({ status: 'error', error: code(error) })
        resolve()
      })
    return promise
  }

  async function perform(
    request: WorkspaceDisplayNamesApplyInput,
    key: string,
    reconcile: boolean,
    execution: ExecuteOptions | undefined,
    operation: 'save' | 'reset',
  ): Promise<void> {
    check(execution)
    const host = options.host
    if (!host) return
    const capturedEpoch = epoch
    const controller = new AbortController()
    let finished = false
    let resolve!: () => void
    const promise = new Promise<void>((done) => {
      resolve = done
    })
    const action: WorkspaceDisplayNamesAction = {
      status: reconcile ? 'reconciling' : 'submitting',
      operation,
      request,
      key,
      receipt: null,
      error: null,
    }
    const task = {
      cancel(error: string) {
        if (finished) return
        finished = true
        controller.abort()
        clearTimeout(timer)
        execution?.signal?.removeEventListener('abort', abort)
        if (alive()) publish({ action: { ...action, status: 'unknown', error } })
        resolve()
      },
    }
    const abort = () => task.cancel('CANCELLED')
    const timer = setTimeout(() => task.cancel('TIMEOUT'), TIMEOUT_MS)
    execution?.signal?.addEventListener('abort', abort, { once: true })
    actionTask = task
    publish({ action })
    let refreshAfter = false
    void Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) throw new CommandError('CANCELLED', 'Request was cancelled before dispatch')
        return reconcile
          ? host.execute(
              'workspaceDisplayNames.receipt',
              { idempotencyKey: key, request },
              { signal: controller.signal },
            )
          : host.execute('workspaceDisplayNames.apply', request, { idempotencyKey: key, signal: controller.signal })
      })
      .then(
        (value) => {
          if (finished || !alive() || capturedEpoch !== epoch || !connected) return
          const parsed = workspaceDisplayNamesReceiptSchema.nullable().safeParse(value)
          if (
            !parsed.success ||
            (parsed.data && !workspaceDisplayNamesRequestsEqual(parsed.data.request, request)) ||
            (!reconcile && parsed.data === null)
          ) {
            publish({ action: { ...action, status: 'unknown', error: 'INVALID_OUTPUT' } })
            return
          }
          if (!parsed.data) {
            publish({ action: { ...action, status: 'unknown', error: 'RESULT_UNKNOWN' } })
            return
          }
          lowerBound = Math.max(lowerBound, parsed.data.revision)
          const editor = current().editor
          publish({
            action: { ...action, status: 'succeeded', receipt: parsed.data, error: null },
            editor:
              editor?.workspaceId === request.workspaceId
                ? operation === 'save'
                  ? null
                  : {
                      ...editor,
                      draft: editor.canonicalName,
                      revision: ++editorRevision,
                      validation: null,
                      expectedRevision: parsed.data.revision,
                      expectedDisplayName: null,
                      baseLoaded: true,
                      pristine: true,
                      conflict: (current().snapshot?.revision ?? 0) > parsed.data.revision,
                    }
                : editor,
          })
          refreshAfter = true
        },
        (error: unknown) => {
          if (finished || !alive() || capturedEpoch !== epoch) return
          const errorCode = code(error)
          const rejected = !reconcile && rejectedCodes.has(errorCode)
          publish({ action: { ...action, status: rejected ? 'failed' : 'unknown', error: errorCode } })
          refreshAfter = rejected && errorCode === 'COMMAND_CONFLICT'
        },
      )
      .then(async () => {
        finished = true
        clearTimeout(timer)
        execution?.signal?.removeEventListener('abort', abort)
        if (actionTask === task) {
          actionTask = null
          publish({})
        }
        if (refreshAfter && alive() && capturedEpoch === epoch && connected) await refresh(true)
        resolve()
      })
      .catch((error: unknown) => {
        if (actionTask === task) {
          actionTask = null
          publish({})
        }
        clearTimeout(timer)
        execution?.signal?.removeEventListener('abort', abort)
        if (alive()) publish({ action: { ...action, status: 'unknown', error: code(error) } })
        resolve()
      })
    return promise
  }

  const editorFor = (workspaceId: string, revision?: number) => {
    if (!alive()) throw new CommandError('DISPOSED', 'Workspace display name owner was disposed')
    const editor = current().editor
    if (!editor || editor.workspaceId !== workspaceId)
      throw new CommandError('NOT_FOUND', 'The original editor is not open')
    if (revision !== undefined && revision !== editor.revision)
      throw new CommandError('COMMAND_CONFLICT', 'The editor draft changed')
    return editor
  }
  const normalize = (draft: string) => draft.trim().replace(/\s+/g, ' ')
  const validate = (value: string): WorkspaceDisplayNameEditor['validation'] => {
    if (!value) return 'required'
    if (value.length > 80) return 'tooLong'
    return workspaceDisplayNameSchema.safeParse(value).success ? null : 'invalid'
  }
  async function submit(workspaceId: string, revision: number, operation: 'save' | 'reset', execution: ExecuteOptions) {
    check(execution)
    const editor = editorFor(workspaceId, revision)
    if (locked()) throw new CommandError('BUSY', 'Inspect the original display name request first')
    const normalized = normalize(editor.draft)
    const validation = operation === 'save' ? validate(normalized) : null
    if (validation) {
      publish({ editor: { ...editor, validation } })
      return
    }
    const request = workspaceDisplayNamesApplyInputSchema.parse({
      expectedRevision: editor.expectedRevision,
      workspaceId,
      expectedDisplayName: editor.expectedDisplayName,
      displayName: operation === 'reset' || normalized === normalize(editor.canonicalName) ? null : normalized,
    })
    const snapshot = current().snapshot
    const alias = snapshot?.entries.find((entry) => entry.workspaceId === workspaceId)?.displayName ?? null
    let error: string | null = null
    if (current().status !== 'ready' || !snapshot || snapshot.revision < lowerBound) error = 'BUSY'
    else if (snapshot.revision !== request.expectedRevision || alias !== request.expectedDisplayName)
      error = 'COMMAND_CONFLICT'
    else if (
      alias === null &&
      request.displayName !== null &&
      snapshot.entries.length >= WORKSPACE_DISPLAY_NAMES_MAX_ENTRIES
    )
      error = 'INPUT_TOO_LARGE'
    if (error) {
      publish({
        action: { ...idle, operation, status: 'failed', request, error },
        editor: { ...editor, conflict: error === 'COMMAND_CONFLICT' || editor.conflict },
      })
      if (error === 'COMMAND_CONFLICT') await refresh(true)
      return
    }
    if (request.expectedDisplayName === request.displayName) {
      publish({
        action: idle,
        editor:
          operation === 'save'
            ? null
            : {
                ...editor,
                draft: editor.canonicalName,
                validation: null,
                pristine: true,
                revision: ++editorRevision,
              },
      })
      return
    }
    await perform(request, crypto.randomUUID(), false, execution, operation)
  }
  const unregister = [
    local.register(workspaceDisplayNamesClientCommands['workspaceAlias.open'], ({ workspaceId }) => {
      if (!alive()) throw new CommandError('DISPOSED', 'Workspace display name owner was disposed')
      if (locked()) {
        if (current().editor?.workspaceId !== workspaceId)
          throw new CommandError('BUSY', 'The original editor must be reconciled first')
        const editor = current().editor
        if (editor) publish({ editor: { ...editor, open: true } })
        return summary()
      }
      if (current().editor?.open && current().editor?.workspaceId === workspaceId) return summary()
      const workspace = options.resolveWorkspace(workspaceId)
      if (!workspace || workspace.id !== workspaceId) throw new CommandError('NOT_FOUND', 'Workspace not found')
      const snapshot = current().snapshot
      const alias = snapshot?.entries.find((entry) => entry.workspaceId === workspaceId)?.displayName ?? null
      publish({
        action: idle,
        editor: {
          open: true,
          workspaceId,
          canonicalName: workspace.name,
          path: workspace.path,
          draft: alias ?? workspace.name,
          revision: ++editorRevision,
          validation: null,
          expectedRevision: snapshot?.revision ?? 0,
          expectedDisplayName: alias,
          conflict: false,
          baseLoaded: snapshot !== null,
          pristine: true,
        },
      })
      return summary()
    }),
    local.register(workspaceDisplayNamesClientCommands['workspaceAlias.edit'], ({ workspaceId, revision, draft }) => {
      const editor = editorFor(workspaceId, revision)
      if (locked()) throw new CommandError('BUSY', 'The original display name request is unresolved')
      publish({ editor: { ...editor, draft, revision: ++editorRevision, validation: null, pristine: false } })
      return summary()
    }),
    local.register(workspaceDisplayNamesClientCommands['workspaceAlias.close'], ({ workspaceId }) => {
      const editor = editorFor(workspaceId)
      publish({ editor: locked() ? { ...editor, open: false } : null })
      return summary()
    }),
    local.register(
      workspaceDisplayNamesClientCommands['workspaceAlias.save'],
      async ({ workspaceId, revision }, context) => {
        await submit(workspaceId, revision, 'save', context)
        return summary()
      },
    ),
    local.register(
      workspaceDisplayNamesClientCommands['workspaceAlias.reset'],
      async ({ workspaceId, revision }, context) => {
        await submit(workspaceId, revision, 'reset', context)
        return summary()
      },
    ),
    local.register(
      workspaceDisplayNamesClientCommands['workspaceAlias.rebase'],
      async ({ workspaceId, revision }, context) => {
        check(context)
        const editor = editorFor(workspaceId, revision)
        if (locked()) throw new CommandError('BUSY', 'The original display name request is unresolved')
        await refresh(true)
        check(context)
        const latest = current().editor
        if (
          !latest ||
          latest.workspaceId !== editor.workspaceId ||
          latest.revision !== editor.revision ||
          !latest.open ||
          locked()
        )
          throw new CommandError('COMMAND_CONFLICT', 'The original editor changed while reading')
        const snapshot = current().snapshot
        if (current().status !== 'ready' || !snapshot) return summary()
        publish({
          action: idle,
          editor: {
            ...latest,
            revision: ++editorRevision,
            conflict: false,
            expectedRevision: snapshot.revision,
            expectedDisplayName:
              snapshot.entries.find((entry) => entry.workspaceId === workspaceId)?.displayName ?? null,
          },
        })
        return summary()
      },
    ),
    local.register(workspaceDisplayNamesClientCommands['workspaceAlias.refresh'], async (_input, context) => {
      check(context)
      await refresh()
      return summary()
    }),
    local.register(workspaceDisplayNamesClientCommands['workspaceAlias.reconcile'], async (_input, context) => {
      check(context)
      if (actionTask) throw new CommandError('BUSY', 'The original request is physically still in flight')
      const action = current().action
      if (action.status !== 'unknown' || !action.request || !action.key || !action.operation)
        throw new CommandError('COMMAND_CONFLICT', 'No unknown workspace display name request')
      await perform(action.request, action.key, true, context, action.operation)
      return summary()
    }),
  ]
  const offEvents = options.events?.subscribe(() => {
    void refresh(true)
  })
  const offConnection = options.events?.onConnection?.((next) => {
    if (!alive() || !options.host || next === connected) return
    connected = next
    epoch++
    if (!next) {
      queuedRead = false
      readTask?.cancel('DISCONNECTED')
      actionTask?.cancel('DISCONNECTED')
      publish({ status: 'offline', error: 'DISCONNECTED' })
    } else void refresh(true)
  })
  const ready = refresh()
  return {
    reader: state.reader,
    ready,
    snapshotReader: { getSnapshot: () => current().snapshot, subscribe: state.reader.subscribe },
    dispose() {
      if (disposed) return
      disposed = true
      epoch++
      queuedRead = false
      offEvents?.()
      offConnection?.()
      readTask?.cancel('DISPOSED')
      actionTask?.cancel('DISPOSED')
      for (const stop of unregister) stop()
      state.dispose()
    },
  }
}

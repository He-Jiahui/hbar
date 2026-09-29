import { z } from 'zod'
import { CommandError, defineCommand, type CommandExecutor, type CommandRegistry } from '@hbar/commands'
import { approvalModeSchema, idSchema } from '@hbar/contracts'
import { configurationCommands } from '@hbar/contracts/commands/configuration'
import { createSessionComposerPermission } from './composer-session-permission'
import { createState, type StateReader } from './state'
import type { NavigationState } from './types'

export type ComposerPermissionMode = z.output<typeof approvalModeSchema>
export type ComposerPermissionChoice = ComposerPermissionMode | 'inherit'

export interface ComposerPermissionEntry {
  readonly sessionId: string
  readonly choice: ComposerPermissionChoice
  readonly revision: number
  readonly status: 'idle' | 'loading' | 'preparing' | 'prepared' | 'unknown' | 'failed'
  readonly locked: boolean
  readonly error: string | null
  /** A Host settings write is unresolved; distinct from an unresolved Run submission. */
  readonly writeUnknown?: boolean
}

export interface ComposerPermissionState {
  /** Whether this runtime can read the Host default for the visible picker. */
  readonly available: boolean
  readonly hostDefault: {
    readonly status: 'idle' | 'loading' | 'ready' | 'error'
    readonly mode: ComposerPermissionMode | null
    readonly error: string | null
  }
  readonly entries: Readonly<Record<string, ComposerPermissionEntry>>
}

/** Run ownership token only; the Host session approval setting has separate write receipts. */
export interface ComposerPermissionSubmission {
  readonly token: string
  readonly sessionId: string
  readonly revision: number
  readonly choice: ComposerPermissionChoice
  readonly approval: ComposerPermissionMode
}

export interface ComposerPermissionOptions {
  readonly configuration?: CommandExecutor | undefined
  readonly settings?: CommandExecutor | undefined
  readonly events?: {
    subscribe(listener: () => void): () => void
    onConnection?(listener: (connected: boolean) => void): () => void
  }
  readonly navigation: StateReader<NavigationState>
  /** Existing Draft/Composer submission ownership remains authoritative, including detached Plan runs. */
  readonly isSubmissionLocked: (sessionId: string) => boolean
  readonly isRunActive?: (sessionId: string) => boolean
  readonly onSubscriberError: (error: unknown) => void
  readonly readTimeoutMs?: number
}

const MAX_ENTRIES = 100
const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.app-runtime',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  scope: 'session' as const,
  category: 'run.draft',
  visibility: 'internal' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as ('api' | 'palette' | 'cli' | 'tui')[],
  cancelMode: 'cooperative' as const,
  maxConcurrent: 8,
})

export const composerPermissionCommands = {
  'composerPermission.refresh': defineCommand(
    { ...metadata('composerPermission.refresh'), scope: 'client' },
    z.strictObject({}),
    z.strictObject({ mode: approvalModeSchema }),
  ),
  'composerPermission.setChoice': defineCommand(
    metadata('composerPermission.setChoice'),
    z.strictObject({
      sessionId: idSchema,
      choice: z.enum(['inherit', 'ask', 'deny', 'allow']),
      expectedRevision: z.number().int().nonnegative(),
      confirmAllow: z.literal(true).optional(),
    }),
    z.strictObject({ sessionId: idSchema, revision: z.number().int().nonnegative() }),
  ),
  'composerPermission.reconcile': defineCommand(
    metadata('composerPermission.reconcile'),
    z.strictObject({ sessionId: idSchema }),
    z.strictObject({ sessionId: idSchema, revision: z.number().int().nonnegative() }),
  ),
}

function initial(sessionId: string): ComposerPermissionEntry {
  return { sessionId, choice: 'inherit', revision: 0, status: 'idle', locked: false, error: null }
}

function code(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

/** Use Host session settings when available; legacy runtimes retain the one-shot local fallback. */
export function createComposerPermission(local: CommandRegistry, options: ComposerPermissionOptions) {
  if (options.settings) return createSessionComposerPermission(local, options)
  const state = createState<ComposerPermissionState>(
    { available: !!options.configuration, hostDefault: { status: 'idle', mode: null, error: null }, entries: {} },
    options.onSubscriberError,
  )
  let disposed = false
  let sessionGeneration = 0
  let selectedSession = options.navigation.getSnapshot().sessionId
  const unsubscribeNavigation = options.navigation.subscribe(() => {
    const next = options.navigation.getSnapshot().sessionId
    if (selectedSession !== next) {
      selectedSession = next
      sessionGeneration++
    }
  })
  let read: { readonly controller: AbortController; readonly promise: Promise<ComposerPermissionMode> } | null = null
  const pending = new Map<
    string,
    { readonly promise: Promise<ComposerPermissionSubmission>; captured: ComposerPermissionSubmission | null }
  >()

  const entry = (sessionId: string) => state.reader.getSnapshot().entries[sessionId] ?? initial(sessionId)
  const assertSelected = (sessionId: string) => {
    if (disposed) throw new CommandError('DISPOSED', 'Composer permission state is disposed')
    if (options.navigation.getSnapshot().sessionId !== sessionId)
      throw new CommandError('STALE_TARGET', 'The permission choice belongs to another session')
  }
  const replaceEntry = (value: ComposerPermissionEntry) => {
    if (disposed) return
    const current = state.reader.getSnapshot()
    if (!current.entries[value.sessionId] && Object.keys(current.entries).length >= MAX_ENTRIES)
      throw new CommandError('BUSY', 'Too many session permission drafts are open')
    state.replace({ ...current, entries: { ...current.entries, [value.sessionId]: value } })
  }
  const readDefault = (): Promise<ComposerPermissionMode> => {
    if (disposed) return Promise.reject(new CommandError('DISPOSED', 'Composer permission state is disposed'))
    if (read) return read.promise
    const controller = new AbortController()
    state.replace({ ...state.reader.getSnapshot(), hostDefault: { status: 'loading', mode: null, error: null } })
    const promise = Promise.resolve().then(async () => {
      if (disposed) throw new CommandError('DISPOSED', 'Composer permission state is disposed')
      const timeout = setTimeout(() => controller.abort(), options.readTimeoutMs ?? 15_000)
      let stopWaiting = () => {}
      const aborted = new Promise<never>((_resolve, reject) => {
        const onAbort = () =>
          reject(new CommandError(disposed ? 'DISPOSED' : 'TIMEOUT', 'Permission default read stopped'))
        controller.signal.addEventListener('abort', onAbort, { once: true })
        stopWaiting = () => controller.signal.removeEventListener('abort', onAbort)
        if (controller.signal.aborted) onAbort()
      })
      try {
        if (!options.configuration)
          throw new CommandError('CAPABILITY_UNAVAILABLE', 'Host permission defaults are unavailable')
        const value = await Promise.race([
          options.configuration.execute('permission.get', {}, { signal: controller.signal }),
          aborted,
        ])
        if (disposed || controller.signal.aborted)
          throw new CommandError('CANCELLED', 'Permission default read cancelled')
        const parsed = configurationCommands['permission.get'].output.safeParse(value)
        if (!parsed.success) throw new CommandError('INVALID_OUTPUT', 'Invalid Host permission default')
        state.replace({
          ...state.reader.getSnapshot(),
          hostDefault: { status: 'ready', mode: parsed.data.mode, error: null },
        })
        return parsed.data.mode
      } catch (reason) {
        if (!disposed)
          state.replace({
            ...state.reader.getSnapshot(),
            hostDefault: { status: 'error', mode: null, error: code(reason) },
          })
        throw reason
      } finally {
        clearTimeout(timeout)
        stopWaiting()
        if (read?.controller === controller) read = null
      }
    })
    read = { controller, promise }
    return promise
  }
  const prepareDefault = async (signal?: AbortSignal): Promise<ComposerPermissionMode> => {
    if (!signal) return readDefault()
    if (signal.aborted) throw new CommandError('CANCELLED', 'Submission preparation cancelled')
    let stopWaiting = () => {}
    const cancelled = new Promise<never>((_resolve, reject) => {
      const onAbort = () => reject(new CommandError('CANCELLED', 'Submission preparation cancelled'))
      signal.addEventListener('abort', onAbort, { once: true })
      stopWaiting = () => signal.removeEventListener('abort', onAbort)
    })
    try {
      // Cancelling one caller must not abort the shared, read-only Host default request.
      return await Promise.race([readDefault(), cancelled])
    } finally {
      stopWaiting()
    }
  }

  local.register(composerPermissionCommands['composerPermission.refresh'], async (_input, execution) => {
    const mode = await readDefault()
    if (execution.signal.aborted) throw new CommandError('CANCELLED', 'Permission default refresh cancelled')
    return { mode }
  })
  local.register(composerPermissionCommands['composerPermission.setChoice'], (input) => {
    assertSelected(input.sessionId)
    if (options.isRunActive?.(input.sessionId))
      throw new CommandError('RUN_ACTIVE', 'Wait for the current Run before changing execution permissions')
    const current = entry(input.sessionId)
    if (current.locked || options.isSubmissionLocked(input.sessionId))
      throw new CommandError('SUBMISSION_PENDING', 'The original submitted permission choice is frozen')
    if (current.revision !== input.expectedRevision)
      throw new CommandError('VERSION_CONFLICT', 'The permission draft changed before selection')
    if (current.choice === input.choice) return { sessionId: input.sessionId, revision: current.revision }
    if (input.choice === 'allow' && !input.confirmAllow)
      throw new CommandError('CONFIRMATION_REQUIRED', 'Auto-approval requires an explicit risk confirmation')
    const next = {
      ...current,
      choice: input.choice,
      revision: current.revision + 1,
      status: 'idle' as const,
      error: null,
    }
    replaceEntry(next)
    return { sessionId: input.sessionId, revision: next.revision }
  })

  const view = {
    reader: state.reader,
    async refreshSession(sessionId: string): Promise<void> {
      assertSelected(sessionId)
      if (pending.has(sessionId)) throw new CommandError('BUSY', 'Session approval preparation is still in flight')
      replaceEntry({ ...entry(sessionId), status: 'idle', locked: false, error: null })
    },
    /** Call only for ordinary composer submissions; detached Plan execution has separate approval ownership. */
    prepareSubmission(
      sessionId: string,
      expectedRevision: number,
      signal?: AbortSignal,
    ): Promise<ComposerPermissionSubmission> {
      assertSelected(sessionId)
      const current = entry(sessionId)
      if (current.revision !== expectedRevision)
        return Promise.reject(new CommandError('VERSION_CONFLICT', 'The permission draft changed before submission'))
      const existing = pending.get(sessionId)
      if (existing) return existing.promise
      if (options.isSubmissionLocked(sessionId))
        return Promise.reject(new CommandError('SUBMISSION_PENDING', 'Another submission owns this session'))
      if (signal?.aborted) return Promise.reject(new CommandError('CANCELLED', 'Submission preparation cancelled'))
      replaceEntry({ ...current, status: 'preparing', locked: true, error: null })
      const generation = sessionGeneration
      const promise = Promise.resolve().then(async () => {
        try {
          const approval = current.choice === 'inherit' ? await prepareDefault(signal) : current.choice
          assertSelected(sessionId)
          if (generation !== sessionGeneration)
            throw new CommandError('STALE_TARGET', 'The session changed during permission preparation')
          if (signal?.aborted) throw new CommandError('CANCELLED', 'Submission preparation cancelled')
          const value: ComposerPermissionSubmission = Object.freeze({
            token: crypto.randomUUID(),
            sessionId,
            revision: current.revision,
            choice: current.choice,
            approval,
          })
          capture.captured = value
          replaceEntry({ ...entry(sessionId), status: 'prepared', locked: true, error: null })
          return value
        } catch (reason) {
          if (pending.get(sessionId) === capture) pending.delete(sessionId)
          replaceEntry({ ...entry(sessionId), status: 'failed', locked: false, error: code(reason) })
          throw reason
        }
      })
      const capture: {
        captured: ComposerPermissionSubmission | null
        readonly promise: Promise<ComposerPermissionSubmission>
      } = {
        captured: null,
        promise,
      }
      pending.set(sessionId, capture)
      return capture.promise
    },
    getPreparedSubmission(sessionId: string): ComposerPermissionSubmission | null {
      return pending.get(sessionId)?.captured ?? null
    },
    /** The existing Run/Composer receipt owner decides the outcome; a read-default refresh never settles a Run. */
    settleSubmission(
      captured: ComposerPermissionSubmission,
      outcome: 'accepted' | 'failed' | 'unknown',
      error: string | null = null,
    ): boolean {
      if (disposed) return false
      const original = pending.get(captured.sessionId)?.captured
      if (!original || original.token !== captured.token || original.revision !== captured.revision) return false
      const current = entry(captured.sessionId)
      if (outcome === 'unknown') {
        replaceEntry({ ...current, status: 'unknown', locked: true, error })
      } else {
        pending.delete(captured.sessionId)
        replaceEntry({
          ...current,
          ...(outcome === 'accepted' && current.revision === captured.revision
            ? { choice: 'inherit' as const, revision: current.revision + 1 }
            : {}),
          status: outcome === 'accepted' ? 'idle' : 'failed',
          locked: false,
          error,
        })
      }
      return true
    },
    dispose() {
      disposed = true
      unsubscribeNavigation()
      read?.controller.abort()
      pending.clear()
      state.dispose()
    },
  }
  return {
    ...view,
    /** Preserve legacy runtimes without this capability; any explicit choice/revision opts in strictly. */
    prepareComposerSubmission(sessionId: string, expectedRevision?: number, signal?: AbortSignal) {
      const current = state.reader.getSnapshot().entries[sessionId]
      if (!options.configuration && expectedRevision === undefined && !current)
        return Promise.resolve<ComposerPermissionSubmission | null>(null)
      return view.prepareSubmission(sessionId, expectedRevision ?? current?.revision ?? 0, signal)
    },
  }
}

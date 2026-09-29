import { CommandError, type CommandRegistry } from '@hbar/commands'
import { configurationCommands } from '@hbar/contracts/commands/configuration'
import { settingsCommands, type SettingsReceipt, type SettingsSnapshot } from '@hbar/contracts/commands/settings'
import { encodePath } from '@hbar/schema-core'
import { createState } from './state'
import {
  composerPermissionCommands,
  type ComposerPermissionChoice,
  type ComposerPermissionEntry,
  type ComposerPermissionMode,
  type ComposerPermissionOptions,
  type ComposerPermissionState,
  type ComposerPermissionSubmission,
} from './composer-permission'

const path = [{ kind: 'field' as const, name: 'session.approval' }]
const field = encodePath(path)
const unknownCodes = new Set([
  'RESULT_UNKNOWN',
  'DISCONNECTED',
  'CONNECTION_CLOSED',
  'TIMEOUT',
  'TIMED_OUT',
  'CANCELLED',
  'EXECUTION_FAILED',
  'INVALID_OUTPUT',
])
const errorCode = (reason: unknown) =>
  reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
type WriteInput =
  | {
      readonly schemaVersion: number
      readonly scope: { readonly kind: 'session'; readonly targetId: string }
      readonly path: typeof path
      readonly value: ComposerPermissionMode
      readonly baselineRevisions: Record<string, number>
    }
  | {
      readonly schemaVersion: number
      readonly scope: { readonly kind: 'session'; readonly targetId: string }
      readonly path: typeof path
      readonly baselineRevisions: Record<string, number>
    }
type Operation = {
  readonly commandId: 'settings.set' | 'settings.unset'
  readonly input: WriteInput
  readonly key: string
  readonly choice: ComposerPermissionChoice
  readonly layerId: string
}

/** Host-confirmed session policy; an uncertain write is recoverable only through its original receipt. */
export function createSessionComposerPermission(local: CommandRegistry, options: ComposerPermissionOptions) {
  const settings = options.settings!
  const state = createState<ComposerPermissionState>(
    {
      available: Boolean(options.configuration),
      hostDefault: { status: 'idle', mode: null, error: null },
      entries: {},
    },
    options.onSubscriberError,
  )
  let disposed = false
  const baselines = new Map<string, { schemaVersion: number; revisions: Record<string, number>; layerId: string }>()
  const operations = new Map<string, Operation>()
  const submissions = new Map<
    string,
    { captured: ComposerPermissionSubmission | null; promise: Promise<ComposerPermissionSubmission> }
  >()
  const reading = new Set<string>()
  const invalidated = new Set<string>()
  const generations = new Map<string, number>()
  let defaultRead: Promise<ComposerPermissionMode> | null = null
  const selected = (sessionId: string) => {
    if (disposed) throw new CommandError('DISPOSED', 'Composer permission state is disposed')
    if (options.navigation.getSnapshot().sessionId !== sessionId)
      throw new CommandError('STALE_TARGET', 'The selected session changed')
  }
  const current = (sessionId: string) => state.reader.getSnapshot().entries[sessionId]
  const publish = (value: ComposerPermissionEntry) => {
    if (disposed) return
    const snapshot = state.reader.getSnapshot()
    if (!snapshot.entries[value.sessionId] && Object.keys(snapshot.entries).length >= 100)
      throw new CommandError('BUSY', 'Too many session approval projections are open')
    state.replace({ ...snapshot, entries: { ...snapshot.entries, [value.sessionId]: value } })
  }
  const initial = (sessionId: string): ComposerPermissionEntry => ({
    sessionId,
    choice: 'inherit',
    revision: 0,
    status: 'loading',
    locked: false,
    error: null,
  })
  const modeFrom = (snapshot: SettingsSnapshot): ComposerPermissionChoice => {
    const report = snapshot.resolution.reports[field]
    if (!report) throw new CommandError('INVALID_OUTPUT', 'Session approval report is missing')
    const raw = report.localPresence ? report.localValue : null
    if (raw === null || raw === undefined) return 'inherit'
    if (raw === 'ask' || raw === 'deny' || raw === 'allow') return raw
    throw new CommandError('INVALID_OUTPUT', 'Session approval is not a known mode')
  }
  const readSetting = async (sessionId: string) => {
    selected(sessionId)
    if (operations.has(sessionId)) throw new CommandError('RESULT_UNKNOWN', 'Check the original approval write')
    if (submissions.has(sessionId))
      throw new CommandError('SUBMISSION_PENDING', 'The original submission owns its approval')
    if (reading.has(sessionId)) throw new CommandError('BUSY', 'Session approval read is in progress')
    reading.add(sessionId)
    const generation = (generations.get(sessionId) ?? 0) + 1
    generations.set(sessionId, generation)
    const before = current(sessionId) ?? initial(sessionId)
    publish({ ...before, status: 'loading', locked: false, error: null })
    try {
      const snapshot = settingsCommands['settings.get'].output.parse(
        await settings.execute('settings.get', { scope: { kind: 'session', targetId: sessionId }, path }),
      )
      selected(sessionId)
      if (invalidated.has(sessionId) || generations.get(sessionId) !== generation)
        throw new CommandError('RESULT_UNKNOWN', 'Session approval changed during the read')
      const choice = modeFrom(snapshot)
      const layer = snapshot.resolution.layers.at(-1)
      if (!layer || layer.kind !== 'session')
        throw new CommandError('INVALID_OUTPUT', 'Session settings layer is missing')
      baselines.set(sessionId, {
        schemaVersion: snapshot.schemaVersion,
        revisions: snapshot.revisions,
        layerId: layer.id,
      })
      publish({
        sessionId,
        choice,
        revision: before.revision + 1,
        status: 'idle',
        locked: false,
        error: null,
        writeUnknown: false,
      })
      return choice
    } catch (reason) {
      if (!disposed && generations.get(sessionId) === generation)
        publish({ ...before, status: 'failed', locked: false, error: errorCode(reason) })
      throw reason
    } finally {
      reading.delete(sessionId)
      if (
        invalidated.delete(sessionId) &&
        !disposed &&
        !operations.has(sessionId) &&
        options.navigation.getSnapshot().sessionId === sessionId
      )
        queueMicrotask(() => {
          void readSetting(sessionId).catch(() => undefined)
        })
    }
  }
  const readDefault = () => {
    if (defaultRead) return defaultRead
    state.replace({ ...state.reader.getSnapshot(), hostDefault: { status: 'loading', mode: null, error: null } })
    const promise = Promise.resolve()
      .then(async () => {
        if (!options.configuration)
          throw new CommandError('CAPABILITY_UNAVAILABLE', 'Host permission default is unavailable')
        const result = configurationCommands['permission.get'].output.parse(
          await options.configuration.execute('permission.get', {}),
        )
        if (disposed) throw new CommandError('DISPOSED', 'Composer permission state is disposed')
        state.replace({
          ...state.reader.getSnapshot(),
          hostDefault: { status: 'ready', mode: result.mode, error: null },
        })
        return result.mode
      })
      .catch((reason: unknown) => {
        if (!disposed)
          state.replace({
            ...state.reader.getSnapshot(),
            hostDefault: { status: 'error', mode: null, error: errorCode(reason) },
          })
        throw reason
      })
      .finally(() => {
        if (defaultRead === promise) defaultRead = null
      })
    defaultRead = promise
    return promise
  }
  const verifyReceipt = (receipt: SettingsReceipt, operation: Operation) => {
    const report = receipt.resolution.reports[field]
    if (
      receipt.layerId !== operation.layerId ||
      receipt.schemaVersion !== operation.input.schemaVersion ||
      !report ||
      report.localPresence !== (operation.choice !== 'inherit') ||
      (operation.choice !== 'inherit' && report.localValue !== operation.choice)
    )
      throw new CommandError('INVALID_OUTPUT', 'Original approval receipt does not match the requested change')
    return receipt
  }
  const settleWrite = (sessionId: string, operation: Operation, receipt: SettingsReceipt) => {
    verifyReceipt(receipt, operation)
    if (operations.get(sessionId) !== operation) throw new CommandError('STALE_TARGET', 'Approval write was superseded')
    operations.delete(sessionId)
    const before = current(sessionId) ?? initial(sessionId)
    baselines.set(sessionId, {
      schemaVersion: receipt.schemaVersion,
      revisions: Object.fromEntries(receipt.resolution.layers.map((layer) => [layer.id, layer.revision])),
      layerId: receipt.layerId,
    })
    publish({
      sessionId,
      choice: operation.choice,
      revision: before.revision + 1,
      status: 'idle',
      locked: false,
      error: null,
      writeUnknown: false,
    })
    if (invalidated.delete(sessionId))
      queueMicrotask(() => {
        void readSetting(sessionId).catch(() => undefined)
      })
    return { sessionId, revision: before.revision + 1 }
  }
  local.register(composerPermissionCommands['composerPermission.refresh'], async () => {
    const sessionId = options.navigation.getSnapshot().sessionId
    const [mode] = await Promise.all([
      readDefault(),
      sessionId && !reading.has(sessionId) ? readSetting(sessionId) : Promise.resolve(),
    ])
    return { mode }
  })
  local.register(composerPermissionCommands['composerPermission.setChoice'], async (input) => {
    selected(input.sessionId)
    if (options.isRunActive?.(input.sessionId))
      throw new CommandError('RUN_ACTIVE', 'Wait for the current Run before changing execution permissions')
    const before = current(input.sessionId)
    const baseline = baselines.get(input.sessionId)
    if (
      !before ||
      before.status !== 'idle' ||
      before.locked ||
      !baseline ||
      reading.has(input.sessionId) ||
      operations.has(input.sessionId) ||
      options.isSubmissionLocked(input.sessionId)
    )
      throw new CommandError('BUSY', 'Confirm the Host approval before changing it')
    if (before.revision !== input.expectedRevision)
      throw new CommandError('VERSION_CONFLICT', 'Session approval changed')
    if (input.choice === 'allow' && !input.confirmAllow)
      throw new CommandError('CONFIRMATION_REQUIRED', 'Auto-approval requires explicit risk confirmation')
    if (before.choice === input.choice) return { sessionId: input.sessionId, revision: before.revision }
    const base = {
      schemaVersion: baseline.schemaVersion,
      scope: { kind: 'session' as const, targetId: input.sessionId },
      path,
      baselineRevisions: baseline.revisions,
    }
    const operation: Operation =
      input.choice === 'inherit'
        ? {
            commandId: 'settings.unset',
            input: base,
            key: crypto.randomUUID(),
            choice: input.choice,
            layerId: baseline.layerId,
          }
        : {
            commandId: 'settings.set',
            input: { ...base, value: input.choice },
            key: crypto.randomUUID(),
            choice: input.choice,
            layerId: baseline.layerId,
          }
    operations.set(input.sessionId, operation)
    publish({ ...before, status: 'preparing', locked: true, error: null })
    let dispatched = false
    try {
      selected(input.sessionId)
      if (options.isRunActive?.(input.sessionId))
        throw new CommandError('RUN_ACTIVE', 'The current Run started before the permission change')
      dispatched = true
      const receipt = settingsCommands[operation.commandId].output.parse(
        await settings.execute(operation.commandId, operation.input, { idempotencyKey: operation.key }),
      )
      // The receipt is scoped to this explicit Session. Selection may have
      // changed while the Host write was in flight; do not discard a confirmed
      // write receipt merely because the user focused another tab.
      return settleWrite(input.sessionId, operation, receipt)
    } catch (reason) {
      const unknown = dispatched && unknownCodes.has(errorCode(reason))
      if (!unknown) operations.delete(input.sessionId)
      if (!dispatched && errorCode(reason) === 'RUN_ACTIVE' && !invalidated.has(input.sessionId)) publish(before)
      else
        publish({
          ...before,
          status: unknown ? 'unknown' : 'failed',
          locked: unknown,
          error: errorCode(reason),
          writeUnknown: unknown,
        })
      throw reason
    }
  })
  local.register(composerPermissionCommands['composerPermission.reconcile'], async ({ sessionId }) => {
    selected(sessionId)
    const operation = operations.get(sessionId)
    if (!operation) throw new CommandError('INVALID_STATE', 'No original approval write needs checking')
    const receipt = settingsCommands['settings.receipt'].output.parse(
      await settings.execute('settings.receipt', {
        idempotencyKey: operation.key,
        commandId: operation.commandId,
        input: operation.input,
      }),
    )
    if (!receipt) throw new CommandError('RESULT_UNKNOWN', 'The original approval receipt is not available')
    selected(sessionId)
    return settleWrite(sessionId, operation, receipt)
  })
  let selectedSession = options.navigation.getSnapshot().sessionId
  const unsubscribeNavigation = options.navigation.subscribe(() => {
    const next = options.navigation.getSnapshot().sessionId
    if (next === selectedSession) return
    if (selectedSession && reading.has(selectedSession)) invalidated.add(selectedSession)
    selectedSession = next
    if (next && !operations.has(next) && !submissions.has(next)) void readSetting(next).catch(() => undefined)
  })
  if (selectedSession) void readSetting(selectedSession).catch(() => undefined)
  const unsubscribeEvents = options.events?.subscribe(() => {
    const sessionId = options.navigation.getSnapshot().sessionId
    void readDefault().catch(() => undefined)
    if (!sessionId) return
    if (operations.has(sessionId) || submissions.has(sessionId) || reading.has(sessionId)) invalidated.add(sessionId)
    else void readSetting(sessionId).catch(() => undefined)
  })
  const unsubscribeConnection = options.events?.onConnection?.((connected) => {
    const sessionId = options.navigation.getSnapshot().sessionId
    if (!sessionId) return
    if (!connected) {
      if (reading.has(sessionId)) invalidated.add(sessionId)
      const before = current(sessionId)
      if (before && !operations.has(sessionId) && !submissions.has(sessionId))
        publish({ ...before, status: 'failed', locked: false, error: 'DISCONNECTED' })
    } else {
      void readDefault().catch(() => undefined)
      if (!operations.has(sessionId) && !submissions.has(sessionId) && !reading.has(sessionId))
        void readSetting(sessionId).catch(() => undefined)
    }
  })
  const view = {
    reader: state.reader,
    async refreshSession(sessionId: string): Promise<void> {
      await readSetting(sessionId)
    },
    async prepareSubmission(
      sessionId: string,
      expectedRevision: number,
      signal?: AbortSignal,
    ): Promise<ComposerPermissionSubmission> {
      selected(sessionId)
      const before = current(sessionId)
      if (!before || before.status !== 'idle' || before.locked || submissions.has(sessionId))
        throw new CommandError('BUSY', 'Confirm the Host approval before sending')
      if (before.revision !== expectedRevision) throw new CommandError('VERSION_CONFLICT', 'Session approval changed')
      if (options.isSubmissionLocked(sessionId))
        throw new CommandError('SUBMISSION_PENDING', 'Another submission owns this session')
      if (signal?.aborted) throw new CommandError('CANCELLED', 'Submission preparation cancelled')
      publish({ ...before, status: 'preparing', locked: true, error: null })
      const holder: { captured: ComposerPermissionSubmission | null; promise: Promise<ComposerPermissionSubmission> } =
        {
          captured: null,
          promise: Promise.resolve(null as never),
        }
      holder.promise = Promise.resolve().then(async () => {
        try {
          const snapshot = settingsCommands['settings.get'].output.parse(
            await settings.execute('settings.get', { scope: { kind: 'session', targetId: sessionId }, path }),
          )
          selected(sessionId)
          const actual = modeFrom(snapshot)
          const layer = snapshot.resolution.layers.at(-1)
          if (!layer || layer.kind !== 'session')
            throw new CommandError('INVALID_OUTPUT', 'Session settings layer is missing')
          baselines.set(sessionId, {
            schemaVersion: snapshot.schemaVersion,
            revisions: snapshot.revisions,
            layerId: layer.id,
          })
          if (invalidated.has(sessionId))
            throw new CommandError('VERSION_CONFLICT', 'Session approval changed during submission preparation')
          if (actual !== before.choice) {
            publish({
              sessionId,
              choice: actual,
              revision: before.revision + 1,
              status: 'idle',
              locked: false,
              error: null,
            })
            throw new CommandError('VERSION_CONFLICT', 'Session approval changed before sending')
          }
          const approval = actual === 'inherit' ? await readDefault() : actual
          selected(sessionId)
          if (invalidated.has(sessionId))
            throw new CommandError('VERSION_CONFLICT', 'Session approval changed during submission preparation')
          if (signal?.aborted) throw new CommandError('CANCELLED', 'Submission preparation cancelled')
          const captured: ComposerPermissionSubmission = Object.freeze({
            token: crypto.randomUUID(),
            sessionId,
            revision: before.revision,
            choice: actual,
            approval,
          })
          holder.captured = captured
          publish({ ...before, status: 'prepared', locked: true, error: null })
          return captured
        } catch (reason) {
          if (submissions.get(sessionId) === holder) submissions.delete(sessionId)
          if (current(sessionId)?.locked)
            publish({ ...(current(sessionId) ?? before), status: 'failed', locked: false, error: errorCode(reason) })
          if (invalidated.delete(sessionId) && options.navigation.getSnapshot().sessionId === sessionId)
            queueMicrotask(() => {
              void readSetting(sessionId).catch(() => undefined)
            })
          throw reason
        }
      })
      submissions.set(sessionId, holder)
      return holder.promise
    },
    getPreparedSubmission(sessionId: string) {
      return submissions.get(sessionId)?.captured ?? null
    },
    settleSubmission(
      captured: ComposerPermissionSubmission,
      outcome: 'accepted' | 'failed' | 'unknown',
      error: string | null = null,
    ) {
      if (disposed) return false
      const holder = submissions.get(captured.sessionId)
      if (!holder?.captured || holder.captured.token !== captured.token) return false
      const before = current(captured.sessionId)
      if (!before) return false
      if (outcome !== 'unknown') submissions.delete(captured.sessionId)
      publish({
        ...before,
        status: outcome === 'unknown' ? 'unknown' : outcome === 'accepted' ? 'idle' : 'failed',
        locked: outcome === 'unknown',
        error,
      })
      if (
        outcome !== 'unknown' &&
        invalidated.delete(captured.sessionId) &&
        options.navigation.getSnapshot().sessionId === captured.sessionId
      )
        queueMicrotask(() => {
          void readSetting(captured.sessionId).catch(() => undefined)
        })
      return true
    },
    prepareComposerSubmission(sessionId: string, expectedRevision?: number, signal?: AbortSignal) {
      return view.prepareSubmission(sessionId, expectedRevision ?? current(sessionId)?.revision ?? 0, signal)
    },
    dispose() {
      disposed = true
      unsubscribeNavigation()
      unsubscribeEvents?.()
      unsubscribeConnection?.()
      operations.clear()
      submissions.clear()
      baselines.clear()
      state.dispose()
    },
  }
  return view
}

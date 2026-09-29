import { CommandError, type CommandExecutor, type CommandRegistry, type ExecuteOptions } from '@hbar/commands'
import { sessionSchema, type Session } from '@hbar/contracts/directory'
import { modelCommands } from '@hbar/contracts/commands/models'
import {
  preSessionDraftCommands,
  preSessionDraftStateSchema,
  type PreSessionDraftState,
} from '@hbar/contracts/commands/pre-session-draft'
import { runAcceptedSchema, type RunAccepted } from '@hbar/contracts/commands/run'
import { createState, type StateReader } from './state'
import type { DraftsState, NavigationState, RunCommandPort, SessionControlsState } from './types'
import type { DirectoryQueries } from './directory'
import type { WorkspaceTabNavigationHooks } from './workspace-tabs-runtime'
import type { ComposerPermissionEntry, ComposerPermissionState } from './composer-permission'

const MAX_DRAFTS = 100
const MAX_PENDING = 32
const UNKNOWN_CREATE_CODES = new Set([
  'RESULT_UNKNOWN',
  'DISCONNECTED',
  'CONNECTION_CLOSED',
  'TIMEOUT',
  'TIMED_OUT',
  'CANCELLED',
  'NAVIGATION_SUPERSEDED',
  'INVALID_OUTPUT',
  'EXECUTION_FAILED',
])
const UNKNOWN_OPERATION_CODES = new Set(UNKNOWN_CREATE_CODES)
const PERMISSION_READ_TIMEOUT_MS = 15_000

interface PendingSubmission {
  readonly draftId: string
  readonly createKey: string
  readonly runKey: string
  readonly workspaceId: string
  readonly revision: number
  readonly text: string
  readonly requestedModelId: string | null
  readonly approvalChoice: PreSessionDraftState['approvalChoice']
  navigationFence: Readonly<NavigationState>
  stage: 'create' | 'model' | 'approval' | 'run'
  sessionId: string | null
  modelId: string | null
  approvalWriteStarted: boolean
  inFlight: boolean
  closeRequested: boolean
}

interface PreSessionDraftOptions {
  readonly navigation: StateReader<NavigationState>
  readonly controls: StateReader<SessionControlsState>
  readonly permissions: StateReader<ComposerPermissionState>
  readonly sessionApprovalSettingsAvailable: boolean
  readonly drafts: StateReader<DraftsState>
  readonly queries: DirectoryQueries
  readonly tabs: WorkspaceTabNavigationHooks
  readonly createSession: (
    workspaceId: string,
    title: string | undefined,
    execution: ExecuteOptions,
  ) => Promise<Session>
  readonly workspaces?: CommandExecutor
  readonly models?: CommandExecutor
  readonly run?: RunCommandPort
  readonly onSubscriberError: (error: unknown) => void
  readonly isDisposed: () => boolean
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code
  return 'EXECUTION_FAILED'
}

function initial(draftId: string, workspaceId: string | null): PreSessionDraftState {
  return {
    draftId,
    workspaceId,
    text: '',
    modelId: null,
    approvalChoice: 'inherit',
    revision: 0,
    phase: 'idle',
    unknownStage: null,
    error: null,
    sessionId: null,
    capturedWorkspaceId: null,
    capturedRevision: null,
    operationId: null,
    accepted: null,
  }
}

function operationState(
  current: PreSessionDraftState,
  pending: PendingSubmission,
  phase: PreSessionDraftState['phase'],
  error: string | null = null,
  unknownStage: PreSessionDraftState['unknownStage'] = null,
  accepted: RunAccepted | null = null,
): PreSessionDraftState {
  return {
    ...current,
    phase,
    unknownStage,
    error,
    sessionId: pending.sessionId,
    capturedWorkspaceId: pending.workspaceId,
    capturedRevision: pending.revision,
    operationId: accepted?.operationId ?? current.operationId,
    accepted,
  }
}

export function createPreSessionDrafts(local: CommandRegistry, options: PreSessionDraftOptions) {
  const state = createState<Readonly<Record<string, Readonly<PreSessionDraftState>>>>({}, options.onSubscriberError)
  const pending = new Map<string, PendingSubmission>()
  let disposed = false

  const entry = (draftId: string): PreSessionDraftState => {
    const current = state.reader.getSnapshot()[draftId]
    if (!current) throw new CommandError('DRAFT_NOT_FOUND', 'Pre-session draft is not open')
    return current
  }
  const publish = (value: PreSessionDraftState): void => {
    if (disposed || options.isDisposed()) return
    const current = state.reader.getSnapshot()
    if (!current[value.draftId] && Object.keys(current).length >= MAX_DRAFTS)
      throw new CommandError('BUSY', 'Too many pre-session drafts are open')
    state.replace({ ...current, [value.draftId]: preSessionDraftStateSchema.parse(value) })
  }
  const checkRevision = (current: PreSessionDraftState, expectedRevision: number): void => {
    if (current.revision !== expectedRevision)
      throw new CommandError('VERSION_CONFLICT', 'Pre-session draft changed before this edit')
  }
  const requireEditable = (draftId: string, current: PreSessionDraftState): void => {
    if (pending.has(draftId) || current.phase === 'unknown')
      throw new CommandError('BUSY', 'Reconcile the pending first submission before editing')
    if (current.phase === 'accepted') throw new CommandError('STALE_TARGET', 'This pre-session draft was already sent')
  }
  const requireCapabilities = (approvalChoice: PreSessionDraftState['approvalChoice']): void => {
    if (!options.workspaces) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Session creation is unavailable')
    if (!options.models) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Model configuration is unavailable')
    if (!options.run) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Run commands are unavailable')
    if (approvalChoice !== 'inherit' && !options.sessionApprovalSettingsAvailable)
      throw new CommandError('CAPABILITY_UNAVAILABLE', 'Host session approval settings are unavailable')
  }
  const requireModels = (): CommandExecutor => {
    if (!options.models) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Model configuration is unavailable')
    return options.models
  }
  const ensureSelected = async (operation: PendingSubmission): Promise<void> => {
    const sessionId = operation.sessionId
    if (!sessionId) throw new CommandError('INVALID_STATE', 'The Session identity is missing')
    const current = options.navigation.getSnapshot()
    if (current !== operation.navigationFence || current.status !== 'idle')
      throw new CommandError('STALE_TARGET', 'Navigation changed while preparing the first Run')
    if (current.sessionId === sessionId && current.workspaceId === operation.workspaceId && current.status === 'idle')
      return
    await local.execute('app.setSession', { sessionId, workspaceId: operation.workspaceId })
    const selected = options.navigation.getSnapshot()
    if (
      selected.sessionId !== sessionId ||
      selected.workspaceId !== operation.workspaceId ||
      selected.status !== 'idle'
    )
      throw new CommandError('STALE_TARGET', 'Created Session could not be selected for its first Run')
    operation.navigationFence = selected
  }
  const assertSelectionFence = (operation: PendingSubmission): void => {
    const current = options.navigation.getSnapshot()
    if (current !== operation.navigationFence || current.status !== 'idle')
      throw new CommandError('STALE_TARGET', 'Navigation changed while preparing the first Run')
  }
  const seedSessionDraft = async (operation: PendingSubmission): Promise<void> => {
    const sessionId = operation.sessionId
    if (!sessionId) throw new CommandError('INVALID_STATE', 'The Session identity is missing')
    const current = options.drafts.getSnapshot()[sessionId]
    if (current?.text === operation.text) return
    if (
      current &&
      (current.text ||
        current.mentions.length > 0 ||
        current.attachments.length > 0 ||
        current.attachmentTransfers.length > 0)
    )
      throw new CommandError('VERSION_CONFLICT', 'Session composer draft changed before first-send setup')
    await local.execute('draft.setText', {
      sessionId,
      text: operation.text,
      expectedRevision: current?.revision ?? 0,
    })
    const seeded = options.drafts.getSnapshot()[sessionId]
    if (!seeded || seeded.text !== operation.text)
      throw new CommandError('INVALID_OUTPUT', 'First message did not reach the Session composer draft')
  }
  const setPhase = (
    operation: PendingSubmission,
    phase: PreSessionDraftState['phase'],
    error: string | null = null,
    unknownStage: PreSessionDraftState['unknownStage'] = null,
    accepted: RunAccepted | null = null,
  ): void => {
    const current = state.reader.getSnapshot()[operation.draftId]
    if (current) publish(operationState(current, operation, phase, error, unknownStage, accepted))
  }

  const confirmModel = async (operation: PendingSubmission): Promise<string> => {
    const sessionId = operation.sessionId
    if (!sessionId) throw new CommandError('INVALID_STATE', 'The Session must be created before model setup')
    await ensureSelected(operation)
    if (operation.requestedModelId) {
      await local.execute('composerModel.refresh', { sessionId })
      const configuration = options.controls.getSnapshot().model
      if (!configuration || configuration.sessionId !== sessionId)
        throw new CommandError('MODEL_NOT_READY', 'Created Session model configuration is unavailable')
      if (configuration.modelId !== operation.requestedModelId)
        await local.execute('composerModel.selectModel', { sessionId, modelId: operation.requestedModelId })
      operation.modelId = operation.requestedModelId
      return operation.modelId
    }

    await local.execute('composerModel.refresh', { sessionId })
    const configuration = options.controls.getSnapshot().model
    if (
      !configuration ||
      configuration.sessionId !== sessionId ||
      configuration.status !== 'configured' ||
      !configuration.modelId ||
      !configuration.model
    )
      throw new CommandError('MODEL_NOT_READY', 'Choose a model before sending the first message')
    operation.modelId = configuration.modelId
    return configuration.modelId
  }

  const waitForApprovalEntry = async (sessionId: string): Promise<ComposerPermissionEntry> => {
    const entry = () => options.permissions.getSnapshot().entries[sessionId]
    const current = entry()
    if (current?.writeUnknown || current?.status === 'unknown')
      throw new CommandError('RESULT_UNKNOWN', 'Reconcile the original Host approval write before continuing')
    if (!current || current.status === 'failed') {
      // Session selection starts this read automatically. Retry a failed/missing
      // projection through the existing command and wait for its Host result.
      void local.execute('composerPermission.refresh', {}).catch(() => undefined)
    }

    return new Promise<ComposerPermissionEntry>((resolve, reject) => {
      let complete = false
      let unsubscribe = () => {}
      let timeout: ReturnType<typeof setTimeout> | undefined
      const finish = (settle: () => void) => {
        if (complete) return
        complete = true
        if (timeout !== undefined) clearTimeout(timeout)
        unsubscribe()
        settle()
      }
      const check = () => {
        const value = entry()
        if (disposed || options.isDisposed()) {
          finish(() => reject(new CommandError('DISPOSED', 'Pre-session drafts were disposed')))
        } else if (value?.status === 'idle') {
          finish(() => resolve(value))
        } else if (value?.writeUnknown || value?.status === 'unknown') {
          finish(() => reject(new CommandError('RESULT_UNKNOWN', 'Reconcile the original Host approval write')))
        } else if (value?.status === 'failed') {
          finish(() => reject(new CommandError(value.error ?? 'EXECUTION_FAILED', 'Host session approval read failed')))
        }
      }
      unsubscribe = options.permissions.subscribe(check)
      timeout = setTimeout(() => {
        finish(() => reject(new CommandError('TIMEOUT', 'Host session approval could not be confirmed')))
      }, PERMISSION_READ_TIMEOUT_MS)
      check()
    })
  }

  const applyApprovalChoice = async (operation: PendingSubmission): Promise<void> => {
    if (operation.approvalChoice === 'inherit') return
    const sessionId = operation.sessionId
    if (!sessionId) throw new CommandError('INVALID_STATE', 'The Session must be created before approval setup')
    await ensureSelected(operation)
    const current = await waitForApprovalEntry(sessionId)
    assertSelectionFence(operation)
    if (current.choice !== operation.approvalChoice) {
      operation.approvalWriteStarted = true
      await local.execute('composerPermission.setChoice', {
        sessionId,
        choice: operation.approvalChoice,
        expectedRevision: current.revision,
        ...(operation.approvalChoice === 'allow' ? { confirmAllow: true as const } : {}),
      })
      operation.approvalWriteStarted = false
    }
    // A settings event can start a fresh Host read as soon as the write receipt
    // settles. The receipt confirms the write, but wait for that read to finish
    // before composerIntent captures the permission used by the Run.
    const confirmed = await waitForApprovalEntry(sessionId)
    if (
      !confirmed ||
      confirmed.status !== 'idle' ||
      confirmed.writeUnknown ||
      confirmed.choice !== operation.approvalChoice
    )
      throw new CommandError('RESULT_UNKNOWN', 'Host approval did not reach the requested confirmed value')
    assertSelectionFence(operation)
  }

  const continueSubmission = async (
    operation: PendingSubmission,
    reconcilingUnknownCreate = false,
  ): Promise<RunAccepted> => {
    requireCapabilities(operation.approvalChoice)
    if (operation.stage === 'create') {
      if (!reconcilingUnknownCreate) assertSelectionFence(operation)
      options.tabs.reserveCreation(operation.createKey, operation.workspaceId)
      setPhase(operation, 'creating')
      const created = sessionSchema.parse(
        await options.createSession(operation.workspaceId, undefined, { idempotencyKey: operation.createKey }),
      )
      if (created.workspaceId !== operation.workspaceId || created.archived)
        throw new CommandError('INVALID_OUTPUT', 'Created Session does not match its captured Workspace')
      operation.sessionId = created.id
      options.tabs.commitCreation(operation.createKey, created)
      operation.stage = 'model'
      setPhase(operation, 'configuring')
      await seedSessionDraft(operation)
    }

    if (operation.stage === 'model') {
      const sessionId = operation.sessionId
      if (!sessionId) throw new CommandError('INVALID_STATE', 'The Session identity is missing')
      operation.modelId = await confirmModel(operation)
      assertSelectionFence(operation)
      if (disposed || options.isDisposed()) throw new CommandError('DISPOSED', 'Pre-session drafts were disposed')
      if (operation.approvalChoice === 'inherit') {
        // A new Host Session already inherits approval. Leave it unoverridden;
        // composerIntent captures the effective Host default before submitting.
        operation.stage = 'run'
      } else {
        operation.stage = 'approval'
        setPhase(operation, 'configuring')
      }
    }

    if (operation.stage === 'approval') {
      await applyApprovalChoice(operation)
      operation.stage = 'run'
      setPhase(operation, 'configuring')
    }

    if (operation.stage === 'run') {
      const sessionId = operation.sessionId
      const modelId = operation.modelId
      if (!sessionId || !modelId) throw new CommandError('INVALID_STATE', 'First Run setup is incomplete')
      assertSelectionFence(operation)
      setPhase(operation, 'submitting')
      const accepted = runAcceptedSchema.parse(
        await local.execute(
          'composerIntent.submit',
          { sessionId, modelId, input: { text: operation.text, images: [], files: [] } },
          { idempotencyKey: operation.runKey },
        ),
      )
      if (accepted.sessionId !== sessionId || accepted.idempotencyKey !== operation.runKey)
        throw new CommandError('RESULT_UNKNOWN', 'First Run receipt does not match its captured request')
      return accepted
    }

    throw new CommandError('INVALID_STATE', 'Pre-session submission stage is invalid')
  }

  const settle = (operation: PendingSubmission, accepted: RunAccepted): void => {
    if (pending.get(operation.draftId) !== operation) return
    const current = state.reader.getSnapshot()[operation.draftId]
    if (!current) return
    if (operation.closeRequested) {
      const next = { ...state.reader.getSnapshot() }
      delete next[operation.draftId]
      state.replace(next)
      pending.delete(operation.draftId)
      return
    }
    const clear = current.revision === operation.revision
    publish({
      ...operationState(current, operation, 'accepted', null, null, accepted),
      ...(clear ? { text: '', revision: current.revision + 1 } : {}),
      modelId: operation.modelId ?? current.modelId,
    })
    pending.delete(operation.draftId)
  }

  const run = async (operation: PendingSubmission, reconcile: boolean): Promise<RunAccepted> => {
    if (operation.inFlight) throw new CommandError('BUSY', 'The original first submission is still in flight')
    if (reconcile && !['unknown', 'failed'].includes(entry(operation.draftId).phase))
      throw new CommandError('INVALID_STATE', 'The first submission does not need reconciliation')
    operation.inFlight = true
    try {
      if (reconcile && operation.stage === 'model') {
        if (!operation.sessionId) throw new CommandError('INVALID_STATE', 'Unknown model write has no Session target')
        await ensureSelected(operation)
        try {
          await local.execute('composerModel.reconcile', { sessionId: operation.sessionId })
        } catch (error) {
          // A timed out catalog/config read has no model receipt. Refreshing and
          // comparing the effective value below is safe; unknown writes keep
          // their owner and return RESULT_UNKNOWN from composerModel.reconcile.
          if (errorCode(error) !== 'INVALID_INPUT') throw error
        }
      } else if (reconcile && operation.stage === 'run') {
        if (!operation.sessionId || !options.run)
          throw new CommandError('INVALID_STATE', 'Unknown Run has no receipt owner')
        await local.execute('composerIntent.reconcile', { sessionId: operation.sessionId })
        const receipt = runAcceptedSchema.nullable().parse(
          await options.run.getReceipt(operation.sessionId, operation.runKey, 'run.submit'),
        )
        if (!receipt || receipt.sessionId !== operation.sessionId || receipt.idempotencyKey !== operation.runKey)
          throw new CommandError('RESULT_UNKNOWN', 'The original first Run receipt is not confirmed')
        settle(operation, receipt)
        return receipt
      } else if (reconcile && operation.stage === 'approval') {
        if (!operation.sessionId)
          throw new CommandError('INVALID_STATE', 'Unknown Host approval write has no Session target')
        await ensureSelected(operation)
        const permission = options.permissions.getSnapshot().entries[operation.sessionId]
        if (permission?.writeUnknown) {
          await local.execute('composerPermission.reconcile', { sessionId: operation.sessionId })
          operation.approvalWriteStarted = false
        } else if (
          permission?.status !== 'idle' ||
          permission.choice !== operation.approvalChoice
        ) {
          // A known failure before dispatch is safe to retry only after the
          // existing Host projection is refreshed by applyApprovalChoice.
        }
      }

      const accepted = await continueSubmission(operation, reconcile && operation.stage === 'create')
      settle(operation, accepted)
      return accepted
    } catch (error) {
      const code = errorCode(error)
      const permission = operation.sessionId
        ? options.permissions.getSnapshot().entries[operation.sessionId]
        : undefined
      const uncertain =
        operation.stage === 'create'
          ? UNKNOWN_CREATE_CODES.has(code)
          : operation.stage === 'approval'
            ? Boolean(
                permission?.writeUnknown ||
                  (operation.approvalWriteStarted && UNKNOWN_OPERATION_CODES.has(code)),
              )
            : UNKNOWN_OPERATION_CODES.has(code)
      if (pending.get(operation.draftId) === operation) {
        if (uncertain) setPhase(operation, 'unknown', code, operation.stage)
        else {
          if (operation.stage === 'create') options.tabs.settleCreation(operation.createKey, false)
          if (operation.closeRequested) {
            const next = { ...state.reader.getSnapshot() }
            delete next[operation.draftId]
            state.replace(next)
          } else {
            setPhase(operation, 'failed', code)
          }
          pending.delete(operation.draftId)
        }
      }
      throw error
    } finally {
      operation.inFlight = false
    }
  }

  local.register(preSessionDraftCommands['preSessionDraft.open'], ({ draftId: requestedDraftId, workspaceId }) => {
    if (disposed || options.isDisposed()) throw new CommandError('DISPOSED', 'Pre-session drafts are disposed')
    const capturedWorkspace = workspaceId === undefined ? options.navigation.getSnapshot().workspaceId : workspaceId
    if (requestedDraftId) {
      const existing = state.reader.getSnapshot()[requestedDraftId]
      if (existing) return existing
    }
    const draftId = requestedDraftId ?? crypto.randomUUID()
    const value = initial(draftId, capturedWorkspace)
    publish(value)
    return value
  })

  local.register(preSessionDraftCommands['preSessionDraft.setText'], ({ draftId, text, expectedRevision }) => {
    const current = entry(draftId)
    requireEditable(draftId, current)
    checkRevision(current, expectedRevision)
    const value = {
      ...current,
      text,
      revision: current.revision + 1,
      phase: current.phase === 'failed' ? ('idle' as const) : current.phase,
      unknownStage: null,
      error: null,
      accepted: null,
    }
    publish(value)
    return { draftId, revision: value.revision }
  })

  local.register(
    preSessionDraftCommands['preSessionDraft.setWorkspace'],
    async ({ draftId, workspaceId, expectedRevision }) => {
      const current = entry(draftId)
      requireEditable(draftId, current)
      checkRevision(current, expectedRevision)
      if (current.sessionId) throw new CommandError('STALE_TARGET', 'A created Session cannot change Workspaces')
      if (current.workspaceId === workspaceId) return { draftId, revision: current.revision }
      const workspace = await options.queries.execute('workspace.get', { workspaceId })
      if (!workspace || workspace.id !== workspaceId)
        throw new CommandError('WORKSPACE_NOT_FOUND', 'Workspace is no longer available')
      const latest = entry(draftId)
      requireEditable(draftId, latest)
      checkRevision(latest, expectedRevision)
      const value = {
        ...latest,
        workspaceId,
        revision: latest.revision + 1,
        phase: latest.phase === 'failed' ? ('idle' as const) : latest.phase,
        unknownStage: null,
        error: null,
        accepted: null,
      }
      publish(value)
      return { draftId, revision: value.revision }
    },
  )

  local.register(preSessionDraftCommands['preSessionDraft.setModel'], ({ draftId, modelId, expectedRevision }) => {
    const current = entry(draftId)
    requireEditable(draftId, current)
    checkRevision(current, expectedRevision)
    if (current.modelId === modelId) return { draftId, revision: current.revision }
    const value = {
      ...current,
      modelId,
      revision: current.revision + 1,
      phase: current.phase === 'failed' ? ('idle' as const) : current.phase,
      unknownStage: null,
      error: null,
      accepted: null,
    }
    publish(value)
    return { draftId, revision: value.revision }
  })

  local.register(
    preSessionDraftCommands['preSessionDraft.setApprovalChoice'],
    ({ draftId, choice, expectedRevision, confirmAllow }) => {
      const current = entry(draftId)
      requireEditable(draftId, current)
      checkRevision(current, expectedRevision)
      if (choice === 'allow' && !confirmAllow)
        throw new CommandError('CONFIRMATION_REQUIRED', 'Auto-approval requires explicit risk confirmation')
      if (current.approvalChoice === choice) return { draftId, revision: current.revision }
      const value = {
        ...current,
        approvalChoice: choice,
        revision: current.revision + 1,
        phase: current.phase === 'failed' ? ('idle' as const) : current.phase,
        unknownStage: null,
        error: null,
        accepted: null,
      }
      publish(value)
      return { draftId, revision: value.revision }
    },
  )

  local.register(preSessionDraftCommands['preSessionDraft.submit'], async (input) => {
    const current = entry(input.draftId)
    if (current.phase === 'accepted' && current.accepted && current.sessionId)
      return { draftId: current.draftId, sessionId: current.sessionId, accepted: current.accepted }
    if (current.phase === 'unknown')
      throw new CommandError('RESULT_UNKNOWN', 'Reconcile the captured first submission before retrying')
    if (pending.has(input.draftId)) throw new CommandError('BUSY', 'The first submission is already in progress')
    checkRevision(current, input.expectedRevision)
    const workspaceId = current.workspaceId
    if (!workspaceId) throw new CommandError('WORKSPACE_REQUIRED', 'Choose a Workspace before sending')
    if (!current.text.trim()) throw new CommandError('INVALID_INPUT', 'A first message must contain text')
    requireCapabilities(current.approvalChoice)
    if (pending.size >= MAX_PENDING) throw new CommandError('BUSY', 'Too many first submissions are pending')
    const requestedModelId = input.modelId ?? current.modelId
    const operation: PendingSubmission = {
      draftId: input.draftId,
      createKey: current.sessionId ? '' : crypto.randomUUID(),
      runKey: crypto.randomUUID(),
      workspaceId,
      revision: current.revision,
      text: current.text,
      requestedModelId,
      approvalChoice: current.approvalChoice,
      navigationFence: options.navigation.getSnapshot(),
      stage: current.sessionId ? 'model' : 'create',
      sessionId: current.sessionId,
      modelId: requestedModelId,
      approvalWriteStarted: false,
      inFlight: false,
      closeRequested: false,
    }
    pending.set(input.draftId, operation)
    setPhase(operation, 'preparing')
    if (requestedModelId) {
      try {
        const catalog = modelCommands['model.list'].output.parse(await requireModels().execute('model.list', {}))
        if (!catalog.some((model) => model.id === requestedModelId))
          throw new CommandError('MODEL_NOT_FOUND', 'Selected model is no longer available')
      } catch (error) {
        setPhase(operation, 'failed', errorCode(error))
        pending.delete(input.draftId)
        throw error
      }
    }
    const accepted = await run(operation, false)
    if (!operation.sessionId) throw new CommandError('INVALID_STATE', 'First submission completed without a Session')
    return { draftId: input.draftId, sessionId: operation.sessionId, accepted }
  })

  local.register(preSessionDraftCommands['preSessionDraft.reconcile'], async ({ draftId }) => {
    const current = entry(draftId)
    if (current.phase === 'accepted') return current
    const operation = pending.get(draftId)
    if (!operation) throw new CommandError('INVALID_STATE', 'No first submission is available to reconcile')
    if (operation.inFlight) throw new CommandError('BUSY', 'The original first submission is still in flight')
    const accepted = await run(operation, true)
    const settled = state.reader.getSnapshot()[draftId]
    return (
      settled ??
      operationState(initial(draftId, operation.workspaceId), operation, 'accepted', null, null, accepted)
    )
  })

  local.register(preSessionDraftCommands['preSessionDraft.close'], ({ draftId }) => {
    const current = state.reader.getSnapshot()[draftId]
    if (!current) return { draftId, closed: false }
    const operation = pending.get(draftId)
    if (operation) {
      if (operation.inFlight) operation.closeRequested = true
      return { draftId, closed: false }
    }
    if (current.phase === 'unknown') return { draftId, closed: false }
    const next = { ...state.reader.getSnapshot() }
    delete next[draftId]
    state.replace(next)
    return { draftId, closed: true }
  })

  return {
    reader: state.reader,
    dispose() {
      disposed = true
      pending.clear()
      state.dispose()
    },
  }
}

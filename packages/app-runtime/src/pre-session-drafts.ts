import { CommandError, type CommandExecutor, type CommandRegistry, type ExecuteOptions } from '@hbar/commands'
import { sessionSchema, type Session } from '@hbar/contracts/directory'
import { modelCommands, modelConfigurationSchema, type ModelDescriptor } from '@hbar/contracts/commands/models'
import {
  preSessionDraftCommands,
  preSessionDraftStateSchema,
  type PreSessionDraftState,
} from '@hbar/contracts/commands/pre-session-draft'
import {
  sessionLaunchSelectionSchema,
  type SessionLaunchTargetPreparationManager,
  type SessionLaunchSelection,
} from '@hbar/contracts/commands/session-launch-target'
import { runAcceptedSchema, type RunAccepted } from '@hbar/contracts/commands/run'
import { promptAttachmentSchema, type PromptAttachment } from '@hbar/contracts/commands/draft'
import { createState, type StateReader } from './state'
import type { DraftsState, NavigationState, RunCommandPort, SessionControlsState } from './types'
import type { DirectoryQueries } from './directory'
import type { WorkspaceTabNavigationHooks } from './workspace-tabs-runtime'
import type { ComposerPermissionEntry, ComposerPermissionState } from './composer-permission'
import type { ComposerPlanModeEntry, ComposerPlanModeState } from './composer-plan-mode'
import type { ComposerIntentState } from './composer-intent'
import { registerPreSessionAttachments } from './pre-session-attachments'
import {
  capturePreSessionLaunchPreparation,
  PreSessionLaunchPreparation,
  type PreSessionLaunchPreparationKeys,
} from './pre-session-launch-preparation'

const MAX_DRAFTS = 100
const MAX_PENDING = 32
const MODEL_CATALOG_PREFLIGHT_TIMEOUT_MS = 15_000
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
const PLAN_MODE_READ_TIMEOUT_MS = 15_000

interface PendingSubmission {
  readonly draftId: string
  readonly createKey: string
  readonly runKey: string
  readonly launchKeys: PreSessionLaunchPreparationKeys
  readonly launchPreparation: PreSessionLaunchPreparation | null
  observationSignal: AbortSignal
  readonly workspaceId: string
  readonly revision: number
  readonly text: string
  readonly attachments: readonly PromptAttachment[]
  readonly launchSelection: SessionLaunchSelection
  readonly requestedModelId: string | null
  readonly requestedThinkingLevel: PreSessionDraftState['thinkingLevel']
  readonly approvalChoice: PreSessionDraftState['approvalChoice']
  readonly planMode: PreSessionDraftState['planMode']
  readonly intent: PreSessionDraftState['intent']
  navigationFence: Readonly<NavigationState>
  stage: 'create' | 'launch' | 'model' | 'approval' | 'planMode' | 'goal' | 'run'
  sessionId: string | null
  launchTargetRevision: number | null
  modelId: string | null
  thinkingWriteStarted: boolean
  thinkingWriteReceiptConfirmed: boolean
  approvalWriteStarted: boolean
  inFlight: boolean
  closeRequested: boolean
  cancelRequested: boolean
  pausedForNavigation: boolean
  requiresExplicitContinue: boolean
  handoffStarted: boolean
  readonly observationController: AbortController
  activeAttemptController: AbortController | null
}

interface PreSessionDraftOptions {
  readonly navigation: StateReader<NavigationState>
  readonly controls: StateReader<SessionControlsState>
  readonly permissions: StateReader<ComposerPermissionState>
  readonly sessionApprovalSettingsAvailable: boolean
  readonly planModes: StateReader<ComposerPlanModeState>
  readonly sessionPlanModeAvailable: boolean
  readonly composerIntents: StateReader<ComposerIntentState>
  readonly sessionGoalsAvailable: boolean
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
  readonly attachments?: CommandExecutor
  readonly files?: CommandExecutor
  readonly run?: RunCommandPort
  readonly sessionLaunchTargetPreparation?: SessionLaunchTargetPreparationManager
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
    attachments: [],
    attachmentTransfers: [],
    uploading: 0,
    uploadError: null,
    launchSelection: { mode: 'shared-current' },
    modelId: null,
    thinkingLevel: null,
    approvalChoice: 'inherit',
    planMode: 'default',
    intent: 'default',
    revision: 0,
    phase: 'idle',
    unknownStage: null,
    error: null,
    sessionId: null,
    capturedWorkspaceId: null,
    capturedRevision: null,
    capturedLaunchSelection: null,
    launchPreparation: null,
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
    capturedLaunchSelection: pending.launchSelection,
    launchPreparation: pending.launchPreparation?.getState() ?? current.launchPreparation,
    operationId: accepted?.operationId ?? current.operationId,
    accepted,
  }
}

function sameLaunchSelection(left: SessionLaunchSelection, right: SessionLaunchSelection): boolean {
  return (
    JSON.stringify(sessionLaunchSelectionSchema.parse(left)) ===
    JSON.stringify(sessionLaunchSelectionSchema.parse(right))
  )
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
    if (current.error === 'GOAL_PREPARED')
      throw new CommandError('GOAL_PREPARED', 'Retry the prepared Goal from the active Session composer')
  }
  registerPreSessionAttachments(local, {
    read: entry,
    replace: (_draftId, value) => publish(value),
    assertEditable: requireEditable,
    uploads: options.attachments,
    queries: options.files,
    isDisposed: () => disposed || options.isDisposed(),
  })
  const requireCapabilities = (
    approvalChoice: PreSessionDraftState['approvalChoice'],
    planMode: PreSessionDraftState['planMode'],
    intent: PreSessionDraftState['intent'],
  ): void => {
    if (!options.workspaces) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Session creation is unavailable')
    if (!options.models) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Model configuration is unavailable')
    if (!options.run) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Run commands are unavailable')
    if (approvalChoice !== 'inherit' && !options.sessionApprovalSettingsAvailable)
      throw new CommandError('CAPABILITY_UNAVAILABLE', 'Host session approval settings are unavailable')
    if (planMode === 'plan' && !options.sessionPlanModeAvailable)
      throw new CommandError('CAPABILITY_UNAVAILABLE', 'Host session Plan mode is unavailable')
    if (intent === 'goal' && !options.sessionGoalsAvailable)
      throw new CommandError('CAPABILITY_UNAVAILABLE', 'Host Goal commands are unavailable')
  }
  const requireModels = (): CommandExecutor => {
    if (!options.models) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Model configuration is unavailable')
    return options.models
  }
  const readModelCatalog = async (signal: AbortSignal): Promise<ModelDescriptor[]> => {
    if (signal.aborted) throw new CommandError('CANCELLED', 'Model catalog preflight was cancelled')
    const controller = new AbortController()
    let timedOut = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    let stopWaitingForCancellation = () => {}
    const cancelled = new Promise<never>((_resolve, reject) => {
      const cancel = () => {
        controller.abort()
        reject(new CommandError('CANCELLED', 'Model catalog preflight was cancelled'))
      }
      signal.addEventListener('abort', cancel, { once: true })
      stopWaitingForCancellation = () => signal.removeEventListener('abort', cancel)
      if (signal.aborted) cancel()
    })
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        timedOut = true
        controller.abort()
        reject(new CommandError('TIMEOUT', 'Model catalog preflight timed out'))
      }, MODEL_CATALOG_PREFLIGHT_TIMEOUT_MS)
    })
    try {
      const raw = await Promise.race([
        requireModels().execute('model.list', {}, { signal: controller.signal }),
        cancelled,
        timeoutPromise,
      ])
      if (signal.aborted) throw new CommandError('CANCELLED', 'Model catalog preflight was cancelled')
      const parsed = modelCommands['model.list'].output.safeParse(raw)
      if (!parsed.success || new Set(parsed.data.map((item) => item.id)).size !== parsed.data.length)
        throw new CommandError('INVALID_OUTPUT', 'Model catalog is invalid')
      return parsed.data
    } catch (error) {
      if (timedOut) throw new CommandError('TIMEOUT', 'Model catalog preflight timed out')
      throw error
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
      stopWaitingForCancellation()
    }
  }
  const pauseForNavigation = (operation: PendingSubmission): void => {
    operation.pausedForNavigation = true
    operation.requiresExplicitContinue = true
    operation.launchPreparation?.pauseNavigation()
    setPhase(operation, 'failed', 'STALE_TARGET')
  }
  const navigationMatches = (operation: PendingSubmission): boolean => {
    const current = options.navigation.getSnapshot()
    return current === operation.navigationFence && current.status === 'idle'
  }
  const ensureSelected = async (operation: PendingSubmission): Promise<void> => {
    const sessionId = operation.sessionId
    if (!sessionId) throw new CommandError('INVALID_STATE', 'The Session identity is missing')
    const current = options.navigation.getSnapshot()
    if (operation.cancelRequested && !operation.handoffStarted)
      throw new CommandError('CANCELLED', 'The first submission was cancelled before Run handoff')
    if (current !== operation.navigationFence || current.status !== 'idle') {
      pauseForNavigation(operation)
      throw new CommandError('STALE_TARGET', 'Navigation changed while preparing the first Run')
    }
    if (current.sessionId === sessionId && current.workspaceId === operation.workspaceId && current.status === 'idle')
      return
    await local.execute('app.setSession', { sessionId, workspaceId: operation.workspaceId })
    const selected = options.navigation.getSnapshot()
    if (
      selected.sessionId !== sessionId ||
      selected.workspaceId !== operation.workspaceId ||
      selected.status !== 'idle'
    ) {
      pauseForNavigation(operation)
      throw new CommandError('STALE_TARGET', 'Created Session could not be selected for its first Run')
    }
    operation.navigationFence = selected
  }
  const assertSelectionFence = (operation: PendingSubmission): void => {
    if (operation.cancelRequested && !operation.handoffStarted)
      throw new CommandError('CANCELLED', 'The first submission was cancelled before Run handoff')
    const current = options.navigation.getSnapshot()
    if (current !== operation.navigationFence || current.status !== 'idle') {
      pauseForNavigation(operation)
      throw new CommandError('STALE_TARGET', 'Navigation changed while preparing the first Run')
    }
  }
  const seedSessionDraft = async (operation: PendingSubmission): Promise<void> => {
    const sessionId = operation.sessionId
    if (!sessionId) throw new CommandError('INVALID_STATE', 'The Session identity is missing')
    const current = options.drafts.getSnapshot()[sessionId]
    const sameAttachments = (attachments: readonly PromptAttachment[]) =>
      JSON.stringify(attachments) === JSON.stringify(operation.attachments)
    if (
      current?.text === operation.text &&
      sameAttachments(current.attachments) &&
      current.mentions.length === 0 &&
      current.attachmentTransfers.length === 0
    )
      return
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
    const textSeeded = options.drafts.getSnapshot()[sessionId]
    if (!textSeeded || textSeeded.text !== operation.text)
      throw new CommandError('INVALID_OUTPUT', 'First message did not reach the Session composer draft')
    if (operation.attachments.length > 0)
      await local.execute('draft.setAttachments', {
        sessionId,
        attachments: [...operation.attachments],
        expectedRevision: textSeeded.revision,
      })
    const seeded = options.drafts.getSnapshot()[sessionId]
    if (!seeded || seeded.text !== operation.text || !sameAttachments(seeded.attachments))
      throw new CommandError('INVALID_OUTPUT', 'First message attachments did not reach the Session composer draft')
  }
  const capturedInput = (operation: PendingSubmission) => ({
    text: operation.text,
    images: operation.attachments.filter((item) => item.kind === 'image').map((item) => item.artifact),
    files: operation.attachments.filter((item) => item.kind === 'file').map((item) => item.artifact),
  })
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

  const confirmThinkingLevel = async (operation: PendingSubmission): Promise<void> => {
    const thinkingLevel = operation.requestedThinkingLevel
    if (thinkingLevel === null) return
    const sessionId = operation.sessionId
    const modelId = operation.modelId
    if (!sessionId || !modelId) throw new CommandError('INVALID_STATE', 'Thinking setup has no confirmed model')
    await ensureSelected(operation)
    const configuration = options.controls.getSnapshot().model
    if (
      !configuration ||
      configuration.sessionId !== sessionId ||
      configuration.status !== 'configured' ||
      configuration.modelId !== modelId ||
      !configuration.model
    )
      throw new CommandError('MODEL_NOT_READY', 'Created Session model is not confirmed for thinking setup')
    if (!configuration.model.thinkingLevels.includes(thinkingLevel))
      throw new CommandError('INVALID_INPUT', 'Thinking level is not supported by the selected model')

    if (configuration.thinkingLevel !== thinkingLevel) {
      if (operation.thinkingWriteStarted && !operation.thinkingWriteReceiptConfirmed)
        throw new CommandError('RESULT_UNKNOWN', 'Reconcile the original thinking-level write before retrying')
      if (operation.thinkingWriteReceiptConfirmed)
        throw new CommandError('VERSION_CONFLICT', 'Confirmed thinking level changed before the first Run')
      operation.thinkingWriteStarted = true
      await local.execute('composerModel.selectThinking', { sessionId, thinkingLevel })
      operation.thinkingWriteReceiptConfirmed = true
    }

    assertSelectionFence(operation)
    const actual = modelConfigurationSchema.safeParse(await requireModels().execute('session.getModel', { sessionId }))
    if (!actual.success || actual.data.sessionId !== sessionId)
      throw new CommandError('INVALID_OUTPUT', 'Session model projection does not match the created Session')
    if (
      actual.data.status !== 'configured' ||
      actual.data.modelId !== modelId ||
      actual.data.thinkingLevel !== thinkingLevel ||
      !actual.data.model?.thinkingLevels.includes(thinkingLevel)
    )
      throw new CommandError('VERSION_CONFLICT', 'Host thinking level changed before the first Run')
    operation.thinkingWriteReceiptConfirmed = true
    assertSelectionFence(operation)
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

  const waitForPlanModeEntry = async (sessionId: string): Promise<ComposerPlanModeEntry> => {
    const entry = () => options.planModes.getSnapshot().entries[sessionId]
    const current = entry()
    if (current?.status === 'unknown')
      throw new CommandError('RESULT_UNKNOWN', 'Reconcile the original Host Plan mode write before continuing')
    if (!current || current.status === 'failed') {
      void local.execute('composerPlanMode.refresh', { sessionId }).catch(() => undefined)
    }

    return new Promise<ComposerPlanModeEntry>((resolve, reject) => {
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
        } else if (value?.status === 'ready' && value.mode !== null) {
          finish(() => resolve(value))
        } else if (value?.status === 'unknown') {
          finish(() => reject(new CommandError('RESULT_UNKNOWN', 'Reconcile the original Host Plan mode write')))
        } else if (value?.status === 'failed') {
          finish(() => reject(new CommandError(value.error ?? 'EXECUTION_FAILED', 'Host Plan mode read failed')))
        }
      }
      unsubscribe = options.planModes.subscribe(check)
      timeout = setTimeout(() => {
        finish(() => reject(new CommandError('TIMEOUT', 'Host Plan mode could not be confirmed')))
      }, PLAN_MODE_READ_TIMEOUT_MS)
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

  const applyPlanMode = async (operation: PendingSubmission): Promise<void> => {
    if (operation.planMode === 'default') return
    const sessionId = operation.sessionId
    if (!sessionId) throw new CommandError('INVALID_STATE', 'The Session must be created before Plan mode setup')
    await ensureSelected(operation)
    const current = await waitForPlanModeEntry(sessionId)
    assertSelectionFence(operation)
    if (current.mode !== operation.planMode) {
      await local.execute('composerPlanMode.setMode', {
        sessionId,
        mode: operation.planMode,
        expectedRevision: current.revision,
      })
    }
    // mode.changed can invalidate the projection as the Host write settles.
    // The Run is allowed only after the durable Host mode is again confirmed.
    const confirmed = await waitForPlanModeEntry(sessionId)
    if (confirmed.mode !== operation.planMode)
      throw new CommandError('VERSION_CONFLICT', 'Host Plan mode changed before the first Run')
    assertSelectionFence(operation)
  }

  const ensureComposerGoalIntent = async (operation: PendingSubmission) => {
    const sessionId = operation.sessionId
    if (!sessionId) throw new CommandError('INVALID_STATE', 'The Session identity is missing')
    await ensureSelected(operation)
    let composer = options.composerIntents.getSnapshot().entries[sessionId]
    if (composer?.submission.status === 'partial' && composer.submission.preparedGoalId)
      throw new CommandError('GOAL_PREPARED', 'Retry the prepared Goal from the active Session composer')
    if (composer?.submission.status === 'unknown')
      throw new CommandError('RESULT_UNKNOWN', 'Reconcile the original Goal preparation before retrying')
    if (composer?.intent !== 'goal') {
      await local.execute('composerIntent.setIntent', {
        sessionId,
        intent: 'goal',
        expectedRevision: composer?.revision ?? 0,
      })
      assertSelectionFence(operation)
      composer = options.composerIntents.getSnapshot().entries[sessionId]
    }
    if (!composer || composer.intent !== 'goal')
      throw new CommandError('INVALID_OUTPUT', 'Goal intent was not confirmed for the created Session')
    return composer
  }

  const submitGoalFirstRun = async (operation: PendingSubmission): Promise<RunAccepted> => {
    const sessionId = operation.sessionId
    const modelId = operation.modelId
    if (!sessionId || !modelId) throw new CommandError('INVALID_STATE', 'Goal first-send setup is incomplete')
    await ensureSelected(operation)
    if (options.sessionPlanModeAvailable) {
      const mode = await waitForPlanModeEntry(sessionId)
      if (mode.mode !== 'default')
        throw new CommandError('PLAN_INTENT_CONFLICT', 'Exit Host Plan mode before preparing a Goal')
      assertSelectionFence(operation)
    }

    const composer = await ensureComposerGoalIntent(operation)

    assertSelectionFence(operation)
    setPhase(operation, 'submitting')
    operation.handoffStarted = true
    const accepted = runAcceptedSchema.parse(
      await local.execute(
        'composerIntent.submit',
        {
          sessionId,
          modelId,
          expectedIntentRevision: composer.revision,
          ...(operation.launchTargetRevision === null
            ? {}
            : { expectedLaunchTargetRevision: operation.launchTargetRevision }),
          requireSelectedSession: true,
          input: capturedInput(operation),
        },
        { idempotencyKey: operation.runKey },
      ),
    )
    if (accepted.sessionId !== sessionId || accepted.idempotencyKey !== operation.runKey)
      throw new CommandError('RESULT_UNKNOWN', 'Goal first Run receipt does not match its captured request')
    return accepted
  }

  const finishGoalPrepared = (operation: PendingSubmission): PreSessionDraftState => {
    if (pending.get(operation.draftId) === operation) pending.delete(operation.draftId)
    const current = state.reader.getSnapshot()[operation.draftId]
    if (!current)
      return operationState(initial(operation.draftId, operation.workspaceId), operation, 'failed', 'GOAL_PREPARED')
    if (operation.closeRequested) {
      const next = { ...state.reader.getSnapshot() }
      delete next[operation.draftId]
      state.replace(next)
      return operationState(current, operation, 'failed', 'GOAL_PREPARED')
    }
    const prepared = operationState(current, operation, 'failed', 'GOAL_PREPARED')
    publish(prepared)
    return prepared
  }

  const continueSubmission = async (
    operation: PendingSubmission,
    reconcilingUnknownCreate = false,
    allowLaunchReconcile = false,
  ): Promise<RunAccepted> => {
    requireCapabilities(operation.approvalChoice, operation.planMode, operation.intent)
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
      operation.stage = operation.launchPreparation ? 'launch' : 'model'
      setPhase(operation, 'configuring')
      await seedSessionDraft(operation)
      if (operation.cancelRequested) {
        throw new CommandError('CANCELLED', 'First submission was cancelled after Session creation')
      }
      await ensureSelected(operation)
    }

    if (operation.stage === 'launch') {
      const sessionId = operation.sessionId
      const launchPreparation = operation.launchPreparation
      if (!sessionId || !launchPreparation)
        throw new CommandError('INVALID_STATE', 'Launch preparation is unavailable for the captured Session')
      await ensureSelected(operation)
      await seedSessionDraft(operation)
      assertSelectionFence(operation)
      setPhase(operation, 'preparing')
      const result = allowLaunchReconcile
        ? await launchPreparation.continue(sessionId, {
            signal: operation.observationSignal,
            mayContinue: () => navigationMatches(operation) && !operation.cancelRequested,
          })
        : await launchPreparation.prepare(sessionId, {
            signal: operation.observationSignal,
            mayContinue: () => navigationMatches(operation) && !operation.cancelRequested,
          })
      setPhase(operation, 'preparing')
      if (result.kind === 'paused-navigation') {
        pauseForNavigation(operation)
        throw new CommandError('STALE_TARGET', 'Navigation changed while preparing the first Run')
      }
      if (result.kind === 'cancel-requested' || result.kind === 'cancelled')
        throw new CommandError('CANCELLED', 'Launch preparation was cancelled; first Run was not submitted')
      if (result.kind === 'failed')
        throw new CommandError(launchPreparation.getState().error ?? 'EXECUTION_FAILED', 'Launch preparation failed')
      operation.launchTargetRevision = result.snapshot.targetRevision
      assertSelectionFence(operation)
      operation.stage = 'model'
    }

    if (operation.stage === 'model') {
      const sessionId = operation.sessionId
      if (!sessionId) throw new CommandError('INVALID_STATE', 'The Session identity is missing')
      operation.modelId = await confirmModel(operation)
      await confirmThinkingLevel(operation)
      assertSelectionFence(operation)
      if (disposed || options.isDisposed()) throw new CommandError('DISPOSED', 'Pre-session drafts were disposed')
      if (operation.planMode === 'plan') {
        operation.stage = 'planMode'
        setPhase(operation, 'configuring')
      } else if (operation.approvalChoice !== 'inherit') {
        operation.stage = 'approval'
        setPhase(operation, 'configuring')
      } else if (operation.intent === 'goal') {
        operation.stage = 'goal'
        setPhase(operation, 'configuring')
      } else {
        // A new Host Session already inherits approval. Leave it unoverridden;
        // composerIntent captures the effective Host default before submitting.
        operation.stage = 'run'
      }
    }

    if (operation.stage === 'planMode') {
      await applyPlanMode(operation)
      operation.stage =
        operation.approvalChoice !== 'inherit' ? 'approval' : operation.intent === 'goal' ? 'goal' : 'run'
      setPhase(operation, 'configuring')
    }

    if (operation.stage === 'approval') {
      await applyApprovalChoice(operation)
      operation.stage = operation.intent === 'goal' ? 'goal' : 'run'
      setPhase(operation, 'configuring')
    }

    if (operation.stage === 'goal') return submitGoalFirstRun(operation)

    if (operation.stage === 'run') {
      const sessionId = operation.sessionId
      const modelId = operation.modelId
      if (!sessionId || !modelId) throw new CommandError('INVALID_STATE', 'First Run setup is incomplete')
      assertSelectionFence(operation)
      setPhase(operation, 'submitting')
      operation.handoffStarted = true
      const accepted = runAcceptedSchema.parse(
        await local.execute(
          'composerIntent.submit',
          {
            sessionId,
            modelId,
            ...(operation.launchTargetRevision === null
              ? {}
              : { expectedLaunchTargetRevision: operation.launchTargetRevision }),
            input: capturedInput(operation),
          },
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
      ...(clear ? { text: '', attachments: [], uploadError: null, revision: current.revision + 1 } : {}),
      modelId: operation.modelId ?? current.modelId,
    })
    pending.delete(operation.draftId)
  }

  const reconcileGoalPreparation = async (operation: PendingSubmission): Promise<PreSessionDraftState> => {
    if (operation.inFlight) throw new CommandError('BUSY', 'The original Goal reconciliation is still in flight')
    const sessionId = operation.sessionId
    if (!sessionId) throw new CommandError('INVALID_STATE', 'Unknown Goal creation has no Session target')
    operation.inFlight = true
    try {
      await ensureSelected(operation)
      let composer = options.composerIntents.getSnapshot().entries[sessionId]
      if (composer?.submission.status === 'partial' && composer.submission.preparedGoalId)
        return finishGoalPrepared(operation)
      if (
        composer?.intent !== 'goal' ||
        composer.submission.status !== 'unknown' ||
        composer.submission.phase !== 'goal'
      )
        throw new CommandError('INVALID_STATE', 'The composer no longer owns this uncertain Goal creation')
      await local.execute('composerIntent.reconcile', { sessionId })
      composer = options.composerIntents.getSnapshot().entries[sessionId]
      if (composer?.submission.status === 'partial' && composer.submission.preparedGoalId)
        return finishGoalPrepared(operation)
      throw new CommandError('RESULT_UNKNOWN', 'The original Goal creation has not been confirmed')
    } catch (error) {
      const composer = options.composerIntents.getSnapshot().entries[sessionId]
      if (composer?.submission.status === 'partial' && composer.submission.preparedGoalId)
        return finishGoalPrepared(operation)
      if (!(composer?.intent === 'goal' && composer.submission.status === 'unknown')) {
        if (pending.get(operation.draftId) === operation) {
          if (operation.closeRequested) {
            const next = { ...state.reader.getSnapshot() }
            delete next[operation.draftId]
            state.replace(next)
          } else setPhase(operation, 'failed', errorCode(error))
          pending.delete(operation.draftId)
        }
      }
      throw error
    } finally {
      operation.inFlight = false
    }
  }

  const run = async (
    operation: PendingSubmission,
    reconcile: boolean,
    allowLaunchReconcile = false,
    signal?: AbortSignal,
  ): Promise<RunAccepted> => {
    if (operation.inFlight) throw new CommandError('BUSY', 'The original first submission is still in flight')
    if (reconcile && !['unknown', 'failed'].includes(entry(operation.draftId).phase))
      throw new CommandError('INVALID_STATE', 'The first submission does not need reconciliation')
    if (!operation.activeAttemptController) {
      const controller = new AbortController()
      operation.activeAttemptController = controller
      operation.observationSignal = AbortSignal.any(
        signal
          ? [operation.observationController.signal, controller.signal, signal]
          : [operation.observationController.signal, controller.signal],
      )
    }
    operation.inFlight = true
    try {
      if (reconcile && operation.stage === 'model') {
        if (!operation.sessionId) throw new CommandError('INVALID_STATE', 'Unknown model write has no Session target')
        await ensureSelected(operation)
        try {
          await local.execute('composerModel.reconcile', { sessionId: operation.sessionId })
          if (operation.thinkingWriteStarted) operation.thinkingWriteReceiptConfirmed = true
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
        const receipt = runAcceptedSchema
          .nullable()
          .parse(await options.run.getReceipt(operation.sessionId, operation.runKey, 'run.submit'))
        if (!receipt || receipt.sessionId !== operation.sessionId || receipt.idempotencyKey !== operation.runKey)
          throw new CommandError('RESULT_UNKNOWN', 'The original first Run receipt is not confirmed')
        settle(operation, receipt)
        return receipt
      } else if (reconcile && operation.stage === 'planMode') {
        if (!operation.sessionId)
          throw new CommandError('INVALID_STATE', 'Unknown Host Plan mode write has no Session target')
        await ensureSelected(operation)
        const planMode = options.planModes.getSnapshot().entries[operation.sessionId]
        if (planMode?.status === 'unknown') {
          await local.execute('composerPlanMode.reconcile', { sessionId: operation.sessionId })
        }
      } else if (reconcile && operation.stage === 'approval') {
        if (!operation.sessionId)
          throw new CommandError('INVALID_STATE', 'Unknown Host approval write has no Session target')
        await ensureSelected(operation)
        const permission = options.permissions.getSnapshot().entries[operation.sessionId]
        if (permission?.writeUnknown) {
          await local.execute('composerPermission.reconcile', { sessionId: operation.sessionId })
          operation.approvalWriteStarted = false
        } else if (permission?.status !== 'idle' || permission.choice !== operation.approvalChoice) {
          // A known failure before dispatch is safe to retry only after the
          // existing Host projection is refreshed by applyApprovalChoice.
        }
      }

      if (
        reconcile &&
        operation.cancelRequested &&
        !operation.handoffStarted &&
        operation.stage !== 'create' &&
        operation.stage !== 'launch'
      ) {
        finishCancelled(operation)
        throw new CommandError('CANCELLED', 'The first submission was cancelled before Run handoff')
      }

      const accepted = await continueSubmission(
        operation,
        reconcile && operation.stage === 'create',
        allowLaunchReconcile,
      )
      settle(operation, accepted)
      return accepted
    } catch (error) {
      const code = errorCode(error)
      const permission = operation.sessionId
        ? options.permissions.getSnapshot().entries[operation.sessionId]
        : undefined
      const planMode = operation.sessionId ? options.planModes.getSnapshot().entries[operation.sessionId] : undefined
      const composerIntent = operation.sessionId
        ? options.composerIntents.getSnapshot().entries[operation.sessionId]
        : undefined
      let uncertain =
        operation.stage === 'create'
          ? UNKNOWN_CREATE_CODES.has(code)
          : operation.stage === 'approval'
            ? Boolean(permission?.writeUnknown || (operation.approvalWriteStarted && UNKNOWN_OPERATION_CODES.has(code)))
            : operation.stage === 'planMode'
              ? planMode?.status === 'unknown'
              : UNKNOWN_OPERATION_CODES.has(code)
      if (operation.stage === 'goal') {
        const unknownGoalOperation = composerIntent?.intent === 'goal' && composerIntent.submission.status === 'unknown'
        if (unknownGoalOperation && composerIntent.submission.phase === 'run') operation.stage = 'run'
        uncertain = unknownGoalOperation
      }
      if (pending.get(operation.draftId) === operation) {
        const preparation = operation.launchPreparation?.getState()
        const cancelledLaunchPending =
          operation.cancelRequested &&
          !operation.handoffStarted &&
          operation.stage === 'launch' &&
          (preparation?.phase === 'cancel-requested' || preparation?.phase === 'unknown')
        const cancellationNeedsRecovery =
          operation.cancelRequested &&
          !operation.handoffStarted &&
          (cancelledLaunchPending ||
            (operation.stage === 'create' && uncertain) ||
            (operation.stage !== 'launch' && operation.stage !== 'create' && uncertain))
        if (cancellationNeedsRecovery) {
          const unknownStage =
            operation.stage === 'launch'
              ? (operation.launchPreparation?.getRecoveryStage() ?? 'launchPreparation')
              : operation.stage
          setPhase(operation, 'unknown', code, unknownStage)
        } else if (operation.cancelRequested && !operation.handoffStarted) {
          if (operation.stage === 'create') options.tabs.settleCreation(operation.createKey, false)
          if (operation.closeRequested) {
            const next = { ...state.reader.getSnapshot() }
            delete next[operation.draftId]
            state.replace(next)
          } else setPhase(operation, 'failed', 'CANCELLED')
          pending.delete(operation.draftId)
        } else if (operation.pausedForNavigation && !operation.handoffStarted) {
          setPhase(operation, 'failed', 'STALE_TARGET')
        } else if (uncertain) {
          const unknownStage =
            operation.stage === 'launch'
              ? (operation.launchPreparation?.getRecoveryStage() ?? 'launchPreparation')
              : operation.stage
          setPhase(operation, 'unknown', code, unknownStage)
        } else if (
          operation.stage === 'goal' &&
          composerIntent?.submission.status === 'partial' &&
          composerIntent.submission.preparedGoalId
        )
          finishGoalPrepared(operation)
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
      const controller = operation.activeAttemptController
      operation.activeAttemptController = null
      controller?.abort()
    }
  }

  const finishCancelled = (operation: PendingSubmission, error = 'CANCELLED'): PreSessionDraftState => {
    const current = state.reader.getSnapshot()[operation.draftId]
    if (current) setPhase(operation, 'failed', error)
    pending.delete(operation.draftId)
    if (operation.closeRequested) {
      const next = { ...state.reader.getSnapshot() }
      delete next[operation.draftId]
      state.replace(next)
      return current ?? initial(operation.draftId, operation.workspaceId)
    }
    return state.reader.getSnapshot()[operation.draftId] ?? initial(operation.draftId, operation.workspaceId)
  }

  const reconcileLaunchPreparation = async (operation: PendingSubmission): Promise<PreSessionDraftState> => {
    const sessionId = operation.sessionId
    const launchPreparation = operation.launchPreparation
    if (!sessionId || !launchPreparation)
      throw new CommandError('INVALID_STATE', 'Launch preparation has no captured Session')
    if (operation.inFlight) throw new CommandError('BUSY', 'Launch preparation is still being observed')
    operation.inFlight = true
    try {
      if (operation.pausedForNavigation || operation.requiresExplicitContinue) {
        await launchPreparation.refresh(operation.observationController.signal)
      } else {
        await launchPreparation.reconcile(sessionId, operation.observationController.signal)
      }
      const launchState = launchPreparation.getState()
      if (operation.cancelRequested) {
        if (launchState.phase !== 'cancelled' && launchState.phase !== 'failed') {
          const outcome = await launchPreparation.cancel()
          if (outcome.kind === 'cancel-requested') {
            setPhase(operation, 'unknown', 'CANCEL_REQUESTED', launchPreparation.getRecoveryStage())
            return entry(operation.draftId)
          }
          if (outcome.kind === 'failed')
            return finishCancelled(operation, launchPreparation.getState().error ?? 'EXECUTION_FAILED')
        }
        return finishCancelled(operation)
      }
      if (launchState.phase === 'cancelled') return finishCancelled(operation)
      if (launchState.phase === 'failed') {
        const error = launchState.error ?? 'EXECUTION_FAILED'
        setPhase(operation, 'failed', error)
        pending.delete(operation.draftId)
        return entry(operation.draftId)
      }
      if (launchState.phase === 'ready') {
        operation.launchTargetRevision = launchState.targetRevision
        operation.requiresExplicitContinue = true
        if (!navigationMatches(operation)) pauseForNavigation(operation)
        else setPhase(operation, 'failed', 'CONTINUE_REQUIRED')
        return entry(operation.draftId)
      }
      setPhase(operation, 'unknown', 'RESULT_UNKNOWN', launchPreparation.getRecoveryStage())
      return entry(operation.draftId)
    } catch (error) {
      if (operation.cancelRequested) {
        const launchState = launchPreparation.getState()
        if (launchState.phase === 'cancelled' || launchState.phase === 'failed') return finishCancelled(operation)
        setPhase(operation, 'unknown', 'CANCEL_REQUESTED', launchPreparation.getRecoveryStage())
      } else {
        const current = state.reader.getSnapshot()[operation.draftId]
        if (current) setPhase(operation, 'unknown', errorCode(error), launchPreparation.getRecoveryStage())
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
        launchSelection: { mode: 'shared-current' as const },
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

  local.register(
    preSessionDraftCommands['preSessionDraft.setLaunchSelection'],
    ({ draftId, selection, expectedRevision }) => {
      const current = entry(draftId)
      requireEditable(draftId, current)
      checkRevision(current, expectedRevision)
      if (sameLaunchSelection(current.launchSelection, selection)) return { draftId, revision: current.revision }
      const value = {
        ...current,
        launchSelection: sessionLaunchSelectionSchema.parse(selection),
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

  local.register(
    preSessionDraftCommands['preSessionDraft.setModel'],
    async ({ draftId, modelId, expectedRevision }, execution) => {
      const current = entry(draftId)
      requireEditable(draftId, current)
      checkRevision(current, expectedRevision)
      if (current.modelId === modelId) return { draftId, revision: current.revision }

      let thinkingLevel = current.thinkingLevel
      if (thinkingLevel !== null) {
        if (modelId === null) thinkingLevel = null
        else {
          const catalog = await readModelCatalog(execution.signal)
          const latest = entry(draftId)
          requireEditable(draftId, latest)
          checkRevision(latest, expectedRevision)
          if (latest.modelId !== current.modelId)
            throw new CommandError('VERSION_CONFLICT', 'Pre-session model changed before thinking validation')
          const selected = catalog.find((model) => model.id === modelId)
          if (!selected) throw new CommandError('MODEL_NOT_FOUND', 'Selected model is no longer available')
          if (!selected.thinkingLevels.includes(thinkingLevel)) thinkingLevel = null
        }
      }

      const latest = entry(draftId)
      requireEditable(draftId, latest)
      checkRevision(latest, expectedRevision)
      if (latest.modelId !== current.modelId)
        throw new CommandError('VERSION_CONFLICT', 'Pre-session model changed before this edit')
      const value = {
        ...latest,
        modelId,
        thinkingLevel,
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

  local.register(
    preSessionDraftCommands['preSessionDraft.setThinkingLevel'],
    async ({ draftId, thinkingLevel, expectedModelId, expectedRevision }, execution) => {
      const current = entry(draftId)
      requireEditable(draftId, current)
      checkRevision(current, expectedRevision)
      if (current.modelId !== expectedModelId)
        throw new CommandError('VERSION_CONFLICT', 'Pre-session model changed before thinking selection')

      if (thinkingLevel !== null) {
        if (!expectedModelId) throw new CommandError('MODEL_NOT_READY', 'Choose a model before setting thinking')
        const catalog = await readModelCatalog(execution.signal)
        const latest = entry(draftId)
        requireEditable(draftId, latest)
        checkRevision(latest, expectedRevision)
        if (latest.modelId !== expectedModelId)
          throw new CommandError('VERSION_CONFLICT', 'Pre-session model changed before thinking validation')
        const selected = catalog.find((model) => model.id === expectedModelId)
        if (!selected) throw new CommandError('MODEL_NOT_FOUND', 'Selected model is no longer available')
        if (!selected.thinkingLevels.includes(thinkingLevel))
          throw new CommandError('INVALID_INPUT', 'Thinking level is not supported by the selected model')
      }

      const latest = entry(draftId)
      requireEditable(draftId, latest)
      checkRevision(latest, expectedRevision)
      if (latest.modelId !== expectedModelId)
        throw new CommandError('VERSION_CONFLICT', 'Pre-session model changed before thinking selection')
      if (latest.thinkingLevel === thinkingLevel) return { draftId, revision: latest.revision }
      const value = {
        ...latest,
        thinkingLevel,
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

  local.register(preSessionDraftCommands['preSessionDraft.setPlanMode'], ({ draftId, mode, expectedRevision }) => {
    const current = entry(draftId)
    requireEditable(draftId, current)
    checkRevision(current, expectedRevision)
    if (mode === 'plan' && current.intent === 'goal')
      throw new CommandError('GOAL_PLAN_CONFLICT', 'Goal intent cannot be combined with Host Plan mode')
    if (current.planMode === mode) return { draftId, revision: current.revision }
    const value = {
      ...current,
      planMode: mode,
      revision: current.revision + 1,
      phase: current.phase === 'failed' ? ('idle' as const) : current.phase,
      unknownStage: null,
      error: null,
      accepted: null,
    }
    publish(value)
    return { draftId, revision: value.revision }
  })

  local.register(preSessionDraftCommands['preSessionDraft.setIntent'], ({ draftId, intent, expectedRevision }) => {
    const current = entry(draftId)
    requireEditable(draftId, current)
    checkRevision(current, expectedRevision)
    if (intent === 'goal' && !options.sessionGoalsAvailable)
      throw new CommandError('CAPABILITY_UNAVAILABLE', 'Host Goal commands are unavailable')
    if (intent === 'goal' && current.planMode === 'plan')
      throw new CommandError('GOAL_PLAN_CONFLICT', 'Goal intent cannot be combined with Host Plan mode')
    if (current.intent === intent) return { draftId, revision: current.revision }
    const value = {
      ...current,
      intent,
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
    preSessionDraftCommands['preSessionDraft.setEntryMode'],
    ({ draftId, mode, expectedRevision, text }) => {
      const current = entry(draftId)
      requireEditable(draftId, current)
      checkRevision(current, expectedRevision)
      if (mode === 'goal' && !options.sessionGoalsAvailable)
        throw new CommandError('CAPABILITY_UNAVAILABLE', 'Host Goal commands are unavailable')
      if (mode === 'plan' && !options.sessionPlanModeAvailable)
        throw new CommandError('CAPABILITY_UNAVAILABLE', 'Host Plan mode commands are unavailable')
      const intent = mode === 'goal' ? 'goal' : 'default'
      const planMode = mode === 'plan' ? 'plan' : 'default'
      const nextText = text ?? current.text
      if (current.intent === intent && current.planMode === planMode && current.text === nextText)
        return { draftId, revision: current.revision }
      const value: PreSessionDraftState = {
        ...current,
        intent,
        planMode,
        text: nextText,
        revision: current.revision + 1,
        phase: current.phase === 'failed' ? 'idle' : current.phase,
        unknownStage: null,
        error: null,
        accepted: null,
      }
      publish(value)
      return { draftId, revision: value.revision }
    },
  )

  local.register(preSessionDraftCommands['preSessionDraft.submit'], async (input, execution) => {
    const current = entry(input.draftId)
    if (current.phase === 'accepted' && current.accepted && current.sessionId)
      return { draftId: current.draftId, sessionId: current.sessionId, accepted: current.accepted }
    if (current.phase === 'unknown')
      throw new CommandError('RESULT_UNKNOWN', 'Reconcile the captured first submission before retrying')
    if (pending.has(input.draftId)) throw new CommandError('BUSY', 'The first submission is already in progress')
    checkRevision(current, input.expectedRevision)
    const workspaceId = current.workspaceId
    if (!workspaceId) throw new CommandError('WORKSPACE_REQUIRED', 'Choose a Workspace before sending')
    if (current.attachmentTransfers.length > 0)
      throw new CommandError('ATTACHMENT_PENDING', 'Resolve the selected attachment transfers before first Send')
    if (!current.text.trim() && (current.intent === 'goal' || current.attachments.length === 0))
      throw new CommandError('INVALID_INPUT', 'A first message needs text or attachments; a Goal needs objective text')
    if (current.error === 'GOAL_PREPARED')
      throw new CommandError('GOAL_PREPARED', 'Retry the prepared Goal from the active Session composer')
    requireCapabilities(current.approvalChoice, current.planMode, current.intent)
    if (current.launchSelection.mode !== 'shared-current' && !options.sessionLaunchTargetPreparation)
      throw new CommandError(
        'CAPABILITY_UNAVAILABLE',
        'Session launch-target preparation is unavailable for the selected target',
      )
    if (pending.size >= MAX_PENDING) throw new CommandError('BUSY', 'Too many first submissions are pending')
    const requestedModelId = input.modelId ?? current.modelId
    const launchKeys = Object.freeze({
      setSelection: crypto.randomUUID(),
      start: crypto.randomUUID(),
      cancel: crypto.randomUUID(),
      reconcile: crypto.randomUUID(),
    })
    const launchCapture = capturePreSessionLaunchPreparation(workspaceId, current.launchSelection, launchKeys)
    const observationController = new AbortController()
    const activeAttemptController = new AbortController()
    const observationSignal = AbortSignal.any([
      execution.signal,
      observationController.signal,
      activeAttemptController.signal,
    ])
    const launchPreparation = options.sessionLaunchTargetPreparation
      ? new PreSessionLaunchPreparation(options.sessionLaunchTargetPreparation, launchCapture)
      : null
    const operation: PendingSubmission = {
      draftId: input.draftId,
      createKey: current.sessionId ? '' : crypto.randomUUID(),
      runKey: crypto.randomUUID(),
      launchKeys,
      launchPreparation,
      observationSignal,
      workspaceId,
      revision: current.revision,
      text: current.text,
      attachments: current.attachments.map((item) => promptAttachmentSchema.parse(item)),
      launchSelection: launchCapture.selection,
      requestedModelId,
      requestedThinkingLevel: current.thinkingLevel,
      approvalChoice: current.approvalChoice,
      planMode: current.planMode,
      intent: current.intent,
      navigationFence: options.navigation.getSnapshot(),
      stage: current.sessionId ? (launchPreparation ? 'launch' : 'model') : 'create',
      sessionId: current.sessionId,
      launchTargetRevision: null,
      modelId: requestedModelId,
      thinkingWriteStarted: false,
      thinkingWriteReceiptConfirmed: false,
      approvalWriteStarted: false,
      inFlight: false,
      closeRequested: false,
      cancelRequested: false,
      pausedForNavigation: false,
      requiresExplicitContinue: false,
      handoffStarted: false,
      observationController,
      activeAttemptController,
    }
    pending.set(input.draftId, operation)
    setPhase(operation, 'preparing')
    operation.inFlight = true
    try {
      const catalog = await readModelCatalog(observationSignal)
      if (observationSignal.aborted) throw new CommandError('CANCELLED', 'Model catalog preflight was cancelled')
      if (operation.cancelRequested)
        throw new CommandError('CANCELLED', 'First submission was cancelled before creation')
      if (operation.closeRequested)
        throw new CommandError('CANCELLED', 'Pre-session draft was closed before Session creation')
      if (requestedModelId && !catalog.some((model) => model.id === requestedModelId))
        throw new CommandError('MODEL_NOT_FOUND', 'Selected model is no longer available')
      if (!requestedModelId && catalog.length === 0)
        throw new CommandError('MODEL_NOT_READY', 'No model is available for the first Run')
      if (current.thinkingLevel !== null) {
        const selected = requestedModelId ? catalog.find((model) => model.id === requestedModelId) : undefined
        if (!selected)
          throw new CommandError('MODEL_NOT_READY', 'Choose a model before setting thinking for the first Run')
        if (!selected.thinkingLevels.includes(current.thinkingLevel))
          throw new CommandError('INVALID_INPUT', 'Thinking level is not supported by the selected model')
      }
    } catch (error) {
      if (operation.closeRequested) {
        const next = { ...state.reader.getSnapshot() }
        delete next[input.draftId]
        state.replace(next)
      } else setPhase(operation, 'failed', operation.cancelRequested ? 'CANCELLED' : errorCode(error))
      pending.delete(input.draftId)
      throw error
    } finally {
      operation.inFlight = false
    }
    const accepted = await run(operation, false)
    if (!operation.sessionId) throw new CommandError('INVALID_STATE', 'First submission completed without a Session')
    return { draftId: input.draftId, sessionId: operation.sessionId, accepted }
  })

  local.register(preSessionDraftCommands['preSessionDraft.reconcile'], async ({ draftId }) => {
    const current = entry(draftId)
    if (current.phase === 'accepted') return current
    if (current.error === 'GOAL_PREPARED') return current
    const operation = pending.get(draftId)
    if (!operation) throw new CommandError('INVALID_STATE', 'No first submission is available to reconcile')
    if (operation.inFlight) throw new CommandError('BUSY', 'The original first submission is still in flight')
    if (operation.stage === 'launch') return reconcileLaunchPreparation(operation)
    if (operation.stage === 'goal') {
      const sessionId = operation.sessionId
      const composer = sessionId ? options.composerIntents.getSnapshot().entries[sessionId] : undefined
      if (operation.handoffStarted && composer?.submission.status === 'unknown' && composer.submission.phase === 'run')
        operation.stage = 'run'
      else if (composer?.submission.status === 'partial' || composer?.submission.phase !== 'run')
        return reconcileGoalPreparation(operation)
    }
    let accepted: RunAccepted
    try {
      accepted = await run(operation, true)
    } catch (error) {
      if (operation.cancelRequested && !pending.has(draftId)) return entry(draftId)
      throw error
    }
    const settled = state.reader.getSnapshot()[draftId]
    return (
      settled ?? operationState(initial(draftId, operation.workspaceId), operation, 'accepted', null, null, accepted)
    )
  })

  local.register(
    preSessionDraftCommands['preSessionDraft.continue'],
    async ({ draftId, expectedRevision }, execution) => {
      const current = entry(draftId)
      checkRevision(current, expectedRevision)
      if (current.phase === 'accepted') return current
      const operation = pending.get(draftId)
      if (!operation) throw new CommandError('INVALID_STATE', 'No first submission is available to continue')
      if (operation.inFlight) throw new CommandError('BUSY', 'The original first submission is still in flight')
      if (operation.handoffStarted)
        throw new CommandError('RESULT_UNKNOWN', 'Reconcile the original Run receipt instead')
      if (operation.cancelRequested) throw new CommandError('CANCELLED', 'The first submission was cancelled')
      if (!operation.requiresExplicitContinue && operation.stage !== 'launch')
        throw new CommandError('INVALID_STATE', 'The first submission is not paused for explicit continuation')
      const sessionId = operation.sessionId
      const navigation = options.navigation.getSnapshot()
      if (
        !sessionId ||
        navigation.status !== 'idle' ||
        navigation.sessionId !== sessionId ||
        navigation.workspaceId !== operation.workspaceId
      )
        throw new CommandError('STALE_TARGET', 'Select the captured Session and Workspace before continuing')
      operation.navigationFence = navigation
      operation.pausedForNavigation = false
      operation.requiresExplicitContinue = false
      await run(operation, false, operation.stage === 'launch', execution.signal)
      return entry(draftId)
    },
  )

  local.register(
    preSessionDraftCommands['preSessionDraft.cancel'],
    async ({ draftId, expectedRevision }, execution) => {
      const current = entry(draftId)
      checkRevision(current, expectedRevision)
      if (current.phase === 'accepted') return current
      const operation = pending.get(draftId)
      if (!operation) {
        if (current.phase === 'failed' && current.error === 'CANCELLED') return current
        throw new CommandError('INVALID_STATE', 'No first submission is available to cancel')
      }

      if (operation.handoffStarted) {
        if (operation.inFlight) return current
        if (operation.stage === 'goal') {
          const sessionId = operation.sessionId
          const composer = sessionId ? options.composerIntents.getSnapshot().entries[sessionId] : undefined
          if (composer?.submission.status === 'unknown' && composer.submission.phase === 'run') operation.stage = 'run'
          else if (current.phase === 'unknown') return reconcileGoalPreparation(operation)
        }
        if (operation.stage === 'run' && current.phase === 'unknown') {
          await run(operation, true, false, execution.signal)
          return entry(draftId)
        }
        return current
      }

      operation.cancelRequested = true
      operation.activeAttemptController?.abort(new CommandError('CANCELLED', 'First submission was cancelled'))
      if (operation.launchPreparation) {
        const outcome = await operation.launchPreparation.cancel()
        if (outcome.kind === 'failed')
          return finishCancelled(operation, operation.launchPreparation.getState().error ?? 'EXECUTION_FAILED')
        if (outcome.kind === 'cancelled') return finishCancelled(operation)
        if (!operation.inFlight)
          setPhase(operation, 'unknown', 'CANCEL_REQUESTED', operation.launchPreparation.getRecoveryStage())
        return entry(draftId)
      }

      if (operation.inFlight) {
        setPhase(
          operation,
          current.phase === 'unknown' ? 'unknown' : 'preparing',
          current.phase === 'unknown' ? current.error : null,
          current.phase === 'unknown' ? current.unknownStage : null,
        )
        return entry(draftId)
      }
      if (current.phase === 'unknown') {
        setPhase(operation, 'unknown', 'CANCEL_REQUESTED', current.unknownStage)
        return entry(draftId)
      }
      return finishCancelled(operation)
    },
  )

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

  const unsubscribeComposerIntents = options.composerIntents.subscribe(() => {
    const entries = options.composerIntents.getSnapshot().entries
    for (const operation of pending.values()) {
      const current = state.reader.getSnapshot()[operation.draftId]
      if (operation.stage !== 'goal' || current?.phase !== 'unknown' || current.unknownStage !== 'goal') continue
      const sessionId = operation.sessionId
      const composer = sessionId ? entries[sessionId] : undefined
      if (composer?.intent === 'goal' && composer.submission.status === 'partial' && composer.submission.preparedGoalId)
        finishGoalPrepared(operation)
    }
  })

  return {
    reader: state.reader,
    dispose() {
      disposed = true
      unsubscribeComposerIntents()
      for (const operation of pending.values()) {
        operation.observationController.abort()
        operation.activeAttemptController?.abort()
        operation.launchPreparation?.dispose()
      }
      pending.clear()
      state.dispose()
    },
  }
}

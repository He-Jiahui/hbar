import {
  CommandError,
  createCommandClient,
  defineCommand,
  type CommandRegistry,
  type ExecuteOptions,
} from '@hbar/commands'
import {
  agentCommands,
  agentCreateInputSchema,
  agentProfileCatalogSchema,
  agentProfileIdSchema,
  type AgentProfileId,
  type AgentRecord,
} from '@hbar/contracts/commands/agents'
import { z } from 'zod'
import type { AgentCreateRecovery, PendingAgentCreate } from './agent-create-recovery'
import { createState, type StateReader } from './state'
import type {
  AgentComposerActionState,
  AgentComposerState,
  DirectoryState,
  DraftsState,
  NavigationState,
  PresentationState,
  RuntimeOptions,
  SessionControlsState,
  SurfaceState,
} from './types'
import type { WorkspaceTabsState } from './workspace-tabs-runtime'

const idSchema = z.string().min(1).max(160)
const MAX_ACTIONS = 32
const UNKNOWN_CODES = new Set([
  'RESULT_UNKNOWN',
  'DISCONNECTED',
  'CONNECTION_CLOSED',
  'TIMEOUT',
  'TIMED_OUT',
  'CANCELLED',
  'INVALID_OUTPUT',
  'EXECUTION_FAILED',
])

const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.agent-composer',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  scope: 'client' as const,
  category: 'agent.goal.plan',
  visibility: 'internal' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as ('api' | 'cli' | 'tui' | 'palette')[],
})
const resultSchema = z.strictObject({
  sessionId: idSchema,
  status: z.enum(['ready', 'error', 'submitting', 'succeeded', 'failed', 'unknown']),
  agentId: idSchema.nullable(),
  error: z.string().nullable(),
})
export const agentComposerCommands = {
  'agentComposer.refreshProfiles': defineCommand(
    { ...metadata('agentComposer.refreshProfiles'), kind: 'query', stateEffect: 'none' },
    z.strictObject({}),
    agentProfileCatalogSchema,
  ),
  'agentComposer.refresh': defineCommand(
    { ...metadata('agentComposer.refresh'), kind: 'query', stateEffect: 'none' },
    z.strictObject({ sessionId: idSchema, workspaceId: idSchema }),
    resultSchema,
  ),
  'agentComposer.invoke': defineCommand(
    metadata('agentComposer.invoke'),
    z.strictObject({
      sessionId: idSchema,
      workspaceId: idSchema,
      draftText: z.string().max(4_200),
      draftRevision: z.number().int().nonnegative(),
      profileId: agentProfileIdSchema,
      objective: z.string().trim().min(1).max(4_000),
    }),
    resultSchema.extend({ draftCleared: z.boolean() }),
  ),
  'agentComposer.openResult': defineCommand(
    metadata('agentComposer.openResult'),
    z.strictObject({ sessionId: idSchema, workspaceId: idSchema, agentId: idSchema }),
    z.strictObject({ sessionId: idSchema, agentId: idSchema, panelInstanceId: idSchema, selected: z.boolean() }),
  ),
}

function code(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

function commandFailure(reason: unknown): CommandError {
  if (reason instanceof CommandError) return reason
  return new CommandError(code(reason), reason instanceof Error ? reason.message : 'Agent operation failed')
}

interface AgentComposerOptions {
  readonly recovery: AgentCreateRecovery
  readonly acquireCreateLock: (sessionId: string) => (() => void) | null
  readonly isCreateInFlight: (sessionId: string) => boolean
  readonly navigation: StateReader<NavigationState>
  readonly presentation: StateReader<PresentationState>
  readonly directory: StateReader<DirectoryState>
  readonly drafts: StateReader<DraftsState>
  readonly tabs: StateReader<WorkspaceTabsState>
  readonly surfaces: StateReader<SurfaceState>
  readonly controls: StateReader<SessionControlsState>
  readonly mergeCreatedRecord: (agent: AgentRecord) => void
  readonly onSubscriberError: (error: unknown) => void
  readonly isDisposed: () => boolean
}

export function createAgentComposer(
  local: CommandRegistry,
  runtimeOptions: RuntimeOptions,
  options: AgentComposerOptions,
) {
  const state = createState<AgentComposerState>(
    { profileCatalog: { status: 'idle', profiles: [], error: null }, actions: {} },
    options.onSubscriberError,
  )
  const client = runtimeOptions.agents ? createCommandClient(agentCommands, runtimeOptions.agents) : null
  let connected = true
  let profileGeneration = 0
  let profileRead: {
    readonly controller: AbortController
    readonly promise: Promise<readonly AgentProfileId[]>
  } | null = null

  const requireClient = () => {
    if (!client) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Agent commands are unavailable')
    return client
  }
  const replaceAction = (action: AgentComposerActionState) => {
    if (options.isDisposed()) return
    const current = state.reader.getSnapshot()
    const actions = { ...current.actions }
    if (!actions[action.sessionId] && Object.keys(actions).length >= MAX_ACTIONS) {
      const settled = Object.entries(actions).find(
        ([, entry]) => entry.status === 'succeeded' || entry.status === 'failed',
      )
      if (!settled) throw new CommandError('BUSY', 'Too many Agent composer actions are pending')
      delete actions[settled[0]]
    }
    actions[action.sessionId] = action
    state.replace({ ...current, actions })
  }
  const makeAction = (
    sessionId: string,
    workspaceId: string,
    draftText: string,
    draftRevision: number,
    profileId: AgentProfileId,
    objective: string,
    status: AgentComposerActionState['status'],
    error: string | null,
    agent: Readonly<AgentRecord> | null = null,
    draftCleared = false,
  ): AgentComposerActionState => ({
    sessionId,
    workspaceId,
    draftText,
    draftRevision,
    profileId,
    objective,
    status,
    agent,
    draftCleared,
    error,
  })
  const activeSourceTab = (sessionId: string, workspaceId: string) => {
    const active = options.navigation.getSnapshot()
    const page = options.presentation.getSnapshot().page
    const tabs = options.tabs.getSnapshot()
    const activeTab = tabs.items.find((item) => item.id === tabs.activeId)
    const directory = options.directory.getSnapshot()
    const session = directory.sessions[sessionId]
    const workspace = directory.workspaces[workspaceId]
    if (
      active.status !== 'idle' ||
      active.sessionId !== sessionId ||
      active.workspaceId !== workspaceId ||
      page.kind !== 'session' ||
      activeTab?.kind !== 'session' ||
      activeTab.sessionId !== sessionId ||
      activeTab.workspaceId !== workspaceId ||
      !session ||
      session.workspaceId !== workspaceId ||
      session.archived ||
      !workspace
    )
      return null
    return activeTab
  }
  const requireActiveSource = (sessionId: string, workspaceId: string) => {
    const tab = activeSourceTab(sessionId, workspaceId)
    if (!tab) throw new CommandError('STALE_TARGET', 'The source Session is no longer visible and selected')
    return tab
  }
  const sourceStillMatches = (sessionId: string, workspaceId: string, instanceKey: string) => {
    return activeSourceTab(sessionId, workspaceId)?.instanceKey === instanceKey
  }
  const requireDraft = (sessionId: string, text: string, revision: number, exactRevision: boolean) => {
    const current = options.drafts.getSnapshot()[sessionId]
    if (!current || current.text !== text || (exactRevision && current.revision !== revision))
      throw new CommandError('VERSION_CONFLICT', 'The composer draft changed before Agent dispatch')
    if (
      current.mentions.length ||
      current.attachments.length ||
      current.attachmentTransfers.length ||
      current.uploading > 0
    )
      throw new CommandError('INVALID_INPUT', 'Agent slash commands cannot include mentions or attachments')
    if (current.status === 'submitting' || current.status === 'unknown')
      throw new CommandError('BUSY', 'Resolve the current Run submission before invoking an Agent')
    return current
  }
  const requireRetryDraft = (sessionId: string, pending: PendingAgentCreate) => {
    const origin = pending.origin
    if (!origin)
      throw new CommandError('IDEMPOTENCY_CONFLICT', 'Pending Agent creation was not started from the composer')
    const current = options.drafts.getSnapshot()[sessionId]
    // A reload may restore the action before it restores the local draft. Empty is safe: retry still uses the exact
    // persisted input and key, and a confirmed response will never clear a newer non-empty draft.
    if (!current) return
    if (current.text !== '' && current.text !== origin.draftText)
      throw new CommandError('VERSION_CONFLICT', 'A different composer draft is now in the source Session')
    if (
      current.mentions.length ||
      current.attachments.length ||
      current.attachmentTransfers.length ||
      current.uploading > 0
    )
      throw new CommandError('INVALID_INPUT', 'Agent slash commands cannot include mentions or attachments')
    if (current.status === 'submitting' || current.status === 'unknown')
      throw new CommandError('BUSY', 'Resolve the current Run submission before retrying an Agent')
  }
  const refreshProfiles = async (signal?: AbortSignal): Promise<readonly AgentProfileId[]> => {
    if (signal?.aborted) throw new CommandError('CANCELLED', 'Agent profile refresh was cancelled')
    const existing = state.reader.getSnapshot().profileCatalog
    if (existing.status === 'ready') return existing.profiles
    if (profileRead) return profileRead.promise
    const controller = new AbortController()
    const generation = ++profileGeneration
    state.replace({
      ...state.reader.getSnapshot(),
      profileCatalog: { ...existing, status: 'loading', error: null },
    })
    const promise = Promise.resolve().then(async () => {
      try {
        if (!connected) throw new CommandError('DISCONNECTED', 'Agent profile catalog needs a connection')
        const result = await requireClient().execute('agent.profiles.list', {}, { signal: controller.signal })
        const profiles = agentProfileCatalogSchema.parse(result)
        if (new Set(profiles).size !== profiles.length)
          throw new CommandError('INVALID_OUTPUT', 'Agent profile catalog contains duplicate IDs')
        if (options.isDisposed() || controller.signal.aborted || generation !== profileGeneration)
          throw new CommandError('CANCELLED', 'Agent profile catalog read was superseded')
        state.replace({ ...state.reader.getSnapshot(), profileCatalog: { status: 'ready', profiles, error: null } })
        return profiles
      } catch (reason) {
        if (!options.isDisposed() && !controller.signal.aborted && generation === profileGeneration)
          state.replace({
            ...state.reader.getSnapshot(),
            profileCatalog: { status: 'error', profiles: [], error: code(reason) },
          })
        throw commandFailure(reason)
      } finally {
        if (profileRead?.controller === controller) profileRead = null
      }
    })
    profileRead = { controller, promise }
    return promise
  }
  const restorePending = async (sessionId: string, workspaceId: string) => {
    const pending = await options.recovery.read(sessionId)
    if (!pending?.origin || pending.origin.workspaceId !== workspaceId) return pending
    const previous = state.reader.getSnapshot().actions[sessionId]
    const sameConfirmed =
      previous?.status === 'succeeded' &&
      previous.workspaceId === workspaceId &&
      previous.draftText === pending.origin.draftText &&
      previous.draftRevision === pending.origin.draftRevision &&
      previous.profileId === pending.input.profileId &&
      previous.objective === pending.input.objective &&
      previous.agent !== null
    if (sameConfirmed) return pending
    const profileId = pending.input.profileId
    if (!profileId) throw new CommandError('INVALID_PERSISTED_STATE', 'Composer Agent retry is missing its profile')
    const status = options.isCreateInFlight(sessionId) ? 'submitting' : 'unknown'
    replaceAction(
      makeAction(
        sessionId,
        workspaceId,
        pending.origin.draftText,
        pending.origin.draftRevision,
        profileId,
        pending.input.objective,
        status,
        status === 'unknown' ? 'RESULT_UNKNOWN' : null,
      ),
    )
    return pending
  }
  const clearDraftAfterConfirmation = async (
    pending: PendingAgentCreate,
  ): Promise<{ readonly cleared: boolean; readonly keepPending: boolean; readonly error: string | null }> => {
    const origin = pending.origin
    if (!origin) return { cleared: false, keepPending: false, error: null }
    const current = options.drafts.getSnapshot()[pending.parentSessionId]
    if (!current) return { cleared: false, keepPending: false, error: null }
    if (
      current.text !== origin.draftText ||
      current.revision !== origin.draftRevision ||
      current.mentions.length ||
      current.attachments.length ||
      current.attachmentTransfers.length ||
      current.uploading > 0
    )
      return { cleared: false, keepPending: false, error: 'DRAFT_CHANGED' }
    try {
      await local.execute('draft.setContent', {
        sessionId: pending.parentSessionId,
        text: '',
        mentions: [],
        expectedRevision: origin.draftRevision,
      })
      return { cleared: true, keepPending: false, error: null }
    } catch (reason) {
      // The Agent is confirmed. Retain the same Host key only when the original draft is still exact, allowing a
      // subsequent exact repeat to reconcile rather than producing a second child.
      return { cleared: false, keepPending: true, error: code(reason) }
    }
  }
  const resultFor = (
    sessionId: string,
    action: AgentComposerActionState | undefined,
  ): z.output<typeof resultSchema> => ({
    sessionId,
    status: action?.status === 'idle' ? 'ready' : (action?.status ?? 'ready'),
    agentId: action?.agent?.agentId ?? null,
    error: action?.error ?? null,
  })
  const refresh = async (
    input: { readonly sessionId: string; readonly workspaceId: string },
    execution: ExecuteOptions,
  ) => {
    const source = requireActiveSource(input.sessionId, input.workspaceId)
    try {
      await refreshProfiles(execution.signal)
      if (execution.signal?.aborted) throw new CommandError('CANCELLED', 'Agent profile refresh was cancelled')
      if (sourceStillMatches(input.sessionId, input.workspaceId, source.instanceKey))
        await restorePending(input.sessionId, input.workspaceId)
      return resultFor(input.sessionId, state.reader.getSnapshot().actions[input.sessionId])
    } catch (reason) {
      return {
        sessionId: input.sessionId,
        status: 'error' as const,
        agentId: state.reader.getSnapshot().actions[input.sessionId]?.agent?.agentId ?? null,
        error: state.reader.getSnapshot().profileCatalog.error ?? code(reason),
      }
    }
  }
  const matchesInput = (
    pending: PendingAgentCreate,
    input: {
      readonly sessionId: string
      readonly workspaceId: string
      readonly draftText: string
      readonly draftRevision: number
      readonly profileId: AgentProfileId
      readonly objective: string
    },
  ) =>
    pending.origin?.kind === 'composer' &&
    pending.parentSessionId === input.sessionId &&
    pending.origin.workspaceId === input.workspaceId &&
    pending.origin.draftText === input.draftText &&
    pending.origin.draftRevision === input.draftRevision &&
    pending.input.profileId === input.profileId &&
    pending.input.objective === input.objective
  const sameAction = (
    action: AgentComposerActionState | undefined,
    input: {
      readonly sessionId: string
      readonly workspaceId: string
      readonly draftText: string
      readonly draftRevision: number
      readonly profileId: AgentProfileId
      readonly objective: string
    },
  ): action is AgentComposerActionState & { readonly agent: Readonly<AgentRecord> } =>
    action?.sessionId === input.sessionId &&
    action.workspaceId === input.workspaceId &&
    action.draftText === input.draftText &&
    action.draftRevision === input.draftRevision &&
    action.profileId === input.profileId &&
    action.objective === input.objective &&
    action.status === 'succeeded' &&
    action.agent !== null
  const reconcileConfirmedRepeat = async (
    input: {
      readonly sessionId: string
      readonly workspaceId: string
      readonly draftText: string
      readonly draftRevision: number
      readonly profileId: AgentProfileId
      readonly objective: string
    },
    action: AgentComposerActionState & { readonly agent: Readonly<AgentRecord> },
  ) => {
    requireActiveSource(input.sessionId, input.workspaceId)
    let settled = action
    if (!action.draftCleared) {
      try {
        const pending = await options.recovery.read(input.sessionId)
        if (pending && matchesInput(pending, input)) {
          const result = await clearDraftAfterConfirmation(pending)
          let error = result.error
          if (!result.keepPending) {
            try {
              await options.recovery.remove(input.sessionId, pending.operationKey)
            } catch (reason) {
              error = code(reason)
            }
          }
          settled = { ...action, draftCleared: result.cleared, error }
          replaceAction(settled)
        }
      } catch (reason) {
        settled = { ...action, error: code(reason) }
        replaceAction(settled)
      }
    }
    return {
      sessionId: input.sessionId,
      status: 'succeeded' as const,
      agentId: settled.agent.agentId,
      error: settled.error,
      draftCleared: settled.draftCleared,
    }
  }
  const invoke = async (
    input: {
      readonly sessionId: string
      readonly workspaceId: string
      readonly draftText: string
      readonly draftRevision: number
      readonly profileId: AgentProfileId
      readonly objective: string
    },
    execution: ExecuteOptions,
  ) => {
    const sessionId = input.sessionId
    const release = options.acquireCreateLock(sessionId)
    if (!release) throw new CommandError('BUSY', 'Agent creation is already in progress for this Session')
    try {
      const previousAction = state.reader.getSnapshot().actions[sessionId]
      if (sameAction(previousAction, input)) return await reconcileConfirmedRepeat(input, previousAction)

      let pending: PendingAgentCreate | null = null
      let wrotePending = false
      let action = makeAction(
        sessionId,
        input.workspaceId,
        input.draftText,
        input.draftRevision,
        input.profileId,
        input.objective,
        'submitting',
        null,
      )
      replaceAction(action)
      try {
        requireActiveSource(input.sessionId, input.workspaceId)
        pending = await options.recovery.read(sessionId)
        if (execution.signal?.aborted)
          throw new CommandError('CANCELLED', 'Agent creation was cancelled before dispatch')
        if (pending) {
          if (!matchesInput(pending, input)) {
            const recovered = await restorePending(sessionId, input.workspaceId).catch(() => null)
            const original = state.reader.getSnapshot().actions[sessionId]
            if (recovered?.origin && original) action = original
            throw new CommandError(
              'IDEMPOTENCY_CONFLICT',
              'Resolve the original pending Agent creation before changing it',
            )
          }
          requireRetryDraft(sessionId, pending)
          action = makeAction(
            sessionId,
            input.workspaceId,
            input.draftText,
            input.draftRevision,
            input.profileId,
            pending.input.objective,
            'submitting',
            null,
          )
          replaceAction(action)
        } else {
          if (previousAction?.status === 'unknown')
            throw new CommandError('PERSISTENCE_UNAVAILABLE', 'The unresolved Agent request key is unavailable')
          requireDraft(input.sessionId, input.draftText, input.draftRevision, true)
          const profiles = await refreshProfiles(execution.signal)
          if (execution.signal?.aborted)
            throw new CommandError('CANCELLED', 'Agent creation was cancelled before dispatch')
          if (!profiles.includes(input.profileId))
            throw new CommandError('INVALID_INPUT', 'Agent profile is not advertised by this Host')
          requireActiveSource(input.sessionId, input.workspaceId)
          requireDraft(input.sessionId, input.draftText, input.draftRevision, true)
          const controls = options.controls.getSnapshot()
          const model = controls.model
          if (
            controls.sessionId !== sessionId ||
            controls.status === 'loading' ||
            !model ||
            model.status !== 'configured' ||
            !model.modelId ||
            !model.model ||
            model.model.id !== model.modelId ||
            (model.thinkingLevel !== null && !model.model.thinkingLevels.includes(model.thinkingLevel))
          )
            throw new CommandError('INVALID_INPUT', 'Configure an available model for the selected Session first')
          const createInput = agentCreateInputSchema.parse({
            parentSessionId: sessionId,
            objective: input.objective,
            profileId: input.profileId,
            modelId: model.modelId,
            ...(model.thinkingLevel ? { thinkingLevel: model.thinkingLevel } : {}),
            approval: 'deny',
          })
          pending = {
            version: 1,
            hostId: runtimeOptions.hostId,
            parentSessionId: sessionId,
            operationKey: crypto.randomUUID(),
            input: createInput,
            origin: {
              kind: 'composer',
              workspaceId: input.workspaceId,
              draftText: input.draftText,
              draftRevision: input.draftRevision,
            },
          }
          await options.recovery.write(pending)
          wrotePending = true
          requireActiveSource(input.sessionId, input.workspaceId)
          requireDraft(input.sessionId, input.draftText, input.draftRevision, true)
        }
        if (execution.signal?.aborted || options.isDisposed())
          throw new CommandError('CANCELLED', 'Agent creation was cancelled before dispatch')
        requireActiveSource(input.sessionId, input.workspaceId)
        if (pending.origin) requireRetryDraft(sessionId, pending)
        else requireDraft(sessionId, input.draftText, input.draftRevision, true)
      } catch (reason) {
        const failure = commandFailure(reason)
        if (pending && wrotePending) {
          try {
            await options.recovery.remove(sessionId, pending.operationKey)
            replaceAction({ ...action, status: 'failed', error: failure.code })
          } catch (removeError) {
            replaceAction({ ...action, status: 'unknown', error: code(removeError) })
            throw commandFailure(removeError)
          }
        } else if (pending?.origin) {
          const original = state.reader.getSnapshot().actions[sessionId]
          replaceAction({ ...(original ?? action), status: 'unknown', error: failure.code })
        } else {
          replaceAction({
            ...action,
            status: previousAction?.status === 'unknown' ? 'unknown' : 'failed',
            error: failure.code,
          })
        }
        throw failure
      }
      if (!pending) throw new CommandError('PERSISTENCE_UNAVAILABLE', 'Agent creation recovery storage is unavailable')

      let created: AgentRecord
      try {
        created = await requireClient().execute('agent.create', pending.input, {
          idempotencyKey: pending.operationKey,
          requestId: pending.operationKey,
          ...(execution.signal ? { signal: execution.signal } : {}),
        })
      } catch (reason) {
        const error = code(reason)
        if (UNKNOWN_CODES.has(error)) {
          replaceAction({ ...action, status: 'unknown', error })
          throw commandFailure(reason)
        }
        try {
          await options.recovery.remove(sessionId, pending.operationKey)
        } catch (removeError) {
          replaceAction({ ...action, status: 'unknown', error: code(removeError) })
          throw commandFailure(removeError)
        }
        replaceAction({ ...action, status: 'failed', error })
        throw commandFailure(reason)
      }

      const cleared = await clearDraftAfterConfirmation(pending)
      let resultError = cleared.error
      if (!cleared.keepPending) {
        try {
          await options.recovery.remove(sessionId, pending.operationKey)
        } catch (reason) {
          resultError = code(reason)
        }
      }
      options.mergeCreatedRecord(created)
      replaceAction({
        ...action,
        status: 'succeeded',
        agent: created,
        draftCleared: cleared.cleared,
        error: resultError,
      })
      return {
        sessionId,
        status: 'succeeded' as const,
        agentId: created.agentId,
        error: resultError,
        draftCleared: cleared.cleared,
      }
    } finally {
      release()
    }
  }
  const openResult = async (
    input: { readonly sessionId: string; readonly workspaceId: string; readonly agentId: string },
    execution: ExecuteOptions,
  ) => {
    const action = state.reader.getSnapshot().actions[input.sessionId]
    if (
      !action ||
      action.status !== 'succeeded' ||
      action.workspaceId !== input.workspaceId ||
      action.agent?.agentId !== input.agentId
    )
      throw new CommandError('COMMAND_NOT_FOUND', 'Confirmed Agent result is no longer available')
    const agent = action.agent
    if (!agent) throw new CommandError('COMMAND_NOT_FOUND', 'Confirmed Agent result is no longer available')
    const source = requireActiveSource(input.sessionId, input.workspaceId)
    const existingWorkbench = options.tabs
      .getSnapshot()
      .items.find(
        (item) =>
          item.kind === 'workbench' &&
          options.surfaces.getSnapshot().panels[item.panelInstanceId]?.panelId === 'agents' &&
          options.surfaces.getSnapshot().panels[item.panelInstanceId]?.sessionId === input.sessionId,
      )
    if (existingWorkbench)
      throw new CommandError('COMMAND_CONFLICT', 'Switch to the existing Agents workbench before opening this result')
    const opened = z.strictObject({ instanceId: idSchema, visible: z.boolean() }).parse(
      await local.execute(
        'sessionTools.open',
        {
          panelId: 'agents',
          workspaceId: input.workspaceId,
          sessionId: input.sessionId,
          sourceTabInstanceKey: source.instanceKey,
        },
        execution,
      ),
    )
    await local.execute('agentWorkspace.refresh', { instanceId: opened.instanceId }, execution)
    if (!sourceStillMatches(input.sessionId, input.workspaceId, source.instanceKey))
      return { sessionId: input.sessionId, agentId: input.agentId, panelInstanceId: opened.instanceId, selected: false }
    const panel = options.surfaces.getSnapshot().panels[opened.instanceId]
    if (panel?.panelId !== 'agents' || panel.sessionId !== input.sessionId)
      throw new CommandError('STALE_TARGET', 'The Agents panel target changed before opening the result')
    options.mergeCreatedRecord(agent)
    const entry = options.surfaces.getSnapshot().panels[opened.instanceId]
    if (!entry) throw new CommandError('RESULT_UNKNOWN', 'The parent Agent list could not be refreshed')
    await local.execute(
      'agentWorkspace.showAgent',
      { instanceId: opened.instanceId, agentId: input.agentId },
      execution,
    )
    return { sessionId: input.sessionId, agentId: input.agentId, panelInstanceId: opened.instanceId, selected: true }
  }

  local.register(agentComposerCommands['agentComposer.refreshProfiles'], async (_input, execution) => [
    ...(await refreshProfiles(execution.signal)),
  ])
  local.register(agentComposerCommands['agentComposer.refresh'], refresh)
  local.register(agentComposerCommands['agentComposer.invoke'], invoke)
  local.register(agentComposerCommands['agentComposer.openResult'], openResult)

  const invalidateCatalog = () => {
    profileGeneration += 1
    profileRead?.controller.abort()
    profileRead = null
    state.replace({ ...state.reader.getSnapshot(), profileCatalog: { status: 'idle', profiles: [], error: null } })
  }
  const setConnected = (value: boolean) => {
    if (connected === value) return
    connected = value
    invalidateCatalog()
  }
  return {
    reader: state.reader,
    invalidateCatalog,
    setConnected,
    dispose() {
      profileGeneration += 1
      profileRead?.controller.abort()
      profileRead = null
      state.dispose()
    },
  }
}

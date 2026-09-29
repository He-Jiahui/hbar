import { CommandError, createCommandClient, type CommandRegistry } from '@hbar/commands'
import { agentWorkspaceCommands } from '@hbar/contracts/commands/agent-workspace'
import {
  agentCommands,
  agentCreateInputSchema,
  agentProfileIdSchema,
  type AgentCreateInput,
  type AgentRecord,
} from '@hbar/contracts/commands/agents'
import { modelCommands } from '@hbar/contracts/commands/models'
import { z } from 'zod'
import { createState, type StateReader } from './state'
import type {
  AgentWorkspaceDraftState,
  AgentWorkspaceEntryState,
  AgentWorkspaceState,
  ClientJsonObject,
  RuntimeOptions,
  SessionControlsState,
  SurfaceState,
} from './types'

const PAGE_SIZE = 50
const MAX_AGENTS = 500
const MAX_PANELS = 8
const MAX_PENDING_CREATE_BYTES = 16 * 1024
const UNKNOWN_CODES = new Set(['RESULT_UNKNOWN', 'DISCONNECTED', 'TIMEOUT'])
const pendingCreateSchema = z.strictObject({
  version: z.literal(1),
  hostId: z.string().min(1).max(160),
  parentSessionId: z.string().min(1).max(160),
  operationKey: z.string().min(1).max(128),
  input: agentCreateInputSchema.refine((value) => !value.patchTask && !value.reviewTask),
})
type PendingCreate = z.output<typeof pendingCreateSchema>

function code(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

function commandFailure(reason: unknown): CommandError {
  if (reason instanceof CommandError) return reason
  return new CommandError(code(reason), reason instanceof Error ? reason.message : 'Agent operation failed')
}

function initialDraft(modelId = ''): AgentWorkspaceDraftState {
  return {
    objective: '',
    profileId: '',
    modelId,
    title: '',
    tokenBudget: '',
    thinkingLevel: '',
    approval: 'deny',
    revision: 0,
    issues: {},
  }
}

function draftFromCreateInput(input: AgentCreateInput, revision: number): AgentWorkspaceDraftState {
  return {
    objective: input.objective,
    profileId: input.profileId ?? '',
    modelId: input.modelId,
    title: input.title ?? '',
    tokenBudget: input.tokenBudget === undefined ? '' : String(input.tokenBudget),
    thinkingLevel: input.thinkingLevel ?? '',
    approval: input.approval,
    revision,
    issues: {},
  }
}

function createInputMatches(left: AgentCreateInput, right: AgentCreateInput): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function pendingCreateJson(pending: PendingCreate): ClientJsonObject {
  return {
    version: pending.version,
    hostId: pending.hostId,
    parentSessionId: pending.parentSessionId,
    operationKey: pending.operationKey,
    input: {
      parentSessionId: pending.input.parentSessionId,
      objective: pending.input.objective,
      ...(pending.input.profileId ? { profileId: pending.input.profileId } : {}),
      modelId: pending.input.modelId,
      ...(pending.input.title ? { title: pending.input.title } : {}),
      ...(pending.input.tokenBudget === undefined ? {} : { tokenBudget: pending.input.tokenBudget }),
      ...(pending.input.thinkingLevel ? { thinkingLevel: pending.input.thinkingLevel } : {}),
      approval: pending.input.approval,
    },
  }
}

function serializedBytes(value: unknown): number {
  let serialized: string | undefined
  try {
    serialized = JSON.stringify(value)
  } catch {
    throw new CommandError('INVALID_PERSISTED_STATE', 'Pending agent creation is not serializable')
  }
  if (serialized === undefined)
    throw new CommandError('INVALID_PERSISTED_STATE', 'Pending agent creation is not serializable')
  return new TextEncoder().encode(serialized).byteLength
}

function createInput(draft: AgentWorkspaceDraftState, parentSessionId: string) {
  const tokenBudget = draft.tokenBudget.trim()
  return agentCreateInputSchema.parse({
    parentSessionId,
    objective: draft.objective,
    ...(draft.profileId ? { profileId: draft.profileId } : {}),
    modelId: draft.modelId,
    ...(draft.title.trim() ? { title: draft.title } : {}),
    ...(tokenBudget ? { tokenBudget: Number(tokenBudget) } : {}),
    ...(draft.thinkingLevel ? { thinkingLevel: draft.thinkingLevel } : {}),
    approval: draft.approval,
  })
}

function fieldIssues(reason: unknown): Readonly<Record<string, string>> {
  if (!(reason instanceof z.ZodError)) return {}
  return Object.fromEntries(
    reason.issues.flatMap((issue) => {
      const field = issue.path[0]
      return typeof field === 'string' ? [[field, 'INVALID_INPUT']] : []
    }),
  )
}

function terminal(status: AgentRecord['status']): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'failed' || status === 'interrupted'
}

export function createAgentWorkspace(
  local: CommandRegistry,
  options: RuntimeOptions,
  surfaces: StateReader<SurfaceState>,
  controls: StateReader<SessionControlsState>,
  onSubscriberError: (error: unknown) => void,
  isDisposed: () => boolean,
) {
  const state = createState<AgentWorkspaceState>(
    { entries: {}, catalog: { status: 'idle', models: [], error: null } },
    onSubscriberError,
  )
  const client = options.agents ? createCommandClient(agentCommands, options.agents) : null
  const models = options.models ? createCommandClient(modelCommands, options.models) : null
  let connected = true
  let catalogGeneration = 0
  let catalogRead: {
    readonly controller: AbortController
    readonly promise: Promise<AgentWorkspaceState['catalog']>
  } | null = null
  const generations = new Map<string, number>()
  const inFlightCreateSessions = new Set<string>()
  const pendingCreateStorageKey = (parentSessionId: string) =>
    `hbar:agent-workspace:pending-create:${encodeURIComponent(options.hostId)}:${encodeURIComponent(parentSessionId)}`
  const persistenceUnavailable = () =>
    new CommandError('PERSISTENCE_UNAVAILABLE', 'Agent creation recovery storage is unavailable')
  const readPendingCreate = async (parentSessionId: string): Promise<PendingCreate | null> => {
    const persistence = options.persistence
    if (!persistence) throw persistenceUnavailable()
    let value: unknown
    try {
      value = await persistence.read(pendingCreateStorageKey(parentSessionId))
    } catch {
      throw persistenceUnavailable()
    }
    if (value === null || value === undefined) return null
    const parsed = pendingCreateSchema.safeParse(value)
    if (
      !parsed.success ||
      parsed.data.hostId !== options.hostId ||
      parsed.data.parentSessionId !== parentSessionId ||
      parsed.data.input.parentSessionId !== parentSessionId
    )
      throw new CommandError('INVALID_PERSISTED_STATE', 'Pending agent creation does not match this Host session')
    if (serializedBytes(pendingCreateJson(parsed.data)) > MAX_PENDING_CREATE_BYTES)
      throw new CommandError('INVALID_PERSISTED_STATE', 'Pending agent creation exceeds its storage limit')
    return parsed.data
  }
  const writePendingCreate = async (pending: PendingCreate) => {
    const persistence = options.persistence
    if (!persistence) throw persistenceUnavailable()
    const value = pendingCreateJson(pending)
    if (serializedBytes(value) > MAX_PENDING_CREATE_BYTES)
      throw new CommandError('PERSISTENCE_LIMIT', 'Pending agent creation exceeds its storage limit')
    try {
      await persistence.write(pendingCreateStorageKey(pending.parentSessionId), value)
    } catch {
      throw persistenceUnavailable()
    }
  }
  const removePendingCreate = async (parentSessionId: string, operationKey: string) => {
    const persistence = options.persistence
    if (!persistence) throw persistenceUnavailable()
    const pending = await readPendingCreate(parentSessionId)
    if (!pending) return
    if (pending.operationKey !== operationKey)
      throw new CommandError('IDEMPOTENCY_CONFLICT', 'Pending agent creation changed before it could be cleared')
    try {
      await persistence.remove(pendingCreateStorageKey(parentSessionId))
    } catch {
      throw persistenceUnavailable()
    }
  }
  const replaceForTarget = (entry: AgentWorkspaceEntryState) => {
    const current = surfaces.getSnapshot().panels[entry.instanceId]
    if (current?.panelId === 'agents' && current.sessionId === entry.parentSessionId) replace(entry)
  }
  let previousPanels = surfaces.getSnapshot().panels
  const offSurfaces = surfaces.subscribe(() => {
    const panels = surfaces.getSnapshot().panels
    const removed = Object.entries(previousPanels).filter(([id, panel]) => panel.panelId === 'agents' && !panels[id])
    previousPanels = panels
    if (!removed.length) return
    const ids = new Set(removed.map(([id]) => id))
    for (const id of ids) generations.delete(id)
    const snapshot = state.reader.getSnapshot()
    const noAgentPanels = !Object.values(panels).some((value) => value.panelId === 'agents')
    if (noAgentPanels) {
      catalogGeneration += 1
      catalogRead?.controller.abort()
      catalogRead = null
    }
    state.replace({
      ...snapshot,
      entries: Object.fromEntries(Object.entries(snapshot.entries).filter(([id]) => !ids.has(id))),
      ...(noAgentPanels ? { catalog: { status: 'idle', models: [], error: null } } : {}),
    })
  })

  const panel = (instanceId: string) => {
    const value = surfaces.getSnapshot().panels[instanceId]
    if (!value || value.panelId !== 'agents') throw new CommandError('COMMAND_NOT_FOUND', 'Agent panel is not open')
    if (!value.sessionId) throw new CommandError('INVALID_INPUT', 'Agent panel requires a session target')
    return { ...value, sessionId: value.sessionId }
  }
  const requireClient = () => {
    if (!client) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Agent commands are unavailable')
    return client
  }
  const replace = (entry: AgentWorkspaceEntryState) => {
    const current = state.reader.getSnapshot()
    const entries = { ...current.entries, [entry.instanceId]: entry }
    const ids = Object.keys(entries)
    if (ids.length > MAX_PANELS)
      for (const id of ids) {
        if (id !== entry.instanceId && !surfaces.getSnapshot().panels[id]) {
          delete entries[id]
          break
        }
      }
    state.replace({ ...current, entries })
  }
  const updateSessionEntries = (
    parentSessionId: string,
    update: (entry: AgentWorkspaceEntryState) => AgentWorkspaceEntryState,
  ) => {
    if (isDisposed()) return
    const current = state.reader.getSnapshot()
    const entries = { ...current.entries }
    let changed = false
    for (const [instanceId, entry] of Object.entries(current.entries)) {
      const target = surfaces.getSnapshot().panels[instanceId]
      if (
        entry.parentSessionId !== parentSessionId ||
        target?.panelId !== 'agents' ||
        target.sessionId !== parentSessionId
      )
        continue
      entries[instanceId] = update(entry)
      changed = true
    }
    if (changed) state.replace({ ...current, entries })
  }
  const refreshModels = (instanceId: string) => {
    panel(instanceId)
    if (catalogRead) return catalogRead.promise
    const controller = new AbortController()
    const generation = ++catalogGeneration
    const current = state.reader.getSnapshot()
    state.replace({ ...current, catalog: { ...current.catalog, status: 'loading', error: null } })
    const promise = Promise.resolve().then(async (): Promise<AgentWorkspaceState['catalog']> => {
      try {
        if (!connected) throw new CommandError('DISCONNECTED', 'Model catalog needs a connection')
        if (!models) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Model catalog is unavailable')
        const result = await models.execute('model.list', {}, { signal: controller.signal })
        if (new Set(result.map((model) => model.id)).size !== result.length)
          throw new CommandError('INVALID_OUTPUT', 'Model catalog contains duplicate IDs')
        if (isDisposed() || controller.signal.aborted || generation !== catalogGeneration)
          throw new CommandError('CANCELLED', 'Model catalog read was superseded')
        const catalog = { status: 'ready' as const, models: result, error: null }
        state.replace({ ...state.reader.getSnapshot(), catalog })
        return catalog
      } catch (reason) {
        if (!isDisposed() && !controller.signal.aborted && generation === catalogGeneration)
          state.replace({
            ...state.reader.getSnapshot(),
            catalog: { status: 'error', models: [], error: code(reason) },
          })
        throw commandFailure(reason)
      } finally {
        if (catalogRead?.controller === controller) catalogRead = null
      }
    })
    catalogRead = { controller, promise }
    return promise
  }
  const invalidateModels = () => {
    catalogGeneration += 1
    catalogRead?.controller.abort()
    catalogRead = null
    const current = state.reader.getSnapshot()
    state.replace({ ...current, catalog: { status: 'idle', models: [], error: null } })
    const openCreate = Object.values(current.entries).find(
      (entry) =>
        entry.view === 'create' && surfaces.getSnapshot().panels[entry.instanceId]?.sessionId === entry.parentSessionId,
    )
    if (connected && openCreate) void refreshModels(openCreate.instanceId).catch(() => {})
  }
  const setConnected = (value: boolean) => {
    if (connected === value) return
    connected = value
    invalidateModels()
  }
  const summary = (entry: AgentWorkspaceEntryState) => ({
    instanceId: entry.instanceId,
    parentSessionId: entry.parentSessionId,
    view: entry.view,
    selectedAgentId: entry.selectedAgentId,
    status: entry.status,
    itemCount: entry.items.length,
    hasMore: entry.nextCursor !== null,
    creationStatus: entry.creation.status,
    error: entry.creation.error ?? entry.error,
  })
  const load = async (instanceId: string) => {
    const target = panel(instanceId)
    const previous = state.reader.getSnapshot().entries[instanceId]
    const sameTarget = previous?.parentSessionId === target.sessionId
    const modelId =
      controls.getSnapshot().sessionId === target.sessionId ? (controls.getSnapshot().model?.modelId ?? '') : ''
    const generation = (generations.get(instanceId) ?? 0) + 1
    generations.set(instanceId, generation)
    const loading: AgentWorkspaceEntryState = {
      instanceId,
      parentSessionId: target.sessionId,
      view: sameTarget ? previous.view : 'list',
      selectedAgentId: sameTarget ? previous.selectedAgentId : null,
      status: 'loading',
      items: sameTarget ? previous.items : [],
      nextCursor: null,
      draft: sameTarget ? previous.draft : initialDraft(modelId),
      creation: sameTarget ? previous.creation : { status: 'idle', error: null },
      actions: sameTarget ? previous.actions : {},
      error: null,
    }
    replace(loading)
    try {
      const pending = options.persistence ? await readPendingCreate(target.sessionId) : null
      const page = await requireClient().execute('agent.list', {
        parentSessionId: target.sessionId,
        limit: PAGE_SIZE,
      })
      if (isDisposed() || generations.get(instanceId) !== generation)
        throw new CommandError('RESULT_UNKNOWN', 'Agent listing was superseded')
      const actions = { ...loading.actions }
      for (const item of page.items)
        if (terminal(item.status) || item.status === 'cancelRequested') delete actions[item.agentId]
      const selectedAgentId = page.items.some((item) => item.agentId === loading.selectedAgentId)
        ? loading.selectedAgentId
        : null
      const ready = {
        ...loading,
        view: pending
          ? ('create' as const)
          : loading.view === 'detail' && selectedAgentId === null
            ? ('list' as const)
            : loading.view,
        selectedAgentId: pending ? null : selectedAgentId,
        status: 'ready' as const,
        items: page.items,
        nextCursor: page.nextCursor,
        actions,
        ...(pending
          ? {
              draft: draftFromCreateInput(pending.input, loading.draft.revision),
              creation: {
                status: inFlightCreateSessions.has(target.sessionId) ? ('submitting' as const) : ('unknown' as const),
                error: inFlightCreateSessions.has(target.sessionId) ? null : 'RESULT_UNKNOWN',
              },
            }
          : loading.creation.status === 'unknown'
            ? { creation: { status: 'unknown' as const, error: 'PERSISTENCE_UNAVAILABLE' } }
            : {}),
      }
      replace(ready)
      return summary(ready)
    } catch (reason) {
      if (isDisposed() || generations.get(instanceId) !== generation) throw reason
      const failed = { ...loading, status: 'error' as const, error: code(reason) }
      replace(failed)
      throw commandFailure(reason)
    }
  }
  const loadMore = async (instanceId: string) => {
    const entry = state.reader.getSnapshot().entries[instanceId]
    if (!entry) return load(instanceId)
    if (!entry.nextCursor) return summary(entry)
    const target = panel(instanceId)
    const page = await requireClient().execute('agent.list', {
      parentSessionId: target.sessionId,
      after: entry.nextCursor,
      limit: PAGE_SIZE,
    })
    const items = [...new Map([...entry.items, ...page.items].map((item) => [item.agentId, item])).values()].slice(
      0,
      MAX_AGENTS,
    )
    const next = {
      ...entry,
      items,
      nextCursor: items.length >= MAX_AGENTS ? null : page.nextCursor,
      status: 'ready' as const,
      error: null,
    }
    replace(next)
    return summary(next)
  }
  const showList = (instanceId: string) => {
    const entry = state.reader.getSnapshot().entries[instanceId]
    const target = panel(instanceId)
    if (!entry || entry.parentSessionId !== target.sessionId)
      throw new CommandError('RESULT_UNKNOWN', 'Refresh agent panel target')
    const next = { ...entry, view: 'list' as const, selectedAgentId: null }
    replace(next)
    return summary(next)
  }
  const showCreate = (instanceId: string) => {
    const entry = state.reader.getSnapshot().entries[instanceId]
    const target = panel(instanceId)
    if (!entry || entry.parentSessionId !== target.sessionId)
      throw new CommandError('RESULT_UNKNOWN', 'Refresh agent panel target')
    const next = { ...entry, view: 'create' as const, selectedAgentId: null }
    replace(next)
    if (state.reader.getSnapshot().catalog.status === 'idle' || state.reader.getSnapshot().catalog.status === 'error')
      void refreshModels(instanceId).catch(() => {})
    return summary(next)
  }
  const showAgent = (instanceId: string, agentId: string) => {
    const entry = state.reader.getSnapshot().entries[instanceId]
    const target = panel(instanceId)
    if (!entry || entry.parentSessionId !== target.sessionId)
      throw new CommandError('RESULT_UNKNOWN', 'Refresh agent panel target')
    if (!entry.items.some((item) => item.agentId === agentId))
      throw new CommandError('COMMAND_NOT_FOUND', 'Child agent is not available in this panel')
    const next = { ...entry, view: 'detail' as const, selectedAgentId: agentId }
    replace(next)
    return summary(next)
  }
  const setField = (
    instanceId: string,
    field: keyof Omit<AgentWorkspaceDraftState, 'revision' | 'issues'>,
    value: string,
  ) => {
    const entry = state.reader.getSnapshot().entries[instanceId]
    if (!entry) throw new CommandError('COMMAND_NOT_FOUND', 'Agent workspace is not loaded')
    if (entry.view !== 'create') throw new CommandError('INVALID_INPUT', 'Open the creation form before editing it')
    if (entry.creation.status === 'submitting' || entry.creation.status === 'unknown')
      throw new CommandError('BUSY', 'Resolve the pending agent creation before editing its fields')
    if (field === 'profileId' && value && !agentProfileIdSchema.safeParse(value).success)
      throw new CommandError('INVALID_INPUT', 'Unknown agent profile')
    const issues = { ...entry.draft.issues }
    delete issues[field]
    const selectedModel =
      field === 'modelId' ? state.reader.getSnapshot().catalog.models.find((model) => model.id === value) : undefined
    const draft = {
      ...entry.draft,
      [field]: field === 'approval' && !['deny', 'ask', 'allow'].includes(value) ? entry.draft.approval : value,
      ...(field === 'modelId' &&
      (!selectedModel || !selectedModel.thinkingLevels.some((level) => level === entry.draft.thinkingLevel))
        ? { thinkingLevel: '' }
        : {}),
      revision: entry.draft.revision + 1,
      issues,
    } as AgentWorkspaceDraftState
    const next = { ...entry, draft, creation: { status: 'idle' as const, error: null } }
    replace(next)
    return summary(next)
  }
  const createForPanel = async (instanceId: string) => {
    const target = panel(instanceId)
    const panelAtStart = surfaces.getSnapshot().panels[instanceId]
    const entry = state.reader.getSnapshot().entries[instanceId]
    if (!entry || entry.parentSessionId !== target.sessionId)
      throw new CommandError('RESULT_UNKNOWN', 'Refresh agent panel target')
    if (entry.view !== 'create') throw new CommandError('INVALID_INPUT', 'Open the creation form before submitting it')
    if (entry.creation.status === 'submitting') throw new CommandError('BUSY', 'Agent creation is already in progress')
    if (!options.persistence) {
      const failed = { ...entry, creation: { status: 'failed' as const, error: 'PERSISTENCE_UNAVAILABLE' } }
      replaceForTarget(failed)
      throw persistenceUnavailable()
    }
    let input: AgentCreateInput
    try {
      input = createInput(entry.draft, entry.parentSessionId)
    } catch (reason) {
      const failed = {
        ...entry,
        draft: { ...entry.draft, issues: fieldIssues(reason) },
        creation: { status: 'failed' as const, error: 'INVALID_INPUT' },
      }
      replace(failed)
      throw new CommandError('INVALID_INPUT', 'Agent creation fields are invalid')
    }
    let pending: PendingCreate | null
    try {
      pending = await readPendingCreate(target.sessionId)
    } catch (reason) {
      const failed = {
        ...entry,
        creation: {
          status: entry.creation.status === 'unknown' ? ('unknown' as const) : ('failed' as const),
          error: code(reason),
        },
      }
      replaceForTarget(failed)
      throw commandFailure(reason)
    }
    const isSubmissionTargetCurrent = (revision: number, expectedInput: AgentCreateInput) => {
      const currentPanel = surfaces.getSnapshot().panels[instanceId]
      const currentEntry = state.reader.getSnapshot().entries[instanceId]
      if (
        isDisposed() ||
        currentPanel !== panelAtStart ||
        currentPanel?.panelId !== 'agents' ||
        currentPanel.sessionId !== target.sessionId ||
        !currentEntry ||
        currentEntry.parentSessionId !== target.sessionId ||
        currentEntry.view !== 'create' ||
        currentEntry.draft.revision !== revision
      )
        return false
      try {
        return createInputMatches(createInput(currentEntry.draft, target.sessionId), expectedInput)
      } catch {
        return false
      }
    }
    if (!isSubmissionTargetCurrent(entry.draft.revision, input))
      throw new CommandError('VERSION_CONFLICT', 'Agent creation target changed before submission')
    const latestEntry = state.reader.getSnapshot().entries[instanceId]!
    if (pending && entry.creation.status !== 'unknown') {
      const restored = {
        ...latestEntry,
        view: 'create' as const,
        selectedAgentId: null,
        draft: draftFromCreateInput(pending.input, latestEntry.draft.revision),
        creation: { status: 'unknown' as const, error: 'RESULT_UNKNOWN' },
      }
      replaceForTarget(restored)
      throw new CommandError('BUSY', 'Review the unresolved agent creation before retrying it')
    }
    if (pending && !createInputMatches(input, pending.input)) {
      const failed = {
        ...latestEntry,
        creation: { status: 'unknown' as const, error: 'IDEMPOTENCY_CONFLICT' },
      }
      replaceForTarget(failed)
      throw new CommandError('IDEMPOTENCY_CONFLICT', 'An unresolved agent creation cannot be changed or replayed')
    }
    if (!pending && entry.creation.status === 'unknown') {
      const failed = { ...latestEntry, creation: { status: 'unknown' as const, error: 'PERSISTENCE_UNAVAILABLE' } }
      replaceForTarget(failed)
      throw persistenceUnavailable()
    }
    const submittedRevision = latestEntry.draft.revision
    replaceForTarget({ ...latestEntry, creation: { status: 'submitting', error: null } })
    if (!pending) {
      const createdPending = pendingCreateSchema.parse({
        version: 1,
        hostId: options.hostId,
        parentSessionId: target.sessionId,
        operationKey: crypto.randomUUID(),
        input,
      })
      try {
        await writePendingCreate(createdPending)
      } catch (reason) {
        updateSessionEntries(target.sessionId, (current) => ({
          ...current,
          creation: { status: 'failed', error: code(reason) },
        }))
        throw commandFailure(reason)
      }
      pending = createdPending
      if (!isSubmissionTargetCurrent(submittedRevision, createdPending.input)) {
        try {
          await removePendingCreate(target.sessionId, createdPending.operationKey)
        } catch (reason) {
          updateSessionEntries(target.sessionId, (current) => ({
            ...current,
            view: 'create',
            selectedAgentId: null,
            draft: draftFromCreateInput(createdPending.input, current.draft.revision),
            creation: { status: 'unknown', error: code(reason) },
          }))
          throw commandFailure(reason)
        }
        throw new CommandError('CANCELLED', 'Agent creation target closed or changed before dispatch')
      }
    }
    const dispatchPending = pending
    if (!dispatchPending) throw persistenceUnavailable()
    let created: AgentRecord
    try {
      created = await requireClient().execute('agent.create', dispatchPending.input, {
        idempotencyKey: dispatchPending.operationKey,
        requestId: dispatchPending.operationKey,
      })
    } catch (reason) {
      const error = code(reason)
      if (UNKNOWN_CODES.has(error)) {
        updateSessionEntries(target.sessionId, (current) => ({
          ...current,
          view: 'create',
          selectedAgentId: null,
          draft: draftFromCreateInput(dispatchPending.input, current.draft.revision),
          creation: { status: 'unknown', error },
        }))
        throw commandFailure(reason)
      }
      try {
        await removePendingCreate(target.sessionId, dispatchPending.operationKey)
      } catch (persistenceError) {
        updateSessionEntries(target.sessionId, (current) => ({
          ...current,
          view: 'create',
          selectedAgentId: null,
          draft: draftFromCreateInput(dispatchPending.input, current.draft.revision),
          creation: { status: 'unknown', error: code(persistenceError) },
        }))
        throw commandFailure(persistenceError)
      }
      updateSessionEntries(target.sessionId, (current) => ({
        ...current,
        creation: { status: 'failed', error },
      }))
      throw commandFailure(reason)
    }
    try {
      await removePendingCreate(target.sessionId, dispatchPending.operationKey)
    } catch (reason) {
      updateSessionEntries(target.sessionId, (entry) => ({
        ...entry,
        view: 'create',
        selectedAgentId: null,
        status: 'ready',
        items: [...new Map([created, ...entry.items].map((item) => [item.agentId, item])).values()],
        draft: draftFromCreateInput(dispatchPending.input, entry.draft.revision),
        creation: { status: 'unknown', error: code(reason) },
        error: null,
      }))
      throw commandFailure(reason)
    }
    const latest = state.reader.getSnapshot().entries[instanceId]
    const current = latest?.parentSessionId === target.sessionId ? latest : latestEntry
    const items = [...new Map([created, ...current.items].map((item) => [item.agentId, item])).values()]
    const draft =
      current.draft.revision === submittedRevision
        ? {
            ...current.draft,
            objective: '',
            title: '',
            tokenBudget: '',
            issues: {},
            revision: current.draft.revision + 1,
          }
        : current.draft
    const succeeded: AgentWorkspaceEntryState = {
      ...current,
      view: 'detail',
      selectedAgentId: created.agentId,
      status: 'ready',
      items,
      draft,
      creation: { status: 'succeeded', error: null },
      error: null,
    }
    updateSessionEntries(target.sessionId, (entry) => {
      if (entry.instanceId === instanceId) return succeeded
      const sessionItems = [...new Map([created, ...entry.items].map((item) => [item.agentId, item])).values()]
      const sessionDraft =
        entry.draft.revision === submittedRevision
          ? {
              ...entry.draft,
              objective: '',
              title: '',
              tokenBudget: '',
              issues: {},
              revision: entry.draft.revision + 1,
            }
          : entry.draft
      return {
        ...entry,
        view: 'list',
        selectedAgentId: null,
        status: 'ready',
        items: sessionItems,
        draft: sessionDraft,
        creation: { status: 'succeeded', error: null },
        error: null,
      }
    })
    return summary(succeeded)
  }
  const create = async (instanceId: string) => {
    const target = panel(instanceId)
    if (inFlightCreateSessions.has(target.sessionId))
      throw new CommandError('BUSY', 'Agent creation is already in progress for this session')
    inFlightCreateSessions.add(target.sessionId)
    try {
      return await createForPanel(instanceId)
    } finally {
      inFlightCreateSessions.delete(target.sessionId)
    }
  }
  const cancel = async (instanceId: string, agentId: string) => {
    const entry = state.reader.getSnapshot().entries[instanceId]
    const target = panel(instanceId)
    const item = entry?.items.find((candidate) => candidate.agentId === agentId)
    if (!entry || entry.parentSessionId !== target.sessionId || !item)
      throw new CommandError('COMMAND_NOT_FOUND', 'Child agent is not available in this panel')
    if (terminal(item.status)) return summary(entry)
    const current = entry.actions[agentId]
    if (current?.status === 'submitting') throw new CommandError('BUSY', 'Agent cancellation is already in progress')
    replace({
      ...entry,
      actions: { ...entry.actions, [agentId]: { status: 'submitting', error: null } },
    })
    try {
      const cancelled = await requireClient().execute('agent.cancel', {
        parentSessionId: entry.parentSessionId,
        agentId,
      })
      const latest = state.reader.getSnapshot().entries[instanceId] ?? entry
      const succeeded = {
        ...latest,
        items: latest.items.map((candidate) => (candidate.agentId === agentId ? cancelled : candidate)),
        actions: { ...latest.actions, [agentId]: { status: 'succeeded' as const, error: null } },
      }
      replace(succeeded)
      return summary(succeeded)
    } catch (reason) {
      const latest = state.reader.getSnapshot().entries[instanceId] ?? entry
      const error = code(reason)
      const failed = {
        ...latest,
        actions: {
          ...latest.actions,
          [agentId]: { status: UNKNOWN_CODES.has(error) ? ('unknown' as const) : ('failed' as const), error },
        },
      }
      replace(failed)
      throw commandFailure(reason)
    }
  }

  local.register(agentWorkspaceCommands['agentWorkspace.refresh'], ({ instanceId }) => load(instanceId))
  local.register(agentWorkspaceCommands['agentWorkspace.loadMore'], ({ instanceId }) => loadMore(instanceId))
  local.register(agentWorkspaceCommands['agentWorkspace.showList'], ({ instanceId }) => showList(instanceId))
  local.register(agentWorkspaceCommands['agentWorkspace.showCreate'], ({ instanceId }) => showCreate(instanceId))
  local.register(agentWorkspaceCommands['agentWorkspace.refreshModels'], async ({ instanceId }) => {
    try {
      const catalog = await refreshModels(instanceId)
      return { status: 'ready' as const, itemCount: catalog.models.length, error: null }
    } catch (reason) {
      const catalog = state.reader.getSnapshot().catalog
      return { status: 'error' as const, itemCount: catalog.models.length, error: code(reason) }
    }
  })
  local.register(agentWorkspaceCommands['agentWorkspace.showAgent'], ({ instanceId, agentId }) =>
    showAgent(instanceId, agentId),
  )
  local.register(agentWorkspaceCommands['agentWorkspace.setField'], ({ instanceId, field, value }) =>
    setField(instanceId, field, value),
  )
  local.register(agentWorkspaceCommands['agentWorkspace.create'], ({ instanceId }) => create(instanceId))
  local.register(agentWorkspaceCommands['agentWorkspace.cancel'], ({ instanceId, agentId }) =>
    cancel(instanceId, agentId),
  )
  return {
    reader: state.reader,
    invalidateModels,
    setConnected,
    dispose() {
      offSurfaces()
      catalogGeneration += 1
      catalogRead?.controller.abort()
      catalogRead = null
      generations.clear()
      inFlightCreateSessions.clear()
      state.dispose()
    },
  }
}

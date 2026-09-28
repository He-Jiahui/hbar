import { CommandError, createCommandClient, type CommandRegistry } from '@hbar/commands'
import { agentWorkspaceCommands } from '@hbar/contracts/commands/agent-workspace'
import {
  agentCommands,
  agentCreateInputSchema,
  agentProfileIdSchema,
  type AgentRecord,
} from '@hbar/contracts/commands/agents'
import { modelCommands } from '@hbar/contracts/commands/models'
import { z } from 'zod'
import { createState, type StateReader } from './state'
import type {
  AgentWorkspaceDraftState,
  AgentWorkspaceEntryState,
  AgentWorkspaceState,
  RuntimeOptions,
  SessionControlsState,
  SurfaceState,
} from './types'

const PAGE_SIZE = 50
const MAX_AGENTS = 500
const MAX_PANELS = 8
const UNKNOWN_CODES = new Set(['RESULT_UNKNOWN', 'DISCONNECTED', 'TIMEOUT'])

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
  const pendingCreateKeys = new Map<string, string>()
  let previousPanels = surfaces.getSnapshot().panels
  const offSurfaces = surfaces.subscribe(() => {
    const panels = surfaces.getSnapshot().panels
    const removed = Object.entries(previousPanels).filter(([id, panel]) => panel.panelId === 'agents' && !panels[id])
    previousPanels = panels
    if (!removed.length) return
    const ids = new Set(removed.map(([id]) => id))
    for (const id of ids) {
      generations.delete(id)
      pendingCreateKeys.delete(id)
    }
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
          pendingCreateKeys.delete(id)
          break
        }
      }
    state.replace({ ...current, entries })
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
    if (!sameTarget) pendingCreateKeys.delete(instanceId)
    replace(loading)
    try {
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
        view: loading.view === 'detail' && selectedAgentId === null ? ('list' as const) : loading.view,
        selectedAgentId,
        status: 'ready' as const,
        items: page.items,
        nextCursor: page.nextCursor,
        actions,
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
  const create = async (instanceId: string) => {
    const entry = state.reader.getSnapshot().entries[instanceId]
    const target = panel(instanceId)
    if (!entry || entry.parentSessionId !== target.sessionId)
      throw new CommandError('RESULT_UNKNOWN', 'Refresh agent panel target')
    if (entry.view !== 'create') throw new CommandError('INVALID_INPUT', 'Open the creation form before submitting it')
    if (entry.creation.status === 'submitting') throw new CommandError('BUSY', 'Agent creation is already in progress')
    let input
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
    const submittedRevision = entry.draft.revision
    const operationKey = pendingCreateKeys.get(instanceId) ?? crypto.randomUUID()
    pendingCreateKeys.set(instanceId, operationKey)
    replace({ ...entry, creation: { status: 'submitting', error: null } })
    try {
      const created = await requireClient().execute('agent.create', input, {
        idempotencyKey: operationKey,
        requestId: operationKey,
      })
      const latest = state.reader.getSnapshot().entries[instanceId] ?? entry
      const items = [...new Map([created, ...latest.items].map((item) => [item.agentId, item])).values()]
      const draft =
        latest.draft.revision === submittedRevision
          ? {
              ...latest.draft,
              objective: '',
              title: '',
              tokenBudget: '',
              issues: {},
              revision: latest.draft.revision + 1,
            }
          : latest.draft
      const succeeded = {
        ...latest,
        view: 'detail' as const,
        selectedAgentId: created.agentId,
        status: 'ready' as const,
        items,
        draft,
        creation: { status: 'succeeded' as const, error: null },
        error: null,
      }
      pendingCreateKeys.delete(instanceId)
      replace(succeeded)
      return summary(succeeded)
    } catch (reason) {
      const latest = state.reader.getSnapshot().entries[instanceId] ?? entry
      const error = code(reason)
      const failed = {
        ...latest,
        creation: { status: UNKNOWN_CODES.has(error) ? ('unknown' as const) : ('failed' as const), error },
      }
      if (!UNKNOWN_CODES.has(error)) pendingCreateKeys.delete(instanceId)
      replace(failed)
      throw commandFailure(reason)
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
      pendingCreateKeys.clear()
      state.dispose()
    },
  }
}

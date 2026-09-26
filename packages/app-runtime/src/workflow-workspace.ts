import { CommandError, createCommandClient, type CommandRegistry } from '@hbar/commands'
import type { AgentRecord } from '@hbar/contracts/commands/agents'
import { agentCommands } from '@hbar/contracts/commands/agents'
import { workflowWorkspaceCommands } from '@hbar/contracts/commands/workflow-workspace'
import { workflowCommands } from '@hbar/contracts/commands/workflows'
import type { WorkflowSnapshot } from '@hbar/contracts'
import { createState, type StateReader } from './state'
import { isSessionToolVisible } from './session-tool-visibility'
import type {
  PresentationState,
  RuntimeOptions,
  SurfaceState,
  WorkflowWorkspaceActionState,
  WorkflowWorkspaceEntryState,
  WorkflowWorkspaceState,
} from './types'

const MAX_PANELS = 8
const AGENT_QUERY_CONCURRENCY = 8
export const WORKFLOW_EVIDENCE_PAGE_SIZE = 20
const UNKNOWN_CODES = new Set(['RESULT_UNKNOWN', 'DISCONNECTED', 'TIMEOUT'])

function code(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

function failure(reason: unknown): CommandError {
  if (reason instanceof CommandError) return reason
  return new CommandError(code(reason), reason instanceof Error ? reason.message : 'Workflow operation failed')
}

function duplicate(values: readonly string[]) {
  return new Set(values).size !== values.length
}

function validateSnapshot(snapshot: WorkflowSnapshot) {
  const workflow = snapshot.workflow
  if (!workflow) return
  if (duplicate(workflow.delegations.map((delegation) => delegation.delegationId)))
    throw new CommandError('DUPLICATE_ID', 'Workflow contains duplicate delegation ids')
  if (duplicate(workflow.evidence.map((evidence) => evidence.evidenceId)))
    throw new CommandError('DUPLICATE_ID', 'Workflow contains duplicate evidence ids')
  if (workflow.focus && duplicate(workflow.focus.acceptanceChecks.map((check) => check.id)))
    throw new CommandError('DUPLICATE_ID', `Workflow focus ${workflow.focus.focusId} contains duplicate check ids`)
}

export function createWorkflowWorkspace(
  local: CommandRegistry,
  options: RuntimeOptions,
  surfaces: StateReader<SurfaceState>,
  onSubscriberError: (error: unknown) => void,
  isDisposed: () => boolean,
  presentation?: StateReader<PresentationState>,
) {
  const state = createState<WorkflowWorkspaceState>({ entries: {} }, onSubscriberError)
  const workflows = options.workflows ? createCommandClient(workflowCommands, options.workflows) : null
  const agents = options.agents ? createCommandClient(agentCommands, options.agents) : null
  const generations = new Map<string, number>()
  let generationSequence = 0
  const operations = new Map<string, string>()
  const watchers = new Map<string, () => void>()
  const ownedPanels = new Set<string>()
  const suspendedPanels = new Set<string>()
  const readControllers = new Map<string, AbortController>()
  const reads = new Map<string, { controller: AbortController; promise: Promise<ReturnType<typeof summary>> }>()
  const visible = (instanceId: string) =>
    isSessionToolVisible(surfaces.getSnapshot().panels[instanceId], presentation?.getSnapshot())
  const isReadCurrent = (instanceId: string, sessionId: string, generation: number) =>
    !isDisposed() &&
    surfaces.getSnapshot().panels[instanceId]?.sessionId === sessionId &&
    visible(instanceId) &&
    generations.get(instanceId) === generation
  const releaseReads = (instanceId: string) => {
    generations.set(instanceId, ++generationSequence)
    readControllers.get(instanceId)?.abort()
    readControllers.delete(instanceId)
    reads.delete(instanceId)
    watchers.get(instanceId)?.()
    watchers.delete(instanceId)
  }
  const synchronizeVisibility = () => {
    for (const id of ownedPanels) {
      const entry = state.reader.getSnapshot().entries[id]
      const target = surfaces.getSnapshot().panels[id]
      if (!entry || !target?.sessionTool || target.sessionId !== entry.sessionId) {
        releaseReads(id)
        generations.delete(id)
        suspendedPanels.delete(id)
        ownedPanels.delete(id)
        if (entry?.status === 'loading') replace({ ...entry, status: 'error', error: 'CANCELLED' })
        continue
      }
      if (!visible(id)) {
        if (!suspendedPanels.has(id)) {
          suspendedPanels.add(id)
          releaseReads(id)
          if (entry.status === 'loading') replace({ ...entry, status: 'error', error: 'CANCELLED' })
        }
      } else if (suspendedPanels.delete(id)) {
        void load(id, true).catch(() => {})
      }
    }
  }
  const offSurfaces = surfaces.subscribe(synchronizeVisibility)
  const offPresentation = presentation?.subscribe(synchronizeVisibility)

  const panel = (instanceId: string) => {
    const value = surfaces.getSnapshot().panels[instanceId]
    if (!value || value.panelId !== 'goals') throw new CommandError('COMMAND_NOT_FOUND', 'Workflow panel is not open')
    if (!value.sessionId) throw new CommandError('INVALID_INPUT', 'Workflow panel requires a session target')
    return { ...value, sessionId: value.sessionId }
  }
  const requireWorkflows = () => {
    if (!workflows) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Workflow commands are unavailable')
    return workflows
  }
  const requireAgents = () => {
    if (!agents) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Agent commands are unavailable')
    return agents
  }
  const replace = (entry: WorkflowWorkspaceEntryState) => {
    const current = state.reader.getSnapshot()
    const entries = { ...current.entries, [entry.instanceId]: entry }
    const ids = Object.keys(entries)
    if (ids.length > MAX_PANELS)
      for (const id of ids) {
        if (id !== entry.instanceId && !surfaces.getSnapshot().panels[id]) {
          delete entries[id]
          releaseReads(id)
          ownedPanels.delete(id)
          suspendedPanels.delete(id)
          generations.delete(id)
          break
        }
      }
    state.replace({ entries })
  }
  const summary = (entry: WorkflowWorkspaceEntryState) => {
    const actionStatuses = Object.values(entry.actions).map((action) => action.status)
    const actionStatus = actionStatuses.includes('submitting')
      ? ('submitting' as const)
      : actionStatuses.includes('unknown')
        ? ('unknown' as const)
        : actionStatuses.includes('failed')
          ? ('failed' as const)
          : actionStatuses.includes('succeeded')
            ? ('succeeded' as const)
            : ('idle' as const)
    return {
      instanceId: entry.instanceId,
      sessionId: entry.sessionId,
      status: entry.status,
      workflowStatus: entry.snapshot.workflow?.status ?? (entry.snapshot.plan ? ('draft' as const) : null),
      actionStatus,
      visibleEvidence: entry.visibleEvidence,
      error: entry.error,
    }
  }
  const current = (instanceId: string) => {
    const entry = state.reader.getSnapshot().entries[instanceId]
    const target = panel(instanceId)
    if (!entry || entry.sessionId !== target.sessionId)
      throw new CommandError('RESULT_UNKNOWN', 'Refresh the workflow panel target')
    return entry
  }
  const fetchAgents = async (sessionId: string, snapshot: WorkflowSnapshot, signal: AbortSignal) => {
    if (!snapshot.workflow || !agents) return {}
    const ids = [...new Set(snapshot.workflow.delegations.flatMap((entry) => (entry.agentId ? [entry.agentId] : [])))]
    const records: Record<string, AgentRecord> = {}
    for (let offset = 0; offset < ids.length; offset += AGENT_QUERY_CONCURRENCY) {
      if (signal.aborted) throw new CommandError('CANCELLED', 'Workflow read was cancelled')
      const batch = await Promise.allSettled(
        ids
          .slice(offset, offset + AGENT_QUERY_CONCURRENCY)
          .map((agentId) => agents.execute('agent.result.get', { parentSessionId: sessionId, agentId }, { signal })),
      )
      batch.forEach((result, index) => {
        const id = ids[offset + index]
        if (id && result.status === 'fulfilled') records[id] = result.value
      })
    }
    return records
  }
  const applySnapshot = async (
    instanceId: string,
    sessionId: string,
    generation: number,
    snapshot: WorkflowSnapshot,
    signal: AbortSignal,
  ) => {
    if (!isReadCurrent(instanceId, sessionId, generation) || signal.aborted) return
    validateSnapshot(snapshot)
    const records = await fetchAgents(sessionId, snapshot, signal)
    if (!isReadCurrent(instanceId, sessionId, generation) || signal.aborted) return
    const previous = state.reader.getSnapshot().entries[instanceId]
    if (!previous || previous.sessionId !== sessionId) return
    const currentRevision = previous.snapshot.workflow?.revision ?? 0
    const incomingRevision = snapshot.workflow?.revision ?? 0
    if (incomingRevision < currentRevision) return
    replace({
      ...previous,
      status: 'ready',
      snapshot,
      agents: records,
      visibleEvidence: Math.min(
        snapshot.workflow?.evidence.length ?? 0,
        Math.max(WORKFLOW_EVIDENCE_PAGE_SIZE, previous.visibleEvidence),
      ),
      error: null,
    })
  }
  const watch = (instanceId: string, sessionId: string, generation: number, signal: AbortSignal) => {
    watchers.get(instanceId)?.()
    if (!options.workflows?.watch) return
    watchers.set(
      instanceId,
      options.workflows.watch(sessionId, (snapshot) => {
        void applySnapshot(instanceId, sessionId, generation, snapshot, signal).catch((reason) => {
          if (!isReadCurrent(instanceId, sessionId, generation) || signal.aborted) return
          const entry = state.reader.getSnapshot().entries[instanceId]
          if (entry?.sessionId === sessionId) replace({ ...entry, status: 'error', error: code(reason) })
        })
      }),
    )
  }
  const performLoad = async (instanceId: string, background: boolean, controller: AbortController) => {
    const target = panel(instanceId)
    if (!visible(instanceId)) throw new CommandError('TARGET_CHANGED', 'Session tool is not visible')
    if (target.sessionTool) ownedPanels.add(instanceId)
    const previous = state.reader.getSnapshot().entries[instanceId]
    const sameTarget = previous?.sessionId === target.sessionId
    const generation = ++generationSequence
    generations.set(instanceId, generation)
    const loading: WorkflowWorkspaceEntryState = {
      instanceId,
      sessionId: target.sessionId,
      status: background && sameTarget ? previous.status : 'loading',
      snapshot: sameTarget ? previous.snapshot : { plan: null, workflow: null },
      agents: sameTarget ? previous.agents : {},
      visibleEvidence: sameTarget ? previous.visibleEvidence : WORKFLOW_EVIDENCE_PAGE_SIZE,
      actions: sameTarget ? previous.actions : {},
      error: null,
    }
    replace(loading)
    try {
      const snapshot = await requireWorkflows().execute(
        'workflow.get',
        { sessionId: target.sessionId },
        { signal: controller.signal },
      )
      if (!isReadCurrent(instanceId, target.sessionId, generation))
        throw new CommandError('RESULT_UNKNOWN', 'Workflow refresh was superseded')
      validateSnapshot(snapshot)
      const records = await fetchAgents(target.sessionId, snapshot, controller.signal)
      if (!isReadCurrent(instanceId, target.sessionId, generation))
        throw new CommandError('RESULT_UNKNOWN', 'Workflow refresh was superseded')
      const latest = current(instanceId)
      const newer = (latest.snapshot.workflow?.revision ?? 0) > (snapshot.workflow?.revision ?? 0)
      const facts = newer ? latest.snapshot : snapshot
      const ready: WorkflowWorkspaceEntryState = {
        ...latest,
        status: 'ready',
        snapshot: facts,
        agents: newer ? latest.agents : records,
        visibleEvidence: Math.min(
          facts.workflow?.evidence.length ?? 0,
          background ? Math.max(WORKFLOW_EVIDENCE_PAGE_SIZE, latest.visibleEvidence) : WORKFLOW_EVIDENCE_PAGE_SIZE,
        ),
        // A resumed read is not a receipt for an in-flight or uncertain write.
        actions: target.sessionTool
          ? Object.fromEntries(
              Object.entries(latest.actions).filter(([, action]) => background || action.status === 'submitting'),
            )
          : {},
        error: null,
      }
      replace(ready)
      watch(instanceId, target.sessionId, generation, controller.signal)
      return summary(ready)
    } catch (reason) {
      if (!isReadCurrent(instanceId, target.sessionId, generation)) throw reason
      watchers.get(instanceId)?.()
      watchers.delete(instanceId)
      const failed = { ...current(instanceId), status: 'error' as const, error: code(reason) }
      replace(failed)
      throw failure(reason)
    }
  }
  function load(instanceId: string, background = false): Promise<ReturnType<typeof summary>> {
    const target = panel(instanceId)
    const pending = reads.get(instanceId)
    if (target.sessionTool && pending) return pending.promise
    readControllers.get(instanceId)?.abort()
    const controller = new AbortController()
    readControllers.set(instanceId, controller)
    const promise = performLoad(instanceId, background, controller).finally(() => {
      if (reads.get(instanceId)?.controller === controller) reads.delete(instanceId)
    })
    reads.set(instanceId, { controller, promise })
    return promise
  }
  const loadMoreEvidence = (instanceId: string) => {
    const entry = current(instanceId)
    const next = {
      ...entry,
      visibleEvidence: Math.min(
        entry.snapshot.workflow?.evidence.length ?? 0,
        entry.visibleEvidence + WORKFLOW_EVIDENCE_PAGE_SIZE,
      ),
    }
    replace(next)
    return summary(next)
  }
  const setAction = (entry: WorkflowWorkspaceEntryState, key: string, action: WorkflowWorkspaceActionState) => {
    const next = { ...entry, actions: { ...entry.actions, [key]: action } }
    replace(next)
    return next
  }
  const acceptCheck = async (
    instanceId: string,
    itemId: string,
    checkId: string,
    decision: 'accepted' | 'rejected',
  ) => {
    const entry = current(instanceId)
    const workflow = entry.snapshot.workflow
    if (!workflow) throw new CommandError('WORKFLOW_NOT_FOUND', 'No active workflow exists')
    const key = `accept:${itemId}:${checkId}`
    if (entry.actions[key]?.status === 'submitting' || entry.actions[key]?.status === 'unknown')
      throw new CommandError('BUSY', 'Reconcile the pending acceptance operation')
    const operation = crypto.randomUUID()
    operations.set(`${instanceId}:${key}`, operation)
    setAction(entry, key, { status: 'submitting', error: null })
    try {
      const snapshot = await requireWorkflows().execute('workflow.acceptCheck', {
        sessionId: entry.sessionId,
        itemId,
        checkId,
        decision,
        note: null,
        expectedRevision: workflow.revision,
      })
      const latest = current(instanceId)
      if (
        operations.get(`${instanceId}:${key}`) !== operation ||
        latest.snapshot.workflow?.workflowId !== workflow.workflowId ||
        (latest.snapshot.workflow?.revision ?? 0) > (snapshot.workflow?.revision ?? 0)
      )
        throw new CommandError('RESULT_UNKNOWN', 'Acceptance result belongs to an older workflow')
      validateSnapshot(snapshot)
      const next = setAction({ ...latest, snapshot, error: null }, key, { status: 'succeeded', error: null })
      return summary(next)
    } catch (reason) {
      const latest = current(instanceId)
      const error = code(reason)
      const next = setAction(latest, key, {
        status: UNKNOWN_CODES.has(error) ? 'unknown' : 'failed',
        error,
      })
      if (UNKNOWN_CODES.has(error)) return summary(next)
      throw failure(reason)
    }
  }
  const applyPatch = async (instanceId: string, agentId: string) => {
    const entry = current(instanceId)
    const workflow = entry.snapshot.workflow
    const delegation = workflow?.delegations.find((candidate) => candidate.agentId === agentId)
    if (!workflow || !delegation) throw new CommandError('AGENT_NOT_FOUND', 'Delegated agent is unavailable')
    const key = `apply:${agentId}`
    if (entry.actions[key]?.status === 'submitting' || entry.actions[key]?.status === 'unknown')
      throw new CommandError('BUSY', 'Reconcile the pending patch operation')
    const operation = crypto.randomUUID()
    operations.set(`${instanceId}:${key}`, operation)
    setAction(entry, key, { status: 'submitting', error: null })
    try {
      const record = await requireAgents().execute(
        'agent.patch.apply',
        { parentSessionId: entry.sessionId, agentId, planRevision: workflow.planRevision },
        { idempotencyKey: `ui-${operation}`, requestId: `ui-${operation}` },
      )
      const snapshot = await requireWorkflows().execute('workflow.get', { sessionId: entry.sessionId })
      const latest = current(instanceId)
      if (
        operations.get(`${instanceId}:${key}`) !== operation ||
        latest.snapshot.workflow?.workflowId !== workflow.workflowId ||
        (latest.snapshot.workflow?.revision ?? 0) > (snapshot.workflow?.revision ?? 0)
      )
        throw new CommandError('RESULT_UNKNOWN', 'Patch result belongs to an older workflow')
      validateSnapshot(snapshot)
      const next = setAction(
        { ...latest, snapshot, agents: { ...latest.agents, [agentId]: record }, error: null },
        key,
        { status: 'succeeded', error: null },
      )
      return summary(next)
    } catch (reason) {
      const latest = current(instanceId)
      const error = code(reason)
      const next = setAction(latest, key, {
        status: UNKNOWN_CODES.has(error) ? 'unknown' : 'failed',
        error,
      })
      if (UNKNOWN_CODES.has(error)) return summary(next)
      throw failure(reason)
    }
  }

  local.register(workflowWorkspaceCommands['workflowWorkspace.refresh'], ({ instanceId }) => load(instanceId))
  local.register(workflowWorkspaceCommands['workflowWorkspace.loadMoreEvidence'], ({ instanceId }) =>
    loadMoreEvidence(instanceId),
  )
  local.register(
    workflowWorkspaceCommands['workflowWorkspace.acceptCheck'],
    ({ instanceId, itemId, checkId, decision }) => acceptCheck(instanceId, itemId, checkId, decision),
  )
  local.register(workflowWorkspaceCommands['workflowWorkspace.applyPatch'], ({ instanceId, agentId }) =>
    applyPatch(instanceId, agentId),
  )
  return {
    reader: state.reader,
    dispose() {
      offSurfaces()
      offPresentation?.()
      for (const controller of readControllers.values()) controller.abort()
      readControllers.clear()
      reads.clear()
      suspendedPanels.clear()
      ownedPanels.clear()
      for (const unsubscribe of watchers.values()) unsubscribe()
      watchers.clear()
      generations.clear()
      operations.clear()
      state.dispose()
    },
  }
}

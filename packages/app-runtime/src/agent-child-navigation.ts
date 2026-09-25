import {
  CommandError,
  createCommandClient,
  defineCommand,
  type CommandExecutor,
  type CommandRegistry,
  type ExecuteOptions,
} from '@hbar/commands'
import { z } from 'zod'
import { agentCommands } from '@hbar/contracts/commands/agents'
import { sessionSchema, workspaceSchema } from '@hbar/contracts/directory'
import type { StateReader } from './state'
import type { AgentWorkspaceState, NavigationState, SurfaceState } from './types'
import type { createWorkspaceTabs, SessionTabRef } from './workspace-tabs-runtime'

const id = z.string().min(1).max(160)
const tabKey = z.string().uuid()
const metadata = (name: string) => ({
  id: name,
  version: 1,
  owner: 'hbar.agent-child-navigation',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  scope: 'client' as const,
  category: 'app.navigation',
  visibility: 'internal' as const,
  titleKey: `commands.${name}.title`,
  descriptionKey: `commands.${name}.description`,
  surfaces: ['api'] as ('api' | 'cli' | 'tui' | 'palette')[],
})
export const agentChildNavigationCommands = {
  'agentChild.open': defineCommand(
    metadata('agentChild.open'),
    z.strictObject({
      panelInstanceId: id,
      parentSessionId: id,
      agentId: id,
      expectedChildSessionId: id,
      sourceTabInstanceKey: tabKey,
    }),
    z.strictObject({ childSessionId: id, childTabInstanceKey: tabKey, sourceAttached: z.boolean() }),
  ),
  'agentChild.return': defineCommand(
    metadata('agentChild.return'),
    z.strictObject({ childSessionId: id, childTabInstanceKey: tabKey }),
    z.strictObject({ activeId: id }),
  ),
}

interface AgentChildNavigationOptions {
  readonly agents?: CommandExecutor
  readonly queries: CommandExecutor
  readonly tabs: ReturnType<typeof createWorkspaceTabs>
  readonly surfaces: StateReader<SurfaceState>
  readonly agentWorkspace: StateReader<AgentWorkspaceState>
  readonly navigation: StateReader<NavigationState>
  readonly selectSession: (sessionId: string, workspaceId: string, execution: ExecuteOptions) => Promise<unknown>
  readonly isDisposed: () => boolean
}

function verifiedSession(value: unknown, requestedId: string) {
  if (value === null) throw new CommandError('SESSION_NOT_FOUND', 'Agent Session is unavailable')
  const parsed = sessionSchema.safeParse(value)
  if (!parsed.success || parsed.data.id !== requestedId)
    throw new CommandError('INVALID_OUTPUT', 'Session does not match the Agent navigation target')
  return parsed.data
}

function sessionTab(options: AgentChildNavigationOptions, sessionId: string): SessionTabRef | null {
  const item = options.tabs.reader.getSnapshot().items.find((candidate) => candidate.id === sessionId)
  return item?.kind === 'session' ? item : null
}

function normalizeNavigationFailure(reason: unknown): CommandError {
  if (reason instanceof CommandError) return reason
  const candidate = reason && typeof reason === 'object' && 'code' in reason ? reason.code : null
  // Host/client codes are transport metadata. Neither the raw message nor an
  // unbounded/malformed code may escape into the local command result.
  const code =
    typeof candidate === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(candidate) ? candidate : 'EXECUTION_FAILED'
  return new CommandError(code, 'Agent navigation could not be completed')
}

async function withNormalizedFailure<Result>(operation: () => Promise<Result>): Promise<Result> {
  try {
    return await operation()
  } catch (reason) {
    throw normalizeNavigationFailure(reason)
  }
}

/** AgentRecord is the sole parent→child fact source; no tool-use correlation is inferred. */
export function createAgentChildNavigation(local: CommandRegistry, options: AgentChildNavigationOptions) {
  const agents = options.agents ? createCommandClient(agentCommands, options.agents) : null
  const requireAgents = () => {
    if (!agents) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Agent facts are unavailable')
    return agents
  }
  const matchingRecord = (
    record: {
      agentId: string
      parentSessionId: string
      sessionId: string
    },
    parentSessionId: string,
    agentId: string,
    childSessionId: string,
  ) => {
    if (record.agentId !== agentId || record.parentSessionId !== parentSessionId || record.sessionId !== childSessionId)
      throw new CommandError('INVALID_OUTPUT', 'Agent identity changed during navigation')
  }
  const agentDetail = (panelInstanceId: string, parentSessionId: string, agentId: string, childSessionId: string) => {
    const panel = options.surfaces.getSnapshot().panels[panelInstanceId]
    const entry = options.agentWorkspace.getSnapshot().entries[panelInstanceId]
    if (
      panel?.panelId !== 'agents' ||
      panel.sessionId !== parentSessionId ||
      entry?.parentSessionId !== parentSessionId ||
      entry.status !== 'ready' ||
      entry.view !== 'detail' ||
      entry.selectedAgentId !== agentId ||
      !entry.items.some(
        (item) =>
          item.agentId === agentId && item.parentSessionId === parentSessionId && item.sessionId === childSessionId,
      )
    )
      throw new CommandError('SOURCE_CHANGED', 'Agent detail no longer belongs to the captured source')
    return panel
  }

  local.register(agentChildNavigationCommands['agentChild.open'], (input, execution) =>
    withNormalizedFailure(async () => {
      if (options.isDisposed()) throw new CommandError('DISPOSED', 'Runtime is disposed')
      const { panelInstanceId, parentSessionId, agentId, expectedChildSessionId, sourceTabInstanceKey } = input
      if (parentSessionId === expectedChildSessionId)
        throw new CommandError('INVALID_INPUT', 'An Agent child cannot be its own parent')
      const source = sessionTab(options, parentSessionId)
      if (!source || source.instanceKey !== sourceTabInstanceKey)
        throw new CommandError('SOURCE_CHANGED', 'Parent tab instance changed')
      const panel = agentDetail(panelInstanceId, parentSessionId, agentId, expectedChildSessionId)
      const navigation = options.navigation.getSnapshot()
      const record = await requireAgents().execute('agent.result.get', { parentSessionId, agentId }, execution)
      matchingRecord(record, parentSessionId, agentId, expectedChildSessionId)
      const [parent, child] = await Promise.all([
        options.queries.execute('session.get', { sessionId: parentSessionId }, execution),
        options.queries.execute('session.get', { sessionId: expectedChildSessionId }, execution),
      ])
      const verifiedParent = verifiedSession(parent, parentSessionId)
      const verifiedChild = verifiedSession(child, expectedChildSessionId)
      if (
        verifiedParent.archived ||
        verifiedParent.workspaceId !== source.workspaceId ||
        verifiedChild.archived ||
        verifiedChild.parentId !== parentSessionId
      )
        throw new CommandError('SOURCE_CHANGED', 'Agent parent or child Session is unavailable')
      const workspace = await options.queries.execute(
        'workspace.get',
        { workspaceId: verifiedChild.workspaceId },
        execution,
      )
      const parsedWorkspace = workspaceSchema.safeParse(workspace)
      if (!parsedWorkspace.success || parsedWorkspace.data.id !== verifiedChild.workspaceId)
        throw new CommandError(
          workspace === null ? 'WORKSPACE_NOT_FOUND' : 'INVALID_OUTPUT',
          'Child Workspace is unavailable',
        )
      if (
        options.isDisposed() ||
        execution.signal?.aborted ||
        options.navigation.getSnapshot() !== navigation ||
        options.surfaces.getSnapshot().panels[panelInstanceId] !== panel ||
        sessionTab(options, parentSessionId)?.instanceKey !== sourceTabInstanceKey
      )
        throw new CommandError('SOURCE_CHANGED', 'Agent source changed while verifying the child')
      agentDetail(panelInstanceId, parentSessionId, agentId, expectedChildSessionId)
      await options.selectSession(expectedChildSessionId, verifiedChild.workspaceId, execution)
      const childTab = sessionTab(options, expectedChildSessionId)
      if (!childTab) throw new CommandError('RESULT_UNKNOWN', 'Child navigation completed without a tab')
      if (
        options.navigation.getSnapshot().sessionId !== expectedChildSessionId ||
        options.tabs.reader.getSnapshot().activeId !== expectedChildSessionId
      )
        throw new CommandError('NAVIGATION_SUPERSEDED', 'A newer target replaced the child navigation')
      let sourceAttached = false
      try {
        options.tabs.attachAgentSource(expectedChildSessionId, childTab.instanceKey, {
          parentSessionId,
          parentWorkspaceId: source.workspaceId,
          agentId,
          sourceTabInstanceKey,
        })
        sourceAttached = true
      } catch (reason) {
        if (!(reason instanceof CommandError) || reason.code !== 'SOURCE_CHANGED') throw reason
      }
      return { childSessionId: expectedChildSessionId, childTabInstanceKey: childTab.instanceKey, sourceAttached }
    }),
  )

  local.register(
    agentChildNavigationCommands['agentChild.return'],
    ({ childSessionId, childTabInstanceKey }, execution) =>
      withNormalizedFailure(async () => {
        if (options.isDisposed()) throw new CommandError('DISPOSED', 'Runtime is disposed')
        const child = sessionTab(options, childSessionId)
        const origin = child?.instanceKey === childTabInstanceKey ? child.agentSource : null
        if (!origin || options.tabs.reader.getSnapshot().activeId !== childSessionId)
          throw new CommandError('SOURCE_CHANGED', 'Agent child tab or source relation changed')
        const source = sessionTab(options, origin.parentSessionId)
        if (source?.instanceKey !== origin.sourceTabInstanceKey || source.workspaceId !== origin.parentWorkspaceId)
          throw new CommandError('SOURCE_CHANGED', 'Parent tab instance is no longer open')
        const navigation = options.navigation.getSnapshot()
        const record = await requireAgents().execute(
          'agent.result.get',
          {
            parentSessionId: origin.parentSessionId,
            agentId: origin.agentId,
          },
          execution,
        )
        matchingRecord(record, origin.parentSessionId, origin.agentId, childSessionId)
        const [parent, checkedChild] = await Promise.all([
          options.queries.execute('session.get', { sessionId: origin.parentSessionId }, execution),
          options.queries.execute('session.get', { sessionId: childSessionId }, execution),
        ])
        const verifiedParent = verifiedSession(parent, origin.parentSessionId)
        const verifiedChild = verifiedSession(checkedChild, childSessionId)
        if (
          verifiedParent.archived ||
          verifiedParent.workspaceId !== origin.parentWorkspaceId ||
          verifiedChild.parentId !== origin.parentSessionId
        )
          throw new CommandError('SOURCE_CHANGED', 'Agent parent is no longer available')
        if (
          options.isDisposed() ||
          execution.signal?.aborted ||
          options.navigation.getSnapshot() !== navigation ||
          sessionTab(options, childSessionId)?.instanceKey !== childTabInstanceKey ||
          sessionTab(options, origin.parentSessionId)?.instanceKey !== origin.sourceTabInstanceKey ||
          options.tabs.reader.getSnapshot().activeId !== childSessionId
        )
          throw new CommandError('SOURCE_CHANGED', 'Agent navigation was superseded')
        await options.selectSession(origin.parentSessionId, origin.parentWorkspaceId, execution)
        if (
          options.navigation.getSnapshot().sessionId !== origin.parentSessionId ||
          options.tabs.reader.getSnapshot().activeId !== origin.parentSessionId
        )
          throw new CommandError('NAVIGATION_SUPERSEDED', 'A newer target replaced the parent navigation')
        return { activeId: origin.parentSessionId }
      }),
  )
}

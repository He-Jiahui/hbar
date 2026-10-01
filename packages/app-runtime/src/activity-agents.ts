import { CommandError, createCommandClient, type CommandExecutor, type ExecuteOptions } from '@hbar/commands'
import { agentCommands, type AgentRecord } from '@hbar/contracts/commands/agents'
import type { ActivityAgentEntryState } from './types'

export const ACTIVITY_AGENT_PAGE_SIZE = 50
export const ACTIVITY_AGENT_MAX_ITEMS = 200
interface Target {
  readonly instanceId: string
  readonly sessionId: string
  readonly workspaceId: string
}
interface Options {
  readonly agents?: CommandExecutor
  readonly target: (instanceId: string) => Target
  readonly isCurrent: (target: Target) => boolean
  readonly get: (instanceId: string) => Readonly<ActivityAgentEntryState> | undefined
  readonly replace: (entry: ActivityAgentEntryState) => void
}
const errorCode = (reason: unknown) =>
  reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'

/** Reads the public plugin-owned Agent records; never infers them from child Sessions or private events. */
export function createActivityAgentReads(options: Options) {
  const client = options.agents ? createCommandClient(agentCommands, options.agents) : null
  const requests = new Map<string, { target: Target; controller: AbortController }>()
  function abort(instanceId: string) {
    const request = requests.get(instanceId)
    requests.delete(instanceId)
    request?.controller.abort(new CommandError('QUERY_SUPERSEDED', 'Activity source was hidden or changed'))
  }
  async function read(instanceId: string, append: boolean, execution?: ExecuteOptions) {
    const target = options.target(instanceId)
    if (requests.has(instanceId)) throw new CommandError('BUSY', 'Agent activity is already loading')
    const previous = options.get(instanceId)
    if (
      append &&
      (!previous ||
        previous.sessionId !== target.sessionId ||
        previous.status !== 'ready' ||
        !previous.nextCursor ||
        previous.limitReached)
    )
      throw new CommandError('NOT_READY', 'Refresh Agent activity before loading more')
    const before = previous?.sessionId === target.sessionId ? previous.items : []
    const base: ActivityAgentEntryState = {
      instanceId,
      sessionId: target.sessionId,
      status: client ? 'loading' : 'unavailable',
      items: before,
      nextCursor: null,
      limitReached: false,
      error: null,
    }
    options.replace(base)
    if (!client) return
    const controller = new AbortController()
    const request = { target, controller }
    requests.set(instanceId, request)
    const onAbort = () =>
      controller.abort(execution?.signal?.reason ?? new CommandError('CANCELLED', 'Agent activity read cancelled'))
    execution?.signal?.addEventListener('abort', onAbort, { once: true })
    if (execution?.signal?.aborted) onAbort()
    const timeout = setTimeout(
      () => controller.abort(new CommandError('TIMEOUT', 'Agent activity read timed out')),
      12_000,
    )
    let stopAbort: () => void = () => undefined
    const interrupted = new Promise<never>((_resolve, reject) => {
      const abortRead = () =>
        reject(
          controller.signal.reason instanceof CommandError
            ? controller.signal.reason
            : new CommandError('CANCELLED', 'Agent activity read cancelled'),
        )
      controller.signal.addEventListener('abort', abortRead, { once: true })
      stopAbort = () => controller.signal.removeEventListener('abort', abortRead)
      if (controller.signal.aborted) abortRead()
    })
    const current = () => requests.get(instanceId) === request && options.isCurrent(target)
    try {
      const ids = new Set<string>(append ? before.map((item) => item.agentId) : [])
      const items: Readonly<AgentRecord>[] = [...(append ? before : [])]
      let cursor = append ? (previous?.nextCursor ?? null) : null
      const desired = append
        ? Math.min(before.length + ACTIVITY_AGENT_PAGE_SIZE, ACTIVITY_AGENT_MAX_ITEMS)
        : Math.max(ACTIVITY_AGENT_PAGE_SIZE, before.length)
      for (let pageIndex = 0; pageIndex < 4; pageIndex++) {
        const page = await Promise.race([
          client.execute(
            'agent.list',
            {
              parentSessionId: target.sessionId,
              limit: ACTIVITY_AGENT_PAGE_SIZE,
              ...(cursor ? { after: cursor } : {}),
            },
            { signal: controller.signal },
          ),
          interrupted,
        ])
        if (!current()) throw new CommandError('QUERY_SUPERSEDED', 'Agent activity target changed')
        for (const item of page.items) {
          if (item.parentSessionId !== target.sessionId || item.sessionId === target.sessionId || ids.has(item.agentId))
            throw new CommandError('INVALID_OUTPUT', 'Agent activity returned duplicate or foreign records')
          ids.add(item.agentId)
        }
        if (
          page.items.length > ACTIVITY_AGENT_PAGE_SIZE ||
          (page.nextCursor && (page.nextCursor !== page.items.at(-1)?.agentId || page.nextCursor === cursor))
        )
          throw new CommandError('INVALID_OUTPUT', 'Agent activity returned an invalid cursor')
        items.push(...page.items)
        cursor = page.nextCursor
        if (!cursor || items.length >= desired) break
      }
      options.replace({
        ...base,
        status: 'ready',
        items,
        nextCursor: cursor,
        limitReached: items.length >= ACTIVITY_AGENT_MAX_ITEMS && cursor !== null,
      })
    } catch (reason) {
      if (current()) options.replace({ ...base, status: 'error', error: errorCode(reason) })
      throw reason
    } finally {
      clearTimeout(timeout)
      stopAbort()
      execution?.signal?.removeEventListener('abort', onAbort)
      if (requests.get(instanceId) === request) requests.delete(instanceId)
    }
  }
  return {
    read,
    abort,
    busy: (instanceId: string) => requests.has(instanceId),
    dispose() {
      for (const id of requests.keys()) abort(id)
    },
  }
}

import {
  CommandError,
  createCommandClient,
  defineCommand,
  type CommandExecutor,
  type CommandRegistry,
  type ExecuteOptions,
} from '@hbar/commands'
import { forkableMessagesResultSchema, workspaceSessionCommands } from '@hbar/contracts/commands/workspaces'
import { directoryCommands } from '@hbar/contracts/commands'
import { sessionSchema } from '@hbar/contracts/directory'
import { z } from 'zod'
import { createState, type StateReader } from './state'
import type { NavigationState } from './types'
import type { WorkspaceTabNavigationHooks, WorkspaceTabsState } from './workspace-tabs-runtime'

const id = z.string().min(1).max(160)
const targetSchema = z.strictObject({ sessionId: id, messageId: id, sourceTabInstanceKey: z.string().uuid() })
const metadata = (name: string, kind: 'command' | 'query' = 'command') => ({
  id: name,
  version: 1,
  owner: 'hbar.session-message-fork',
  kind,
  execution: 'client' as const,
  stateEffect: kind === 'query' ? ('none' as const) : ('application' as const),
  scope: 'client' as const,
  category: 'app.navigation',
  visibility: 'internal' as const,
  titleKey: `commands.${name}.title`,
  descriptionKey: `commands.${name}.description`,
  surfaces: ['api'] as ('api' | 'cli' | 'tui' | 'palette')[],
})
export const sessionMessageForkCommands = {
  'messageFork.refreshEligibility': defineCommand(
    metadata('messageFork.refreshEligibility'),
    z.strictObject({ sessionId: id, cursor: z.number().int().nonnegative(), messageIds: z.array(id).min(1).max(200) }),
    z.strictObject({ sessionId: id, cursor: z.number().int().nonnegative(), count: z.number().int().max(200) }),
  ),
  'messageFork.submit': defineCommand(
    metadata('messageFork.submit'),
    targetSchema,
    z.strictObject({ childSessionId: id, navigated: z.boolean() }),
  ),
  'messageFork.reconcile': defineCommand(
    metadata('messageFork.reconcile'),
    z.strictObject({ sessionId: id, messageId: id }),
    z.strictObject({ status: z.enum(['unknown', 'created']), childSessionId: id.nullable(), navigated: z.boolean() }),
  ),
}

export interface SessionMessageForkAction {
  readonly sessionId: string
  readonly messageId: string
  readonly sourceTabInstanceKey: string
  readonly sourceWorkspaceId: string
  readonly idempotencyKey: string
  readonly status: 'submitting' | 'unknown' | 'failed' | 'created'
  readonly childSessionId: string | null
  readonly error: string | null
}
export interface SessionMessageForkState {
  readonly eligibility: {
    readonly sessionId: string | null
    readonly cursor: number
    readonly items: Readonly<
      Record<
        string,
        {
          readonly eligible: boolean
          readonly reason: z.output<typeof forkableMessagesResultSchema>['items'][number]['reason']
        }
      >
    >
  }
  readonly actions: Readonly<Record<string, SessionMessageForkAction>>
}
export function messageForkActionKey(target: { readonly sessionId: string; readonly messageId: string }): string {
  return JSON.stringify([target.sessionId, target.messageId])
}

export interface SessionMessageForkNavigationOptions {
  readonly workspaces: CommandExecutor
  readonly directory: CommandExecutor
  readonly tabs: {
    readonly reader: StateReader<WorkspaceTabsState>
    readonly hooks: Pick<WorkspaceTabNavigationHooks, 'reserveCreation' | 'commitCreation' | 'settleCreation'>
  }
  readonly navigation: StateReader<NavigationState>
  readonly selectSession: (sessionId: string, workspaceId: string, execution: ExecuteOptions) => Promise<unknown>
  readonly isDisposed: () => boolean
  readonly onSubscriberError: (reason: unknown) => void
}

const UNCERTAIN = new Set([
  'RESULT_UNKNOWN',
  'DISCONNECTED',
  'CONNECTION_CLOSED',
  'TIMEOUT',
  'TIMED_OUT',
  'EXECUTION_FAILED',
  'CANCELLED',
  'INVALID_OUTPUT',
])
function errorCode(reason: unknown): string {
  const candidate = reason && typeof reason === 'object' && 'code' in reason ? reason.code : null
  return typeof candidate === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(candidate) ? candidate : 'EXECUTION_FAILED'
}
function safeError(reason: unknown): CommandError {
  return reason instanceof CommandError
    ? reason
    : new CommandError(errorCode(reason), 'Message Fork could not be completed')
}

/** Host owns eligibility, durable receipt and the copied prefix; this module only owns client intent/navigation. */
export function createSessionMessageForkNavigation(
  local: CommandRegistry,
  options: SessionMessageForkNavigationOptions,
) {
  const host = createCommandClient(workspaceSessionCommands, options.workspaces)
  const directory = createCommandClient(directoryCommands, options.directory)
  const state = createState<SessionMessageForkState>(
    {
      eligibility: { sessionId: null, cursor: 0, items: {} },
      actions: {},
    },
    options.onSubscriberError,
  )
  const current = () => state.reader.getSnapshot()
  const reconciling = new Set<string>()
  const publish = (next: Partial<SessionMessageForkState>) => state.replace({ ...current(), ...next })
  const setAction = (target: z.infer<typeof targetSchema>, entry: SessionMessageForkAction) => {
    const existing = current().actions
    const key = messageForkActionKey(target)
    const actions: Record<string, SessionMessageForkAction> = { ...existing, [key]: entry }
    if (Object.keys(actions).length > 128) {
      const oldest = Object.keys(actions).find(
        (item) => item !== key && ['failed', 'created'].includes(actions[item]?.status ?? ''),
      )
      if (oldest) delete actions[oldest]
      else throw new CommandError('BUSY', 'Too many unresolved message Forks')
    }
    publish({ actions })
  }
  const sourceTab = (target: z.infer<typeof targetSchema>) =>
    options.tabs.reader
      .getSnapshot()
      .items.find(
        (item) =>
          item.kind === 'session' && item.id === target.sessionId && item.instanceKey === target.sourceTabInstanceKey,
      )
  const verifyChild = (value: unknown, sourceWorkspaceId: string, sourceSessionId: string) => {
    const parsed = sessionSchema.safeParse(value)
    if (
      !parsed.success ||
      parsed.data.id === sourceSessionId ||
      parsed.data.parentId !== sourceSessionId ||
      parsed.data.workspaceId !== sourceWorkspaceId ||
      parsed.data.archived
    )
      throw new CommandError('INVALID_OUTPUT', 'Fork result does not match the captured source')
    return parsed.data
  }
  async function finish(
    target: z.infer<typeof targetSchema>,
    child: unknown,
    capturedNavigation: NavigationState,
    execution: ExecuteOptions,
  ) {
    const entry = current().actions[messageForkActionKey(target)]
    if (!entry || entry.sourceTabInstanceKey !== target.sourceTabInstanceKey)
      throw new CommandError('SOURCE_CHANGED', 'The original Fork intent is unavailable')
    const verified = verifyChild(child, entry.sourceWorkspaceId, target.sessionId)
    const sourceStillOpen = Boolean(sourceTab(target))
    // The child exists even if its source tab closed. Open it without taking focus.
    options.tabs.hooks.commitCreation(entry.idempotencyKey, verified)
    setAction(target, { ...entry, status: 'created', childSessionId: verified.id, error: null })
    let navigated = false
    if (
      sourceStillOpen &&
      options.navigation.getSnapshot() === capturedNavigation &&
      options.navigation.getSnapshot().sessionId === target.sessionId &&
      options.tabs.reader.getSnapshot().activeId === target.sessionId &&
      !options.isDisposed()
    ) {
      try {
        await options.selectSession(verified.id, verified.workspaceId, execution)
        navigated = options.navigation.getSnapshot().sessionId === verified.id
      } catch {
        // The child exists and its tab is available; navigation failure cannot turn a committed Fork into failure.
      }
    }
    return { childSessionId: verified.id, navigated }
  }

  local.register(sessionMessageForkCommands['messageFork.refreshEligibility'], async (input, execution) => {
    if (options.isDisposed()) throw new CommandError('DISPOSED', 'Runtime is disposed')
    const navigation = options.navigation.getSnapshot()
    if (navigation.sessionId !== input.sessionId)
      throw new CommandError('SOURCE_CHANGED', 'The eligibility page belongs to another Session')
    const before = current().eligibility
    if (before.sessionId !== input.sessionId || before.cursor !== input.cursor)
      publish({ eligibility: { sessionId: input.sessionId, cursor: input.cursor, items: {} } })
    const result = await host.execute(
      'session.forkableMessages',
      {
        sessionId: input.sessionId,
        messageIds: input.messageIds,
      },
      execution,
    )
    if (
      result.sessionId !== input.sessionId ||
      result.items.length !== input.messageIds.length ||
      result.items.some((item, index) => item.messageId !== input.messageIds[index])
    )
      throw new CommandError('INVALID_OUTPUT', 'Fork eligibility response target mismatch')
    if (
      options.isDisposed() ||
      options.navigation.getSnapshot() !== navigation ||
      current().eligibility.sessionId !== input.sessionId ||
      current().eligibility.cursor !== input.cursor
    )
      throw new CommandError('SOURCE_CHANGED', 'Eligibility page superseded by navigation')
    const items = { ...current().eligibility.items }
    for (const item of result.items) items[item.messageId] = { eligible: item.eligible, reason: item.reason }
    const bounded: Record<
      string,
      { eligible: boolean; reason: z.output<typeof forkableMessagesResultSchema>['items'][number]['reason'] }
    > = {}
    for (const [key, value] of Object.entries(items).slice(-1_000)) bounded[key] = value
    publish({ eligibility: { sessionId: input.sessionId, cursor: input.cursor, items: bounded } })
    return { sessionId: input.sessionId, cursor: input.cursor, count: result.items.length }
  })

  local.register(sessionMessageForkCommands['messageFork.submit'], async (target, execution) => {
    if (options.isDisposed()) throw new CommandError('DISPOSED', 'Runtime is disposed')
    const previous = current().actions[messageForkActionKey(target)]
    if (previous && ['submitting', 'unknown', 'created'].includes(previous.status))
      throw new CommandError('BUSY', 'Existing Fork must be reconciled or is already created')
    const navigation = options.navigation.getSnapshot()
    const source = sourceTab(target)
    if (
      !source ||
      source.kind !== 'session' ||
      navigation.sessionId !== target.sessionId ||
      options.tabs.reader.getSnapshot().activeId !== target.sessionId ||
      navigation.status !== 'idle'
    )
      throw new CommandError('SOURCE_CHANGED', 'Fork source tab is no longer selected')
    const key = crypto.randomUUID()
    const entry: SessionMessageForkAction = {
      ...target,
      sourceWorkspaceId: source.workspaceId,
      idempotencyKey: key,
      status: 'submitting',
      childSessionId: null,
      error: null,
    }
    try {
      options.tabs.hooks.reserveCreation(key, source.workspaceId)
    } catch (reason) {
      const error = safeError(reason)
      setAction(target, { ...entry, status: 'failed', error: error.code })
      throw error
    }
    try {
      setAction(target, entry)
    } catch (reason) {
      options.tabs.hooks.settleCreation(key, false)
      throw reason
    }
    let dispatched = false
    try {
      const sourceSession = await directory.execute('session.get', { sessionId: target.sessionId }, execution)
      if (!sourceSession || sourceSession.archived || sourceSession.workspaceId !== source.workspaceId)
        throw new CommandError('SOURCE_CHANGED', 'Fork source Session changed')
      const eligibility = await host.execute(
        'session.forkableMessages',
        {
          sessionId: target.sessionId,
          messageIds: [target.messageId],
        },
        execution,
      )
      const candidate = eligibility.items[0]
      if (eligibility.sessionId !== target.sessionId || candidate?.messageId !== target.messageId)
        throw new CommandError('INVALID_OUTPUT', 'Fork target was not verified')
      if (!candidate.eligible) throw new CommandError(candidate.reason.toUpperCase(), 'Message cannot be forked')
      if (options.isDisposed() || options.navigation.getSnapshot() !== navigation || !sourceTab(target))
        throw new CommandError('SOURCE_CHANGED', 'Fork source changed during verification')
      dispatched = true
      const child = await host.execute(
        'session.forkFromMessage',
        {
          sessionId: target.sessionId,
          messageId: target.messageId,
        },
        { ...execution, idempotencyKey: key },
      )
      return await finish(target, child, navigation, execution)
    } catch (reason) {
      const error = safeError(reason)
      const unknown = dispatched && UNCERTAIN.has(error.code)
      const latest = current().actions[messageForkActionKey(target)]
      if (latest?.idempotencyKey === key && latest.status !== 'created')
        setAction(target, { ...latest, status: unknown ? 'unknown' : 'failed', error: error.code })
      options.tabs.hooks.settleCreation(key, unknown)
      throw error
    }
  })

  local.register(sessionMessageForkCommands['messageFork.reconcile'], async (target, execution) => {
    if (options.isDisposed()) throw new CommandError('DISPOSED', 'Runtime is disposed')
    const actionKey = messageForkActionKey(target)
    const entry = current().actions[actionKey]
    if (!entry || entry.status !== 'unknown')
      throw new CommandError('INVALID_STATE', 'No uncertain Fork receipt belongs to this target')
    if (reconciling.has(actionKey)) throw new CommandError('BUSY', 'Fork receipt is already being checked')
    reconciling.add(actionKey)
    const captured = {
      sessionId: target.sessionId,
      messageId: target.messageId,
      sourceTabInstanceKey: entry.sourceTabInstanceKey,
    }
    const navigation = options.navigation.getSnapshot()
    try {
      const receipt = await host.execute(
        'session.forkFromMessageReceipt',
        {
          sessionId: target.sessionId,
          messageId: target.messageId,
          idempotencyKey: entry.idempotencyKey,
        },
        execution,
      )
      if (!receipt) return { status: 'unknown' as const, childSessionId: null, navigated: false }
      const result = await finish(captured, receipt, navigation, execution)
      return { status: 'created' as const, ...result }
    } catch (reason) {
      const error = safeError(reason)
      const latest = current().actions[messageForkActionKey(target)]
      if (latest?.idempotencyKey === entry.idempotencyKey && latest.status === 'unknown')
        setAction(captured, { ...latest, error: error.code })
      throw error
    } finally {
      reconciling.delete(actionKey)
    }
  })
  return {
    reader: state.reader,
    dispose() {
      reconciling.clear()
      state.dispose()
    },
  }
}

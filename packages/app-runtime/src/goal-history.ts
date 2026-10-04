import {
  CommandError,
  createCommandClient,
  defineCommand,
  type CommandExecutor,
  type CommandRegistry,
} from '@hbar/commands'
import { idSchema, type SessionEvent } from '@hbar/contracts'
import {
  goalHistoryCommands as hostCommands,
  parseGoalHistoryEvent,
  type GoalHistoryFact,
  type GoalHistoryPage,
} from '@hbar/contracts/commands/goal-history'
import { z } from 'zod'
import { createState, type StateReader } from './state'
import type { NavigationState } from './types'

export type { GoalHistoryFact, GoalHistorySnapshot } from '@hbar/contracts/commands/goal-history'
export const GOAL_HISTORY_MAX_FACTS = 1_000
const MAX_SESSIONS = 8
const PAGE_SIZE = 100
const MAX_FILL_PAGES = 10
const READ_TIMEOUT = 12_000

export interface GoalHistoryTimelineSnapshot {
  readonly sessionId: string | null
  readonly generation: number
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly cursor: number
  readonly messageFromSeq: number | null
  readonly hasOlderMessages: boolean
  readonly watching: boolean
}
export type GoalHistoryTimelineUpdate =
  | { readonly kind: 'loading' | 'snapshot' | 'window' | 'error'; readonly snapshot: GoalHistoryTimelineSnapshot }
  | { readonly kind: 'event'; readonly snapshot: GoalHistoryTimelineSnapshot; readonly event: SessionEvent }
export interface GoalHistoryTimelinePort {
  getSnapshot(): GoalHistoryTimelineSnapshot
  subscribe(listener: (update: GoalHistoryTimelineUpdate) => void | Promise<void>): () => void
}
export interface GoalHistoryEntry {
  readonly sessionId: string
  readonly status: 'idle' | 'loading' | 'ready' | 'error' | 'unsupported'
  readonly olderStatus: 'idle' | 'loading' | 'error' | 'limit'
  readonly error: string | null
  readonly olderError: string | null
  readonly stale: boolean
  readonly limit: boolean
  readonly facts: readonly Readonly<GoalHistoryFact>[]
  /** Null means unread, distinct from the confirmed start {seq:0, goal:null}. */
  readonly preceding: Readonly<GoalHistoryPage['preceding']> | null
  readonly anchorSeq: number | null
  readonly nextBeforeSeq: number | null
  readonly coveredFromSeq: number | null
  readonly coveredToSeq: number | null
  readonly messageFromSeq: number | null
  readonly hasOlderMessages: boolean
  readonly hasOlder: boolean
}
export interface GoalHistoryState {
  readonly available: boolean
  readonly sessionId: string | null
  readonly sessions: Readonly<Record<string, Readonly<GoalHistoryEntry>>>
}
export interface GoalHistoryProjection {
  readonly facts: readonly Readonly<GoalHistoryFact>[]
  readonly preceding: Readonly<GoalHistoryPage['preceding']> | null
  readonly gap: boolean
  readonly gapReason: 'unsupported' | 'unread' | 'stale' | 'error' | 'limit' | 'window' | null
  readonly coverage: { readonly fromSeq: number; readonly toSeq: number } | null
  readonly hasOlder: boolean
  readonly limit: boolean
  readonly stale: boolean
  readonly status: GoalHistoryEntry['status']
  readonly olderStatus: GoalHistoryEntry['olderStatus']
  readonly error: string | null
  readonly olderError: string | null
}

/** A Goal page is not a message page. Never insert older facts across an unread message interval. */
export function getGoalHistoryProjection(entry: Readonly<GoalHistoryEntry>): GoalHistoryProjection {
  const from = entry.hasOlderMessages ? entry.messageFromSeq : null
  const facts = from === null ? entry.facts : entry.facts.filter((fact) => fact.seq >= from)
  let preceding = entry.preceding
  if (from !== null) {
    for (const fact of entry.facts) {
      if (fact.seq >= from) break
      preceding = { seq: fact.seq, goal: fact.goal }
    }
  }
  const gapReason =
    entry.status === 'unsupported'
      ? 'unsupported'
      : entry.stale
        ? 'stale'
        : entry.error || entry.olderError
          ? 'error'
          : entry.coveredFromSeq === null || entry.coveredToSeq === null
            ? 'unread'
            : entry.limit && (from === null || entry.coveredFromSeq > from)
              ? 'limit'
              : from !== null && entry.coveredFromSeq > from
                ? 'window'
                : null
  return {
    facts,
    preceding,
    gap: gapReason !== null,
    gapReason,
    coverage:
      entry.coveredFromSeq !== null && entry.coveredToSeq !== null
        ? { fromSeq: entry.coveredFromSeq, toSeq: entry.coveredToSeq }
        : null,
    hasOlder: entry.hasOlder,
    limit: entry.limit,
    stale: entry.stale,
    status: entry.status,
    olderStatus: entry.olderStatus,
    error: entry.error,
    olderError: entry.olderError,
  }
}

const input = z.strictObject({ sessionId: idSchema })
const output = z.strictObject({ sessionId: idSchema, loaded: z.number().int().nonnegative(), hasOlder: z.boolean() })
const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.app-runtime',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  scope: 'session' as const,
  category: 'agent.goal.plan',
  visibility: 'internal' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as 'api'[],
  cancelMode: 'cooperative' as const,
  maxConcurrent: 8,
})
export const goalHistoryCommands = {
  'goalHistory.refresh': defineCommand(metadata('goalHistory.refresh'), input, output),
  'goalHistory.loadOlder': defineCommand(metadata('goalHistory.loadOlder'), input, output),
}

function code(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}
function initial(snapshot: GoalHistoryTimelineSnapshot, available: boolean): GoalHistoryEntry {
  if (!snapshot.sessionId) throw new CommandError('STALE_TARGET', 'Goal history has no session target')
  return {
    sessionId: snapshot.sessionId,
    status: available ? 'idle' : 'unsupported',
    olderStatus: 'idle',
    error: null,
    olderError: null,
    stale: true,
    limit: false,
    facts: [],
    preceding: null,
    anchorSeq: null,
    nextBeforeSeq: null,
    coveredFromSeq: null,
    coveredToSeq: null,
    messageFromSeq: snapshot.messageFromSeq,
    hasOlderMessages: snapshot.hasOlderMessages,
    hasOlder: false,
  }
}
function sameFact(left: Readonly<GoalHistoryFact>, right: Readonly<GoalHistoryFact>) {
  return JSON.stringify(left) === JSON.stringify(right)
}
function mergeFacts(first: readonly Readonly<GoalHistoryFact>[], second: readonly Readonly<GoalHistoryFact>[]) {
  const bySequence = new Map<number, Readonly<GoalHistoryFact>>()
  const byId = new Map<string, number>()
  for (const fact of [...first, ...second]) {
    const previous = bySequence.get(fact.seq)
    if ((previous && !sameFact(previous, fact)) || (byId.has(fact.eventId) && byId.get(fact.eventId) !== fact.seq))
      throw new CommandError('INVALID_OUTPUT', 'Goal history contains contradictory canonical facts')
    bySequence.set(fact.seq, fact)
    byId.set(fact.eventId, fact.seq)
  }
  return [...bySequence.values()].sort((left, right) => left.seq - right.seq)
}

/** One owner consumes the timeline's canonical watcher; no second follow and no token-stream reads. */
export function createGoalHistory(
  local: CommandRegistry,
  port: CommandExecutor | undefined,
  timeline: GoalHistoryTimelinePort,
  navigation: StateReader<NavigationState>,
  onSubscriberError: (reason: unknown) => void,
  isDisposed: () => boolean,
) {
  const state = createState<GoalHistoryState>(
    { available: Boolean(port), sessionId: null, sessions: {} },
    onSubscriberError,
  )
  const client = port ? createCommandClient(hostCommands, port) : null
  const recency = new Set<string>()
  const observed = new Map<string, readonly Readonly<GoalHistoryFact>[]>()
  const requests = new Map<string, { controller: AbortController; generation: number; timelineGeneration: number }>()
  let generation = 0
  let disposed = false
  function replace(entry: GoalHistoryEntry) {
    recency.delete(entry.sessionId)
    recency.add(entry.sessionId)
    const sessions = { ...state.reader.getSnapshot().sessions, [entry.sessionId]: entry }
    while (recency.size > MAX_SESSIONS) {
      const oldest = recency.values().next().value
      if (!oldest) break
      recency.delete(oldest)
      requests.get(oldest)?.controller.abort()
      requests.delete(oldest)
      observed.delete(oldest)
      delete sessions[oldest]
    }
    state.replace({ available: Boolean(port), sessionId: navigation.getSnapshot().sessionId, sessions })
  }
  function entryFor(snapshot: GoalHistoryTimelineSnapshot) {
    if (!snapshot.sessionId) throw new CommandError('STALE_TARGET', 'Goal history has no session target')
    return state.reader.getSnapshot().sessions[snapshot.sessionId] ?? initial(snapshot, Boolean(port))
  }
  function assertSelected(sessionId: string) {
    const snapshot = timeline.getSnapshot()
    if (disposed || isDisposed()) throw new CommandError('DISPOSED', 'Goal history runtime is disposed')
    if (navigation.getSnapshot().sessionId !== sessionId || snapshot.sessionId !== sessionId)
      throw new CommandError('STALE_TARGET', 'Goal history target is not the selected session')
    if (snapshot.status !== 'ready' || !snapshot.watching)
      throw new CommandError('NOT_READY', 'Goal history requires a confirmed timeline cursor')
    return snapshot
  }
  async function read(sessionId: string, older: boolean, externalSignal?: AbortSignal) {
    const snapshot = assertSelected(sessionId)
    const previous = entryFor(snapshot)
    if (!client) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Goal history is unavailable')
    if (requests.has(sessionId)) throw new CommandError('BUSY', 'Goal history is already loading')
    if (older && (previous.stale || previous.anchorSeq === null))
      throw new CommandError('NOT_READY', 'Refresh Goal history before reading older facts')
    if (older && (!previous.hasOlder || previous.limit)) return { sessionId, loaded: 0, hasOlder: previous.hasOlder }
    const available = GOAL_HISTORY_MAX_FACTS - previous.facts.length
    if (older && available <= 0) {
      replace({ ...previous, limit: true, olderStatus: 'limit' })
      return { sessionId, loaded: 0, hasOlder: previous.hasOlder }
    }
    const controller = new AbortController()
    const request = { controller, generation: ++generation, timelineGeneration: snapshot.generation }
    requests.set(sessionId, request)
    const anchorSeq = older ? previous.anchorSeq : snapshot.cursor
    if (anchorSeq === null) throw new CommandError('NOT_READY', 'Goal history anchor is unread')
    const beforeSeq = older ? previous.nextBeforeSeq : null
    const limit = older ? Math.min(PAGE_SIZE, available) : PAGE_SIZE
    const abort = () => controller.abort(new CommandError('CANCELLED', 'Goal history read was cancelled'))
    externalSignal?.addEventListener('abort', abort, { once: true })
    if (externalSignal?.aborted) abort()
    replace({
      ...previous,
      status: older ? previous.status : 'loading',
      olderStatus: older ? 'loading' : 'idle',
      error: older ? previous.error : null,
      olderError: null,
    })
    const current = () =>
      !disposed &&
      !isDisposed() &&
      requests.get(sessionId) === request &&
      navigation.getSnapshot().sessionId === sessionId &&
      timeline.getSnapshot().generation === request.timelineGeneration
    const timer = setTimeout(
      () => controller.abort(new CommandError('TIMEOUT', 'Goal history read timed out')),
      READ_TIMEOUT,
    )
    let removeAbort = () => {}
    try {
      const interrupted = new Promise<never>((_resolve, reject) => {
        const cancelled = () =>
          reject(
            controller.signal.reason instanceof CommandError
              ? controller.signal.reason
              : new CommandError('QUERY_SUPERSEDED', 'Goal history target changed'),
          )
        controller.signal.addEventListener('abort', cancelled, { once: true })
        removeAbort = () => controller.signal.removeEventListener('abort', cancelled)
        if (controller.signal.aborted) cancelled()
      })
      const page = await Promise.race([
        client.execute(
          'goal.history',
          { sessionId, anchorSeq, ...(beforeSeq !== null ? { beforeSeq } : {}), limit },
          { signal: controller.signal },
        ),
        interrupted,
      ])
      if (!current()) throw new CommandError('QUERY_SUPERSEDED', 'Goal history target changed')
      if (
        page.sessionId !== sessionId ||
        page.anchorSeq !== anchorSeq ||
        page.items.length > limit ||
        (beforeSeq !== null && (page.items.some((fact) => fact.seq >= beforeSeq) || page.preceding.seq >= beforeSeq))
      )
        throw new CommandError('INVALID_OUTPUT', 'Goal history page does not match its target or cursor')
      const latest = entryFor(timeline.getSnapshot())
      if (older) {
        const boundary = page.items.at(-1)
        if (
          !boundary ||
          !previous.preceding ||
          boundary.seq !== previous.preceding.seq ||
          JSON.stringify(boundary.goal) !== JSON.stringify(previous.preceding.goal)
        )
          throw new CommandError('INVALID_OUTPUT', 'Older Goal page does not meet its confirmed boundary')
      }
      // A live fact that overlaps the fetched window must agree with the durable page.
      mergeFacts(
        latest.facts.filter((fact) => page.items.some((item) => item.seq === fact.seq)),
        page.items,
      )
      const tail = (observed.get(sessionId) ?? []).filter((fact) => fact.seq > anchorSeq)
      // A new snapshot cannot certify an older cache across an unobserved interval. Rebuild coverage from its own page.
      const facts = mergeFacts(older ? latest.facts : tail, page.items)
      if (facts.length > GOAL_HISTORY_MAX_FACTS)
        throw new CommandError('CAPACITY_EXCEEDED', 'Goal history capacity reached')
      const hasOlder = page.nextBeforeSeq !== null
      replace({
        ...latest,
        status: 'ready',
        olderStatus: facts.length >= GOAL_HISTORY_MAX_FACTS && hasOlder ? 'limit' : 'idle',
        error: null,
        olderError: null,
        stale: false,
        limit: facts.length >= GOAL_HISTORY_MAX_FACTS && hasOlder,
        facts,
        preceding: page.preceding,
        anchorSeq,
        nextBeforeSeq: page.nextBeforeSeq,
        coveredFromSeq: hasOlder ? (page.items[0]?.seq ?? null) : 0,
        coveredToSeq: timeline.getSnapshot().cursor,
        hasOlder,
      })
      return { sessionId, loaded: page.items.length, hasOlder }
    } catch (reason) {
      if (current()) {
        const latest = entryFor(timeline.getSnapshot())
        replace({
          ...latest,
          status: older ? latest.status : 'error',
          olderStatus: older ? 'error' : 'idle',
          error: older ? latest.error : code(reason),
          olderError: older ? code(reason) : null,
          stale: older ? latest.stale : true,
        })
      }
      throw reason
    } finally {
      clearTimeout(timer)
      removeAbort()
      externalSignal?.removeEventListener('abort', abort)
      if (requests.get(sessionId) === request) requests.delete(sessionId)
    }
  }
  async function fillWindow(sessionId: string, signal?: AbortSignal) {
    for (let page = 0; page < MAX_FILL_PAGES; page += 1) {
      if (signal?.aborted) throw new CommandError('CANCELLED', 'Goal history read was cancelled')
      assertSelected(sessionId)
      const entry = state.reader.getSnapshot().sessions[sessionId]
      const targetFrom = entry?.hasOlderMessages ? (entry.messageFromSeq ?? 0) : 0
      if (
        !entry ||
        entry.stale ||
        entry.messageFromSeq === null ||
        !entry.hasOlder ||
        entry.limit ||
        (entry.coveredFromSeq !== null && entry.coveredFromSeq <= targetFrom)
      )
        return
      await read(sessionId, true, signal)
    }
    const entry = state.reader.getSnapshot().sessions[sessionId]
    if (
      entry &&
      entry.messageFromSeq !== null &&
      entry.coveredFromSeq !== null &&
      entry.coveredFromSeq > (entry.hasOlderMessages ? entry.messageFromSeq : 0)
    )
      replace({ ...entry, limit: true, olderStatus: 'limit' })
  }
  async function receive(update: GoalHistoryTimelineUpdate) {
    const snapshot = update.snapshot
    if (update.kind === 'loading') {
      for (const request of requests.values()) request.controller.abort()
      requests.clear()
      observed.clear()
      state.replace({ ...state.reader.getSnapshot(), sessionId: snapshot.sessionId })
      if (snapshot.sessionId)
        replace({ ...entryFor(snapshot), stale: true, status: client ? 'idle' : 'unsupported', olderStatus: 'idle' })
      return
    }
    if (!snapshot.sessionId || navigation.getSnapshot().sessionId !== snapshot.sessionId) return
    const entry = entryFor(snapshot)
    if (update.kind === 'error') {
      replace({
        ...entry,
        stale: true,
        status: client ? 'error' : 'unsupported',
        error: client ? 'TIMELINE_UNAVAILABLE' : null,
      })
      return
    }
    if (update.kind === 'event') {
      try {
        const fact = parseGoalHistoryEvent(update.event)
        if (fact)
          observed.set(
            snapshot.sessionId,
            mergeFacts(observed.get(snapshot.sessionId) ?? [], [fact]).slice(-GOAL_HISTORY_MAX_FACTS),
          )
        const facts = fact ? mergeFacts(entry.facts, [fact]) : entry.facts
        const overflow = Math.max(0, facts.length - GOAL_HISTORY_MAX_FACTS)
        const dropped = overflow ? facts[overflow - 1] : undefined
        replace({
          ...entry,
          facts: overflow ? facts.slice(overflow) : facts,
          preceding: dropped ? { seq: dropped.seq, goal: dropped.goal } : entry.preceding,
          coveredFromSeq: overflow ? (facts[overflow]?.seq ?? entry.coveredFromSeq) : entry.coveredFromSeq,
          coveredToSeq: entry.coveredToSeq === null ? null : snapshot.cursor,
          hasOlder: entry.hasOlder || overflow > 0,
          limit: entry.limit || overflow > 0,
          messageFromSeq: snapshot.messageFromSeq,
          hasOlderMessages: snapshot.hasOlderMessages,
        })
      } catch (reason) {
        requests
          .get(snapshot.sessionId)
          ?.controller.abort(new CommandError('INVALID_OUTPUT', 'Invalid canonical Goal fact'))
        replace({ ...entry, status: 'error', stale: true, error: code(reason) })
      }
      return
    }
    replace({ ...entry, messageFromSeq: snapshot.messageFromSeq, hasOlderMessages: snapshot.hasOlderMessages })
    if (!client) return
    try {
      if (update.kind === 'snapshot') await read(snapshot.sessionId, false)
      await fillWindow(snapshot.sessionId)
    } catch {
      // The read owns its local error. A successful message page must remain available.
    }
  }
  const unsubscribe = timeline.subscribe(receive)
  const snapshot = timeline.getSnapshot()
  if (snapshot.sessionId) {
    replace(initial(snapshot, Boolean(port)))
    if (snapshot.status === 'ready' && snapshot.watching) void receive({ kind: 'snapshot', snapshot })
  }
  local.register(goalHistoryCommands['goalHistory.refresh'], async ({ sessionId }, execution) => {
    const result = await read(sessionId, false, execution.signal)
    await fillWindow(sessionId, execution.signal)
    return result
  })
  local.register(goalHistoryCommands['goalHistory.loadOlder'], ({ sessionId }, execution) =>
    read(sessionId, true, execution.signal),
  )
  return {
    reader: state.reader,
    dispose() {
      disposed = true
      unsubscribe()
      for (const request of requests.values()) request.controller.abort()
      requests.clear()
      recency.clear()
      observed.clear()
      state.dispose()
    },
  }
}

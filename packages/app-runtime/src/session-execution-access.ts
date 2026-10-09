import { CommandError } from '@hbar/commands'
import type { Session } from '@hbar/contracts/directory'
import { createState, type StateReader } from './state'
import type { ConfirmedSessionSubscriber } from './session-projection-fence'
import type { DirectoryState, NavigationState } from './types'

export interface SessionExecutionTarget {
  readonly sessionId: string
  readonly workspaceId: string
}

interface SessionExecutionFact {
  readonly target: SessionExecutionTarget
  readonly seq: number
  readonly updatedAt: number
}
export interface ReadySessionExecutionAccess extends SessionExecutionFact {
  readonly kind: 'ready'
}
export interface ArchivedSessionExecutionAccess extends SessionExecutionFact {
  readonly kind: 'archived'
}
export interface UnverifiedSessionExecutionAccess {
  readonly kind: 'unverified'
  readonly target: SessionExecutionTarget | null
  readonly reason:
    | 'no_target'
    | 'missing_fact'
    | 'target_mismatch'
    | 'conflicting_fact'
    | 'navigation_pending'
    | 'disposed'
    | 'deleted'
}
export type SessionExecutionAccess =
  ReadySessionExecutionAccess | ArchivedSessionExecutionAccess | UnverifiedSessionExecutionAccess

export interface SessionExecutionAccessOptions {
  readonly navigation: StateReader<NavigationState>
  readonly directory: StateReader<DirectoryState>
  readonly subscribeConfirmedSessions: ConfirmedSessionSubscriber
  readonly onSubscriberError: (error: unknown) => void
}

export interface SessionExecutionAccessOwner {
  readonly reader: StateReader<SessionExecutionAccess>
  /** Explicit targets are independent of current selection. Missing canonical facts fail closed. */
  readonly get: (target: SessionExecutionTarget) => SessionExecutionAccess
  /** A local pre-dispatch check, not an atomic Host policy or an existing-Run control gate. */
  readonly assertCanPrepare: (target: SessionExecutionTarget) => ReadySessionExecutionAccess
  readonly dispose: () => void
}

interface SelectedFact extends SessionExecutionFact {
  readonly archived: boolean
  readonly conflicted: boolean
}

function sameTarget(a: SessionExecutionTarget | null, b: SessionExecutionTarget | null): boolean {
  return a === b || (!!a && !!b && a.sessionId === b.sessionId && a.workspaceId === b.workspaceId)
}

function targetCopy(target: SessionExecutionTarget): SessionExecutionTarget {
  return Object.freeze({ sessionId: target.sessionId, workspaceId: target.workspaceId })
}

function navigationTarget(navigation: NavigationState): SessionExecutionTarget | null {
  return navigation.sessionId && navigation.workspaceId
    ? targetCopy({ sessionId: navigation.sessionId, workspaceId: navigation.workspaceId })
    : null
}

function unverified(
  target: SessionExecutionTarget | null,
  reason: UnverifiedSessionExecutionAccess['reason'],
): UnverifiedSessionExecutionAccess {
  return Object.freeze({ kind: 'unverified', target: target ? targetCopy(target) : null, reason })
}

/** Sequence is authoritative; updatedAt only breaks a sequence tie, matching canonical Directory merging. */
function compareVersion(a: SessionExecutionFact, b: SessionExecutionFact): number {
  return a.seq === b.seq ? Math.sign(a.updatedAt - b.updatedAt) : Math.sign(a.seq - b.seq)
}

function accept(previous: SelectedFact | null, session: Readonly<Session>): SelectedFact {
  const next: SelectedFact = {
    target: targetCopy({ sessionId: session.id, workspaceId: session.workspaceId }),
    seq: session.seq,
    updatedAt: session.updatedAt,
    archived: session.archived,
    conflicted: false,
  }
  if (!previous || !sameTarget(previous.target, next.target)) return next
  const order = compareVersion(next, previous)
  if (order < 0) return previous
  if (order > 0) return next
  if (previous.conflicted || previous.archived === next.archived) return previous
  // Contradictory flags at an identical version cannot prove restore. Only a higher version recovers.
  return { ...previous, conflicted: true }
}

function sameAccess(a: SessionExecutionAccess, b: SessionExecutionAccess): boolean {
  if (a.kind !== b.kind || !sameTarget(a.target, b.target)) return false
  if (a.kind === 'unverified' || b.kind === 'unverified')
    return a.kind === 'unverified' && b.kind === 'unverified' && a.reason === b.reason
  return a.seq === b.seq && a.updatedAt === b.updatedAt
}

/**
 * Derives preparation access from canonical readers and accepted facts. O(1) retained projection:
 * only the current target's identity/version/archive flag, never titles, full Sessions or a floor map.
 * Noncurrent targets rely on Directory's accepted-version guarantees (35a2852), not another cache.
 */
export function createSessionExecutionAccess(options: SessionExecutionAccessOptions): SessionExecutionAccessOwner {
  let disposed = false
  let selectedTarget = navigationTarget(options.navigation.getSnapshot())
  let selectedFact: SelectedFact | null = null
  const state = createState<SessionExecutionAccess>(
    unverified(selectedTarget, selectedTarget ? 'missing_fact' : 'no_target'),
    options.onSubscriberError,
  )

  const syncTarget = () => {
    const next = navigationTarget(options.navigation.getSnapshot())
    if (!sameTarget(next, selectedTarget)) {
      selectedTarget = next
      selectedFact = null
    }
  }
  const canonicalFact = (target: SessionExecutionTarget) => options.directory.getSnapshot().sessions[target.sessionId]
  const matches = (session: Readonly<Session>, target: SessionExecutionTarget) =>
    session.id === target.sessionId && session.workspaceId === target.workspaceId

  const get = (requested: SessionExecutionTarget): SessionExecutionAccess => {
    const target = targetCopy(requested)
    if (disposed) return unverified(target, 'disposed')
    if (options.directory.getSnapshot().deletedSessions?.[target.sessionId]) return unverified(target, 'deleted')
    const session = canonicalFact(target)
    if (!session) return unverified(target, 'missing_fact')
    if (!matches(session, target)) return unverified(target, 'target_mismatch')
    const current = sameTarget(target, selectedTarget)
    const fact = accept(current ? selectedFact : null, session)
    if (fact.conflicted) return unverified(target, 'conflicting_fact')
    if (fact.archived) return Object.freeze({ kind: 'archived', target, seq: fact.seq, updatedAt: fact.updatedAt })
    // An unrelated navigation in progress must not block a separately captured target.
    if (current && options.navigation.getSnapshot().status === 'loading')
      return unverified(target, 'navigation_pending')
    return Object.freeze({ kind: 'ready', target, seq: fact.seq, updatedAt: fact.updatedAt })
  }
  const publish = () => {
    if (disposed) return
    const next = selectedTarget ? get(selectedTarget) : unverified(null, 'no_target')
    if (!sameAccess(next, state.reader.getSnapshot())) state.replace(next)
  }
  const sync = () => {
    if (disposed) return
    syncTarget()
    if (selectedTarget) {
      const session = canonicalFact(selectedTarget)
      if (session && matches(session, selectedTarget)) selectedFact = accept(selectedFact, session)
    }
    publish()
  }

  // Subscribe before seeding, so a synchronous accepted archive during subscription cannot be lost.
  const stopConfirmed = options.subscribeConfirmedSessions((facts) => {
    if (disposed) return
    syncTarget()
    for (const session of facts)
      if (selectedTarget && matches(session, selectedTarget)) selectedFact = accept(selectedFact, session)
    sync()
  })
  const stopDirectory = options.directory.subscribe(sync)
  const stopNavigation = options.navigation.subscribe(sync)
  sync()

  return {
    reader: state.reader,
    get,
    assertCanPrepare(target) {
      const access = get(target)
      if (access.kind === 'unverified' && access.reason === 'deleted')
        throw new CommandError('SESSION_DELETED', 'The captured session was deleted')
      if (access.kind === 'archived') throw new CommandError('ARCHIVED', 'The captured session is confirmed archived')
      if (access.kind !== 'ready')
        throw new CommandError('SESSION_UNVERIFIED', 'The captured session has no verified execution access')
      return access
    },
    dispose() {
      if (disposed) return
      disposed = true
      stopConfirmed()
      stopDirectory()
      stopNavigation()
      selectedFact = null
      state.replace(unverified(selectedTarget, 'disposed'))
      state.dispose()
    },
  }
}

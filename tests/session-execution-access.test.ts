import { expect, test } from 'bun:test'
import type { DirectoryState, NavigationState, StateReader } from '@hbar/app-runtime'
import type { Session } from '@hbar/contracts/directory'
import {
  createSessionExecutionAccess,
  type SessionExecutionTarget,
} from '../packages/app-runtime/src/session-execution-access'
import { createState } from '../packages/app-runtime/src/state'

const targetA = { sessionId: 'a', workspaceId: 'w' }
const targetB = { sessionId: 'b', workspaceId: 'w' }
const session = (id = 'a', seq = 1, archived = false, updatedAt = seq, workspaceId = 'w'): Session => ({
  id,
  seq,
  archived,
  updatedAt,
  workspaceId,
  title: `Private title ${id}`,
  parentId: null,
  createdAt: 1,
})

function tracked<State>(source: StateReader<State>) {
  let subscriptions = 0
  return {
    reader: {
      getSnapshot: source.getSnapshot,
      subscribe(listener: () => void) {
        subscriptions++
        const stop = source.subscribe(listener)
        let stopped = false
        return () => {
          if (stopped) return
          stopped = true
          subscriptions--
          stop()
        }
      },
    },
    count: () => subscriptions,
  }
}

function fixture(initial: readonly Session[] = [session(), session('b')], duringSubscription?: readonly Session[]) {
  const errors: unknown[] = []
  const navigation = createState<NavigationState>({ ...targetA, status: 'idle', error: null }, (error) =>
    errors.push(error),
  )
  const directory = createState<DirectoryState>(
    { workspaces: {}, sessions: Object.fromEntries(initial.map((session) => [session.id, session])) },
    (error) => errors.push(error),
  )
  const nav = tracked(navigation.reader)
  const dir = tracked(directory.reader)
  const listeners = new Set<(facts: readonly Session[]) => void>()
  let capturedListener: ((facts: readonly Session[]) => void) | undefined
  const owner = createSessionExecutionAccess({
    navigation: nav.reader,
    directory: dir.reader,
    onSubscriberError: (error) => errors.push(error),
    subscribeConfirmedSessions(listener) {
      listeners.add(listener)
      capturedListener = listener
      if (duringSubscription) listener(duringSubscription)
      return () => {
        listeners.delete(listener)
      }
    },
  })
  const observe = (facts: readonly Session[]) => {
    for (const listener of listeners) listener(facts)
  }
  const replace = (facts: readonly Session[]) =>
    directory.replace({ workspaces: {}, sessions: Object.fromEntries(facts.map((session) => [session.id, session])) })
  return {
    owner,
    errors,
    observe,
    replace,
    accept(facts: readonly Session[]) {
      replace(facts)
      observe(facts)
    },
    select(target: SessionExecutionTarget | null, status: NavigationState['status'] = 'idle') {
      navigation.replace({
        workspaceId: target?.workspaceId ?? null,
        sessionId: target?.sessionId ?? null,
        status,
        error: null,
      })
    },
    selectWorkspace(workspaceId: string) {
      navigation.replace({ workspaceId, sessionId: null, status: 'idle', error: null })
    },
    late: (facts: readonly Session[]) => capturedListener?.(facts),
    subscriptions: () => [nav.count(), dir.count(), listeners.size],
    dispose() {
      owner.dispose()
      navigation.dispose()
      directory.dispose()
    },
  }
}

test('exact canonical target seeds immutable ready access without retaining Session content', () => {
  const f = fixture()
  try {
    expect(f.owner.reader.getSnapshot()).toEqual({ kind: 'ready', target: targetA, seq: 1, updatedAt: 1 })
    const requested = { ...targetA }
    const captured = f.owner.assertCanPrepare(requested)
    requested.workspaceId = 'changed'
    expect(captured.target).toEqual(targetA)
    expect(Object.isFrozen(captured)).toBe(true)
    expect(Object.isFrozen(captured.target)).toBe(true)
    expect(JSON.stringify(captured)).not.toContain('Private title')
  } finally {
    f.dispose()
  }
})

test('accepted archive blocks only its exact target while another target remains ready', () => {
  const f = fixture()
  try {
    f.accept([session('a', 2, true), session('b')])
    expect(f.owner.reader.getSnapshot()).toEqual({ kind: 'archived', target: targetA, seq: 2, updatedAt: 2 })
    expect(() => f.owner.assertCanPrepare(targetA)).toThrow()
    try {
      f.owner.assertCanPrepare(targetA)
    } catch (error) {
      expect(error).toMatchObject({ code: 'ARCHIVED' })
    }
    expect(f.owner.assertCanPrepare(targetB).kind).toBe('ready')
  } finally {
    f.dispose()
  }
})

test('a synchronous accepted archive during subscription is not overwritten by the initial older reader seed', () => {
  const f = fixture([session()], [session('a', 2, true)])
  try {
    expect(f.owner.reader.getSnapshot()).toMatchObject({ kind: 'archived', seq: 2 })
  } finally {
    f.dispose()
  }
})

for (const older of [session('a', 2, false, 999), session('a', 3, false, 9)])
  test(`late false at seq ${older.seq}, time ${older.updatedAt} cannot unlock an accepted archive`, () => {
    const f = fixture([session('a', 3, true, 10)])
    try {
      const before = f.owner.reader.getSnapshot()
      f.replace([older])
      f.observe([older])
      expect(f.owner.reader.getSnapshot()).toBe(before)
      expect(f.owner.get(targetA)).toMatchObject({ kind: 'archived', seq: 3, updatedAt: 10 })
    } finally {
      f.dispose()
    }
  })

for (const restored of [session('a', 4, false, 1), session('a', 3, false, 11)])
  test(`strictly updated restore seq ${restored.seq}, time ${restored.updatedAt} unlocks access`, () => {
    const f = fixture([session('a', 3, true, 10)])
    try {
      f.accept([restored])
      expect(f.owner.assertCanPrepare(targetA)).toMatchObject({
        kind: 'ready',
        seq: restored.seq,
        updatedAt: restored.updatedAt,
      })
    } finally {
      f.dispose()
    }
  })

test('opposite flags at an identical version stay unverified until a strictly higher fact arrives', () => {
  const f = fixture([session('a', 3, true, 10)])
  try {
    f.accept([session('a', 3, false, 10)])
    expect(f.owner.get(targetA)).toMatchObject({ kind: 'unverified', reason: 'conflicting_fact' })
    for (const next of [session('a', 3, true, 10), session('a', 3, false, 10), session('a', 2, true, 99)]) {
      f.replace([next])
      f.observe([next])
      expect(f.owner.reader.getSnapshot()).toMatchObject({ kind: 'unverified', reason: 'conflicting_fact' })
    }
    f.accept([session('a', 4, false, 1)])
    expect(f.owner.assertCanPrepare(targetA).kind).toBe('ready')
  } finally {
    f.dispose()
  }
})

test('missing facts, partial selection and foreign scope are unverified, never a fabricated archive', () => {
  const f = fixture([])
  try {
    expect(f.owner.reader.getSnapshot()).toMatchObject({ kind: 'unverified', reason: 'missing_fact' })
    expect(() => f.owner.assertCanPrepare(targetA)).toThrow()
    try {
      f.owner.assertCanPrepare(targetA)
    } catch (error) {
      expect(error).toMatchObject({ code: 'SESSION_UNVERIFIED' })
    }
    f.replace([session('a', 1, false, 1, 'other')])
    expect(f.owner.reader.getSnapshot()).toMatchObject({ kind: 'unverified', reason: 'target_mismatch' })
    f.select(null)
    expect(f.owner.reader.getSnapshot()).toEqual({ kind: 'unverified', target: null, reason: 'no_target' })
    f.selectWorkspace('w')
    expect(f.owner.reader.getSnapshot()).toEqual({ kind: 'unverified', target: null, reason: 'no_target' })
  } finally {
    f.dispose()
  }
})

test('cache absence after a known fact fails closed; stale data returning cannot unlock its selected archive', () => {
  const f = fixture([session('a', 4, true)])
  try {
    f.replace([])
    expect(f.owner.reader.getSnapshot()).toMatchObject({ kind: 'unverified', reason: 'missing_fact' })
    f.replace([session('a', 1)])
    expect(f.owner.reader.getSnapshot()).toMatchObject({ kind: 'archived', seq: 4 })
  } finally {
    f.dispose()
  }
})

test('wrong-session and wrong-workspace accepted callbacks cannot change current access', () => {
  const f = fixture([session('a', 2)])
  try {
    const before = f.owner.reader.getSnapshot()
    f.observe([session('b', 50, true), session('a', 50, true, 50, 'other')])
    expect(f.owner.reader.getSnapshot()).toBe(before)
    expect(f.owner.get({ sessionId: 'a', workspaceId: 'other' })).toMatchObject({
      kind: 'unverified',
      reason: 'target_mismatch',
    })
  } finally {
    f.dispose()
  }
})

test('navigation loading affects only matching current ready target, not another captured target or a known archive', () => {
  const f = fixture()
  try {
    f.select(targetA, 'loading')
    expect(f.owner.get(targetA)).toMatchObject({ kind: 'unverified', reason: 'navigation_pending' })
    expect(f.owner.get(targetB).kind).toBe('ready')
    f.accept([session('a', 2, true), session('b')])
    expect(f.owner.reader.getSnapshot().kind).toBe('archived')
    f.select(targetA)
    expect(f.owner.reader.getSnapshot().kind).toBe('archived')
  } finally {
    f.dispose()
  }
})

test('switching A/B never publishes a late A callback into B and returning rehydrates canonical facts', () => {
  const f = fixture()
  try {
    f.accept([session('a', 2, true), session('b')])
    f.select(targetB)
    const b = f.owner.reader.getSnapshot()
    f.observe([session('a', 3, true)])
    expect(f.owner.reader.getSnapshot()).toBe(b)
    f.select(targetA)
    expect(f.owner.reader.getSnapshot()).toMatchObject({ kind: 'archived', seq: 2 })
    f.select(targetB)
    f.replace([session('b')])
    f.select(targetA)
    expect(f.owner.reader.getSnapshot()).toMatchObject({ kind: 'unverified', reason: 'missing_fact' })
  } finally {
    f.dispose()
  }
})

test('unchanged projected content retains reader object identity and does not notify unrelated changes', () => {
  const f = fixture()
  let notifications = 0
  const stop = f.owner.reader.subscribe(() => {
    notifications++
  })
  try {
    const before = f.owner.reader.getSnapshot()
    f.replace([{ ...session(), title: 'Changed title' }, session('b', 2)])
    f.observe([session(), session('b', 3, true)])
    f.select(targetA)
    expect(f.owner.reader.getSnapshot()).toBe(before)
    expect(notifications).toBe(0)
    f.accept([session('a', 2, true)])
    expect(notifications).toBe(1)
  } finally {
    stop()
    f.dispose()
  }
})

test('many selections retain only the current projection and exactly three owner subscriptions', () => {
  const f = fixture()
  try {
    for (let index = 0; index < 1000; index++) {
      const id = `session-${index}`
      f.replace([session(id, index + 1)])
      f.select({ sessionId: id, workspaceId: 'w' })
    }
    expect(f.subscriptions()).toEqual([1, 1, 1])
    expect(f.owner.reader.getSnapshot()).toEqual({
      kind: 'ready',
      target: { sessionId: 'session-999', workspaceId: 'w' },
      seq: 1000,
      updatedAt: 1000,
    })
    expect(f.owner.get(targetA)).toMatchObject({ kind: 'unverified', reason: 'missing_fact' })
  } finally {
    f.dispose()
  }
})

test('dispose replaces ready with typed unverified, releases subscriptions once and ignores every late callback', () => {
  const f = fixture()
  f.owner.dispose()
  const disposed = f.owner.reader.getSnapshot()
  expect(disposed).toMatchObject({ kind: 'unverified', reason: 'disposed' })
  f.owner.dispose()
  expect(f.subscriptions()).toEqual([0, 0, 0])
  f.late([session('a', 2, true)])
  f.replace([session('a', 3)])
  f.select(targetB)
  expect(f.owner.reader.getSnapshot()).toBe(disposed)
  expect(f.owner.get(targetB)).toMatchObject({ kind: 'unverified', reason: 'disposed' })
  expect(() => f.owner.assertCanPrepare(targetA)).toThrow()
  f.dispose()
})

test('a subscriber error is reported without preventing another consumer from receiving archive access', () => {
  const f = fixture()
  const failure = new Error('Consumer failed')
  let received = 0
  const first = f.owner.reader.subscribe(() => {
    throw failure
  })
  const second = f.owner.reader.subscribe(() => {
    received++
  })
  try {
    f.accept([session('a', 2, true)])
    expect(f.errors).toEqual([failure])
    expect(received).toBe(1)
  } finally {
    first()
    second()
    f.dispose()
  }
})

test('pre-dispatch preparation harness refuses a write after archive was observed during an await', async () => {
  const f = fixture()
  const preparation = Promise.withResolvers<void>()
  let dispatched = 0
  const attempt = (async () => {
    f.owner.assertCanPrepare(targetA)
    await preparation.promise
    f.owner.assertCanPrepare(targetA)
    dispatched++
  })()
  try {
    f.accept([session('a', 2, true)])
    preparation.resolve()
    await expect(attempt).rejects.toMatchObject({ code: 'ARCHIVED' })
    expect(dispatched).toBe(0)
  } finally {
    preparation.resolve()
    f.dispose()
  }
})

test('post-dispatch harness preserves the original acknowledgement; observing archive cannot roll it back', async () => {
  const f = fixture()
  const reply = Promise.withResolvers<{ sessionId: string; commitId: string }>()
  const captured = f.owner.assertCanPrepare(targetA)
  const dispatched = reply.promise
  try {
    f.accept([session('a', 2, true)])
    reply.resolve({ sessionId: captured.target.sessionId, commitId: 'already-dispatched' })
    expect(await dispatched).toEqual({ sessionId: 'a', commitId: 'already-dispatched' })
    expect(f.owner.get(targetA).kind).toBe('archived')
    // This is a local seam harness, not a Host atomic-archive guarantee or a wired Goal workflow.
  } finally {
    reply.resolve({ sessionId: 'a', commitId: 'already-dispatched' })
    f.dispose()
  }
})

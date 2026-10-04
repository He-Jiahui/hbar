import { expect, test } from 'bun:test'
import { CommandError } from '@hbar/commands'
import { sessionLaunchTargetPreparationSnapshotSchema } from '@hbar/contracts/commands/session-launch-target'
import type {
  SessionLaunchTargetPreparationManager,
  SessionLaunchTargetPreparationOperationInput,
  SessionLaunchTargetPreparationSnapshot,
  SessionLaunchTargetPreparationStartInput,
  SessionLaunchTargetPreparationStartReceipt,
  SessionLaunchTargetSetInput,
  SessionLaunchTargetSetReceipt,
} from '@hbar/contracts/commands/session-launch-target'
import {
  capturePreSessionLaunchPreparation,
  PreSessionLaunchPreparation,
} from '../packages/app-runtime/src/pre-session-launch-preparation'

const keys = {
  setSelection: 'set-key',
  start: 'start-key',
  cancel: 'cancel-key',
  reconcile: 'reconcile-key',
} as const

function snapshot(
  status: SessionLaunchTargetPreparationSnapshot['status'],
  operationVersion = 1,
  updates: Partial<SessionLaunchTargetPreparationSnapshot> = {},
): SessionLaunchTargetPreparationSnapshot {
  const base = {
    schemaVersion: 1 as const,
    operationId: 'operation-1',
    sessionId: 'session-1',
    workspaceId: 'workspace-1',
    targetRevision: 7,
    operationVersion,
    status,
    createdAt: 10,
    updatedAt: 10 + operationVersion,
  }
  return sessionLaunchTargetPreparationSnapshotSchema.parse({
    ...base,
    status,
    ...(status === 'failed' || status === 'reconciling'
      ? { error: { code: 'GIT_FAILED', message: 'Fixture failure' } }
      : {}),
    ...updates,
  })
}

function fixture(
  options: {
    readonly setError?: CommandError
    readonly startUnknownCount?: number
    readonly startNeverSettles?: boolean
    readonly readTargetNeverSettles?: boolean
    readonly readNeverSettles?: boolean
    readonly reads?: readonly SessionLaunchTargetPreparationSnapshot[]
    readonly cancelSnapshot?: SessionLaunchTargetPreparationSnapshot
    readonly cancelGate?: Promise<void>
    readonly readGate?: {
      readonly promise: Promise<void>
      readonly entered: Promise<void>
      readonly markEntered?: () => void
    }
  } = {},
) {
  const setCalls: { input: SessionLaunchTargetSetInput; key: string }[] = []
  const startCalls: { input: SessionLaunchTargetPreparationStartInput; key: string }[] = []
  const cancelCalls: { input: SessionLaunchTargetPreparationOperationInput; key: string }[] = []
  const reconcileCalls: { input: SessionLaunchTargetPreparationOperationInput; key: string }[] = []
  const readCalls: SessionLaunchTargetPreparationOperationInput[] = []
  const targetCalls: string[] = []
  let receipt: SessionLaunchTargetSetReceipt | null = null
  let readIndex = 0
  let lostStartCount = options.startUnknownCount ?? 0
  const manager: SessionLaunchTargetPreparationManager = {
    async readTarget(sessionId) {
      targetCalls.push(sessionId)
      if (options.readTargetNeverSettles) return await new Promise<never>(() => {})
      return {
        sessionId,
        workspaceId: 'workspace-1',
        revision: 7,
        selection: { mode: 'shared-current' },
        locked: false,
        resolution: { status: 'idle' },
        updatedAt: 1,
      }
    },
    async setSelection(input, writeOptions) {
      setCalls.push({ input, key: writeOptions.idempotencyKey })
      const setReceipt: SessionLaunchTargetSetReceipt = {
        commitId: writeOptions.idempotencyKey,
        request: input,
        revision: 7,
        changed: false,
        updatedAt: 2,
      }
      receipt = setReceipt
      if (options.setError) throw options.setError
      return setReceipt
    },
    async readSelectionReceipt() {
      return receipt
    },
    async startPreparation(input, writeOptions): Promise<SessionLaunchTargetPreparationStartReceipt> {
      startCalls.push({ input, key: writeOptions.idempotencyKey })
      if (options.startNeverSettles) return await new Promise<never>(() => {})
      if (lostStartCount > 0) {
        lostStartCount -= 1
        throw new CommandError('RESULT_UNKNOWN', 'Start reply lost')
      }
      return {
        operationId: 'operation-1',
        sessionId: input.sessionId,
        workspaceId: 'workspace-1',
        targetRevision: input.expectedRevision,
      }
    },
    async readPreparation(input, readOptions) {
      if (readOptions?.signal?.aborted) throw new CommandError('CANCELLED', 'Read was cancelled')
      readCalls.push(input)
      options.readGate?.markEntered?.()
      if (options.readGate) await options.readGate.promise
      if (options.readNeverSettles) return await new Promise<never>(() => {})
      const snapshots = options.reads ?? [snapshot('ready')]
      const next = snapshots[Math.min(readIndex, snapshots.length - 1)]
      readIndex += 1
      if (!next) throw new Error('No fixture snapshot')
      return next
    },
    async cancelPreparation(input, writeOptions) {
      cancelCalls.push({ input, key: writeOptions.idempotencyKey })
      if (options.cancelGate) await options.cancelGate
      return options.cancelSnapshot ?? snapshot('cancelled', 2)
    },
    async reconcilePreparation(input, writeOptions) {
      reconcileCalls.push({ input, key: writeOptions.idempotencyKey })
      return snapshot('preparing', 2)
    },
  }
  return { manager, setCalls, startCalls, cancelCalls, reconcileCalls, readCalls, targetCalls }
}

function capture() {
  return capturePreSessionLaunchPreparation('workspace-1', { mode: 'shared-current' }, keys)
}

function context(mayContinue: () => boolean = () => true) {
  return { mayContinue }
}

test('captures an independent immutable shared ref and canonical tip before async preparation', () => {
  const selection = {
    mode: 'shared-branch' as const,
    branch: { ref: 'refs/heads/feature/shared', tipOid: 'A'.repeat(40) },
  }
  const captured = capturePreSessionLaunchPreparation('workspace-1', selection, keys)
  selection.branch.ref = 'refs/heads/later-choice'
  expect(captured.selection).toEqual({
    mode: 'shared-branch',
    branch: { ref: 'refs/heads/feature/shared', tipOid: 'a'.repeat(40) },
  })
  expect(Object.isFrozen(captured.selection)).toBe(true)
  if (captured.selection.mode !== 'shared-branch') throw new Error('Shared choice was not captured')
  expect(Object.isFrozen(captured.selection.branch)).toBe(true)
})

test('captures immutable launch choice and uses the actual no-op receipt revision', async () => {
  const f = fixture()
  const captured = capture()
  const handoff = new PreSessionLaunchPreparation(f.manager, captured, { pollIntervalMs: 0, maxPolls: 2 })

  await expect(handoff.prepare('session-1', context())).resolves.toMatchObject({ kind: 'ready' })
  expect(Object.isFrozen(captured)).toBe(true)
  expect(Object.isFrozen(captured.keys)).toBe(true)
  expect(f.setCalls).toHaveLength(1)
  expect(f.setCalls[0]).toMatchObject({
    input: { sessionId: 'session-1', expectedRevision: 7, selection: { mode: 'shared-current' } },
    key: 'set-key',
  })
  expect(f.startCalls).toEqual([{ input: { sessionId: 'session-1', expectedRevision: 7 }, key: 'start-key' }])
  expect(handoff.getExpectedTargetRevision()).toBe(7)
})

test('recovers an unknown selection write by querying the original key before replay', async () => {
  const f = fixture({ setError: new CommandError('RESULT_UNKNOWN', 'Set reply lost') })
  const handoff = new PreSessionLaunchPreparation(f.manager, capture(), { pollIntervalMs: 0, maxPolls: 1 })

  await expect(handoff.prepare('session-1', context())).resolves.toMatchObject({ kind: 'ready' })
  expect(f.setCalls).toHaveLength(1)
  expect(f.startCalls[0]?.input.expectedRevision).toBe(7)
})

test('replays an unknown start with the exact original input and idempotency key', async () => {
  const f = fixture({ startUnknownCount: 1 })
  const handoff = new PreSessionLaunchPreparation(f.manager, capture(), { pollIntervalMs: 0, maxPolls: 1 })

  await expect(handoff.prepare('session-1', context())).resolves.toMatchObject({ kind: 'ready' })
  expect(f.startCalls).toHaveLength(2)
  expect(f.startCalls[0]?.key).toBe('start-key')
  expect(f.startCalls[1]?.key).toBe('start-key')
  expect(f.startCalls[1]?.input).toEqual(f.startCalls[0]?.input)
})

test('rejects identity changes and same-version snapshot mutation as unknown', async () => {
  const f = fixture({
    reads: [snapshot('preparing', 3), snapshot('preparing', 3, { updatedAt: 99 })],
  })
  const handoff = new PreSessionLaunchPreparation(f.manager, capture(), { pollIntervalMs: 0, maxPolls: 2 })

  await expect(handoff.prepare('session-1', context())).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
  expect(handoff.getState()).toMatchObject({ phase: 'unknown', error: 'INVALID_OUTPUT' })

  const wrong = fixture({ reads: [snapshot('ready', 1, { operationId: 'operation-other' })] })
  const invalid = new PreSessionLaunchPreparation(wrong.manager, capture(), { pollIntervalMs: 0, maxPolls: 1 })
  await expect(invalid.prepare('session-1', context())).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
})

test('navigation loss pauses after observing a ready Host snapshot without running or reconciling it', async () => {
  const f = fixture({ reads: [snapshot('ready')] })
  const handoff = new PreSessionLaunchPreparation(f.manager, capture(), { pollIntervalMs: 0, maxPolls: 1 })

  let navigationChecks = 0
  await expect(
    handoff.prepare(
      'session-1',
      context(() => ++navigationChecks < 5),
    ),
  ).resolves.toMatchObject({
    kind: 'paused-navigation',
    snapshot: { status: 'ready' },
  })
  expect(f.reconcileCalls).toHaveLength(0)
  expect(handoff.getState().phase).toBe('paused-navigation')
})

test('read-only refresh observes readiness without starting, reconciling, or running', async () => {
  const f = fixture({ reads: [snapshot('preparing'), snapshot('ready', 2)] })
  const handoff = new PreSessionLaunchPreparation(f.manager, capture(), { pollIntervalMs: 0, maxPolls: 1 })
  await expect(handoff.prepare('session-1', context())).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })

  await expect(handoff.refresh()).resolves.toMatchObject({ phase: 'ready', snapshot: { status: 'ready' } })
  expect(f.startCalls).toHaveLength(1)
  expect(f.reconcileCalls).toHaveLength(0)
})

test('only explicit continuation reconciles a reconciling Host operation, once, before observing ready', async () => {
  const f = fixture({
    reads: [snapshot('reconciling'), snapshot('preparing', 2), snapshot('ready', 3)],
  })
  const handoff = new PreSessionLaunchPreparation(f.manager, capture(), { pollIntervalMs: 0, maxPolls: 3 })

  await expect(handoff.continue('session-1', context())).resolves.toMatchObject({
    kind: 'ready',
    snapshot: { operationVersion: 3 },
  })
  expect(f.reconcileCalls).toEqual([
    { input: { sessionId: 'session-1', expectedRevision: 7, operationId: 'operation-1' }, key: 'reconcile-key' },
  ])
})

test('refresh cannot regress the accepted operation version and cancellation stays nonterminal until settled', async () => {
  const f = fixture({ reads: [snapshot('ready', 3), snapshot('preparing', 2)] })
  const handoff = new PreSessionLaunchPreparation(f.manager, capture(), { pollIntervalMs: 0, maxPolls: 1 })
  await handoff.prepare('session-1', context())
  await expect(handoff.refresh()).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })

  const cancelling = fixture({ reads: [snapshot('preparing', 1), snapshot('preparing', 2)] })
  const pending = new PreSessionLaunchPreparation(cancelling.manager, capture(), {
    pollIntervalMs: 0,
    maxPolls: 1,
  })
  await expect(pending.prepare('session-1', context())).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
  pending.requestCancel()
  await expect(pending.refresh()).resolves.toMatchObject({ phase: 'cancel-requested', cancelRequested: true })
})

test('cancel latch prevents an undispatched start and observation abort never remote-cancels', async () => {
  const noStart = fixture()
  const beforeStart = new PreSessionLaunchPreparation(noStart.manager, capture())
  beforeStart.requestCancel()
  await expect(beforeStart.prepare('session-1', context())).resolves.toMatchObject({ kind: 'cancelled' })
  expect(noStart.setCalls).toHaveLength(0)
  expect(noStart.startCalls).toHaveLength(0)

  let openRead!: () => void
  let enteredRead!: () => void
  const readGate = {
    promise: new Promise<void>((resolve) => {
      openRead = resolve
    }),
    entered: new Promise<void>((resolve) => {
      enteredRead = resolve
    }),
    markEntered: () => enteredRead(),
  }
  const observing = fixture({ reads: [snapshot('preparing')], readGate })
  const controller = new AbortController()
  const handoff = new PreSessionLaunchPreparation(observing.manager, capture(), { pollIntervalMs: 20, maxPolls: 2 })
  const pending = handoff.prepare('session-1', { ...context(), signal: controller.signal })
  await readGate.entered
  controller.abort()
  openRead()
  await expect(pending).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
  expect(observing.cancelCalls).toHaveLength(0)
})

test('explicit cancel reuses its stable key and settles from the Host snapshot', async () => {
  const f = fixture({ cancelSnapshot: snapshot('ready', 2) })
  const handoff = new PreSessionLaunchPreparation(f.manager, capture(), { pollIntervalMs: 0, maxPolls: 1 })
  await expect(handoff.prepare('session-1', context())).resolves.toMatchObject({ kind: 'ready' })

  await expect(handoff.cancel()).resolves.toMatchObject({ kind: 'cancelled', snapshot: { status: 'ready' } })
  expect(f.cancelCalls).toHaveLength(0)
  expect(handoff.getState()).toMatchObject({ phase: 'cancelled', cancelRequested: true })
})

test('cancel returns the Host cancel-requested state promptly and read-only refresh waits for terminal state', async () => {
  const f = fixture({
    reads: [snapshot('preparing', 1), snapshot('cancelled', 3)],
    cancelSnapshot: snapshot('cancel-requested', 2),
  })
  const handoff = new PreSessionLaunchPreparation(f.manager, capture(), { pollIntervalMs: 0, maxPolls: 1 })
  await expect(handoff.prepare('session-1', context())).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })

  await expect(handoff.cancel()).resolves.toMatchObject({
    kind: 'cancel-requested',
    snapshot: { status: 'cancel-requested' },
  })
  expect(handoff.getState()).toMatchObject({ phase: 'cancel-requested', cancelRequested: true })
  await expect(handoff.refresh()).resolves.toMatchObject({ phase: 'cancelled', snapshot: { status: 'cancelled' } })
})

test('cancel during active preparation is latched and dispatched before its in-flight query settles', async () => {
  let openRead!: () => void
  let enteredRead!: () => void
  const readGate = {
    promise: new Promise<void>((resolve) => {
      openRead = resolve
    }),
    entered: new Promise<void>((resolve) => {
      enteredRead = resolve
    }),
    markEntered: () => enteredRead(),
  }
  const f = fixture({
    reads: [snapshot('preparing', 1)],
    readGate,
    cancelSnapshot: snapshot('cancel-requested', 2),
  })
  const handoff = new PreSessionLaunchPreparation(f.manager, capture(), { pollIntervalMs: 0, maxPolls: 1 })
  const preparing = handoff.prepare('session-1', context())
  await readGate.entered

  await expect(handoff.cancel()).resolves.toMatchObject({
    kind: 'cancel-requested',
    snapshot: { status: 'cancel-requested' },
  })
  expect(f.cancelCalls).toHaveLength(1)
  await expect(preparing).resolves.toMatchObject({ kind: 'cancel-requested', snapshot: { status: 'cancel-requested' } })
  expect(f.cancelCalls).toHaveLength(1)
  openRead()
})

test('cancelling an unknown dispatched start recovers that operation and does not lose cancellation', async () => {
  const f = fixture({ startUnknownCount: 3 })
  const handoff = new PreSessionLaunchPreparation(f.manager, capture(), { pollIntervalMs: 0, maxPolls: 1 })
  await expect(handoff.prepare('session-1', context())).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
  expect(handoff.getState()).toMatchObject({ phase: 'unknown' })

  await expect(handoff.cancel()).resolves.toMatchObject({ kind: 'cancel-requested', snapshot: null })
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(handoff.getState()).toMatchObject({ phase: 'cancelled', cancelRequested: true })
  expect(f.startCalls.length).toBeGreaterThanOrEqual(4)
  expect(new Set(f.startCalls.map((call) => call.key))).toEqual(new Set(['start-key']))
  expect(f.cancelCalls).toHaveLength(1)
  expect(handoff.getState()).toMatchObject({ phase: 'cancelled', cancelRequested: true })
})

test('cancel requests coalesce and a never-settling manager call is bounded', async () => {
  let releaseCancel!: () => void
  const cancelGate = new Promise<void>((resolve) => {
    releaseCancel = resolve
  })
  const f = fixture({ reads: [snapshot('preparing')], cancelSnapshot: snapshot('cancelled', 2), cancelGate })
  const handoff = new PreSessionLaunchPreparation(f.manager, capture(), { pollIntervalMs: 0, maxPolls: 1 })
  await expect(handoff.prepare('session-1', context())).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
  const firstCancel = handoff.cancel()
  const secondCancel = handoff.cancel()
  await Promise.resolve()
  releaseCancel()
  await expect(Promise.all([firstCancel, secondCancel])).resolves.toMatchObject([
    { kind: 'cancelled' },
    { kind: 'cancelled' },
  ])
  expect(f.cancelCalls).toHaveLength(1)

  const never = fixture({ startNeverSettles: true })
  const bounded = new PreSessionLaunchPreparation(never.manager, capture(), {
    managerCallTimeoutMs: 10,
    pollIntervalMs: 0,
    maxPolls: 1,
  })
  await expect(bounded.prepare('session-1', context())).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
  expect(never.startCalls).toHaveLength(1)
  expect(bounded.getState()).toMatchObject({ phase: 'unknown' })
  bounded.dispose()
})

test('timed out status observation retains one owned Port promise across repeated reconcile and continue', async () => {
  const f = fixture({ readNeverSettles: true })
  const handoff = new PreSessionLaunchPreparation(f.manager, capture(), {
    managerCallTimeoutMs: 8,
    pollIntervalMs: 0,
    maxPolls: 1,
  })

  await expect(handoff.prepare('session-1', context())).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
  expect(f.readCalls).toHaveLength(1)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await expect(handoff.refresh()).rejects.toMatchObject({ code: 'TIMEOUT' })
    await expect(handoff.continue('session-1', context())).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
  }
  expect(f.readCalls).toHaveLength(1)
  expect(f.startCalls).toHaveLength(1)
  handoff.dispose()
})

test('an active advance cannot be joined with a different Session identity', async () => {
  let openTargetRead!: () => void
  let enteredTargetRead!: () => void
  const targetGate = {
    promise: new Promise<void>((resolve) => {
      openTargetRead = resolve
    }),
    entered: new Promise<void>((resolve) => {
      enteredTargetRead = resolve
    }),
    markEntered: () => enteredTargetRead(),
  }
  const f = fixture({ readGate: targetGate })
  const handoff = new PreSessionLaunchPreparation(f.manager, capture(), { managerCallTimeoutMs: 100 })
  const preparing = handoff.prepare('session-1', context())
  await targetGate.entered
  await expect(handoff.continue('session-2', context())).rejects.toMatchObject({ code: 'STALE_TARGET' })
  openTargetRead()
  await expect(preparing).resolves.toMatchObject({ kind: 'ready' })
  expect(f.targetCalls).toEqual(['session-1'])
})

test('explicit cancel aborts a held observation and gets its own reserved Host call slot', async () => {
  let openRead!: () => void
  let enteredRead!: () => void
  const readGate = {
    promise: new Promise<void>((resolve) => {
      openRead = resolve
    }),
    entered: new Promise<void>((resolve) => {
      enteredRead = resolve
    }),
    markEntered: () => enteredRead(),
  }
  const f = fixture({ reads: [snapshot('preparing')], readGate, cancelSnapshot: snapshot('cancel-requested', 2) })
  const handoff = new PreSessionLaunchPreparation(f.manager, capture(), { pollIntervalMs: 0, maxPolls: 1 })
  const preparing = handoff.prepare('session-1', context())
  await readGate.entered

  await expect(handoff.cancel()).resolves.toMatchObject({ kind: 'cancel-requested' })
  expect(f.cancelCalls).toHaveLength(1)
  await expect(preparing).resolves.toMatchObject({ kind: 'cancel-requested' })
  openRead()
})

test('a timed out target read is single-flight and does not accumulate Port calls', async () => {
  const f = fixture({ readTargetNeverSettles: true })
  const handoff = new PreSessionLaunchPreparation(f.manager, capture(), { managerCallTimeoutMs: 8 })
  await expect(handoff.prepare('session-1', context())).rejects.toMatchObject({ code: 'TIMEOUT' })
  for (let attempt = 0; attempt < 3; attempt += 1)
    await expect(handoff.prepare('session-1', context())).rejects.toMatchObject({ code: 'TIMEOUT' })
  expect(f.targetCalls).toEqual(['session-1'])
  handoff.dispose()
})

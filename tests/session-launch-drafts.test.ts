import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { directoryCommands } from '@hbar/contracts/commands'
import {
  sessionLaunchTargetPreparationSnapshotSchema,
  type SessionLaunchSelection,
  type SessionLaunchTarget,
  type SessionLaunchTargetPreparationManager,
  type SessionLaunchTargetPreparationSnapshot,
  type SessionLaunchTargetSetInput,
  type SessionLaunchTargetSetReceipt,
} from '@hbar/contracts/commands/session-launch-target'
import type { Session, SessionSnapshot } from '@hbar/contracts'
import { sessionLaunchDraftCommands } from '@hbar/app-runtime'
import { createSessionLaunchDrafts } from '../packages/app-runtime/src/session-launch-drafts'
import type { NavigationState, SessionTimelinePort } from '@hbar/app-runtime'

const session: Session = {
  id: 'launch-draft-session',
  workspaceId: 'launch-draft-workspace',
  title: 'Unstarted session',
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  seq: 0,
}

function emptyTimeline(): SessionSnapshot {
  return {
    session,
    messages: [],
    runs: [],
    approvals: [],
    userInputs: [],
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    cursor: session.seq,
    hasOlder: false,
    streams: [],
  }
}

function fixture(options: { locked?: boolean; timeline?: SessionSnapshot; loseSetSelectionResponse?: boolean } = {}) {
  let selected: SessionLaunchSelection = { mode: 'shared-current' }
  let targetRevision = 0
  let updatedAt = 1
  let target: SessionLaunchTarget = {
    sessionId: session.id,
    workspaceId: session.workspaceId,
    revision: targetRevision,
    selection: selected,
    locked: options.locked ?? false,
    resolution: { status: 'idle' },
    updatedAt,
  }
  let operation: SessionLaunchTargetPreparationSnapshot | null = null
  let selectionReceipt: SessionLaunchTargetSetReceipt | null = null
  let selectionReceiptKey: string | null = null
  let loseSetSelectionResponse = options.loseSetSelectionResponse ?? false
  const calls = { targetReads: 0, setSelections: 0, receiptReads: 0, starts: 0, preparationReads: 0, cancellations: 0 }
  const manager: SessionLaunchTargetPreparationManager = {
    async readTarget() {
      calls.targetReads++
      return target
    },
    async setSelection(input: SessionLaunchTargetSetInput, writeOptions): Promise<SessionLaunchTargetSetReceipt> {
      calls.setSelections++
      if (target.locked) throw new CommandError('SESSION_LAUNCH_TARGET_LOCKED', 'Target is locked')
      if (input.expectedRevision !== target.revision)
        throw new CommandError('COMMAND_CONFLICT', 'Target revision changed')
      const changed = JSON.stringify(selected) !== JSON.stringify(input.selection)
      if (changed) {
        selected = input.selection
        targetRevision++
        updatedAt++
        target = { ...target, revision: targetRevision, selection: selected, updatedAt }
      }
      const receipt: SessionLaunchTargetSetReceipt = {
        commitId: `receipt-${input.expectedRevision}`,
        request: input,
        revision: targetRevision,
        changed,
        updatedAt,
      }
      selectionReceipt = receipt
      selectionReceiptKey = writeOptions?.idempotencyKey ?? null
      if (loseSetSelectionResponse) {
        loseSetSelectionResponse = false
        throw new CommandError('TIMEOUT', 'Selection commit succeeded but its response was lost')
      }
      return receipt
    },
    async readSelectionReceipt(input) {
      calls.receiptReads++
      return input.sessionId === session.id && input.idempotencyKey === selectionReceiptKey ? selectionReceipt : null
    },
    async startPreparation(input) {
      calls.starts++
      if (input.sessionId !== session.id || input.expectedRevision !== target.revision)
        throw new CommandError('COMMAND_CONFLICT', 'Preparation does not match target')
      const receipt = {
        operationId: 'launch-draft-operation',
        sessionId: session.id,
        workspaceId: session.workspaceId,
        targetRevision: target.revision,
      }
      operation = sessionLaunchTargetPreparationSnapshotSchema.parse({
        schemaVersion: 1,
        ...receipt,
        operationVersion: 1,
        status: 'queued',
        createdAt: 1,
        updatedAt: 1,
      })
      return receipt
    },
    async readPreparation(input) {
      calls.preparationReads++
      if (!operation || operation.operationId !== input.operationId)
        throw new CommandError('NOT_FOUND', 'Preparation operation is missing')
      const branch =
        selected.mode === 'shared-current'
          ? null
          : selected.mode === 'shared-branch'
            ? selected.branch.ref.slice('refs/heads/'.length)
            : selected.branch.kind === 'derived'
              ? 'hbar/session-launch/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
              : selected.branch.name
      target = { ...target, resolution: { status: 'ready', branch } }
      operation = sessionLaunchTargetPreparationSnapshotSchema.parse({
        ...operation,
        operationVersion: operation.operationVersion + 1,
        status: 'ready',
        updatedAt: 2,
      })
      return operation
    },
    async cancelPreparation(input) {
      calls.cancellations++
      if (!operation || operation.operationId !== input.operationId)
        throw new CommandError('NOT_FOUND', 'Preparation operation is missing')
      operation = sessionLaunchTargetPreparationSnapshotSchema.parse({
        ...operation,
        operationVersion: operation.operationVersion + 1,
        status: 'cancelled',
        updatedAt: 2,
      })
      target = { ...target, resolution: { status: 'cancelled', code: 'USER_CANCELLED', message: 'Cancelled' } }
      return operation
    },
    async reconcilePreparation(input) {
      if (!operation || operation.operationId !== input.operationId)
        throw new CommandError('NOT_FOUND', 'Preparation operation is missing')
      return operation
    },
  }
  const host = new CommandRegistry({ execution: 'host' })
  host.register(directoryCommands['session.get'], (input) => (input.sessionId === session.id ? session : null))
  const queries = createCommandClient(directoryCommands, host)
  const timeline: SessionTimelinePort = {
    async snapshot(sessionId) {
      if (sessionId !== session.id) throw new CommandError('NOT_FOUND', 'Session not found')
      return options.timeline ?? emptyTimeline()
    },
    async watch() {
      return () => undefined
    },
  }
  let navigationState: NavigationState = {
    workspaceId: session.workspaceId,
    sessionId: session.id,
    status: 'idle',
    error: null,
  }
  const navigation = {
    getSnapshot: () => navigationState,
    subscribe: () => () => undefined,
  }
  const local = new CommandRegistry({ execution: 'client' })
  const drafts = createSessionLaunchDrafts(local, {
    queries,
    timeline,
    preparation: manager,
    navigation,
    onSubscriberError: () => undefined,
    isDisposed: () => false,
  })
  const commands = createCommandClient(sessionLaunchDraftCommands, local)
  return {
    commands,
    calls,
    target: () => target,
    state: drafts.reader,
    changeNavigation(next: NavigationState) {
      navigationState = next
    },
    dispose() {
      drafts.dispose()
      local.dispose()
      host.dispose()
    },
  }
}

test('opening and changing a launch choice stays local and repeated open preserves the edit', async () => {
  const f = fixture()
  try {
    const opened = await f.commands.execute('sessionLaunchDraft.open', {
      sessionId: session.id,
      workspaceId: session.workspaceId,
    })
    expect(opened).toMatchObject({ phase: 'idle', revision: 0, hostRevision: 0, targetRevision: null })
    const changed = await f.commands.execute('sessionLaunchDraft.setSelection', {
      sessionId: session.id,
      expectedRevision: opened.revision,
      selection: { mode: 'shared-branch', branch: { ref: 'refs/heads/main', tipOid: 'a'.repeat(40) } },
    })
    expect(changed.revision).toBe(1)
    const repeated = await f.commands.execute('sessionLaunchDraft.open', {
      sessionId: session.id,
      workspaceId: session.workspaceId,
    })
    expect(repeated.selection).toEqual({
      mode: 'shared-branch',
      branch: { ref: 'refs/heads/main', tipOid: 'a'.repeat(40) },
    })
    await expect(
      f.commands.execute('sessionLaunchDraft.setSelection', {
        sessionId: session.id,
        expectedRevision: 0,
        selection: { mode: 'shared-current' },
      }),
    ).rejects.toMatchObject({ code: 'COMMAND_CONFLICT' })
    expect(f.calls.setSelections).toBe(0)
    expect(f.calls.starts).toBe(0)
    expect(f.target().selection).toEqual({ mode: 'shared-current' })
  } finally {
    f.dispose()
  }
})

test('preparation uses the captured session/selection and returns its confirmed Host revision without submitting a Run', async () => {
  const f = fixture()
  try {
    await f.commands.execute('sessionLaunchDraft.open', {
      sessionId: session.id,
      workspaceId: session.workspaceId,
    })
    await f.commands.execute('sessionLaunchDraft.setSelection', {
      sessionId: session.id,
      expectedRevision: 0,
      selection: { mode: 'shared-branch', branch: { ref: 'refs/heads/main', tipOid: 'a'.repeat(40) } },
    })
    const phases: string[] = []
    const unsubscribe = f.state.subscribe(() => {
      const phase = f.state.getSnapshot().entries[session.id]?.phase
      if (phase) phases.push(phase)
    })
    const ready = await f.commands.execute('sessionLaunchDraft.prepare', {
      sessionId: session.id,
      expectedRevision: 1,
    })
    unsubscribe()
    expect(phases).toEqual(['preparing', 'ready'])
    expect(ready).toMatchObject({
      sessionId: session.id,
      workspaceId: session.workspaceId,
      revision: 1,
      hostRevision: 1,
      selection: { mode: 'shared-branch', branch: { ref: 'refs/heads/main', tipOid: 'a'.repeat(40) } },
      phase: 'ready',
      targetRevision: 1,
    })
    expect(f.target()).toMatchObject({ revision: 1, resolution: { status: 'ready', branch: 'main' } })
    expect(f.calls.setSelections).toBe(1)
    expect(f.calls.starts).toBe(1)
    expect(f.calls.preparationReads).toBe(1)
  } finally {
    f.dispose()
  }
})

test('locked, used, or mismatched sessions fail closed before launch writes', async () => {
  const locked = fixture({ locked: true })
  try {
    await expect(
      locked.commands.execute('sessionLaunchDraft.open', {
        sessionId: session.id,
        workspaceId: session.workspaceId,
      }),
    ).rejects.toMatchObject({ code: 'SESSION_LAUNCH_TARGET_LOCKED' })
    expect(locked.calls.setSelections).toBe(0)
    expect(locked.calls.starts).toBe(0)
  } finally {
    locked.dispose()
  }

  const used = fixture({
    timeline: {
      ...emptyTimeline(),
      messages: [
        {
          id: 'prior-message',
          sessionId: session.id,
          runId: 'prior-run',
          role: 'user',
          content: [],
          seq: 1,
          createdAt: 1,
        },
      ],
    },
  })
  try {
    await expect(
      used.commands.execute('sessionLaunchDraft.open', {
        sessionId: session.id,
        workspaceId: session.workspaceId,
      }),
    ).rejects.toMatchObject({ code: 'SESSION_LAUNCH_TARGET_LOCKED' })
    expect(used.calls.setSelections).toBe(0)
    expect(used.calls.starts).toBe(0)
  } finally {
    used.dispose()
  }

  const stale = fixture()
  try {
    stale.changeNavigation({ workspaceId: 'different-workspace', sessionId: session.id, status: 'idle', error: null })
    await expect(
      stale.commands.execute('sessionLaunchDraft.open', {
        sessionId: session.id,
        workspaceId: session.workspaceId,
      }),
    ).rejects.toMatchObject({ code: 'STALE_TARGET' })
  } finally {
    stale.dispose()
  }
})

test('a lost selection response is reconciled by the captured adapter despite a newer Host revision', async () => {
  const f = fixture({ loseSetSelectionResponse: true })
  try {
    const opened = await f.commands.execute('sessionLaunchDraft.open', {
      sessionId: session.id,
      workspaceId: session.workspaceId,
    })
    await f.commands.execute('sessionLaunchDraft.setSelection', {
      sessionId: session.id,
      expectedRevision: opened.revision,
      selection: { mode: 'shared-branch', branch: { ref: 'refs/heads/main', tipOid: 'b'.repeat(40) } },
    })

    await expect(
      f.commands.execute('sessionLaunchDraft.prepare', {
        sessionId: session.id,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(f.target()).toMatchObject({ revision: 1, selection: { mode: 'shared-branch' } })
    expect(f.state.getSnapshot().entries[session.id]).toMatchObject({ hostRevision: 0, phase: 'unknown' })

    const reconciled = await f.commands.execute('sessionLaunchDraft.reconcile', { sessionId: session.id })
    expect(reconciled).toMatchObject({ hostRevision: 1, phase: 'starting', preparation: { phase: 'starting' } })
    expect(f.calls.receiptReads).toBeGreaterThan(0)

    const ready = await f.commands.execute('sessionLaunchDraft.prepare', {
      sessionId: session.id,
      expectedRevision: 1,
    })
    expect(ready).toMatchObject({ phase: 'ready', hostRevision: 1, targetRevision: 1 })
    expect(f.calls.setSelections).toBe(1)
    expect(f.calls.starts).toBe(1)
  } finally {
    f.dispose()
  }
})

test('close releases only a terminal local draft and cap can be reclaimed', async () => {
  const f = fixture()
  try {
    const opened = await f.commands.execute('sessionLaunchDraft.open', {
      sessionId: session.id,
      workspaceId: session.workspaceId,
    })
    await expect(f.commands.execute('sessionLaunchDraft.close', { sessionId: session.id })).resolves.toEqual({
      sessionId: session.id,
      closed: true,
    })
    expect(f.state.getSnapshot().entries[session.id]).toBeUndefined()
    expect(f.target().selection).toEqual(opened.selection)
    expect(f.calls.setSelections).toBe(0)
    expect(f.calls.starts).toBe(0)
  } finally {
    f.dispose()
  }
})

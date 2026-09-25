import { expect, test } from 'bun:test'
import { CommandError } from '@hbar/commands'
import { createAppRuntime, type GoalPlanWorkspacePort, type RunCommandPort } from '@hbar/app-runtime'
import { goalPlanCommands, type GoalPlanSnapshot } from '@hbar/contracts/commands/goals'
import {
  runAcceptedSchema,
  submitRunInputSchema,
  type RunAccepted,
  type SubmitRunInput,
} from '@hbar/contracts/commands/run'

function deferred() {
  let release = () => {}
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

async function fixture(configuration = true) {
  const calls: { name: string; input: unknown; key: string | undefined }[] = []
  const receipts = new Map<string, RunAccepted>()
  const values = new Map<string, GoalPlanSnapshot>()
  let mode: 'ask' | 'deny' | 'allow' = 'ask'
  let readFailure = false
  let readGate: ReturnType<typeof deferred> | null = null
  let goalGate: ReturnType<typeof deferred> | null = null
  let goalUnknown = false
  let runFailure:
    | 'known'
    | 'unknown'
    | 'malformed'
    | 'wrong-target'
    | 'plain'
    | 'CONNECTION_CLOSED'
    | 'EXECUTION_FAILED'
    | 'TIMEOUT'
    | null = null
  let receiptFailure: 'wrong-target' | 'wrong-key' | null = null
  const snapshot = (sessionId: string): GoalPlanSnapshot =>
    values.get(sessionId) ?? {
      sessionId,
      goal: null,
      goalSeq: 0,
      plan: null,
      planSeq: 0,
      remainingTokens: null,
    }
  const goals: GoalPlanWorkspacePort = {
    snapshot: async (sessionId) => snapshot(sessionId),
    watch: () => () => {},
    async execute(name, raw) {
      calls.push({ name, input: raw, key: undefined })
      if (name !== 'goal.create') throw new Error(`Unexpected Goal command ${name}`)
      const input = goalPlanCommands[name].input.parse(raw)
      if (goalGate) await goalGate.promise
      const value: GoalPlanSnapshot = {
        ...snapshot(input.sessionId),
        goalSeq: 1,
        goal: {
          threadId: input.sessionId,
          goalId: `goal-${input.sessionId}`,
          objective: input.objective,
          status: 'active',
          tokenBudget: input.tokenBudget ?? null,
          tokensUsed: 0,
          timeUsedSeconds: 0,
          createdAt: 1,
          updatedAt: 1,
        },
      }
      values.set(input.sessionId, value)
      if (goalUnknown) throw new CommandError('RESULT_UNKNOWN', 'Goal acknowledgement lost')
      return { goal: value.goal, remainingTokens: null }
    },
  }
  const run: RunCommandPort = {
    async execute(name, raw, options) {
      calls.push({ name, input: structuredClone(raw), key: options?.idempotencyKey })
      if (name !== 'run.submit') throw new Error(`Unexpected Run command ${name}`)
      const input = submitRunInputSchema.parse(raw)
      if (runFailure === 'known') throw new CommandError('MODEL_NOT_FOUND', 'Configure a model')
      const accepted = runAcceptedSchema.parse({
        status: 'accepted',
        commandId: 'run.submit',
        commandVersion: 1,
        requestId: crypto.randomUUID(),
        idempotencyKey: options?.idempotencyKey,
        operationId: crypto.randomUUID(),
        sessionId: input.sessionId,
        acceptedAt: 1,
      })
      receipts.set(`${accepted.sessionId}:${accepted.idempotencyKey}`, accepted)
      if (runFailure === 'unknown') throw new CommandError('RESULT_UNKNOWN', 'Run acknowledgement lost')
      if (runFailure === 'plain') throw new Error('Run accepted before the unclassified error')
      if (runFailure === 'CONNECTION_CLOSED' || runFailure === 'EXECUTION_FAILED' || runFailure === 'TIMEOUT')
        throw new CommandError(runFailure, 'Run accepted before the lost response')
      if (runFailure === 'malformed') return { status: 'accepted' }
      if (runFailure === 'wrong-target') return { ...accepted, sessionId: 'wrong-session' }
      return accepted
    },
    async getReceipt(sessionId, key) {
      const value = receipts.get(`${sessionId}:${key}`) ?? null
      if (value && receiptFailure === 'wrong-target') return { ...value, sessionId: 'wrong-session' }
      if (value && receiptFailure === 'wrong-key') return { ...value, idempotencyKey: 'wrong-key' }
      return value
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'permission-integration',
    hostId: 'host',
    run,
    goals,
    directory: {
      async execute(name, raw) {
        if (name === 'workspace.get') return { id: 'w', name: 'Project', path: 'D:/fixture', createdAt: 1 }
        if (name === 'session.get') {
          const { sessionId } = goalPlanCommands['goal.snapshot'].input.parse(raw)
          return {
            id: sessionId,
            workspaceId: 'w',
            title: sessionId,
            archived: false,
            parentId: null,
            createdAt: 1,
            updatedAt: 1,
            seq: 0,
          }
        }
        if (name === 'session.list' || name === 'workspace.list') return { items: [], nextCursor: null }
        throw new Error(`Unexpected directory command ${name}`)
      },
    },
    ...(configuration
      ? {
          configuration: {
            async execute(name: string) {
              calls.push({ name, input: {}, key: undefined })
              if (name !== 'permission.get') throw new Error(`Unexpected global permission mutation ${name}`)
              const captured = mode
              if (readGate) await readGate.promise
              if (readFailure) throw new CommandError('DISCONNECTED', 'Default could not be read')
              return { mode: captured }
            },
          },
        }
      : {}),
  })
  await runtime.view.commands.execute('app.setSession', { sessionId: 'a' })
  const current = (sessionId = 'a') => runtime.view.state.composerPermission.getSnapshot().entries[sessionId]
  return {
    runtime,
    calls,
    receipts,
    current,
    mode: (value: typeof mode) => {
      mode = value
    },
    failRead: (value: boolean) => {
      readFailure = value
    },
    failRun: (value: typeof runFailure) => {
      runFailure = value
    },
    failReceipt: (value: typeof receiptFailure) => {
      receiptFailure = value
    },
    failGoal: (value: boolean) => {
      goalUnknown = value
    },
    blockRead: () => {
      readGate = deferred()
      return readGate
    },
    blockGoal: () => {
      goalGate = deferred()
      return goalGate
    },
    choice: (choice: 'ask' | 'deny' | 'allow' | 'inherit') =>
      runtime.view.commands.execute('composerPermission.setChoice', {
        sessionId: 'a',
        choice,
        expectedRevision: current()?.revision ?? 0,
        ...(choice === 'allow' ? { confirmAllow: true as const } : {}),
      }),
    submit: (expectedPermissionRevision?: number) =>
      runtime.view.commands.execute('composerIntent.submit', {
        sessionId: 'a',
        modelId: 'provider/model',
        input: { text: 'Original draft', images: [], files: [] },
        ...(expectedPermissionRevision === undefined ? {} : { expectedPermissionRevision }),
      }),
    runs: () =>
      calls.filter((c) => c.name === 'run.submit').map((c) => ({ ...c, input: submitRunInputSchema.parse(c.input) })),
    dispose: () => runtime.dispose(),
  }
}

test.each(['default', 'plan', 'goal'] as const)(
  'public %s composer send captures approval and consumes it only after Run acceptance',
  async (intent) => {
    const f = await fixture()
    try {
      await f.choice('allow')
      await f.runtime.view.commands.execute('composerIntent.setIntent', { sessionId: 'a', intent })
      await f.submit(1)
      expect(f.runs()).toHaveLength(1)
      expect(f.runs()[0]?.input.input).toMatchObject({
        approval: 'allow',
        mode: intent === 'plan' ? 'plan' : 'default',
        source: 'user',
      })
      expect(f.current()).toMatchObject({ choice: 'inherit', revision: 2, locked: false, status: 'idle' })
      expect(f.calls.some((c) => c.name === 'permission.set')).toBe(false)
      expect(f.calls.filter((c) => c.name === 'goal.create')).toHaveLength(intent === 'goal' ? 1 : 0)
    } finally {
      f.dispose()
    }
  },
)

test('inherited snapshot is captured before async Goal creation, even if the Host default later changes', async () => {
  const f = await fixture()
  try {
    f.mode('deny')
    const gate = f.blockGoal()
    await f.runtime.view.commands.execute('composerIntent.setIntent', { sessionId: 'a', intent: 'goal' })
    const sending = f.submit(0)
    for (let i = 0; i < 100 && !f.calls.some((c) => c.name === 'goal.create'); i++) await Bun.sleep(1)
    expect(f.current()).toMatchObject({ choice: 'inherit', status: 'prepared', locked: true })
    expect(f.calls.findIndex((c) => c.name === 'permission.get')).toBeLessThan(
      f.calls.findIndex((c) => c.name === 'goal.create'),
    )
    f.mode('allow')
    await expect(f.choice('allow')).rejects.toMatchObject({ code: 'SUBMISSION_PENDING' })
    gate.release()
    await sending
    expect(f.runs()[0]?.input.input.approval).toBe('deny')
  } finally {
    f.dispose()
  }
})

test('pending default reads reserve the original composer before any Goal write; switch invalidates and no Run is sent', async () => {
  const f = await fixture()
  try {
    const gate = f.blockRead()
    await f.runtime.view.commands.execute('composerIntent.setIntent', { sessionId: 'a', intent: 'goal' })
    const sending = f.submit(0)
    await expect(f.submit(0)).rejects.toMatchObject({ code: 'BUSY' })
    await expect(
      f.runtime.view.commands.execute('composerIntent.setIntent', { sessionId: 'a', intent: 'default' }),
    ).rejects.toMatchObject({ code: 'BUSY' })
    await f.runtime.view.commands.execute('app.setSession', { sessionId: 'b' })
    gate.release()
    await expect(sending).rejects.toMatchObject({ code: 'STALE_TARGET' })
    expect(f.calls.some((c) => c.name === 'goal.create' || c.name === 'run.submit')).toBe(false)
    expect(f.current('b')).toBeUndefined()
    expect(f.current()?.locked).toBe(false)
  } finally {
    f.dispose()
  }
})

test('failed reads and stale permission revisions never create a Goal or submit a Run', async () => {
  const f = await fixture()
  try {
    f.failRead(true)
    await f.runtime.view.commands.execute('composerIntent.setIntent', { sessionId: 'a', intent: 'goal' })
    await expect(f.submit(0)).rejects.toMatchObject({ code: 'DISCONNECTED' })
    await f.choice('deny')
    await expect(f.submit(0)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    expect(f.runs()).toHaveLength(0)
    expect(f.calls.some((c) => c.name === 'goal.create')).toBe(false)
    await f.submit(1)
    expect(f.runs()[0]?.input.input.approval).toBe('deny')
  } finally {
    f.dispose()
  }
})

test.each(['composer', 'generic'] as const)(
  'unknown Run retains its policy/key and %s receipt entry settles the same permission token',
  async (entry) => {
    const f = await fixture()
    try {
      await f.choice('allow')
      f.failRun('unknown')
      await expect(f.submit(1)).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
      expect(f.current()).toMatchObject({ choice: 'allow', locked: true, status: 'unknown' })
      f.mode('deny')
      await expect(f.choice('deny')).rejects.toMatchObject({ code: 'SUBMISSION_PENDING' })
      await expect(f.submit(1)).rejects.toMatchObject({ code: 'BUSY' })
      await f.runtime.view.commands.execute('app.setSession', { sessionId: 'b' })
      if (entry === 'generic') await f.runtime.view.commands.execute('draft.reconcileSubmission', { sessionId: 'a' })
      else await f.runtime.view.commands.execute('composerIntent.reconcile', { sessionId: 'a' })
      expect(f.current()).toMatchObject({ choice: 'inherit', locked: false, status: 'idle', revision: 2 })
      expect(f.current('b')).toBeUndefined()
      expect(f.runtime.view.state.composerIntent.getSnapshot().entries.a?.submission.status).toBe('idle')
      expect(f.runs()).toHaveLength(1)
      expect(f.runs()[0]?.input.input.approval).toBe('allow')
    } finally {
      f.dispose()
    }
  },
)

test.each(['malformed', 'wrong-target'] as const)(
  'normal %s acceptance and wrong receipt preserve pending until exact session/key receipt is confirmed',
  async (failure) => {
    const f = await fixture()
    try {
      await f.choice('deny')
      f.failRun(failure)
      await expect(f.submit(1)).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
      for (const receiptFailure of ['wrong-target', 'wrong-key'] as const) {
        f.failReceipt(receiptFailure)
        await expect(
          f.runtime.view.commands.execute('draft.reconcileSubmission', { sessionId: 'a' }),
        ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
        expect(f.current()?.locked).toBe(true)
        expect(f.runtime.view.state.drafts.getSnapshot().a?.status).toBe('unknown')
      }
      f.failReceipt(null)
      await f.runtime.view.commands.execute('draft.reconcileSubmission', { sessionId: 'a' })
      expect(f.current()?.locked).toBe(false)
      expect(f.runs()).toHaveLength(1)
    } finally {
      f.dispose()
    }
  },
)

test.each(['plain', 'CONNECTION_CLOSED', 'EXECUTION_FAILED', 'TIMEOUT'] as const)(
  'accepted Run followed by %s retains and reconciles the original permission capture',
  async (failure) => {
    const f = await fixture()
    try {
      await f.choice('allow')
      f.failRun(failure)
      await expect(f.submit(1)).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
      expect(f.current()).toMatchObject({ choice: 'allow', status: 'unknown', locked: true })
      expect(f.runtime.view.state.drafts.getSnapshot().a?.status).toBe('unknown')
      await expect(f.submit(1)).rejects.toMatchObject({ code: 'BUSY' })
      await f.runtime.view.commands.execute('composerIntent.reconcile', { sessionId: 'a' })
      expect(f.current()).toMatchObject({ choice: 'inherit', status: 'idle', locked: false })
      expect(f.runs()).toHaveLength(1)
      expect(f.runs()[0]?.input.input.approval).toBe('allow')
    } finally {
      f.dispose()
    }
  },
)

test('confirmed failure preserves next-send choice; repaired partial Goal retries do not recreate the Goal', async () => {
  const f = await fixture()
  try {
    await f.choice('allow')
    f.failRun('known')
    await f.runtime.view.commands.execute('composerIntent.setIntent', { sessionId: 'a', intent: 'goal' })
    await expect(f.submit(1)).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' })
    expect(f.current()).toMatchObject({ choice: 'allow', locked: false, status: 'failed', revision: 1 })
    await f.choice('deny')
    f.failRun(null)
    await f.submit(2)
    expect(f.calls.filter((c) => c.name === 'goal.create')).toHaveLength(1)
    expect(f.runs().map((c) => c.input.input.approval)).toEqual(['allow', 'deny'])
    expect(f.runs()[0]?.key).not.toBe(f.runs()[1]?.key)
    expect(f.current()?.choice).toBe('inherit')
  } finally {
    f.dispose()
  }
})

test('uncertain Goal freezes policy until fact reconciliation, then an explicit retry may choose a new Run policy', async () => {
  const f = await fixture()
  try {
    await f.choice('allow')
    f.failGoal(true)
    await f.runtime.view.commands.execute('composerIntent.setIntent', { sessionId: 'a', intent: 'goal' })
    await expect(f.submit(1)).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(f.current()?.status).toBe('unknown')
    await f.runtime.view.commands.execute('composerIntent.reconcile', { sessionId: 'a' })
    expect(f.current()).toMatchObject({ choice: 'allow', locked: false })
    expect(f.runs()).toHaveLength(0)
    await f.choice('deny')
    await f.submit(2)
    expect(f.runs()[0]?.input.input.approval).toBe('deny')
    expect(f.calls.filter((c) => c.name === 'goal.create')).toHaveLength(1)
  } finally {
    f.dispose()
  }
})

test('legacy runtimes without configuration keep old API behavior, but explicit choices and revisions never downgrade', async () => {
  const f = await fixture(false)
  try {
    expect(f.runtime.view.state.composerPermission.getSnapshot().available).toBe(false)
    await f.submit()
    expect(f.runs()[0]?.input.input.approval).toBeUndefined()
    await expect(f.submit(0)).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' })
    expect(f.runs()).toHaveLength(1)
    await f.choice('deny')
    await f.submit(1)
    expect(f.runs()[1]?.input.input.approval).toBe('deny')
    expect(f.calls.some((c) => c.name === 'permission.get' || c.name === 'permission.set')).toBe(false)
  } finally {
    f.dispose()
  }
})

test('conflicting explicit wire approval fails locally without leaving a locked capture', async () => {
  const f = await fixture()
  try {
    await f.choice('deny')
    const request: SubmitRunInput = {
      sessionId: 'a',
      modelId: 'model',
      input: { text: 'Draft', images: [], approval: 'allow' },
    }
    await expect(
      f.runtime.view.commands.execute('composerIntent.submit', { ...request, expectedPermissionRevision: 1 }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(f.current()).toMatchObject({ choice: 'deny', locked: false })
    expect(f.runs()).toHaveLength(0)
  } finally {
    f.dispose()
  }
})

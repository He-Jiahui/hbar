import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry, type ExecuteOptions } from '@hbar/commands'
import { goalPlanCommands, type GoalPlanChange, type GoalPlanSnapshot } from '@hbar/contracts/commands/goals'
import { runAcceptedSchema, submitRunInputSchema, type RunAccepted } from '@hbar/contracts/commands/run'
import type { Message, ThreadGoal } from '@hbar/contracts'
import type { PromptWorkspaceContextInput, PromptMention } from '@hbar/contracts/commands/draft'
import { createComposerIntent } from '../packages/app-runtime/src/composer-intent'
import { createDrafts } from '../packages/app-runtime/src/drafts'
import { createState } from '../packages/app-runtime/src/state'
import type { GoalPlanWorkspacePort, NavigationState, RunCommandPort } from '../packages/app-runtime/src/types'

function fixture(
  readConversationMessage?: (sessionId: string, messageId: string) => Readonly<Message> | null,
  modeOptions: { readonly mode?: 'default' | 'plan'; readonly modeSequence?: readonly ('default' | 'plan')[] } = {},
) {
  const local = new CommandRegistry()
  const navigation = createState<NavigationState>(
    { workspaceId: 'w', sessionId: null, status: 'idle', error: null },
    () => {},
  )
  const values = new Map<string, GoalPlanSnapshot>()
  const listeners = new Map<string, Set<(change: GoalPlanChange | { kind: 'reset' }) => void>>()
  const calls: { name: string; input: unknown; key?: string | undefined }[] = []
  const receipts = new Map<string, RunAccepted>()
  let createFailure: 'before' | 'after' | 'generic' | null = null
  let runFailure: 'known' | 'unknown' | null = null
  let controlFailure = false
  let runGate: Promise<void> | null = null
  let readGate: Promise<void> | null = null
  let mode = modeOptions.mode ?? 'default'
  let modeReads = 0
  let goalNumber = 0
  let goalRunActive = false
  const value = (sessionId: string): GoalPlanSnapshot =>
    values.get(sessionId) ?? {
      sessionId,
      goal: null,
      remainingTokens: null,
      goalSeq: 0,
      plan: null,
      planSeq: 0,
    }
  const setGoal = (sessionId: string, goal: ThreadGoal | null) => {
    const previous = value(sessionId)
    const next = {
      ...previous,
      goal,
      goalSeq: previous.goalSeq + 1,
      remainingTokens: goal?.tokenBudget == null ? null : Math.max(0, goal.tokenBudget - goal.tokensUsed),
    }
    values.set(sessionId, next)
    for (const listener of listeners.get(sessionId) ?? [])
      listener({ kind: 'goal', sessionId, seq: next.goalSeq, goal })
  }
  const makeGoal = (sessionId: string, objective = 'Ship it'): ThreadGoal => ({
    threadId: sessionId,
    goalId: `goal-${++goalNumber}`,
    objective,
    status: 'active',
    tokenBudget: null,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    createdAt: 1,
    updatedAt: 1,
  })
  const goals: GoalPlanWorkspacePort = {
    snapshot: async (sessionId) => {
      const captured = value(sessionId)
      if (readGate) await readGate
      return captured
    },
    watch(sessionId, listener) {
      const set = listeners.get(sessionId) ?? new Set()
      set.add(listener)
      listeners.set(sessionId, set)
      return () => {
        set.delete(listener)
      }
    },
    async execute(name, raw) {
      calls.push({ name, input: raw })
      if (name === 'goal.create') {
        const input = goalPlanCommands['goal.create'].input.parse(raw)
        if (createFailure === 'before') throw new CommandError('RESULT_UNKNOWN', 'Lost request')
        if (value(input.sessionId).goal?.status === 'active') throw new CommandError('GOAL_EXISTS', 'Existing')
        setGoal(input.sessionId, {
          ...makeGoal(input.sessionId, input.objective),
          tokenBudget: input.tokenBudget ?? null,
        })
        if (createFailure === 'after') throw new CommandError('RESULT_UNKNOWN', 'Lost confirmation')
        if (createFailure === 'generic') throw new Error('Unclassified failure after the side effect')
        const snapshot = value(input.sessionId)
        return { goal: snapshot.goal, remainingTokens: snapshot.remainingTokens }
      }
      if (name === 'goal.set') {
        const input = goalPlanCommands['goal.set'].input.parse(raw)
        const before = value(input.sessionId).goal
        if (!before || before.goalId !== input.expectedGoalId) throw new CommandError('GOAL_CONFLICT', 'Stale goal')
        setGoal(
          input.sessionId,
          input.objective && input.objective !== before.objective
            ? { ...makeGoal(input.sessionId, input.objective), status: input.status ?? 'active' }
            : { ...before, status: input.status ?? before.status },
        )
        if (controlFailure) throw new CommandError('RESULT_UNKNOWN', 'Lost goal control')
        const snapshot = value(input.sessionId)
        return { goal: snapshot.goal, remainingTokens: snapshot.remainingTokens }
      }
      if (name === 'goal.clear') {
        const input = goalPlanCommands['goal.clear'].input.parse(raw)
        if (value(input.sessionId).goal?.goalId !== input.expectedGoalId)
          throw new CommandError('GOAL_CONFLICT', 'Stale goal')
        setGoal(input.sessionId, null)
        if (controlFailure) throw new CommandError('RESULT_UNKNOWN', 'Lost clear')
        return { cleared: true }
      }
      throw new Error(`Unexpected goal command ${name}`)
    },
  }
  const run: RunCommandPort = {
    async execute(name: string, raw: unknown, execution?: ExecuteOptions) {
      calls.push({ name, input: raw, key: execution?.idempotencyKey })
      const input = submitRunInputSchema.parse(raw)
      if (runGate) await runGate
      if (runFailure === 'known') throw new CommandError('MODEL_NOT_FOUND', 'Configure a model')
      const accepted = runAcceptedSchema.parse({
        status: 'accepted',
        commandId: 'run.submit',
        commandVersion: 1,
        requestId: 'request',
        idempotencyKey: execution?.idempotencyKey,
        operationId: `run-${calls.length}`,
        sessionId: input.sessionId,
        acceptedAt: 1,
      })
      receipts.set(`${input.sessionId}:${accepted.idempotencyKey}`, accepted)
      if (runFailure === 'unknown') throw new CommandError('RESULT_UNKNOWN', 'Lost Run receipt')
      return accepted
    },
    async getReceipt(sessionId, key) {
      return receipts.get(`${sessionId}:${key}`) ?? null
    },
  }
  const drafts = createDrafts(
    local,
    run,
    undefined,
    () => {},
    () => false,
    undefined,
    undefined,
    readConversationMessage,
  )
  const composer = createComposerIntent(local, {
    goals,
    navigation: navigation.reader,
    isRunActive: () => goalRunActive,
    onSubscriberError: () => {},
    executeRun: drafts.executeRun,
    serializeDraft: drafts.serializeSubmission,
    serializeGoalObjective: drafts.serializeGoalObjective,
    consumeGoalSlashDraft: (sessionId, revision, text) => {
      const current = drafts.reader.getSnapshot()[sessionId]
      if (
        current?.revision === revision &&
        current.text === text &&
        !current.workspaceContexts?.length &&
        !current.mentions.length &&
        !current.attachments.length &&
        !current.attachmentTransfers.length
      )
        void local.execute('draft.setContent', { sessionId, text: '', mentions: [], expectedRevision: revision })
    },
    reconcileRun: async (sessionId) =>
      runAcceptedSchema.nullable().parse(await local.execute('draft.reconcileSubmission', { sessionId })),
    ...(modeOptions.mode !== undefined || modeOptions.modeSequence
      ? {
          captureMode: () => mode,
          refreshMode: async () => {
            const sequence = modeOptions.modeSequence
            mode = sequence?.[Math.min(modeReads, Math.max(0, sequence.length - 1))] ?? mode
            modeReads += 1
            return mode
          },
        }
      : {}),
  })
  const submit = (sessionId: string, text = 'Ship it', expectedLaunchTargetRevision?: number) =>
    local.execute('composerIntent.submit', {
      sessionId,
      modelId: 'provider/model',
      input: { text, images: [] },
      ...(expectedLaunchTargetRevision === undefined ? {} : { expectedLaunchTargetRevision }),
    })
  const intent = (sessionId: string, intent: 'default' | 'goal' | 'plan') =>
    local.execute('composerIntent.setIntent', { sessionId, intent })
  return {
    local,
    composer,
    drafts,
    calls,
    setGoal,
    makeGoal,
    value,
    submit,
    intent,
    listeners,
    modeReads: () => modeReads,
    select(sessionId: string | null) {
      navigation.replace({ workspaceId: 'w', sessionId, status: 'idle', error: null })
    },
    failures(next: { create?: typeof createFailure; run?: typeof runFailure; control?: boolean }) {
      if (next.create !== undefined) createFailure = next.create
      if (next.run !== undefined) runFailure = next.run
      if (next.control !== undefined) controlFailure = next.control
    },
    gates(next: { run?: Promise<void> | null; read?: Promise<void> | null }) {
      if (next.run !== undefined) runGate = next.run
      if (next.read !== undefined) readGate = next.read
    },
    runActive(value: boolean) {
      goalRunActive = value
    },
    dispose() {
      composer.dispose()
      drafts.dispose()
      local.dispose()
      navigation.dispose()
    },
  }
}

test('composer intent is a per-session draft, cancellation never clears a Goal, and mode is explicit on every Run', async () => {
  const f = fixture()
  try {
    f.setGoal('one', f.makeGoal('one'))
    await f.intent('one', 'goal')
    await f.intent('two', 'plan')
    await f.intent('one', 'default')
    expect(f.calls).toHaveLength(0)
    expect(f.composer.reader.getSnapshot().entries.two?.intent).toBe('plan')
    await f.submit('one')
    await f.submit('two')
    expect(f.calls.map((call) => submitRunInputSchema.parse(call.input).input.mode)).toEqual(['default', 'plan'])
    for (const call of f.calls.filter((item) => item.name === 'run.submit'))
      expect(submitRunInputSchema.parse(call.input)).not.toHaveProperty('expectedLaunchTargetRevision')
    expect(f.value('one').goal).not.toBeNull()
    expect(f.composer.reader.getSnapshot().entries.two?.intent).toBe('default')
  } finally {
    f.dispose()
  }
})

test('Goal submission can run in the confirmed Host Plan mode and rechecks a changed mode before admission', async () => {
  const planned = fixture(undefined, { mode: 'plan' })
  try {
    planned.select('one')
    await planned.intent('one', 'goal')
    await planned.submit('one')
    expect(submitRunInputSchema.parse(planned.calls.find((call) => call.name === 'run.submit')?.input).input.mode).toBe(
      'plan',
    )
    expect(planned.value('one').goal).not.toBeNull()
  } finally {
    planned.dispose()
  }

  const changed = fixture(undefined, { modeSequence: ['plan', 'default'] })
  try {
    changed.select('one')
    await changed.intent('one', 'goal')
    await expect(changed.submit('one')).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    expect(changed.modeReads()).toBe(2)
    expect(changed.calls.filter((call) => call.name === 'goal.create')).toHaveLength(0)
    expect(changed.calls.filter((call) => call.name === 'run.submit')).toHaveLength(0)
  } finally {
    changed.dispose()
  }
})

test('parent Agent prompt uses ordinary Run receipt recovery and preserves images and files until acceptance', async () => {
  const f = fixture()
  const text = '/agent explore Inspect this exact prompt\nthen report the findings'
  const image = { id: 'a'.repeat(64), name: 'diagram.png', mime: 'image/png', size: 12 }
  const file = { id: 'b'.repeat(64), name: 'notes.txt', mime: 'text/plain', size: 25 }
  try {
    f.select('one')
    await f.local.execute('draft.setText', { sessionId: 'one', text })
    const revision = f.drafts.reader.getSnapshot().one?.revision
    if (revision === undefined) throw new Error('Missing parent prompt draft')
    await f.local.execute('draft.setAttachments', {
      sessionId: 'one',
      attachments: [
        { kind: 'image', artifact: image },
        { kind: 'file', artifact: file },
      ],
      expectedRevision: revision,
    })
    const captured = f.drafts.reader.getSnapshot().one
    if (!captured) throw new Error('Missing parent prompt attachments')
    f.failures({ run: 'unknown' })
    await expect(
      f.local.execute('composerIntent.submit', {
        sessionId: 'one',
        modelId: 'provider/model',
        expectedDraftRevision: captured.revision,
        input: { text, images: [image], files: [file] },
      }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    const calls = f.calls.filter((call) => call.name === 'run.submit')
    expect(calls).toHaveLength(1)
    expect(submitRunInputSchema.parse(calls[0]?.input).input).toMatchObject({
      text,
      images: [image],
      files: [file],
      source: 'user',
      mode: 'default',
    })
    expect(f.calls.filter((call) => call.name === 'agent.create' || call.name === 'goal.create')).toHaveLength(0)
    expect(f.drafts.reader.getSnapshot().one).toMatchObject({
      text,
      attachments: captured.attachments,
      status: 'unknown',
    })
    await f.local.execute('composerIntent.reconcile', { sessionId: 'one' })
    expect(f.calls.filter((call) => call.name === 'run.submit')).toHaveLength(1)
    expect(f.drafts.reader.getSnapshot().one).toMatchObject({ text: '', attachments: [], status: 'idle' })
  } finally {
    f.dispose()
  }
})

test('Goal intent excludes conversation quotes while Run receives both workspace and chat context', async () => {
  const message: Message = {
    id: 'assistant-message',
    sessionId: 'one',
    runId: 'run',
    role: 'assistant',
    content: [{ type: 'text', text: 'A rendered assistant response' }],
    seq: 1,
    createdAt: 1,
  }
  const f = fixture((sessionId, messageId) =>
    sessionId === message.sessionId && messageId === message.id ? message : null,
  )
  const mention: PromptMention = {
    start: 8,
    end: 17,
    label: 'entry.ts',
    path: 'src/entry.ts',
    workspaceId: 'w',
    directory: false,
  }
  const context: PromptWorkspaceContextInput = {
    kind: 'source-selection',
    workspaceId: 'w',
    path: 'src/entry.ts',
    lineStart: 5,
    lineEnd: 5,
    quote: 'const value = 1',
    sha256: 'c'.repeat(64),
  }
  try {
    f.select('one')
    await f.intent('one', 'goal')
    await f.local.execute('draft.setContent', {
      sessionId: 'one',
      text: 'Look at @entry.ts',
      mentions: [mention],
      expectedRevision: 0,
    })
    await f.local.execute('draft.addWorkspaceContext', {
      sessionId: 'one',
      context,
      expectedRevision: 1,
    })
    await f.local.execute('draft.addConversationSelection', {
      sessionId: 'one',
      messageId: message.id,
      expectedText: 'A rendered assistant response',
      quote: 'rendered assistant',
      expectedRevision: 2,
    })

    await f.local.execute('composerIntent.submit', {
      sessionId: 'one',
      modelId: 'provider/model',
      input: { text: 'Look at @entry.ts', images: [] },
      expectedDraftRevision: 3,
    })

    const goalInput = goalPlanCommands['goal.create'].input.parse(
      f.calls.find((call) => call.name === 'goal.create')?.input,
    )
    const runInput = submitRunInputSchema.parse(f.calls.find((call) => call.name === 'run.submit')?.input)
    expect(goalInput.objective).toBe('Look at @"src/entry.ts"')
    expect(runInput.input.text).toContain('Look at @"src/entry.ts"')
    expect(runInput.input.text).toContain('Referenced workspace context:')
    expect(runInput.input.text).toContain('Referenced chat context:')
    expect(runInput.input.text).toContain('const value = 1')
    expect(runInput.input.text).toContain('rendered assistant')
    expect(f.drafts.reader.getSnapshot().one).toMatchObject({ text: '', workspaceContexts: [] })
  } finally {
    f.dispose()
  }
})

test('optional launch-target revision is validated and reaches Run without changing ordinary requests', async () => {
  const f = fixture()
  try {
    const ordinary = { sessionId: 'one', modelId: 'provider/model', input: { text: 'Ship it', images: [] } }
    expect(submitRunInputSchema.parse(ordinary)).not.toHaveProperty('expectedLaunchTargetRevision')
    expect(submitRunInputSchema.safeParse({ ...ordinary, expectedLaunchTargetRevision: -1 }).success).toBe(false)
    expect(submitRunInputSchema.safeParse({ ...ordinary, expectedLaunchTargetRevision: 0.5 }).success).toBe(false)
    expect(
      submitRunInputSchema.safeParse({
        ...ordinary,
        expectedLaunchTargetRevision: Number.MAX_SAFE_INTEGER + 1,
      }).success,
    ).toBe(false)

    await f.submit('one', 'Ship it', 0)
    const run = f.calls.find((call) => call.name === 'run.submit')
    expect(submitRunInputSchema.parse(run?.input).expectedLaunchTargetRevision).toBe(0)
  } finally {
    f.dispose()
  }
})

test('confirmed Goal plus failed Run stays partial; retry reuses the Goal and Run key and clears the actual draft only on acceptance', async () => {
  const f = fixture()
  try {
    await f.intent('one', 'goal')
    await f.local.execute('draft.setText', { sessionId: 'one', text: 'Ship it' })
    f.failures({ run: 'known' })
    await expect(f.submit('one', 'Ship it', 7)).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' })
    expect(f.composer.reader.getSnapshot().entries.one?.submission).toMatchObject({
      status: 'partial',
      phase: 'run',
      preparedGoalId: 'goal-1',
    })
    expect(f.drafts.reader.getSnapshot().one?.text).toBe('Ship it')
    await expect(f.submit('one', 'Ship it', 8)).rejects.toMatchObject({ code: 'GOAL_SUBMISSION_CHANGED' })
    expect(f.calls.filter((call) => call.name === 'run.submit')).toHaveLength(1)
    f.failures({ run: null })
    // A normal composer retry may omit the internal capture; it must keep the original fence.
    await f.submit('one')
    expect(f.calls.filter((call) => call.name === 'goal.create')).toHaveLength(1)
    const runs = f.calls.filter((call) => call.name === 'run.submit')
    expect(runs).toHaveLength(2)
    expect(runs[0]?.key).toBe(runs[1]?.key)
    expect(submitRunInputSchema.parse(runs[0]?.input).expectedLaunchTargetRevision).toBe(7)
    expect(submitRunInputSchema.parse(runs[1]?.input).expectedLaunchTargetRevision).toBe(7)
    expect(f.drafts.reader.getSnapshot().one?.text).toBe('')
    expect(f.composer.reader.getSnapshot().entries.one?.submission.status).toBe('idle')
  } finally {
    f.dispose()
  }
})

test('uncertain Goal creation is read-reconciled and requires an explicit retry before sending', async () => {
  const f = fixture()
  try {
    await f.intent('one', 'goal')
    f.failures({ create: 'after' })
    await expect(f.submit('one', 'Ship it', 11)).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    await expect(f.submit('one')).rejects.toMatchObject({ code: 'BUSY' })
    await expect(f.intent('one', 'default')).rejects.toMatchObject({ code: 'BUSY' })
    expect(f.calls).toHaveLength(1)
    await f.local.execute('composerIntent.reconcile', { sessionId: 'one' })
    expect(f.composer.reader.getSnapshot().entries.one?.submission.status).toBe('partial')
    expect(f.calls).toHaveLength(1)
    await f.submit('one')
    expect(f.calls.map((call) => call.name)).toEqual(['goal.create', 'run.submit'])
    expect(submitRunInputSchema.parse(f.calls.find((call) => call.name === 'run.submit')?.input)).toHaveProperty(
      'expectedLaunchTargetRevision',
      11,
    )
  } finally {
    f.dispose()
  }
})

test('an unclassified error after Goal creation is unknown and cannot replay the write', async () => {
  const f = fixture()
  try {
    await f.intent('one', 'goal')
    f.failures({ create: 'generic' })
    await expect(f.submit('one')).rejects.toThrow()
    expect(f.composer.reader.getSnapshot().entries.one?.submission.status).toBe('unknown')
    await expect(f.submit('one')).rejects.toMatchObject({ code: 'BUSY' })
    expect(f.calls.filter((call) => call.name === 'goal.create')).toHaveLength(1)
    await f.local.execute('composerIntent.reconcile', { sessionId: 'one' })
    expect(f.composer.reader.getSnapshot().entries.one?.submission.status).toBe('partial')
  } finally {
    f.dispose()
  }
})

test('an absent Goal snapshot is not permission to blindly replay an uncertain creation', async () => {
  const f = fixture()
  try {
    await f.intent('one', 'goal')
    f.failures({ create: 'before' })
    await expect(f.submit('one')).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    await expect(f.local.execute('composerIntent.reconcile', { sessionId: 'one' })).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    await expect(f.submit('one')).rejects.toMatchObject({ code: 'BUSY' })
    expect(f.calls).toHaveLength(1)
  } finally {
    f.dispose()
  }
})

test('uncertain Run acceptance uses the existing draft receipt reconciliation without a second Run or Goal', async () => {
  const f = fixture()
  try {
    await f.intent('one', 'goal')
    await f.local.execute('draft.setText', { sessionId: 'one', text: 'Ship it' })
    f.failures({ run: 'unknown' })
    await expect(f.submit('one', 'Ship it', 13)).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(f.composer.reader.getSnapshot().entries.one?.submission).toMatchObject({ status: 'unknown', phase: 'run' })
    await f.local.execute('composerIntent.reconcile', { sessionId: 'one' })
    expect(f.calls).toHaveLength(2)
    expect(submitRunInputSchema.parse(f.calls.find((call) => call.name === 'run.submit')?.input)).toHaveProperty(
      'expectedLaunchTargetRevision',
      13,
    )
    expect(f.drafts.reader.getSnapshot().one?.text).toBe('')
    expect(f.composer.reader.getSnapshot().entries.one?.intent).toBe('default')
  } finally {
    f.dispose()
  }
})

test('partial retry rejects changed drafts and replaced Goals; cancelling intent never removes the saved Goal', async () => {
  const f = fixture()
  try {
    await f.intent('one', 'goal')
    f.failures({ run: 'known' })
    await expect(f.submit('one')).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' })
    await expect(f.submit('one', 'Different')).rejects.toMatchObject({ code: 'GOAL_SUBMISSION_CHANGED' })
    const replacement = f.makeGoal('one', 'Replacement')
    f.setGoal('one', replacement)
    await expect(f.submit('one')).rejects.toMatchObject({ code: 'GOAL_CONFLICT' })
    await f.intent('one', 'default')
    expect(f.value('one').goal).toEqual(replacement)
    expect(f.calls.filter((call) => call.name === 'goal.create')).toHaveLength(1)
    expect(f.calls.filter((call) => call.name === 'run.submit')).toHaveLength(1)
  } finally {
    f.dispose()
  }
})

test('Goal strip controls use exact identity and resume never submits a duplicate Run', async () => {
  const f = fixture()
  try {
    const goal = f.makeGoal('one')
    f.setGoal('one', goal)
    const base = { sessionId: 'one', expectedGoalId: goal.goalId }
    await f.local.execute('composerIntent.controlGoal', { ...base, action: 'pause' })
    expect(f.value('one').goal?.status).toBe('paused')
    await f.local.execute('composerIntent.controlGoal', { ...base, action: 'resume' })
    expect(f.value('one').goal?.status).toBe('active')
    await f.local.execute('composerIntent.controlGoal', { ...base, action: 'clear' })
    expect(f.value('one').goal).toBeNull()
    expect(f.calls.map((call) => call.name)).toEqual(['goal.set', 'goal.set', 'goal.clear'])
  } finally {
    f.dispose()
  }
})

test('Goal slash command creates, replaces and clears Host facts without submitting a Run', async () => {
  const f = fixture()
  try {
    f.select('one')
    await f.local.execute('composerIntent.commandGoal', { sessionId: 'one', action: 'set', objective: 'First' })
    const first = f.value('one').goal!
    expect(first.objective).toBe('First')
    await f.local.execute('composerIntent.commandGoal', {
      sessionId: 'one',
      action: 'set',
      objective: 'Second',
      expectedGoalId: first.goalId,
    })
    const second = f.value('one').goal!
    expect(second.objective).toBe('Second')
    expect(second.goalId).not.toBe(first.goalId)
    await f.local.execute('composerIntent.commandGoal', {
      sessionId: 'one',
      action: 'set',
      objective: 'Second',
      expectedGoalId: second.goalId,
    })
    await f.local.execute('composerIntent.commandGoal', {
      sessionId: 'one',
      action: 'clear',
      expectedGoalId: second.goalId,
    })
    expect(f.value('one').goal).toBeNull()
    expect(f.calls.map((call) => call.name)).toEqual(['goal.create', 'goal.set', 'goal.clear'])
    f.setGoal('one', { ...f.makeGoal('one', 'First'), status: 'complete' })
    await f.local.execute('composerIntent.commandGoal', { sessionId: 'one', action: 'set', objective: 'First' })
    expect(f.value('one').goal?.status).toBe('active')
    expect(f.calls.map((call) => call.name)).toEqual(['goal.create', 'goal.set', 'goal.clear', 'goal.create'])
  } finally {
    f.dispose()
  }
})

test('confirmed Goal slash starts one Goal Run with its objective and consumes only its captured draft', async () => {
  const f = fixture()
  try {
    f.select('one')
    await f.local.execute('draft.setText', { sessionId: 'one', text: '/goal First' })
    const revision = f.drafts.reader.getSnapshot().one!.revision
    const created = await f.local.execute('composerIntent.commandGoal', {
      sessionId: 'one',
      action: 'set',
      objective: 'First',
    })
    const goalId = (created as { goalId: string }).goalId
    await f.local.execute('composerIntent.startGoalRun', {
      sessionId: 'one',
      objective: 'First',
      expectedGoalId: goalId,
      modelId: 'provider/model',
      expectedDraftRevision: revision,
      draftText: '/goal First',
    })
    const run = f.calls.find((call) => call.name === 'run.submit')
    expect(submitRunInputSchema.parse(run?.input).input).toMatchObject({
      text: 'First',
      images: [],
      source: 'user',
      mode: 'default',
    })
    expect(submitRunInputSchema.parse(run?.input)).not.toHaveProperty('expectedLaunchTargetRevision')
    expect(f.calls.map((call) => call.name)).toEqual(['goal.create', 'run.submit'])
    expect(f.drafts.reader.getSnapshot().one?.text).toBe('')
  } finally {
    f.dispose()
  }
})

test('Goal slash Run captures the current Host Plan mode instead of forcing default mode', async () => {
  const f = fixture(undefined, { mode: 'plan' })
  try {
    f.select('one')
    await f.local.execute('draft.setText', { sessionId: 'one', text: '/goal First' })
    const revision = f.drafts.reader.getSnapshot().one!.revision
    const created = (await f.local.execute('composerIntent.commandGoal', {
      sessionId: 'one',
      action: 'set',
      objective: 'First',
    })) as { goalId: string }
    await f.local.execute('composerIntent.startGoalRun', {
      sessionId: 'one',
      objective: 'First',
      expectedGoalId: created.goalId,
      modelId: 'provider/model',
      expectedDraftRevision: revision,
      draftText: '/goal First',
    })
    expect(submitRunInputSchema.parse(f.calls.find((call) => call.name === 'run.submit')?.input).input.mode).toBe(
      'plan',
    )
  } finally {
    f.dispose()
  }
})

test('failed Goal kickoff retains the saved Goal and slash draft for an explicit Run retry', async () => {
  const f = fixture()
  try {
    f.select('one')
    await f.local.execute('draft.setText', { sessionId: 'one', text: '/goal First' })
    const revision = f.drafts.reader.getSnapshot().one!.revision
    const input = {
      sessionId: 'one',
      objective: 'First',
      modelId: 'provider/model',
      expectedLaunchTargetRevision: 17,
      expectedDraftRevision: revision,
      draftText: '/goal First',
    }
    const created = (await f.local.execute('composerIntent.commandGoal', {
      sessionId: 'one',
      action: 'set',
      objective: 'First',
    })) as { goalId: string }
    f.failures({ run: 'known' })
    await expect(
      f.local.execute('composerIntent.startGoalRun', { ...input, expectedGoalId: created.goalId }),
    ).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' })
    expect(f.composer.reader.getSnapshot().entries.one?.submission).toMatchObject({ status: 'partial', phase: 'run' })
    expect(f.drafts.reader.getSnapshot().one?.text).toBe('/goal First')
    f.failures({ run: null })
    await expect(
      f.local.execute('composerIntent.startGoalRun', {
        ...input,
        expectedGoalId: created.goalId,
        expectedLaunchTargetRevision: 18,
      }),
    ).rejects.toMatchObject({ code: 'GOAL_SUBMISSION_CHANGED' })
    const repeated = (await f.local.execute('composerIntent.commandGoal', {
      sessionId: 'one',
      action: 'set',
      objective: 'First',
      expectedGoalId: created.goalId,
    })) as { goalId: string }
    expect(repeated.goalId).toBe(created.goalId)
    await f.local.execute('composerIntent.startGoalRun', {
      sessionId: input.sessionId,
      objective: input.objective,
      expectedGoalId: repeated.goalId,
      modelId: input.modelId,
      expectedDraftRevision: input.expectedDraftRevision,
      draftText: input.draftText,
    })
    expect(f.calls.filter((call) => call.name === 'goal.create')).toHaveLength(1)
    expect(f.calls.filter((call) => call.name === 'run.submit')).toHaveLength(2)
    for (const run of f.calls.filter((call) => call.name === 'run.submit'))
      expect(submitRunInputSchema.parse(run.input).expectedLaunchTargetRevision).toBe(17)
    expect(f.drafts.reader.getSnapshot().one?.text).toBe('')
  } finally {
    f.dispose()
  }
})

test('uncertain Goal kickoff reconciles the original Run receipt without a duplicate Goal or Run', async () => {
  const f = fixture()
  try {
    f.select('one')
    await f.local.execute('draft.setText', { sessionId: 'one', text: '/goal First' })
    const revision = f.drafts.reader.getSnapshot().one!.revision
    const created = (await f.local.execute('composerIntent.commandGoal', {
      sessionId: 'one',
      action: 'set',
      objective: 'First',
    })) as { goalId: string }
    const input = {
      sessionId: 'one',
      objective: 'First',
      expectedGoalId: created.goalId,
      modelId: 'provider/model',
      expectedLaunchTargetRevision: 19,
      expectedDraftRevision: revision,
      draftText: '/goal First',
    }
    f.failures({ run: 'unknown' })
    await expect(f.local.execute('composerIntent.startGoalRun', input)).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    await expect(f.local.execute('composerIntent.startGoalRun', input)).rejects.toMatchObject({ code: 'BUSY' })
    await f.local.execute('composerIntent.reconcile', { sessionId: 'one' })
    expect(f.calls.map((call) => call.name)).toEqual(['goal.create', 'run.submit'])
    expect(submitRunInputSchema.parse(f.calls.find((call) => call.name === 'run.submit')?.input)).toHaveProperty(
      'expectedLaunchTargetRevision',
      19,
    )
    expect(f.drafts.reader.getSnapshot().one?.text).toBe('')
  } finally {
    f.dispose()
  }
})

test('Goal kickoff rejects stale identity and draft before a Run, and clear abandons a failed kickoff', async () => {
  const f = fixture()
  try {
    f.select('one')
    await f.local.execute('draft.setText', { sessionId: 'one', text: '/goal First' })
    const revision = f.drafts.reader.getSnapshot().one!.revision
    const created = (await f.local.execute('composerIntent.commandGoal', {
      sessionId: 'one',
      action: 'set',
      objective: 'First',
    })) as { goalId: string }
    const input = {
      sessionId: 'one',
      objective: 'First',
      expectedGoalId: created.goalId,
      modelId: 'provider/model',
      expectedDraftRevision: revision,
      draftText: '/goal First',
    }
    await expect(
      f.local.execute('composerIntent.startGoalRun', { ...input, expectedGoalId: 'stale' }),
    ).rejects.toMatchObject({ code: 'GOAL_CONFLICT' })
    await expect(
      f.local.execute('composerIntent.startGoalRun', { ...input, expectedDraftRevision: revision + 1 }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    expect(f.calls.filter((call) => call.name === 'run.submit')).toHaveLength(0)
    f.failures({ run: 'known' })
    await expect(f.local.execute('composerIntent.startGoalRun', input)).rejects.toMatchObject({
      code: 'MODEL_NOT_FOUND',
    })
    await f.local.execute('composerIntent.commandGoal', {
      sessionId: 'one',
      action: 'clear',
      expectedGoalId: created.goalId,
    })
    expect(f.composer.reader.getSnapshot().entries.one?.submission.status).toBe('idle')
    expect(f.drafts.reader.getSnapshot().one?.text).toBe('/goal First')
  } finally {
    f.dispose()
  }
})

test('Goal slash command refuses unconfirmed replacement and stale session before a write', async () => {
  const f = fixture()
  try {
    const first = f.makeGoal('one')
    f.setGoal('one', first)
    f.select('one')
    await expect(
      f.local.execute('composerIntent.commandGoal', {
        sessionId: 'one',
        action: 'set',
        objective: 'Replacement',
      }),
    ).rejects.toMatchObject({ code: 'GOAL_CONFLICT' })
    await expect(
      f.local.execute('composerIntent.commandGoal', {
        sessionId: 'one',
        action: 'clear',
        expectedGoalId: 'stale',
      }),
    ).rejects.toMatchObject({ code: 'GOAL_CONFLICT' })
    f.select('two')
    await expect(
      f.local.execute('composerIntent.commandGoal', {
        sessionId: 'one',
        action: 'set',
        objective: 'Replacement',
        expectedGoalId: first.goalId,
      }),
    ).rejects.toMatchObject({ code: 'STALE_TARGET' })
    expect(f.calls).toHaveLength(0)
  } finally {
    f.dispose()
  }
})

test('Goal slash resumes a paused matching objective before its user Run', async () => {
  const f = fixture()
  try {
    const paused = { ...f.makeGoal('one', 'First'), status: 'paused' as const }
    if (!paused.goalId) throw new Error('Fixture Goal has no identity')
    f.setGoal('one', paused)
    f.select('one')
    await f.local.execute('draft.setText', { sessionId: 'one', text: '/goal First' })
    const revision = f.drafts.reader.getSnapshot().one!.revision
    const resumed = (await f.local.execute('composerIntent.commandGoal', {
      sessionId: 'one',
      action: 'set',
      objective: 'First',
      expectedGoalId: paused.goalId,
    })) as { goalId: string }
    expect(resumed.goalId).toBe(paused.goalId)
    expect(f.value('one').goal?.status).toBe('active')
    await f.local.execute('composerIntent.startGoalRun', {
      sessionId: 'one',
      objective: 'First',
      expectedGoalId: paused.goalId,
      modelId: 'provider/model',
      expectedDraftRevision: revision,
      draftText: '/goal First',
    })
    expect(f.calls.map((call) => call.name)).toEqual(['goal.set', 'run.submit'])
  } finally {
    f.dispose()
  }
})

test('Goal slash does not invalidate a running task', async () => {
  const f = fixture()
  try {
    f.select('one')
    f.runActive(true)
    await expect(
      f.local.execute('composerIntent.commandGoal', {
        sessionId: 'one',
        action: 'set',
        objective: 'Later',
      }),
    ).rejects.toMatchObject({ code: 'RUN_ACTIVE' })
    expect(f.calls).toHaveLength(0)
    f.runActive(false)
    await f.local.execute('composerIntent.commandGoal', { sessionId: 'one', action: 'set', objective: 'Later' })
    expect(f.value('one').goal?.objective).toBe('Later')
  } finally {
    f.dispose()
  }
})

test('uncertain Goal slash write freezes repeat writes until current Host facts are reconciled', async () => {
  const f = fixture()
  try {
    f.select('one')
    f.failures({ create: 'after' })
    await expect(
      f.local.execute('composerIntent.commandGoal', {
        sessionId: 'one',
        action: 'set',
        objective: 'First',
      }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(f.composer.reader.getSnapshot().entries.one?.goalAction.status).toBe('unknown')
    await expect(
      f.local.execute('composerIntent.commandGoal', {
        sessionId: 'one',
        action: 'set',
        objective: 'First',
      }),
    ).rejects.toMatchObject({ code: 'BUSY' })
    await f.local.execute('composerIntent.reconcile', { sessionId: 'one' })
    expect(f.composer.reader.getSnapshot().entries.one?.goalAction.status).toBe('succeeded')
    expect(f.calls.filter((call) => call.name === 'goal.create')).toHaveLength(1)
    expect(f.calls.filter((call) => call.name === 'run.submit')).toHaveLength(0)
  } finally {
    f.dispose()
  }
})

test('unknown Goal control reconciles facts and never retries against a replacement Goal', async () => {
  const f = fixture()
  try {
    const goal = f.makeGoal('one')
    f.setGoal('one', goal)
    f.failures({ control: true })
    await expect(
      f.local.execute('composerIntent.controlGoal', { sessionId: 'one', expectedGoalId: goal.goalId, action: 'pause' }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    await f.local.execute('composerIntent.reconcile', { sessionId: 'one' })
    expect(f.composer.reader.getSnapshot().entries.one?.goalAction.status).toBe('succeeded')
    await expect(
      f.local.execute('composerIntent.controlGoal', { sessionId: 'one', expectedGoalId: goal.goalId, action: 'clear' }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    const replacement = f.makeGoal('one', 'New goal')
    f.setGoal('one', replacement)
    await expect(f.local.execute('composerIntent.reconcile', { sessionId: 'one' })).rejects.toMatchObject({
      code: 'GOAL_CONFLICT',
    })
    expect(f.value('one').goal).toEqual(replacement)
    expect(f.calls).toHaveLength(2)
  } finally {
    f.dispose()
  }
})

test('Goal facts subscribe before snapshots, ignore stale targets, and release watches on navigation and disposal', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<void>()
  try {
    f.setGoal('one', f.makeGoal('one'))
    f.gates({ read: gate.promise })
    f.select('one')
    expect(f.listeners.get('one')?.size).toBe(1)
    const updated = { ...f.value('one').goal!, status: 'paused' as const }
    f.setGoal('one', updated)
    gate.resolve()
    await f.local.execute('composerIntent.refresh', { sessionId: 'one' })
    expect(f.composer.reader.getSnapshot().facts.snapshot?.goal?.status).toBe('paused')
    f.select('two')
    await f.local.execute('composerIntent.refresh', { sessionId: 'two' })
    f.setGoal('one', { ...updated, status: 'active' })
    expect(f.composer.reader.getSnapshot().facts.sessionId).toBe('two')
    expect(f.composer.reader.getSnapshot().facts.snapshot?.goal).toBeNull()
    expect(f.listeners.get('one')?.size).toBe(0)
    f.composer.dispose()
    expect(f.listeners.get('two')?.size).toBe(0)
  } finally {
    gate.resolve()
    f.dispose()
  }
})

test('pending sends are duplicate guarded and old-session completion cannot clear another session intent', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<void>()
  try {
    await f.intent('one', 'plan')
    f.gates({ run: gate.promise })
    const submission = f.submit('one', 'Ship it', 23)
    await expect(f.submit('one', 'Ship it', 23)).rejects.toMatchObject({ code: 'BUSY' })
    f.select('two')
    await f.intent('two', 'goal')
    gate.resolve()
    await submission
    expect(submitRunInputSchema.parse(f.calls.find((call) => call.name === 'run.submit')?.input)).toHaveProperty(
      'expectedLaunchTargetRevision',
      23,
    )
    expect(f.composer.reader.getSnapshot().entries.two?.intent).toBe('goal')
    expect(f.calls).toHaveLength(1)
  } finally {
    gate.resolve()
    f.dispose()
  }
})

test('invalid Goal drafts and forged continuation inputs fail before any Host write', async () => {
  const f = fixture()
  try {
    await f.intent('one', 'goal')
    await expect(f.submit('one', '')).rejects.toMatchObject({ code: 'GOAL_INVALID' })
    await expect(f.submit('one', 'x'.repeat(4_001))).rejects.toMatchObject({ code: 'GOAL_INVALID' })
    await expect(
      f.local.execute('composerIntent.submit', {
        sessionId: 'one',
        modelId: 'provider/model',
        input: { text: 'Ship it', images: [], source: 'goal' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(
      f.local.execute('composerIntent.submit', {
        sessionId: 'one',
        modelId: 'provider/model',
        input: { text: 'Ship it', images: [] },
        expectedIntentRevision: 0,
      }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    expect(f.calls).toHaveLength(0)
  } finally {
    f.dispose()
  }
})

test('accepted submissions preserve text edited during acceptance and do not overwrite a newer session draft', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<void>()
  try {
    await f.local.execute('draft.setText', { sessionId: 'one', text: 'Ship it' })
    await f.intent('one', 'plan')
    f.gates({ run: gate.promise })
    const submitted = f.submit('one')
    await f.local.execute('draft.setText', { sessionId: 'one', text: 'Newer text' })
    gate.resolve()
    await submitted
    expect(f.drafts.reader.getSnapshot().one?.text).toBe('Newer text')
    expect(f.composer.reader.getSnapshot().entries.one?.intent).toBe('default')
  } finally {
    gate.resolve()
    f.dispose()
  }
})

test('a model change repairs a rejected Run without recreating its confirmed Goal', async () => {
  const f = fixture()
  try {
    await f.intent('one', 'goal')
    f.failures({ run: 'known' })
    await expect(f.submit('one')).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' })
    f.failures({ run: null })
    await f.local.execute('composerIntent.submit', {
      sessionId: 'one',
      modelId: 'provider/working',
      input: { text: 'Ship it', images: [], thinking: 'low' },
    })
    expect(f.calls.filter((call) => call.name === 'goal.create')).toHaveLength(1)
    const runs = f.calls.filter((call) => call.name === 'run.submit')
    expect(runs).toHaveLength(2)
    expect(runs[0]?.key).not.toBe(runs[1]?.key)
    expect(submitRunInputSchema.parse(runs[1]?.input).modelId).toBe('provider/working')
  } finally {
    f.dispose()
  }
})

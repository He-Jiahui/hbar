import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { draftCommands } from '@hbar/contracts/commands/draft'
import { runCommands, type RunAccepted, type SubmitRunInput } from '@hbar/contracts/commands/run'
import {
  createAppRuntime,
  type SessionControlsState,
  type SessionTimelineState,
  type RunCommandPort,
} from '@hbar/app-runtime'
import { createDrafts } from '../packages/app-runtime/src/drafts'
import { createState } from '../packages/app-runtime/src/state'
import type { SessionExecutionPreparationPort } from '../packages/app-runtime/src/session-execution-preparation'
import {
  createPlanProposalActions,
  planProposalActionKey,
  planProposalCommands,
  type PlanProposalOptions,
} from '../packages/app-runtime/src/plan-proposal-actions'
import {
  MAX_PROPOSED_PLAN_CHARACTERS,
  parseProposedPlan,
  proposedPlanFingerprint,
} from '../packages/app-runtime/src/proposed-plan'

const markdown = '# 迁移计划\n\n1. 先核对入口。\n2. 保留原有草稿。\n3. 验证键盘与窄屏。'
const source = `说明文字。\n\n<proposed_plan>\n${markdown}\n</proposed_plan>\n\n结束说明。`
function timeline(): SessionTimelineState {
  return {
    sessionId: 'one',
    status: 'ready',
    olderStatus: 'idle',
    olderError: null,
    messages: [
      {
        id: 'proposal',
        sessionId: 'one',
        runId: 'source-run',
        role: 'assistant',
        content: [{ type: 'text', text: source }],
        seq: 1,
        createdAt: 2,
      },
    ],
    runs: [
      {
        id: 'source-run',
        sessionId: 'one',
        requestId: 'source-request',
        input: { text: 'Plan the work', images: [], mode: 'plan' },
        modelId: 'mock:model',
        status: 'completed',
        createdAt: 1,
        startedAt: 1,
        endedAt: 2,
        error: null,
      },
    ],
    approvals: [],
    userInputs: [],
    plan: null,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    streams: {},
    events: [],
    cursor: 1,
    hasOlder: false,
    error: null,
  }
}
function controls(): SessionControlsState {
  return {
    sessionId: 'one',
    status: 'ready',
    model: {
      sessionId: 'one',
      status: 'configured',
      modelId: 'mock:model',
      model: null,
      thinkingLevel: 'medium',
      revisions: {},
      sources: { model: 'session', thinkingLevel: 'session' },
    },
    usage: null,
    budget: null,
    errors: { model: null, usage: null, budget: null },
  }
}
function fixture(preparation?: SessionExecutionPreparationPort, modePort?: PlanProposalOptions['mode']) {
  const local = new CommandRegistry()
  const feed = createState(timeline(), () => {})
  const configuration = createState(controls(), () => {})
  const calls: Array<{ name: string; input: SubmitRunInput; key: string }> = []
  const receipts = new Map<string, RunAccepted>()
  let mode: 'accepted' | 'failed' | 'unknown' | 'wrong-target' | 'malformed' = 'accepted'
  let hold: Promise<void> | null = null
  let receiptVisible = true
  const receiptHolds: Promise<void>[] = []
  const receiptReads: Array<{ sessionId: string; key: string }> = []
  const receiptErrors: unknown[] = []
  const run: RunCommandPort = {
    async execute(name, input, options) {
      if (name === 'session.queuedUserRuns')
        return {
          sessionId: (input as { sessionId: string }).sessionId,
          sessionSeq: 0,
          totalQueued: 0,
          items: [],
          nextCursor: null,
        }
      if (name !== 'run.submit') throw new CommandError('COMMAND_NOT_FOUND', `Unexpected Run command: ${name}`)
      const request = input as SubmitRunInput
      const key = options?.idempotencyKey ?? ''
      calls.push({ name, input: request, key })
      if (hold) await hold
      if (mode === 'failed') throw new CommandError('MODEL_NOT_FOUND', 'Rejected before acceptance')
      const result: RunAccepted = {
        status: 'accepted',
        commandId: 'run.submit',
        commandVersion: 1,
        requestId: 'request',
        operationId: `operation-${calls.length}`,
        sessionId: request.sessionId,
        idempotencyKey: key,
        acceptedAt: 3,
      }
      receipts.set(key, result)
      if (mode === 'unknown') throw new CommandError('RESULT_UNKNOWN', 'Response lost')
      if (mode === 'wrong-target') return { ...result, sessionId: 'another-session' }
      if (mode === 'malformed') return { accepted: true }
      return result
    },
    async getReceipt(sessionId, key) {
      receiptReads.push({ sessionId, key })
      const receiptHold = receiptHolds.shift()
      if (receiptHold) await receiptHold
      if (receiptErrors.length) throw receiptErrors.shift()
      return receiptVisible ? (receipts.get(key) ?? null) : null
    },
  }
  const drafts = createDrafts(
    local,
    run,
    undefined,
    () => {},
    () => false,
    undefined,
    preparation,
  )
  const draftClient = createCommandClient(draftCommands, local)
  const proposal = createPlanProposalActions(local, {
    ...(preparation ? { preparation } : {}),
    timeline: feed.reader,
    controls: configuration.reader,
    ...(modePort ? { mode: modePort } : {}),
    executeDetachedRun: drafts.executeDetachedRun,
    reconcileRun: (sessionId) => draftClient.execute('draft.reconcileSubmission', { sessionId }),
    getSettledReceipt: drafts.getSettledReceipt,
    onSubscriberError: () => {},
    requestText: ({ action, markdown: plan, feedback, target }) =>
      `${action}\n${target.messageId}\n${plan}\n${feedback}`,
  })
  const commands = createCommandClient(planProposalCommands, local)
  return {
    feed,
    configuration,
    calls,
    run,
    receipts,
    receiptReads,
    drafts,
    draftClient,
    proposal,
    commands,
    setMode(value: typeof mode) {
      mode = value
    },
    setHold(value: Promise<void> | null) {
      hold = value
    },
    showReceipt(value: boolean) {
      receiptVisible = value
    },
    holdNextReceipt(value: Promise<void>) {
      receiptHolds.push(value)
    },
    failNextReceipt(value: unknown) {
      receiptErrors.push(value)
    },
    async target() {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const document = proposal.reader.getSnapshot().proposal
        if (document) return document.target
        await Bun.sleep(1)
      }
      throw new Error('proposal projection did not settle')
    },
    dispose() {
      proposal.dispose()
      drafts.dispose()
      feed.dispose()
      configuration.dispose()
      local.dispose()
    },
  }
}

test('implement confirms Host Plan exit before the Run while continuing planning leaves mode unchanged', async () => {
  let hostMode: 'default' | 'plan' = 'plan'
  const transitions: string[] = []
  const modePort: NonNullable<PlanProposalOptions['mode']> = {
    async read() {
      transitions.push('read')
      return hostMode
    },
    async setDefault() {
      transitions.push('exit')
      hostMode = 'default'
      return hostMode
    },
    async reconcile() {
      transitions.push('reconcile')
      return hostMode
    },
    isUnknown: () => false,
  }
  const f = fixture(undefined, modePort)
  try {
    const target = await f.target()
    await f.commands.execute('proposedPlan.submit', { ...target, action: 'implement' })
    expect(transitions).toEqual(['read', 'exit'])
    expect(await modePort.read('one')).toBe('default')
    expect(f.calls).toHaveLength(1)
    expect(f.calls[0]?.input.input.mode).toBe('default')
    expect(f.proposal.reader.getSnapshot().actions[planProposalActionKey(target)]).toMatchObject({
      phase: 'run',
      status: 'accepted',
    })
  } finally {
    f.dispose()
  }
  hostMode = 'plan'
  transitions.length = 0
  const continuing = fixture(undefined, modePort)
  try {
    const target = await continuing.target()
    await continuing.commands.execute('proposedPlan.submit', { ...target, action: 'continue', feedback: 'Refine' })
    expect(transitions).toEqual([])
    expect(hostMode).toBe('plan')
    expect(continuing.calls[0]?.input.input.mode).toBe('plan')
  } finally {
    continuing.dispose()
  }
  hostMode = 'default'
  transitions.length = 0
  const alreadyDefault = fixture(undefined, modePort)
  try {
    const target = await alreadyDefault.target()
    await alreadyDefault.commands.execute('proposedPlan.submit', { ...target, action: 'implement' })
    expect(transitions).toEqual(['read'])
    expect(alreadyDefault.calls).toHaveLength(1)
    expect(alreadyDefault.calls[0]?.input.input.mode).toBe('default')
  } finally {
    alreadyDefault.dispose()
  }
})

test('unknown Host Plan exit blocks Run admission and confirmation continues once without another mode write', async () => {
  let hostMode: 'default' | 'plan' = 'plan'
  let unknown = false
  let confirmed = false
  let modeWrites = 0
  const modePort: NonNullable<PlanProposalOptions['mode']> = {
    async read() {
      return hostMode
    },
    async setDefault() {
      modeWrites += 1
      hostMode = 'default'
      unknown = true
      throw new CommandError('RESULT_UNKNOWN', 'Host reply lost after mode write')
    },
    async reconcile() {
      if (!confirmed) return 'plan'
      unknown = false
      return hostMode
    },
    isUnknown: () => unknown,
  }
  const f = fixture(undefined, modePort)
  try {
    const target = await f.target()
    await expect(f.commands.execute('proposedPlan.submit', { ...target, action: 'implement' })).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    expect(f.calls).toHaveLength(0)
    expect(f.proposal.reader.getSnapshot().actions[planProposalActionKey(target)]).toMatchObject({
      phase: 'mode',
      status: 'unknown',
    })
    await expect(f.commands.execute('proposedPlan.submit', { ...target, action: 'implement' })).rejects.toMatchObject({
      code: 'BUSY',
    })
    await expect(f.commands.execute('proposedPlan.reconcile', target)).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    expect(f.calls).toHaveLength(0)
    expect(f.proposal.reader.getSnapshot().actions[planProposalActionKey(target)]?.status).toBe('unknown')
    confirmed = true
    const receipt = await f.commands.execute('proposedPlan.reconcile', target)
    expect(receipt?.sessionId).toBe('one')
    expect(modeWrites).toBe(1)
    expect(f.calls).toHaveLength(1)
    expect(f.calls[0]?.input.input.mode).toBe('default')
    expect(f.proposal.reader.getSnapshot().actions[planProposalActionKey(target)]).toMatchObject({
      phase: 'run',
      status: 'accepted',
    })
  } finally {
    f.dispose()
  }
})

test('detached proposal rechecks captured preparation after an await; read failure cannot invent an unknown Run', async () => {
  for (const failure of ['ARCHIVED', 'RESULT_UNKNOWN']) {
    const entered = Promise.withResolvers<void>(),
      gate = Promise.withResolvers<void>()
    const f = fixture({
      async capture(sessionId) {
        entered.resolve()
        await gate.promise
        if (failure === 'RESULT_UNKNOWN') throw new CommandError(failure, 'A preparation read failed')
        return { sessionId, workspaceId: 'workspace' }
      },
      assertCanPrepare() {
        throw new CommandError('ARCHIVED', 'Captured Session was archived while preparing')
      },
    })
    try {
      const target = await f.target()
      await f.draftClient.execute('draft.setText', { sessionId: 'one', text: 'local retained draft' })
      const pending = f.commands
        .execute('proposedPlan.submit', { ...target, action: 'implement' })
        .catch((error: unknown) => error)
      await entered.promise
      gate.resolve()
      expect(await pending).toMatchObject({ code: failure })
      expect(f.calls).toEqual([])
      expect(f.proposal.reader.getSnapshot().actions[planProposalActionKey(target)]).toMatchObject({
        status: 'failed',
        error: failure,
      })
      expect(f.drafts.reader.getSnapshot().one?.text).toBe('local retained draft')
      await expect(f.commands.execute('proposedPlan.reconcile', target)).rejects.toMatchObject({ code: 'STALE_TARGET' })
    } finally {
      gate.resolve()
      f.dispose()
    }
  }
})

test('already dispatched detached proposal retains unknown receipt recovery after preparation is revoked', async () => {
  let archived = false
  const preparation: SessionExecutionPreparationPort = {
    capture: (sessionId) => Promise.resolve({ sessionId, workspaceId: 'workspace' }),
    assertCanPrepare() {
      if (archived) throw new CommandError('ARCHIVED', 'Archived')
    },
  }
  const f = fixture(preparation),
    gate = Promise.withResolvers<void>()
  try {
    const target = await f.target()
    f.setMode('unknown')
    f.setHold(gate.promise)
    const pending = f.commands
      .execute('proposedPlan.submit', { ...target, action: 'implement' })
      .catch((error: unknown) => error)
    for (let attempt = 0; f.calls.length === 0 && attempt < 100; attempt++) await Bun.sleep(1)
    expect(f.calls).toHaveLength(1)
    archived = true
    gate.resolve()
    expect(await pending).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect((await f.commands.execute('proposedPlan.reconcile', target))?.sessionId).toBe('one')
    expect(f.calls).toHaveLength(1)
    expect(f.proposal.reader.getSnapshot().actions[planProposalActionKey(target)]?.status).toBe('accepted')
  } finally {
    gate.resolve()
    f.dispose()
  }
})

test('proposal parser accepts standalone complete Markdown, preserves context and ignores fenced examples', async () => {
  expect(parseProposedPlan(source)).toEqual({
    kind: 'complete',
    before: '说明文字。\n',
    markdown,
    after: '\n结束说明。',
  })
  expect(parseProposedPlan(source.replaceAll('\n', '\r\n'))).toEqual(parseProposedPlan(source))
  expect(parseProposedPlan(`\`\`\`xml\n${source}\n\`\`\``)).toEqual({ kind: 'none' })
  expect(parseProposedPlan(`~~~xml\n${source}\n~~~`)).toEqual({ kind: 'none' })
  expect(parseProposedPlan('Example: <proposed_plan>not standalone</proposed_plan>')).toEqual({ kind: 'none' })
  expect(parseProposedPlan('> <proposed_plan>\n> quoted\n> </proposed_plan>')).toEqual({ kind: 'none' })
  expect(await proposedPlanFingerprint(source)).toHaveLength(64)
  expect(await proposedPlanFingerprint(source)).not.toBe(await proposedPlanFingerprint(`${source}changed`))
})

test('proposal parser fails closed for incomplete, nested, empty, multiple and oversized plans', () => {
  expect(parseProposedPlan('<proposed_plan>\npartial')).toMatchObject({ kind: 'incomplete', markdown: 'partial' })
  expect(parseProposedPlan('<proposed_plan>\n<proposed_plan>\nnested\n</proposed_plan>')).toEqual({
    kind: 'invalid',
    reason: 'nested',
  })
  expect(parseProposedPlan('<proposed_plan>\n \n</proposed_plan>')).toEqual({ kind: 'invalid', reason: 'empty' })
  expect(parseProposedPlan(`${source}\n${source}`)).toEqual({ kind: 'invalid', reason: 'multiple' })
  expect(parseProposedPlan('</proposed_plan>')).toEqual({ kind: 'invalid', reason: 'unmatched' })
  expect(parseProposedPlan(`<proposed_plan>\n${'x'.repeat(MAX_PROPOSED_PLAN_CHARACTERS)}\n</proposed_plan>`).kind).toBe(
    'complete',
  )
  expect(
    parseProposedPlan(`<proposed_plan>\n${'x'.repeat(MAX_PROPOSED_PLAN_CHARACTERS + 1)}\n</proposed_plan>`),
  ).toEqual({ kind: 'invalid', reason: 'too_large' })
})

test('implement submits one explicit Default Run, preserving even an identical composer draft', async () => {
  const f = fixture()
  try {
    const target = await f.target()
    const text = `implement\nproposal\n${markdown}\n`
    await f.draftClient.execute('draft.setText', { sessionId: 'one', text })
    const revision = f.drafts.reader.getSnapshot().one?.revision
    const receipt = await f.commands.execute('proposedPlan.submit', { ...target, action: 'implement' })
    expect(f.calls).toHaveLength(1)
    expect(f.calls[0]?.name).toBe('run.submit')
    expect(f.calls[0]?.input).toEqual({
      sessionId: 'one',
      modelId: 'mock:model',
      input: { text, images: [], files: [], mode: 'default', source: 'user', thinking: 'medium' },
    })
    expect(JSON.stringify(f.calls[0]?.input)).not.toContain('detached')
    expect(f.drafts.reader.getSnapshot().one).toMatchObject({ text, revision, status: 'idle' })
    expect(f.proposal.reader.getSnapshot().actions[planProposalActionKey(target)]).toMatchObject({
      status: 'accepted',
      operationId: receipt.operationId,
    })
    await expect(f.commands.execute('proposedPlan.submit', { ...target, action: 'implement' })).rejects.toMatchObject({
      code: 'ALREADY_SUBMITTED',
    })
  } finally {
    f.dispose()
  }
})

test('continue planning preserves feedback and attachments without creating Goal or mutating persistent mode', async () => {
  const f = fixture()
  try {
    const target = await f.target()
    const attachments = [
      { kind: 'file' as const, artifact: { id: 'a'.repeat(64), name: 'draft.txt', mime: 'text/plain', size: 1 } },
    ]
    await f.draftClient.execute('draft.setText', { sessionId: 'one', text: 'Unrelated draft' })
    await f.draftClient.execute('draft.setAttachments', { sessionId: 'one', attachments })
    await f.commands.execute('proposedPlan.submit', { ...target, action: 'continue', feedback: '  增加回滚步骤。  ' })
    expect(f.calls.map((call) => call.name)).toEqual(['run.submit'])
    expect(f.calls[0]?.input.input).toMatchObject({ mode: 'plan', source: 'user', images: [], files: [] })
    expect(f.calls[0]?.input.input.text).toEndWith('增加回滚步骤。')
    expect(f.drafts.reader.getSnapshot().one).toMatchObject({ text: 'Unrelated draft', attachments })
  } finally {
    f.dispose()
  }
})

test('unknown proposal reuses the draft receipt, blocks both submit paths and does not resend', async () => {
  const f = fixture()
  try {
    const target = await f.target()
    f.setMode('unknown')
    await expect(f.commands.execute('proposedPlan.submit', { ...target, action: 'implement' })).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    expect(f.drafts.reader.getSnapshot().one?.status).toBe('unknown')
    await expect(f.commands.execute('proposedPlan.submit', { ...target, action: 'continue' })).rejects.toMatchObject({
      code: 'BUSY',
    })
    await expect(
      f.drafts.executeRun('run.submit', {
        sessionId: 'one',
        modelId: 'mock:model',
        input: { text: 'other', images: [] },
      }),
    ).rejects.toMatchObject({ code: 'BUSY' })
    f.showReceipt(false)
    expect(await f.commands.execute('proposedPlan.reconcile', target)).toBeNull()
    expect(f.proposal.reader.getSnapshot().actions[planProposalActionKey(target)]?.status).toBe('unknown')
    f.showReceipt(true)
    const receipt = await f.commands.execute('proposedPlan.reconcile', target)
    expect(receipt?.idempotencyKey).toBe(f.calls[0]?.key)
    expect(f.calls).toHaveLength(1)
    expect(f.drafts.reader.getSnapshot().one?.status).toBe('idle')
  } finally {
    f.dispose()
  }
})

test('receipt reconciliation publishes pending feedback and blocks repeated reads without another Run', async () => {
  const f = fixture()
  const hold = Promise.withResolvers<void>()
  let checking: Promise<RunAccepted | null> | undefined
  try {
    const target = await f.target()
    const key = planProposalActionKey(target)
    f.setMode('unknown')
    await expect(f.commands.execute('proposedPlan.submit', { ...target, action: 'implement' })).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    f.holdNextReceipt(hold.promise)
    checking = f.commands.execute('proposedPlan.reconcile', target)
    for (let attempt = 0; attempt < 100 && f.receiptReads.length === 0; attempt += 1) await Bun.sleep(1)
    expect(f.proposal.reader.getSnapshot().actions[key]).toMatchObject({
      status: 'unknown',
      reconciling: true,
      error: null,
    })
    const duplicate = await f.commands.execute('proposedPlan.reconcile', target).catch((error: unknown) => error)
    expect(duplicate).toMatchObject({ code: 'BUSY' })
    const originalKey = f.calls[0]?.key
    if (!originalKey) throw new Error('The original proposal submission key is missing')
    expect(f.receiptReads).toEqual([{ sessionId: target.sessionId, key: originalKey }])
    expect(f.calls).toHaveLength(1)
    hold.resolve()
    const receipt = await checking
    expect(f.proposal.reader.getSnapshot().actions[key]).toMatchObject({
      status: 'accepted',
      reconciling: false,
      error: null,
      operationId: receipt?.operationId,
    })
  } finally {
    hold.resolve()
    await checking?.catch(() => {})
    f.dispose()
  }
})

test('receipt read errors stay unknown with local safe feedback and the original submission key', async () => {
  for (const [failure, expected] of [
    [new CommandError('DISCONNECTED', 'Offline details'), 'DISCONNECTED'],
    [new CommandError('TIMEOUT', 'Transport details'), 'TIMEOUT'],
    [new Error('Sensitive raw payload must not become UI copy'), 'EXECUTION_FAILED'],
  ] as const) {
    const f = fixture()
    try {
      const target = await f.target()
      const key = planProposalActionKey(target)
      f.setMode('unknown')
      await expect(f.commands.execute('proposedPlan.submit', { ...target, action: 'continue' })).rejects.toMatchObject({
        code: 'RESULT_UNKNOWN',
      })
      f.failNextReceipt(failure)
      const error = await f.commands.execute('proposedPlan.reconcile', target).catch((value: unknown) => value)
      expect(error).toMatchObject({ code: expected })
      expect(f.proposal.reader.getSnapshot().actions[key]).toMatchObject({
        target,
        action: 'continue',
        status: 'unknown',
        reconciling: false,
        error: expected,
      })
      expect(JSON.stringify(f.proposal.reader.getSnapshot())).not.toContain('Sensitive raw payload')
      await expect(f.commands.execute('proposedPlan.submit', { ...target, action: 'continue' })).rejects.toMatchObject({
        code: 'BUSY',
      })
      const accepted = await f.commands.execute('proposedPlan.reconcile', target)
      const originalKey = f.calls[0]?.key
      if (!originalKey) throw new Error('The original proposal submission key is missing')
      expect(accepted?.idempotencyKey).toBe(originalKey)
      expect(f.receiptReads.map((read) => read.key)).toEqual([originalKey, originalKey])
      expect(f.proposal.reader.getSnapshot().actions[key]).toMatchObject({
        status: 'accepted',
        reconciling: false,
        error: null,
      })
      expect(f.calls).toHaveLength(1)
    } finally {
      f.dispose()
    }
  }
})

test('missing receipts clear stale read errors but remain unknown even when new proposal preparation is unavailable', async () => {
  const f = fixture()
  try {
    const target = await f.target()
    const key = planProposalActionKey(target)
    f.setMode('unknown')
    await expect(f.commands.execute('proposedPlan.submit', { ...target, action: 'implement' })).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    f.failNextReceipt(new CommandError('TIMEOUT', 'Read failed'))
    await f.commands.execute('proposedPlan.reconcile', target).catch(() => {})
    f.configuration.replace({ ...controls(), model: null })
    expect(f.proposal.reader.getSnapshot().availability).toBe('model_unavailable')
    f.showReceipt(false)
    expect(await f.commands.execute('proposedPlan.reconcile', target)).toBeNull()
    expect(f.proposal.reader.getSnapshot().actions[key]).toMatchObject({
      status: 'unknown',
      reconciling: false,
      error: null,
      operationId: null,
    })
    expect(f.drafts.reader.getSnapshot().one?.status).toBe('unknown')
    await expect(f.commands.execute('proposedPlan.submit', { ...target, action: 'implement' })).rejects.toMatchObject({
      code: 'BUSY',
    })
    f.showReceipt(true)
    expect((await f.commands.execute('proposedPlan.reconcile', target))?.idempotencyKey).toBe(f.calls[0]?.key)
    expect(f.calls).toHaveLength(1)
  } finally {
    f.dispose()
  }
})

test('a late failed receipt read updates only its captured proposal through an A-B-A source change', async () => {
  const f = fixture()
  const hold = Promise.withResolvers<void>()
  let checking: Promise<unknown> | undefined
  try {
    const original = timeline()
    const target = await f.target()
    const key = planProposalActionKey(target)
    f.setMode('unknown')
    await expect(f.commands.execute('proposedPlan.submit', { ...target, action: 'continue' })).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    f.holdNextReceipt(hold.promise)
    f.failNextReceipt(new CommandError('DISCONNECTED', 'Original receipt read failed'))
    checking = f.commands.execute('proposedPlan.reconcile', target).catch((error: unknown) => error)
    for (let attempt = 0; attempt < 100 && f.receiptReads.length === 0; attempt += 1) await Bun.sleep(1)
    f.feed.replace({ ...original, sessionId: 'two', messages: [], runs: [] })
    f.feed.replace({
      ...original,
      messages: original.messages.map((message) => ({ ...message, id: 'new-proposal', seq: 2 })),
    })
    const replacement = await f.target()
    expect(replacement.messageId).toBe('new-proposal')
    hold.resolve()
    expect(await checking).toMatchObject({ code: 'DISCONNECTED' })
    expect(f.proposal.reader.getSnapshot().proposal?.target).toEqual(replacement)
    expect(f.proposal.reader.getSnapshot().actions[planProposalActionKey(replacement)]).toBeUndefined()
    expect(f.proposal.reader.getSnapshot().actions[key]).toMatchObject({
      target,
      status: 'unknown',
      reconciling: false,
      error: 'DISCONNECTED',
    })
    expect((await f.commands.execute('proposedPlan.reconcile', target))?.idempotencyKey).toBe(f.calls[0]?.key)
    expect(f.proposal.reader.getSnapshot().proposal?.target).toEqual(replacement)
    expect(f.calls).toHaveLength(1)
  } finally {
    hold.resolve()
    await checking
    f.dispose()
  }
})

test('disposing during receipt reconciliation publishes no late completion or subscriber callback', async () => {
  const f = fixture()
  const hold = Promise.withResolvers<void>()
  let checking: Promise<unknown> | undefined
  try {
    const target = await f.target()
    f.setMode('unknown')
    await expect(f.commands.execute('proposedPlan.submit', { ...target, action: 'implement' })).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    f.holdNextReceipt(hold.promise)
    checking = f.commands.execute('proposedPlan.reconcile', target).catch((error: unknown) => error)
    for (let attempt = 0; attempt < 100 && f.receiptReads.length === 0; attempt += 1) await Bun.sleep(1)
    const before = f.proposal.reader.getSnapshot()
    expect(before.actions[planProposalActionKey(target)]).toMatchObject({ reconciling: true })
    let notifications = 0
    f.proposal.reader.subscribe(() => {
      notifications += 1
    })
    f.proposal.dispose()
    hold.resolve()
    await checking
    expect(f.proposal.reader.getSnapshot()).toBe(before)
    expect(notifications).toBe(0)
    expect(f.calls).toHaveLength(1)
  } finally {
    hold.resolve()
    await checking
    f.dispose()
  }
})

test('detached invalid or wrong-target acceptance stays unknown until the same valid receipt is reconciled', async () => {
  for (const failure of ['malformed', 'wrong-target'] as const) {
    const f = fixture()
    try {
      const target = await f.target()
      f.setMode(failure)
      await expect(f.commands.execute('proposedPlan.submit', { ...target, action: 'implement' })).rejects.toMatchObject(
        { code: 'RESULT_UNKNOWN' },
      )
      expect(f.drafts.reader.getSnapshot().one?.status).toBe('unknown')
      expect((await f.commands.execute('proposedPlan.reconcile', target))?.sessionId).toBe('one')
      expect(f.calls).toHaveLength(1)
    } finally {
      f.dispose()
    }
  }
})

test('normal composer unknown work is BUSY for proposal actions and remains owned by the normal receipt path', async () => {
  const f = fixture()
  try {
    const target = await f.target()
    f.setMode('unknown')
    await expect(
      f.drafts.executeRun('run.submit', {
        sessionId: 'one',
        modelId: 'mock:model',
        input: { text: 'normal', images: [] },
      }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    await expect(f.commands.execute('proposedPlan.submit', { ...target, action: 'implement' })).rejects.toMatchObject({
      code: 'BUSY',
    })
    expect(f.calls).toHaveLength(1)
    await f.draftClient.execute('draft.reconcileSubmission', { sessionId: 'one' })
    f.setMode('accepted')
    await f.commands.execute('proposedPlan.submit', { ...target, action: 'implement' })
    expect(f.calls).toHaveLength(2)
  } finally {
    f.dispose()
  }
})

test('a new proposal, modified content, wrong role, busy run and missing model cannot dispatch execution', async () => {
  for (const reason of ['replacement', 'content', 'role', 'running', 'incomplete', 'model'] as const) {
    const f = fixture()
    try {
      const target = await f.target()
      const current = f.feed.reader.getSnapshot()
      const first = current.messages[0]!
      const run = current.runs[0]!
      if (reason === 'replacement')
        f.feed.replace({ ...current, messages: [...current.messages, { ...first, id: 'replacement', seq: 2 }] })
      if (reason === 'content')
        f.feed.replace({
          ...current,
          messages: [{ ...first, content: [{ type: 'text', text: source.replace('原有草稿', '全部草稿') }] }],
        })
      if (reason === 'role') f.feed.replace({ ...current, messages: [{ ...first, role: 'tool' }] })
      if (reason === 'running') f.feed.replace({ ...current, runs: [{ ...run, status: 'running', endedAt: null }] })
      if (reason === 'incomplete') f.feed.replace({ ...current, runs: [{ ...run, status: 'failed' }] })
      if (reason === 'model') f.configuration.replace({ ...controls(), model: null })
      await expect(
        f.commands.execute('proposedPlan.submit', { ...target, action: 'implement' }),
      ).rejects.toBeInstanceOf(CommandError)
      expect(f.calls).toHaveLength(0)
    } finally {
      f.dispose()
    }
  }
})

test('late acknowledgement remains bound to the source and current-session proposal is not overwritten', async () => {
  const f = fixture()
  try {
    const target = await f.target()
    let finish: (() => void) | undefined
    f.setHold(
      new Promise<void>((resolve) => {
        finish = resolve
      }),
    )
    const request = f.commands.execute('proposedPlan.submit', { ...target, action: 'implement' })
    for (let attempt = 0; attempt < 100 && f.calls.length === 0; attempt += 1) await Bun.sleep(1)
    expect(f.calls).toHaveLength(1)
    f.feed.replace({ ...timeline(), sessionId: 'two', messages: [], runs: [] })
    finish?.()
    expect((await request).sessionId).toBe('one')
    expect(f.proposal.reader.getSnapshot()).toMatchObject({ sessionId: 'two', proposal: null })
    expect(f.proposal.reader.getSnapshot().actions[planProposalActionKey(target)]?.target.sessionId).toBe('one')
  } finally {
    f.dispose()
  }
})

test('confirmed failure can retry, and ordinary matching draft submission retains its original clear-on-acceptance behavior', async () => {
  const f = fixture()
  try {
    const target = await f.target()
    f.setMode('failed')
    await expect(f.commands.execute('proposedPlan.submit', { ...target, action: 'continue' })).rejects.toMatchObject({
      code: 'MODEL_NOT_FOUND',
    })
    f.setMode('accepted')
    await f.commands.execute('proposedPlan.submit', { ...target, action: 'continue' })
    expect(f.calls[0]?.key).not.toBe(f.calls[1]?.key)
    await f.draftClient.execute('draft.setText', { sessionId: 'two', text: 'normal exact draft' })
    const normal = { sessionId: 'two', modelId: 'mock:model', input: { text: 'normal exact draft', images: [] } }
    const validated = runCommands['run.submit'].input.parse(normal)
    await f.drafts.executeRun('run.submit', validated)
    expect(f.drafts.reader.getSnapshot().two?.text).toBe('')
  } finally {
    f.dispose()
  }
})

test('proposal reconciliation reuses a receipt already confirmed from the composer without resending', async () => {
  const f = fixture()
  try {
    const target = await f.target()
    f.setMode('unknown')
    await expect(f.commands.execute('proposedPlan.submit', { ...target, action: 'implement' })).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    const confirmed = await f.draftClient.execute('draft.reconcileSubmission', { sessionId: 'one' })
    f.showReceipt(false)
    expect(await f.commands.execute('proposedPlan.reconcile', target)).toEqual(confirmed)
    expect(f.proposal.reader.getSnapshot().actions[planProposalActionKey(target)]?.status).toBe('accepted')
    expect(f.calls).toHaveLength(1)
  } finally {
    f.dispose()
  }
})

test('out-of-order receipt reads and later submissions do not transfer acknowledgement across targets or sessions', async () => {
  const f = fixture()
  let finish: (() => void) | undefined
  try {
    const target = await f.target()
    f.setMode('unknown')
    await expect(f.commands.execute('proposedPlan.submit', { ...target, action: 'implement' })).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    f.holdNextReceipt(
      new Promise<void>((resolve) => {
        finish = resolve
      }),
    )
    const delayed = f.commands.execute('proposedPlan.reconcile', target)
    await Bun.sleep(1)
    const confirmed = await f.draftClient.execute('draft.reconcileSubmission', { sessionId: 'one' })
    f.feed.replace({ ...timeline(), sessionId: 'two', messages: [], runs: [] })
    f.setMode('accepted')
    await f.drafts.executeDetachedRun(
      { sessionId: 'one', modelId: 'mock:model', input: { text: 'Later request', images: [] } },
      { idempotencyKey: 'later-key' },
    )
    finish?.()
    expect(await delayed).toEqual(confirmed)
    expect(f.proposal.reader.getSnapshot()).toMatchObject({ sessionId: 'two', proposal: null })
    expect(f.proposal.reader.getSnapshot().actions[planProposalActionKey(target)]?.operationId).toBe(
      confirmed?.operationId,
    )
    expect(f.drafts.reader.getSnapshot().one?.lastOperationId).toBe('operation-2')
    expect(f.drafts.getSettledReceipt('two', f.calls[0]!.key)).toBeNull()
    expect(f.calls).toHaveLength(2)
  } finally {
    finish?.()
    f.dispose()
  }
})

test('recent settled receipts are bounded to 100, scoped by session and returned as defensive copies', async () => {
  const f = fixture()
  try {
    const input = { sessionId: 'one', modelId: 'mock:model', input: { text: 'Unrelated request', images: [] } }
    for (let index = 0; index < 101; index += 1)
      await f.drafts.executeDetachedRun(input, { idempotencyKey: `bounded-${index}` })
    expect(f.drafts.getSettledReceipt('one', 'bounded-0')).toBeNull()
    expect(f.drafts.getSettledReceipt('one', 'bounded-1')?.operationId).toBe('operation-2')
    expect(f.drafts.getSettledReceipt('two', 'bounded-100')).toBeNull()
    const copy = f.drafts.getSettledReceipt('one', 'bounded-100')
    if (copy) copy.operationId = 'mutated-copy'
    expect(f.drafts.getSettledReceipt('one', 'bounded-100')?.operationId).toBe('operation-101')
    f.drafts.dispose()
    expect(f.drafts.getSettledReceipt('one', 'bounded-100')).toBeNull()
  } finally {
    f.dispose()
  }
})

test('switching sessions during asynchronous content verification rejects dispatch before any Run is submitted', async () => {
  const f = fixture()
  try {
    const target = await f.target()
    const submission = f.commands.execute('proposedPlan.submit', { ...target, action: 'implement' })
    f.feed.replace({ ...timeline(), sessionId: 'two', messages: [], runs: [] })
    await expect(submission).rejects.toMatchObject({ code: 'STALE_TARGET' })
    expect(f.calls).toHaveLength(0)
    expect(f.proposal.reader.getSnapshot()).toMatchObject({ sessionId: 'two', proposal: null })
  } finally {
    f.dispose()
  }
})

test('availability changes preserve the same proposal projection and do not unmount editable feedback', async () => {
  const f = fixture()
  try {
    await f.target()
    const document = f.proposal.reader.getSnapshot().proposal
    f.configuration.replace({ ...controls(), model: null })
    expect(f.proposal.reader.getSnapshot()).toMatchObject({ status: 'ready', availability: 'model_unavailable' })
    expect(f.proposal.reader.getSnapshot().proposal).toBe(document)
    f.configuration.replace(controls())
    expect(f.proposal.reader.getSnapshot().availability).toBe('ready')
    expect(f.proposal.reader.getSnapshot().proposal).toBe(document)
  } finally {
    f.dispose()
  }
})

test('immutable message parsing is reused across timeline/control ticks but same-id replacements invalidate it', async () => {
  const f = fixture()
  try {
    const originalTarget = await f.target()
    let textReads = 0
    const message = {
      ...timeline().messages[0]!,
      content: [
        {
          type: 'text' as const,
          get text() {
            textReads += 1
            return source
          },
        },
      ],
    }
    f.feed.replace({ ...timeline(), messages: [message] })
    await f.target()
    const initialReads = textReads
    for (let tick = 0; tick < 20; tick += 1) {
      f.feed.replace({ ...f.feed.reader.getSnapshot(), cursor: tick + 1 })
      f.configuration.replace({ ...controls(), status: tick % 2 === 0 ? 'loading' : 'ready' })
    }
    expect(textReads).toBe(initialReads)
    const revisedSource = source.replace('原有草稿', '最新草稿')
    f.feed.replace({
      ...timeline(),
      messages: [{ ...message, content: [{ type: 'text', text: revisedSource }] }],
    })
    const replacement = await f.target()
    expect(replacement.messageId).toBe(originalTarget.messageId)
    expect(replacement.fingerprint).not.toBe(originalTarget.fingerprint)
    expect(f.proposal.reader.getSnapshot().proposal?.markdown).toContain('最新草稿')
    await expect(
      f.commands.execute('proposedPlan.submit', { ...originalTarget, action: 'implement' }),
    ).rejects.toMatchObject({ code: 'STALE_PROPOSAL' })
    expect(f.calls).toHaveLength(0)
  } finally {
    f.dispose()
  }
})

test('public runtime commands and reader honor the optional host-owned proposal capability', async () => {
  const workspace = { id: 'workspace', path: 'D:/workspace', name: 'Workspace', createdAt: 1 }
  const session = {
    id: 'one',
    workspaceId: workspace.id,
    title: 'Planning',
    archived: false,
    parentId: null,
    createdAt: 1,
    updatedAt: 2,
    seq: 1,
  }
  for (const supported of [false, true]) {
    const f = fixture()
    const initial = timeline()
    const runtime = createAppRuntime({
      instanceId: `proposal-${supported}`,
      hostId: 'host',
      run: f.run,
      directory: {
        async execute(name) {
          if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
          if (name === 'workspace.get') return workspace
          if (name === 'session.list') return { items: [session], nextCursor: null }
          if (name === 'session.get') return session
          throw new Error(`Unexpected directory command: ${name}`)
        },
      },
      models: {
        async execute(name) {
          if (name === 'session.getModel') return controls().model
          throw new Error(`Unexpected model command: ${name}`)
        },
      },
      timeline: {
        async snapshot() {
          return {
            session,
            messages: [...initial.messages],
            runs: [...initial.runs],
            approvals: [],
            userInputs: [],
            usage: initial.usage,
            cursor: 1,
            hasOlder: false,
            streams: [],
          }
        },
        async watch() {
          return () => {}
        },
      },
      ...(supported
        ? { planProposal: { requestText: ({ markdown: value }: { markdown: string }) => `Execute\n${value}` } }
        : {}),
    })
    try {
      await runtime.view.commands.execute('app.setSession', { sessionId: 'one' })
      for (let attempt = 0; attempt < 100 && !runtime.view.state.planProposal.getSnapshot().proposal; attempt += 1)
        await Bun.sleep(1)
      const projected = runtime.view.state.planProposal.getSnapshot()
      const target = projected.proposal?.target
      expect(target).toBeDefined()
      if (!target) throw new Error('Expected the public proposal reader')
      expect(projected.availability).toBe(supported ? 'ready' : 'capability_unavailable')
      if (supported) {
        await runtime.view.commands.execute('draft.setText', { sessionId: 'one', text: 'Keep this draft' })
        const receipt = await runtime.view.commands.execute('proposedPlan.submit', { ...target, action: 'implement' })
        expect(receipt.sessionId).toBe('one')
        expect(f.calls).toHaveLength(1)
        expect(f.calls[0]?.input.input.text).toContain(markdown)
        expect(runtime.view.state.drafts.getSnapshot().one?.text).toBe('Keep this draft')
      } else {
        await expect(
          runtime.view.commands.execute('proposedPlan.submit', { ...target, action: 'implement' }),
        ).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' })
        expect(f.calls.map((call) => call.name)).toEqual([])
      }
    } finally {
      runtime.dispose()
      f.dispose()
    }
  }
})

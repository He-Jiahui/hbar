import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import type { SessionEvent } from '@hbar/contracts'
import { createInteractions } from '../packages/app-runtime/src/interactions'
import { interactionRecoveryCommands } from '../packages/app-runtime/src/interaction-recovery'
import { projectSessionDecisions } from '../packages/app-runtime/src/interaction-presentations'
import { createState } from '../packages/app-runtime/src/state'
import { answeredTimeline, decisionAnswers, decisionApproval, decisionsTimeline } from './session-decisions.fixtures'

const event = (data: unknown, seq = 2): SessionEvent => ({
  eventId: `event-${seq}`,
  sessionId: 'one',
  runId: 'run',
  stepId: null,
  seq,
  time: seq,
  version: 1,
  type: 'approval.resolved',
  data,
})

function fixture() {
  const local = new CommandRegistry()
  const timeline = createState(decisionsTimeline(), () => {})
  let events: SessionEvent[] = []
  let reset = false
  let failure: Error | null = null
  let gate: Promise<void> | null = null
  let writes = 0
  const reads: { sessionId: string; cursor: number }[] = []
  const interactions = createInteractions(
    local,
    {
      async execute() {
        writes += 1
        throw new CommandError('CONNECTION_CLOSED', 'missed reply')
      },
    },
    timeline.reader,
    () => {},
    () => false,
    {
      async follow(sessionId, cursor) {
        reads.push({ sessionId, cursor })
        if (gate) await gate
        if (failure) throw failure
        return { events, reset, cursor: events.at(-1)?.seq ?? cursor }
      },
    },
  )
  return {
    interactions,
    timeline,
    reads,
    writes: () => writes,
    commands: createCommandClient(interactionRecoveryCommands, local),
    history(values: SessionEvent[], isReset = false) {
      events = values
      reset = isReset
    },
    failure(value: Error | null) {
      failure = value
    },
    gate(value: Promise<void>) {
      gate = value
    },
    dispose() {
      interactions.dispose()
      timeline.dispose()
      local.dispose()
    },
  }
}

test('only matching original session/run/call/tool facts recover a lost approval, never missing/reset/malformed facts', async () => {
  const f = fixture()
  const target = { sessionId: 'one', actionId: 'approval:approval' }
  try {
    await expect(
      f.interactions.execute('approval.resolve', { sessionId: 'one', approvalId: 'approval', decision: 'allowed' }),
    ).rejects.toThrow()
    for (const data of [
      { ...decisionApproval, status: 'pending' },
      { ...decisionApproval, status: 'allowed', sessionId: 'two' },
      { ...decisionApproval, status: 'allowed', runId: 'other' },
      { ...decisionApproval, status: 'allowed', callId: 'other' },
      { ...decisionApproval, status: 'allowed', tool: 'other' },
      { ...decisionApproval, status: 'allowed', id: 'other' },
    ]) {
      f.history([event(data)])
      expect(await f.commands.execute('interaction.reconcile', target)).toEqual({ confirmed: false })
    }
    f.history([], true)
    expect(await f.commands.execute('interaction.reconcile', target)).toEqual({ confirmed: false })
    f.failure(new Error('offline'))
    await expect(f.commands.execute('interaction.reconcile', target)).rejects.toThrow()
    expect(f.interactions.reader.getSnapshot()['approval:approval']).toMatchObject({
      status: 'unknown',
      error: 'RESULT_UNKNOWN',
      reconciling: false,
    })
    f.failure(null)
    f.history([event({ ...decisionApproval, status: 'denied' })])
    expect(await f.commands.execute('interaction.reconcile', target)).toEqual({ confirmed: true })
    expect(f.interactions.reader.getSnapshot()['approval:approval']?.resolution).toEqual({
      kind: 'approval',
      status: 'denied',
    })
    expect(f.reads.every((read) => read.sessionId === 'one' && read.cursor === 1)).toBe(true)
    expect(f.writes()).toBe(1)
  } finally {
    f.dispose()
  }
})

test('a legal 2,000-event follow response is checked once; 2,001 events cannot exceed the bounded contract', async () => {
  const f = fixture()
  try {
    await expect(
      f.interactions.execute('approval.resolve', { sessionId: 'one', approvalId: 'approval', decision: 'allowed' }),
    ).rejects.toThrow()
    const events = Array.from({ length: 2_001 }, (_, index) => ({ ...event({}, index + 2), type: 'unrelated' }))
    f.history(events)
    await expect(
      f.commands.execute('interaction.reconcile', { sessionId: 'one', actionId: 'approval:approval' }),
    ).rejects.toThrow()
    expect(f.interactions.reader.getSnapshot()['approval:approval']?.status).toBe('unknown')
    f.history([...events.slice(0, 1_999), event({ ...decisionApproval, status: 'allowed' }, 2_001)])
    expect(
      await f.commands.execute('interaction.reconcile', { sessionId: 'one', actionId: 'approval:approval' }),
    ).toEqual({ confirmed: true })
    expect(f.reads).toHaveLength(2)
    expect(f.writes()).toBe(1)
  } finally {
    f.dispose()
  }
})

test('recovery is single-flight, survives switching without changing the new session, and cannot overwrite a live resolution', async () => {
  const f = fixture()
  let release: (() => void) | undefined
  try {
    await expect(
      f.interactions.execute('approval.resolve', { sessionId: 'one', approvalId: 'approval', decision: 'allowed' }),
    ).rejects.toThrow()
    f.history([event({ ...decisionApproval, status: 'allowed' })])
    f.gate(
      new Promise<void>((resolve) => {
        release = resolve
      }),
    )
    const target = { sessionId: 'one', actionId: 'approval:approval' }
    const first = f.commands.execute('interaction.reconcile', target)
    await expect(f.commands.execute('interaction.reconcile', target)).rejects.toMatchObject({ code: 'BUSY' })
    f.timeline.replace({ ...decisionsTimeline(), approvals: [{ ...decisionApproval, status: 'denied' }] })
    f.timeline.replace({ ...decisionsTimeline(), sessionId: 'two', approvals: [], userInputs: [], messages: [] })
    release?.()
    expect(await first).toEqual({ confirmed: true })
    expect(f.interactions.reader.getSnapshot()['approval:approval']).toMatchObject({
      sessionId: 'one',
      resolution: { status: 'denied' },
      reconciling: false,
    })
    expect(f.timeline.reader.getSnapshot().sessionId).toBe('two')
    expect(f.reads).toHaveLength(1)
    expect(f.writes()).toBe(1)
  } finally {
    release?.()
    f.dispose()
  }
})

test('questionnaire recovery requires a validated tool result and projects its confirmed answers without rewriting the timeline', async () => {
  const f = fixture()
  try {
    await expect(
      f.interactions.execute('questionnaire.answer', {
        sessionId: 'one',
        requestId: 'question',
        answers: decisionAnswers,
      }),
    ).rejects.toThrow()
    expect(f.interactions.reader.getSnapshot()['questionnaire:question']?.submittedAnswers).toEqual(decisionAnswers)
    f.timeline.replace({ ...decisionsTimeline(), userInputs: [] })
    f.history([{ ...event({ sessionId: 'one', requestId: 'question', accepted: true }), type: 'user_input.resolved' }])
    expect(
      await f.commands.execute('interaction.reconcile', { sessionId: 'one', actionId: 'questionnaire:question' }),
    ).toEqual({ confirmed: false })
    const result = answeredTimeline().messages[1]!
    f.history([{ ...event({ id: result.id, role: result.role, content: result.content }), type: 'message.committed' }])
    expect(
      await f.commands.execute('interaction.reconcile', { sessionId: 'one', actionId: 'questionnaire:question' }),
    ).toEqual({ confirmed: true })
    expect(f.timeline.reader.getSnapshot().messages).toHaveLength(1)
    const projection = projectSessionDecisions({
      ...f.timeline.reader.getSnapshot(),
      actions: f.interactions.reader.getSnapshot(),
    })
    expect(
      projection.byMessage.get('assistant')?.get(JSON.stringify(['question-call', 'request_user_input']))?.[0],
    ).toMatchObject({ fact: { status: 'answered', answers: decisionAnswers } })
    expect(f.writes()).toBe(1)
  } finally {
    f.dispose()
  }
})

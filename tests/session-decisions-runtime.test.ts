import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { interactionDraftCommands } from '@hbar/contracts/commands/interaction-draft'
import { createInteractions } from '../packages/app-runtime/src/interactions'
import { createState } from '../packages/app-runtime/src/state'
import { projectSessionDecisions, questionnaireFact } from '../packages/app-runtime/src/interaction-presentations'
import {
  answeredTimeline,
  decisionAnswers,
  decisionApproval,
  decisionRequest,
  decisionsTimeline,
} from './session-decisions.fixtures'

function fixture() {
  const local = new CommandRegistry()
  const timeline = createState(decisionsTimeline(), () => {})
  let reply: unknown = { sessionId: 'one', requestId: 'question', accepted: true }
  let gate: Promise<void> | null = null
  let failure: Error | null = null
  let calls = 0
  const interactions = createInteractions(
    local,
    {
      async execute() {
        calls += 1
        if (gate) await gate
        if (failure) throw failure
        return reply
      },
    },
    timeline.reader,
    () => {},
    () => false,
  )
  return {
    local,
    timeline,
    interactions,
    commands: createCommandClient(interactionDraftCommands, local),
    calls: () => calls,
    reply(value: unknown) {
      reply = value
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
const submit = { sessionId: 'one', requestId: 'question', answers: decisionAnswers }

for (const failure of [
  new Error('Unstable transport prose must not become a product error code'),
  new CommandError('CONNECTION_CLOSED', 'closed after acceptance'),
  new CommandError('EXECUTION_FAILED', 'failed after acceptance'),
  new CommandError('TIMEOUT', 'timed out after acceptance'),
]) {
  for (const kind of ['approval', 'questionnaire'] as const) {
    test(`${kind} dispatched ${'code' in failure ? String(failure.code) : 'plain Error'} stays unknown without repeating a decision`, async () => {
      const f = fixture()
      const name = kind === 'approval' ? 'approval.resolve' : 'questionnaire.answer'
      const input = kind === 'approval' ? { sessionId: 'one', approvalId: 'approval', decision: 'allowed' } : submit
      const id = kind === 'approval' ? 'approval:approval' : 'questionnaire:question'
      try {
        await f.commands.execute('questionnaire.setAnswer', {
          sessionId: 'one',
          requestId: 'question',
          questionId: 'choice',
          answer: { kind: 'option', value: '原位' },
        })
        f.failure(failure)
        await expect(f.interactions.execute(name, input)).rejects.toBe(failure)
        f.timeline.replace({ ...decisionsTimeline(), sessionId: 'two', messages: [], approvals: [], userInputs: [] })
        expect(f.interactions.reader.getSnapshot()[id]).toMatchObject({
          sessionId: 'one',
          status: 'unknown',
          error: 'RESULT_UNKNOWN',
          ...(kind === 'approval' ? { approval: decisionApproval } : { request: decisionRequest }),
        })
        expect(f.interactions.questionnaires.getSnapshot().question?.answers.choice?.value).toBe('原位')
        f.timeline.replace({ ...decisionsTimeline(), approvals: [], userInputs: [] })
        await expect(f.interactions.execute(name, input)).rejects.toMatchObject({ code: 'BUSY' })
        expect(f.calls()).toBe(1)
        f.timeline.replace(
          kind === 'approval'
            ? { ...decisionsTimeline(), approvals: [{ ...decisionApproval, status: 'denied' }] }
            : answeredTimeline(),
        )
        expect(f.interactions.reader.getSnapshot()[id]).toMatchObject({
          status: 'succeeded',
          error: null,
          resolution: { kind, status: kind === 'approval' ? 'denied' : 'answered' },
        })
      } finally {
        f.dispose()
      }
    })

    test(`${kind} confirmed facts survive late ${'code' in failure ? String(failure.code) : 'plain Error'}`, async () => {
      const f = fixture()
      let release: (() => void) | undefined
      try {
        f.gate(
          new Promise<void>((resolve) => {
            release = resolve
          }),
        )
        f.failure(failure)
        const first =
          kind === 'approval'
            ? f.interactions.execute('approval.resolve', {
                sessionId: 'one',
                approvalId: 'approval',
                decision: 'allowed',
              })
            : f.interactions.execute('questionnaire.answer', submit)
        f.timeline.replace(
          kind === 'approval'
            ? { ...decisionsTimeline(), approvals: [{ ...decisionApproval, status: 'denied' }] }
            : answeredTimeline(),
        )
        release?.()
        await expect(first).rejects.toBe(failure)
        expect(
          f.interactions.reader.getSnapshot()[kind === 'approval' ? 'approval:approval' : 'questionnaire:question'],
        ).toMatchObject({
          status: 'succeeded',
          error: null,
          resolution: { kind, status: kind === 'approval' ? 'denied' : 'answered' },
        })
      } finally {
        release?.()
        f.dispose()
      }
    })
  }
}

test('local validation remains failed without dispatch and accepted-only questionnaires remain unconfirmed', async () => {
  const f = fixture()
  try {
    await expect(f.interactions.execute('questionnaire.answer', { ...submit, answers: {} })).rejects.toMatchObject({
      code: 'QUESTIONNAIRE_INCOMPLETE',
    })
    expect(f.interactions.reader.getSnapshot()['questionnaire:question']).toMatchObject({
      status: 'failed',
      error: 'QUESTIONNAIRE_INCOMPLETE',
    })
    expect(f.calls()).toBe(0)
    await f.interactions.execute('questionnaire.answer', submit)
    expect(f.interactions.reader.getSnapshot()['questionnaire:question']).toMatchObject({ status: 'succeeded' })
    expect(f.interactions.reader.getSnapshot()['questionnaire:question']?.resolution).toBeUndefined()
    f.timeline.replace({ ...decisionsTimeline(), userInputs: [] })
    expect(f.interactions.reader.getSnapshot()['questionnaire:question']?.resolution).toBeUndefined()
  } finally {
    f.dispose()
  }
})

test('unknown disappearance is not success, blocks resubmit and answer edits, and preserves the original request', async () => {
  const f = fixture()
  try {
    f.failure(new CommandError('RESULT_UNKNOWN', 'lost'))
    await expect(f.interactions.execute('questionnaire.answer', submit)).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    f.timeline.replace({ ...decisionsTimeline(), userInputs: [] })
    expect(f.interactions.reader.getSnapshot()['questionnaire:question']).toMatchObject({
      status: 'unknown',
      request: decisionRequest,
    })
    await expect(f.interactions.execute('questionnaire.answer', submit)).rejects.toMatchObject({ code: 'BUSY' })
    await expect(
      f.commands.execute('questionnaire.setAnswer', {
        sessionId: 'one',
        requestId: 'question',
        questionId: 'choice',
        answer: { kind: 'option', value: '新页' },
      }),
    ).rejects.toMatchObject({ code: 'BUSY' })
    expect(f.calls()).toBe(1)
    const projection = projectSessionDecisions({
      ...f.timeline.reader.getSnapshot(),
      actions: f.interactions.reader.getSnapshot(),
    })
    expect(
      projection.byMessage.get('assistant')?.get(JSON.stringify(['question-call', 'request_user_input']))?.[0],
    ).toMatchObject({ kind: 'questionnaire', pending: false, fact: null })
    f.timeline.replace(answeredTimeline())
    expect(f.interactions.reader.getSnapshot()['questionnaire:question']).toMatchObject({
      status: 'succeeded',
      resolution: { kind: 'questionnaire', status: 'answered' },
    })
  } finally {
    f.dispose()
  }
})

test('rejected, malformed and wrong-target questionnaire confirmations never report success', async () => {
  for (const [reply, code] of [
    [{ sessionId: 'one', requestId: 'question', accepted: false }, 'INTERACTION_NOT_ACCEPTED'],
    [{ sessionId: 'two', requestId: 'question', accepted: true }, 'RESULT_UNKNOWN'],
    [{ accepted: true }, 'RESULT_UNKNOWN'],
  ] as const) {
    const f = fixture()
    try {
      f.reply(reply)
      await expect(f.interactions.execute('questionnaire.answer', submit)).rejects.toMatchObject({ code })
      expect(f.interactions.reader.getSnapshot()['questionnaire:question']?.status).not.toBe('succeeded')
    } finally {
      f.dispose()
    }
  }
})

test('pending duplicate and late transport failure cannot overwrite confirmed tool-result facts', async () => {
  const f = fixture()
  let release: (() => void) | undefined
  try {
    f.gate(
      new Promise<void>((resolve) => {
        release = resolve
      }),
    )
    f.failure(new CommandError('RESULT_UNKNOWN', 'lost'))
    const first = f.interactions.execute('questionnaire.answer', submit)
    await expect(f.interactions.execute('questionnaire.answer', submit)).rejects.toMatchObject({ code: 'BUSY' })
    f.timeline.replace(answeredTimeline())
    release?.()
    await expect(first).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(f.interactions.reader.getSnapshot()['questionnaire:question']).toMatchObject({
      status: 'succeeded',
      error: null,
      resolution: { status: 'answered' },
    })
  } finally {
    release?.()
    f.dispose()
  }
})

test('confirmed approval keeps the actual denial and malformed approval output stays unknown', async () => {
  for (const valid of [true, false]) {
    const f = fixture()
    try {
      f.reply(
        valid
          ? { sessionId: 'one', approvalId: 'approval', status: 'denied' }
          : { sessionId: 'two', approvalId: 'approval', status: 'allowed' },
      )
      const result = f.interactions.execute('approval.resolve', {
        sessionId: 'one',
        approvalId: 'approval',
        decision: 'allowed',
      })
      if (valid) {
        await result
        expect(f.interactions.reader.getSnapshot()['approval:approval']?.resolution).toEqual({
          kind: 'approval',
          status: 'denied',
        })
      } else {
        await expect(result).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
        expect(f.interactions.reader.getSnapshot()['approval:approval']?.status).toBe('unknown')
      }
    } finally {
      f.dispose()
    }
  }
})

test('questionnaire drafts survive session changes and absence without a confirmed answer', async () => {
  const f = fixture()
  try {
    await f.commands.execute('questionnaire.setAnswer', {
      sessionId: 'one',
      requestId: 'question',
      questionId: 'choice',
      answer: { kind: 'option', value: '原位' },
    })
    f.timeline.replace({ ...decisionsTimeline(), sessionId: 'two', messages: [], approvals: [], userInputs: [] })
    expect(f.interactions.questionnaires.getSnapshot().question?.answers.choice?.value).toBe('原位')
    f.timeline.replace({ ...decisionsTimeline(), userInputs: [] })
    expect(f.interactions.questionnaires.getSnapshot().question?.answers.choice?.value).toBe('原位')
    f.timeline.replace(decisionsTimeline())
    await f.interactions.execute('questionnaire.answer', submit)
    f.timeline.replace(answeredTimeline())
    expect(f.interactions.questionnaires.getSnapshot().question).toBeUndefined()
  } finally {
    f.dispose()
  }
})

test('only unique same-session/run/call/tool calls receive decisions; duplicates and unknown pages stay fallback', () => {
  const current = decisionsTimeline()
  const linked = projectSessionDecisions({ ...current, actions: {} })
  expect(linked.byMessage.get('assistant')?.size).toBe(2)
  expect(linked.fallback).toEqual([])
  for (const change of ['session', 'run', 'tool', 'duplicate'] as const) {
    const message = current.messages[0]!
    const messages =
      change === 'session'
        ? [{ ...message, sessionId: 'two' }]
        : change === 'run'
          ? [{ ...message, runId: 'other' }]
          : change === 'tool'
            ? [{ ...message, content: [{ type: 'tool_call' as const, callId: 'edit-call', name: 'other', args: {} }] }]
            : [message, { ...message, id: 'duplicate' }]
    const result = projectSessionDecisions({ ...current, messages, actions: {} })
    expect(result.fallback).toHaveLength(2)
    expect(result.byMessage.size).toBe(0)
  }
  const approval = linked.byMessage.get('assistant')?.get(JSON.stringify(['edit-call', 'edit_file']))?.[0]
  expect(approval).toMatchObject({ kind: 'approval', approval: { args: decisionApproval.args } })
})

test('settled decisions missing from the loaded message window stay out of fallback while pending and uncertain decisions remain actionable', () => {
  const current = decisionsTimeline()
  const settled = {
    ...current,
    approvals: [{ ...decisionApproval, status: 'allowed' as const }],
    userInputs: [],
    messages: [],
  }
  const settledProjection = projectSessionDecisions({ ...settled, actions: {} })
  expect(settledProjection.fallback).toEqual([])
  expect(settledProjection.settledHistory).toHaveLength(1)
  expect(settledProjection.settledHistory[0]).toMatchObject({ kind: 'approval', approval: { status: 'allowed' } })
  const retained = projectSessionDecisions({
    ...settled,
    approvals: Array.from({ length: 5 }, (_, index) => ({
      ...decisionApproval,
      id: `approval-${index}`,
      callId: `missing-call-${index}`,
      status: 'allowed' as const,
      createdAt: index,
    })),
    actions: {},
  })
  expect(retained.fallback).toEqual([])
  expect(retained.settledHistory).toHaveLength(5)

  const uncertain = projectSessionDecisions({
    ...settled,
    actions: {
      'approval:approval': {
        id: 'approval:approval',
        kind: 'approval',
        sessionId: 'one',
        targetId: 'approval',
        status: 'unknown',
        error: 'RESULT_UNKNOWN',
        approval: { ...decisionApproval, status: 'allowed' as const },
      },
    },
  })
  expect(uncertain.fallback).toHaveLength(1)
  expect(uncertain.fallback[0]).toMatchObject({ kind: 'approval', approval: { status: 'allowed' } })

  const pending = projectSessionDecisions({ ...current, messages: [], actions: {} })
  expect(pending.fallback).toHaveLength(2)
  expect(pending.fallback.map((decision) => decision.kind)).toEqual(['approval', 'questionnaire'])
})

test('historical questionnaire completion is restored only from validated matching tool results', () => {
  const current = answeredTimeline()
  expect(questionnaireFact(decisionRequest, current.messages, [])).toMatchObject({
    status: 'answered',
    answers: decisionAnswers,
  })
  const question = projectSessionDecisions({ ...current, actions: {} })
    .byMessage.get('assistant')
    ?.get(JSON.stringify(['question-call', 'request_user_input']))?.[0]
  expect(question).toMatchObject({
    kind: 'questionnaire',
    requestId: null,
    pending: false,
    fact: { status: 'answered' },
  })
  expect(
    questionnaireFact(
      decisionRequest,
      current.messages.map((message) => ({ ...message, runId: 'other' })),
      [],
    ),
  ).toBeNull()
  expect(
    questionnaireFact(decisionRequest, [...current.messages, { ...current.messages[1]!, id: 'duplicate-result' }], []),
  ).toBeNull()
  const events = [
    {
      eventId: 'cancel',
      sessionId: 'one',
      runId: 'run',
      stepId: null,
      seq: 2,
      time: 2,
      version: 1 as const,
      type: 'user_input.resolved',
      data: { requestId: 'question', sessionId: 'one', cancelled: true },
    },
  ]
  expect(questionnaireFact(decisionRequest, [], events)).toEqual({ status: 'cancelled', answers: null })
  expect(questionnaireFact(decisionRequest, [], [{ ...events[0]!, data: { requestId: 'question' } }])).toBeNull()
})

test('an observed questionnaire keeps its cancellation and draft cleanup without a local answer submission', async () => {
  const f = fixture()
  try {
    await f.commands.execute('questionnaire.setAnswer', {
      sessionId: 'one',
      requestId: 'question',
      questionId: 'choice',
      answer: { kind: 'option', value: '原位' },
    })
    const current = decisionsTimeline()
    f.timeline.replace({
      ...current,
      userInputs: [],
      events: [
        {
          eventId: 'cancel',
          sessionId: 'one',
          runId: 'run',
          stepId: null,
          seq: 2,
          time: 2,
          version: 1,
          type: 'user_input.resolved',
          data: { sessionId: 'one', requestId: 'question', cancelled: true },
        },
      ],
    })
    expect(f.interactions.reader.getSnapshot()['questionnaire:question']?.resolution).toEqual({
      kind: 'questionnaire',
      status: 'cancelled',
    })
    expect(f.interactions.questionnaires.getSnapshot().question).toBeUndefined()
    const decision = projectSessionDecisions({
      ...f.timeline.reader.getSnapshot(),
      actions: f.interactions.reader.getSnapshot(),
    })
      .byMessage.get('assistant')
      ?.get(JSON.stringify(['question-call', 'request_user_input']))?.[0]
    expect(decision).toMatchObject({ kind: 'questionnaire', fact: { status: 'cancelled' } })
    expect(f.calls()).toBe(0)
  } finally {
    f.dispose()
  }
})

test('draft capacity stays bounded across switches without silently dropping unresolved answers', async () => {
  const f = fixture()
  try {
    for (let index = 0; index < 40; index += 1) {
      const request = { ...decisionRequest, requestId: `draft-${index}`, sessionId: `session-${index}` }
      f.timeline.replace({ ...decisionsTimeline(), sessionId: request.sessionId, userInputs: [request] })
      await f.commands.execute('questionnaire.setAnswer', {
        sessionId: request.sessionId,
        requestId: request.requestId,
        questionId: 'choice',
        answer: { kind: 'option', value: '原位' },
      })
    }
    expect(Object.keys(f.interactions.questionnaires.getSnapshot())).toHaveLength(40)
    f.timeline.replace(decisionsTimeline())
    await expect(
      f.commands.execute('questionnaire.setAnswer', {
        sessionId: 'one',
        requestId: 'question',
        questionId: 'choice',
        answer: { kind: 'option', value: '原位' },
      }),
    ).rejects.toMatchObject({ code: 'BUSY' })
    expect(f.interactions.questionnaires.getSnapshot()['draft-0']?.answers.choice?.value).toBe('原位')
  } finally {
    f.dispose()
  }
})

test('observation capacity never evicts a cross-session unknown action', async () => {
  const f = fixture()
  try {
    f.failure(new CommandError('RESULT_UNKNOWN', 'lost'))
    await expect(f.interactions.execute('questionnaire.answer', submit)).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    for (let index = 0; index < 130; index += 1) {
      const request = { ...decisionRequest, requestId: `observed-${index}`, sessionId: `session-${index}` }
      f.timeline.replace({ ...decisionsTimeline(), sessionId: request.sessionId, userInputs: [request] })
    }
    expect(Object.keys(f.interactions.reader.getSnapshot())).toHaveLength(100)
    expect(f.interactions.reader.getSnapshot()['questionnaire:question']).toMatchObject({
      sessionId: 'one',
      status: 'unknown',
      request: decisionRequest,
    })
    expect(f.interactions.reader.getSnapshot()['questionnaire:observed-129']).toBeUndefined()
  } finally {
    f.dispose()
  }
})

test('decision projection has explicit empty and 1–3 questionnaire bounds, and rejects over-bound or duplicate historical questions', () => {
  const base = answeredTimeline()
  expect(projectSessionDecisions({ ...base, messages: [], approvals: [], userInputs: [], actions: {} })).toEqual({
    byMessage: new Map(),
    fallback: [],
    settledHistory: [],
  })
  for (const count of [0, 1, 3, 4]) {
    const questions = Array.from({ length: count }, (_, index) => ({
      ...decisionRequest.questions[0]!,
      id: `question_${index}`,
    }))
    const answers = Object.fromEntries(questions.map((question) => [question.id, { answers: ['原位'] }]))
    const messages = [
      {
        ...base.messages[0]!,
        content: [
          { type: 'tool_call' as const, name: 'request_user_input', callId: 'question-call', args: { questions } },
        ],
      },
      {
        ...base.messages[1]!,
        content: [
          {
            type: 'tool_result' as const,
            name: 'request_user_input',
            callId: 'question-call',
            isError: false,
            text: JSON.stringify({ answers }),
            details: { answers },
          },
        ],
      },
    ]
    const result = projectSessionDecisions({ ...base, approvals: [], messages, actions: {} })
    expect(result.byMessage.size).toBe(count === 1 || count === 3 ? 1 : 0)
    if (count === 3) {
      const duplicate = {
        ...messages[0]!,
        content: [
          {
            type: 'tool_call' as const,
            name: 'request_user_input',
            callId: 'question-call',
            args: { questions: [questions[0], questions[0]] },
          },
        ],
      }
      expect(
        projectSessionDecisions({ ...base, approvals: [], messages: [duplicate, messages[1]!], actions: {} }).byMessage
          .size,
      ).toBe(0)
    }
  }
})

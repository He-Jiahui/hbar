import { expect, test } from 'bun:test'
import { CommandError } from '@hbar/commands'
import { createAppRuntime, type SessionTimelinePort, type SessionTimelineUpdate } from '@hbar/app-runtime'
import { createInteractionCommandClient } from '@hbar/client'
import { HbarError } from '@hbar/contracts'
import type { SessionSnapshot } from '@hbar/contracts'

const workspace = { id: 'workspace', path: 'D:/workspace', name: 'Workspace', createdAt: 1 }
const session = {
  id: 'session',
  workspaceId: workspace.id,
  title: 'Session',
  archived: false,
  parentId: null,
  createdAt: 2,
  updatedAt: 3,
  seq: 1,
}
const approval = {
  id: 'approval',
  sessionId: session.id,
  runId: 'run',
  callId: 'call',
  tool: 'write_file',
  args: { path: 'a.txt' },
  status: 'pending' as const,
  createdAt: 4,
}
const request = {
  requestId: 'questionnaire',
  sessionId: session.id,
  runId: 'run',
  callId: 'question-call',
  questions: [{ id: 'choice', header: 'Choose', question: 'Continue?', options: [], isOther: false, isSecret: false }],
  isBlocking: true,
}

function snapshot(): SessionSnapshot {
  return {
    session,
    messages: [],
    runs: [],
    approvals: [approval],
    userInputs: [request],
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    cursor: 1,
    hasOlder: false,
    streams: [],
  }
}

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (check()) return
    await Bun.sleep(1)
  }
  throw new Error('state did not settle')
}

test('interaction actions stay bound to their targets and unknown replies converge from timeline facts', async () => {
  let update: ((value: SessionTimelineUpdate) => void) | undefined
  const timeline: SessionTimelinePort = {
    async snapshot() {
      return snapshot()
    },
    async watch(_sessionId, _cursor, listener) {
      update = listener
      return () => undefined
    },
  }
  let mode: 'unknown' | 'failed' | 'success' = 'unknown'
  const interactions = {
    async execute(name: string, input: unknown) {
      if (mode === 'unknown') throw new CommandError('RESULT_UNKNOWN', 'lost')
      if (mode === 'failed') throw new CommandError('FORBIDDEN', 'denied')
      const target = input as { sessionId: string; approvalId?: string; requestId?: string; decision?: string }
      return name === 'approval.resolve'
        ? {
            sessionId: target.sessionId,
            approvalId: target.approvalId,
            status: target.decision === 'allowed' ? 'allowed' : 'denied',
          }
        : { sessionId: target.sessionId, requestId: target.requestId, accepted: true }
    },
  }
  const directory = {
    async execute(name: string) {
      if (name === 'session.get') return session
      if (name === 'workspace.get') return workspace
      if (name === 'session.list') return { items: [session], nextCursor: null }
      if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
      throw new Error(`Unsupported query: ${name}`)
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'interactions',
    hostId: 'host',
    directory,
    timeline,
    interactions,
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    await waitFor(() => runtime.view.state.timeline.getSnapshot().status === 'ready')
    await expect(
      runtime.view.commands.execute('approval.resolve', {
        sessionId: session.id,
        approvalId: approval.id,
        decision: 'allowed',
      }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(runtime.view.state.interactions.getSnapshot()['approval:approval']).toMatchObject({
      targetId: approval.id,
      status: 'unknown',
    })

    update!({
      kind: 'event',
      event: {
        eventId: 'approval-resolved',
        sessionId: session.id,
        seq: 2,
        runId: approval.runId,
        stepId: null,
        type: 'approval.resolved',
        data: { ...approval, status: 'allowed' },
        time: 5,
        version: 1,
      },
    })
    expect(runtime.view.state.interactions.getSnapshot()['approval:approval']?.status).toBe('succeeded')

    mode = 'failed'
    await expect(
      runtime.view.commands.execute('questionnaire.answer', {
        sessionId: session.id,
        requestId: request.requestId,
        answers: {},
      }),
    ).rejects.toMatchObject({ code: 'QUESTIONNAIRE_INCOMPLETE' })
    await runtime.view.commands.execute('questionnaire.setAnswer', {
      sessionId: session.id,
      requestId: request.requestId,
      questionId: 'choice',
      answer: { kind: 'custom', value: 'No' },
    })
    expect(runtime.view.state.questionnaires.getSnapshot()[request.requestId]?.answers.choice).toEqual({
      kind: 'custom',
      value: 'No',
    })
    await expect(
      runtime.view.commands.execute('questionnaire.answer', {
        sessionId: session.id,
        requestId: request.requestId,
        answers: { choice: { answers: ['No'] } },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(runtime.view.state.interactions.getSnapshot()['questionnaire:questionnaire']).toMatchObject({
      status: 'failed',
      error: 'FORBIDDEN',
    })

    mode = 'success'
    const answer = await runtime.view.commands.execute('questionnaire.answer', {
      sessionId: session.id,
      requestId: request.requestId,
      answers: { choice: { answers: ['Yes'] } },
    })
    expect(answer.accepted).toBeTrue()
    expect(runtime.view.state.interactions.getSnapshot()['questionnaire:questionnaire']?.status).toBe('succeeded')
    update!({
      kind: 'event',
      event: {
        eventId: 'questionnaire-resolved',
        sessionId: session.id,
        seq: 3,
        runId: request.runId,
        stepId: null,
        type: 'user_input.resolved',
        data: { requestId: request.requestId },
        time: 6,
        version: 1,
      },
    })
    expect(runtime.view.state.questionnaires.getSnapshot()[request.requestId]).toBeUndefined()
  } finally {
    runtime.dispose()
  }
})

test('interaction client reports a lost persistent response as unknown', async () => {
  const client = createInteractionCommandClient({
    call: async () => {
      throw new HbarError('TIMEOUT', 'lost')
    },
  })
  await expect(
    client.execute('approval.resolve', { sessionId: 'session', approvalId: 'approval', decision: 'denied' }),
  ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
})

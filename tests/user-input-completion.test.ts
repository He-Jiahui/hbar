import { expect, test } from 'bun:test'
import { z } from 'zod'
import { HbarError, providerSchema, userInputRequestSchema, type UserInputRequest, type Usage } from '@hbar/contracts'
import type { DecisionCompletionRequest, ModelRequest } from '@hbar/plugin-sdk'
import {
  captureInputDecisionContext,
  completeInputDecision,
  type InputDecisionCompletionPort,
} from '../packages/kernel/src/user-input-completion'

const model = providerSchema.parse({
  id: 'source-model',
  name: 'Source',
  protocol: 'mock',
  model: 'fixture',
  baseUrl: 'http://127.0.0.1',
})
const usage: Usage = { input: 100, output: 20, cacheRead: 0, cacheWrite: 0, cost: 0 }
const question = {
  id: 'scope',
  header: 'Scope',
  question: 'Which task scope?',
  purpose: 'decision' as const,
  options: [
    { label: 'App', description: 'App scope.' },
    { label: 'API', description: 'API scope.' },
  ],
}
function request(questions: unknown[] = [question]): UserInputRequest {
  return userInputRequestSchema.parse({
    requestId: 'question',
    sessionId: 'session',
    runId: 'run',
    callId: 'call',
    questions,
  })
}
function context(): ModelRequest {
  return {
    system: 'Task rule: preserve the source worktree.',
    model,
    messages: [
      {
        id: 'original-task',
        sessionId: 'session',
        runId: 'run',
        role: 'user',
        seq: 1,
        createdAt: 1,
        content: [{ type: 'text', text: 'Implement the API feature with existing conventions.' }],
      },
    ],
    context: { sessionId: 'session', runId: 'run', thinking: 'medium' },
  }
}
function fixture(outputs: unknown[], remaining: number | null = null) {
  const requested: { id: string; completion: DecisionCompletionRequest }[] = []
  const recorded: { id: string; usage: Usage }[] = []
  let calls = 0,
    current = true
  const port: InputDecisionCompletionPort = {
    beforeAttempt: async () => remaining,
    isCurrent: async () => current,
    requested: async (id, completion) => {
      requested.push({ id, completion })
    },
    complete: async () => {
      const output = outputs[calls++]
      if (output instanceof Error) throw output
      return { text: typeof output === 'string' ? output : JSON.stringify(output), usage }
    },
    recorded: async (id, _request, actualUsage) => {
      recorded.push({ id, usage: actualUsage })
    },
  }
  return {
    port,
    requested,
    recorded,
    get calls() {
      return calls
    },
    setCurrent(value: boolean) {
      current = value
    },
  }
}
const answer = (text: string, id = 'scope') => ({ kind: 'answer', answers: { [id]: { answers: [text] } } })

test('model decisions use source context, fixed recommendations and only the unresolved question IDs', async () => {
  const f = fixture([answer('API')])
  const input = request([
    {
      ...question,
      id: 'fixed',
      options: question.options.map((option) => ({ ...option, recommended: option.label === 'App' })),
    },
    question,
  ])
  expect(await completeInputDecision(input, captureInputDecisionContext(context()), f.port)).toEqual({
    kind: 'model',
    response: { answers: { fixed: { answers: ['App'] }, scope: { answers: ['API'] } } },
    attemptIds: f.requested.map((entry) => entry.id),
  })
  expect(f.calls).toBe(1)
  expect(f.recorded).toHaveLength(1)
  const completed = f.requested[0]?.completion
  if (!completed) throw new Error('Expected model completion request')
  expect(completed.request.model).toBe(model)
  expect(completed.request.toolNames).toEqual([])
  expect(completed.request.context).toMatchObject({
    sessionId: 'session',
    runId: 'run',
    thinking: 'medium',
    selectedToolNames: [],
  })
  const block = completed.request.messages[0]?.content[0]
  if (block?.type !== 'text') throw new Error('Expected decision context text')
  const payload = z
    .object({ context: z.string(), questions: z.array(z.object({ id: z.string() })) })
    .parse(JSON.parse(block.text))
  expect(payload.questions.map((item) => item.id)).toEqual(['scope'])
  expect(payload.context).toContain('preserve the source worktree')
  expect(payload.context).toContain('Implement the API feature')
})

test('malformed or disallowed answers receive one correction while every paid attempt retains usage', async () => {
  for (const invalid of [
    'not JSON',
    answer('invented option'),
    answer('App', 'unknown'),
    { kind: 'answer', answers: {} },
  ]) {
    const f = fixture([invalid, answer('API')])
    expect(await completeInputDecision(request(), captureInputDecisionContext(context()), f.port)).toMatchObject({
      kind: 'model',
      response: { answers: { scope: { answers: ['API'] } } },
    })
    expect(f.calls).toBe(2)
    expect(f.recorded.map((entry) => entry.id)).toEqual(f.requested.map((entry) => entry.id))
    expect(f.requested[1]?.completion.request.messages).toHaveLength(3)
  }
  const invalid = fixture([answer('bad'), answer('still bad'), answer('App')])
  expect(await completeInputDecision(request(), captureInputDecisionContext(context()), invalid.port)).toEqual({
    kind: 'human',
    reason: 'invalid_answer',
  })
  expect(invalid.calls).toBe(2)
  expect(invalid.recorded).toHaveLength(2)
})

test('facts, secrets and authorization are never sent to the model, and a model need-user response waits without repair', async () => {
  for (const questionOverride of [
    { purpose: 'fact' },
    { purpose: 'authorization' },
    { isSecret: true },
    { purpose: undefined },
  ]) {
    const f = fixture([answer('App')])
    expect(
      await completeInputDecision(
        request([{ ...question, ...questionOverride }]),
        captureInputDecisionContext(context()),
        f.port,
      ),
    ).toEqual({ kind: 'human', reason: 'model_needs_user' })
    expect(f.calls).toBe(0)
    expect(f.requested).toHaveLength(0)
  }
  const f = fixture([{ kind: 'need_user' }, answer('App')])
  expect(await completeInputDecision(request(), captureInputDecisionContext(context()), f.port)).toEqual({
    kind: 'human',
    reason: 'model_needs_user',
  })
  expect(f.calls).toBe(1)
  expect(f.recorded).toHaveLength(1)
})

test('explicit free text is accepted, while undeclared free text and multiple conflicting choices are rejected', async () => {
  for (const options of [
    { ...question, options: [] },
    { ...question, isOther: true },
  ]) {
    const f = fixture([answer('Keep the existing endpoint style.')])
    expect(
      await completeInputDecision(request([options]), captureInputDecisionContext(context()), f.port),
    ).toMatchObject({
      kind: 'model',
      response: { answers: { scope: { answers: ['Keep the existing endpoint style.'] } } },
    })
  }
  const f = fixture([{ kind: 'answer', answers: { scope: { answers: ['App', 'API'] } } }, answer('unknown')])
  expect((await completeInputDecision(request(), captureInputDecisionContext(context()), f.port)).kind).toBe('human')
  expect(f.calls).toBe(2)
})

test('policy changes and cancellation invalidate a late answer after its actual usage is retained', async () => {
  const f = fixture([answer('App')])
  const record = f.port.recorded
  f.port.recorded = async (...args) => {
    await record(...args)
    f.setCurrent(false)
  }
  expect(await completeInputDecision(request(), captureInputDecisionContext(context()), f.port)).toEqual({
    kind: 'human',
    reason: 'policy_changed',
  })
  expect(f.recorded).toHaveLength(1)
  const cancelled = fixture([answer('App')])
  let checks = 0
  cancelled.port.isCurrent = async () => {
    if (++checks > 1) throw new HbarError('USER_CANCELLED', 'Source stopped')
    return true
  }
  expect(
    await completeInputDecision(request(), captureInputDecisionContext(context()), cancelled.port).catch(
      (error: unknown) => error,
    ),
  ).toMatchObject({ code: 'USER_CANCELLED' })
  expect(cancelled.recorded).toHaveLength(1)
  const failed = fixture([answer('App')])
  failed.port.recorded = async () => {
    throw new HbarError('STORAGE_RESULT_UNKNOWN', 'Usage write failed')
  }
  expect(
    await completeInputDecision(request(), captureInputDecisionContext(context()), failed.port).catch(
      (error: unknown) => error,
    ),
  ).toMatchObject({ code: 'STORAGE_RESULT_UNKNOWN' })
  expect(failed.calls).toBe(1)
})

test('context and token budgets reject model work before admission and preserve bounded text at source capacity', async () => {
  const f = fixture([answer('App')], 10)
  expect(await completeInputDecision(request(), captureInputDecisionContext(context()), f.port)).toEqual({
    kind: 'human',
    reason: 'budget_limited',
  })
  expect(f.calls).toBe(0)
  const original = context()
  original.system = 'source-rule'.repeat(100_000)
  const message = original.messages[0]
  if (!message) throw new Error('Expected context fixture message')
  message.content = Array.from({ length: 1024 }, () => ({ type: 'text' as const, text: 'x'.repeat(10_000) }))
  const captured = captureInputDecisionContext(original)
  expect(captured.text.length).toBeLessThan(33_000)
  expect(captured.model).toBe(original.model)
  const small = fixture([answer('App')])
  expect(
    await completeInputDecision(
      request(),
      { ...captured, model: { ...captured.model, contextWindow: 128 } },
      small.port,
    ),
  ).toEqual({ kind: 'human', reason: 'context_capacity' })
  expect(small.calls).toBe(0)
})

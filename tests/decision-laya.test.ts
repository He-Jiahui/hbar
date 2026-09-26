import { afterEach, expect, test } from 'bun:test'
import { decisionRequestSchema } from '@hbar/contracts/decision'
import type { DecisionCheckpoint, DecisionResult, ParsedDecisionRequest } from '@hbar/contracts/decision'
import { DecisionBackendError, LayaDecisionRuntime, layaConfigSchema } from '../plugins/decision-laya/src/index'
import type { DecisionBackend } from '../plugins/decision-laya/src/index'
import { wireQuestions } from '../plugins/decision-laya/src/answers'

const request = decisionRequestSchema.parse({
  state: 'Tests failed; inspect evidence',
  questions: {
    action: {
      type: 'choice',
      instructions: 'Select the next action',
      criteria: { yes: 'Ship immediately', no: 'Inspect failed checks' },
    },
  },
})
function response(input: ParsedDecisionRequest): Record<string, unknown> {
  return {
    routing: { model: input.checkpoint },
    hbar_input: { state_truncated: false, questions_truncated: [] },
    answers: Object.fromEntries(
      Object.entries(input.questions).map(([id, q]) => {
        if (q.type === 'score')
          return [
            id,
            {
              type: 'score',
              score: 0.8,
              probabilities: { '0': 0.2, '1': 0.8 },
              confidence: 0.4,
              answer_confidence: 0.8,
              action: { act_probability: 1 },
            },
          ]
        return [
          id,
          {
            type: 'choice',
            choice: 'B',
            probabilities: { A: 0.2, B: 0.8 },
            confidence: 0.4,
            answer_confidence: 0.8,
            action: { act_probability: 1 },
          },
        ]
      }),
    ),
  }
}
class FakeBackend implements DecisionBackend {
  calls = 0
  stops = 0
  disposals = 0
  async ready() {}
  async predict(input: ParsedDecisionRequest): Promise<unknown> {
    this.calls++
    return response(input)
  }
  revision(_checkpoint: DecisionCheckpoint) {
    return 'a'.repeat(40)
  }
  async stop() {
    this.stops++
  }
  async dispose() {
    this.disposals++
    await this.stop()
  }
}
class HoldingBackend extends FakeBackend {
  held: { release: () => void; done: Promise<unknown> }[] = []
  private startedResolve: () => void = () => {}
  readonly started = new Promise<void>((done) => {
    this.startedResolve = done
  })
  override async predict(input: ParsedDecisionRequest): Promise<unknown> {
    this.calls++
    let release = () => {}
    const done = new Promise<unknown>((accept) => {
      release = () => accept(response(input))
    })
    this.held.push({ release, done })
    this.startedResolve()
    return done
  }
  override async stop() {
    await super.stop()
    for (const held of this.held) held.release()
    await Promise.all(this.held.map((held) => held.done))
  }
}
const resources: LayaDecisionRuntime[] = []
afterEach(async () => {
  for (const runtime of resources.splice(0)) await runtime.dispose()
})
function runtime(backend: DecisionBackend = new FakeBackend(), config: Record<string, unknown> = {}) {
  const value = new LayaDecisionRuntime(layaConfigSchema.parse(config), backend)
  resources.push(value)
  return value
}
const signal = () => new AbortController().signal

test('Laya translates neutral labels and returns three typed answers without the unusable action head', async () => {
  const value = runtime()
  const input = decisionRequestSchema.parse({
    ...request,
    questions: {
      ...request.questions,
      complete: { type: 'noul', instructions: 'Is the objective verified complete?' },
      progress: { type: 'score', instructions: 'Assess progress', criteria: ['No progress', 'Some progress'] },
    },
  })
  expect(wireQuestions(input)).toMatchObject({
    action: { criteria: { A: 'Ship immediately', B: 'Inspect failed checks' } },
    complete: { type: 'choice' },
  })
  const result = await value.evaluate(input, signal())
  expect(result.status).toBe('evaluated')
  if (result.status !== 'evaluated') throw new Error('Expected an evaluation')
  expect(result.answers.action).toEqual({
    type: 'choice',
    choice: 'no',
    probabilities: { yes: 0.2, no: 0.8 },
    confidence: 0.4,
    answerConfidence: 0.8,
  })
  expect(result.answers.complete).toMatchObject({ type: 'noul', value: false, probability: 0.2 })
  expect(result.answers.progress).toMatchObject({ type: 'score', score: 0.8, probabilities: [0.2, 0.8] })
  expect(JSON.stringify(result)).not.toContain('act_probability')
  expect(result.metadata).toMatchObject({
    checkpoint: 'multilingual',
    calibration: 'uncalibrated',
    modelRevision: 'a'.repeat(40),
  })
})

test('missing answers, foreign models and inconsistent probability mass fail explicitly', async () => {
  for (const raw of [
    { answers: {}, routing: { model: 'multilingual' } },
    { ...response(request), routing: { model: 'english' } },
    {
      routing: { model: 'multilingual' },
      hbar_input: { state_truncated: false, questions_truncated: [] },
      answers: {
        action: {
          type: 'choice',
          choice: 'B',
          probabilities: { A: 0.9, B: 0.8 },
          confidence: 1,
          answer_confidence: 0.8,
        },
      },
    },
  ]) {
    class InvalidBackend extends FakeBackend {
      override async predict() {
        return raw
      }
    }
    const result = await runtime(new InvalidBackend()).evaluate(request, signal())
    expect(result).toMatchObject({ status: 'unavailable', code: 'INVALID_RESPONSE' })
  }
})

test('cancelled forwards retain their inference slot, queued cancellations never run and late results are discarded', async () => {
  const backend = new HoldingBackend()
  const value = runtime(backend)
  const firstAbort = new AbortController()
  const first = value.evaluate(request, firstAbort.signal)
  await backend.started
  const queuedAbort = new AbortController()
  const queued = value.evaluate(request, queuedAbort.signal)
  queuedAbort.abort()
  expect((await queued).status).toBe('cancelled')
  const third = value.evaluate(request, signal())
  firstAbort.abort()
  expect((await first).status).toBe('cancelled')
  expect(backend.calls).toBe(1)
  backend.held[0]?.release()
  // The next forward begins only after the cancelled computation actually returns.
  const deadline = performance.now() + 1_000
  while (backend.calls < 2 && performance.now() < deadline) await new Promise<void>((done) => setTimeout(done, 1))
  expect(backend.calls).toBe(2)
  backend.held[1]?.release()
  expect((await third).status).toBe('evaluated')
  expect(backend.calls).toBe(2)
})

test('the bounded queue rejects overflow and request timeout stops the owned computation before recovery', async () => {
  const backend = new HoldingBackend()
  const value = runtime(backend, { maxQueue: 1, requestTimeoutMs: 20 })
  const first = value.evaluate(request, signal())
  await backend.started
  const queued = value.evaluate(request, signal())
  expect(await value.evaluate(request, signal())).toMatchObject({ status: 'unavailable', code: 'QUEUE_FULL' })
  expect(await first).toMatchObject({ status: 'unavailable', code: 'REQUEST_TIMEOUT' })
  expect(backend.stops).toBeGreaterThan(0)
  expect(await queued).toMatchObject({ status: 'unavailable', code: 'REQUEST_TIMEOUT' })
})

test('startup timeout, missing dependencies and disposal settle callers without executing queued work', async () => {
  class SlowStart extends FakeBackend {
    override async ready() {
      return new Promise<void>(() => {})
    }
  }
  const slow = new SlowStart()
  expect(await runtime(slow, { startupTimeoutMs: 100 }).evaluate(request, signal())).toMatchObject({
    status: 'unavailable',
    code: 'STARTUP_TIMEOUT',
  })
  expect(slow.calls).toBe(0)
  class Missing extends FakeBackend {
    override async ready() {
      throw new DecisionBackendError('MISSING_DEPENDENCY', 'Python dependency is absent')
    }
  }
  expect(await runtime(new Missing()).evaluate(request, signal())).toMatchObject({
    status: 'unavailable',
    code: 'MISSING_DEPENDENCY',
  })
  const backend = new HoldingBackend()
  const value = runtime(backend)
  const active = value.evaluate(request, signal())
  await backend.started
  const waiting = value.evaluate(request, signal())
  await value.dispose()
  expect(await active).toMatchObject({ status: 'unavailable', code: 'DISPOSED' })
  expect(await waiting).toMatchObject({ status: 'unavailable', code: 'DISPOSED' })
  expect(backend.calls).toBe(1)
  expect(await value.evaluate(request, signal())).toMatchObject({ code: 'DISPOSED' })
})

test('records carry host correlation and hashes without duplicating raw state, and persistence failure is explicit', async () => {
  const records: { sessionId: string; result: DecisionResult }[] = []
  const value = new LayaDecisionRuntime(layaConfigSchema.parse({}), new FakeBackend(), async (context, result) => {
    records.push({ sessionId: context.sessionId, result })
  })
  resources.push(value)
  const result = await value.evaluate(request, signal(), { sessionId: 'real-session', runId: 'real-run' })
  expect(records).toHaveLength(1)
  expect(records[0]?.sessionId).toBe('real-session')
  expect(records[0]?.result.metadata.evaluationId).toBe(result.metadata.evaluationId)
  expect(JSON.stringify(records)).not.toContain('Tests failed; inspect evidence')
  const failing = new LayaDecisionRuntime(layaConfigSchema.parse({}), new FakeBackend(), async () => {
    throw new Error('storage unavailable')
  })
  resources.push(failing)
  expect(await failing.evaluate(request, signal(), { sessionId: 'real-session' })).toMatchObject({
    status: 'unavailable',
    code: 'RECORDING_FAILED',
  })
})

test('the unconfigured managed plugin reports setup needs without spawning a process', async () => {
  const value = new LayaDecisionRuntime(layaConfigSchema.parse({}))
  resources.push(value)
  expect(await value.evaluate(request, signal())).toMatchObject({ status: 'unavailable', code: 'NOT_CONFIGURED' })
  expect(await value.evaluate({ ...request, checkpoint: 'typed-decisions' }, signal())).toMatchObject({
    code: 'MISSING_MODEL',
  })
})

test('queue expiry and stalled audit confirmation have bounded failure results', async () => {
  const backend = new HoldingBackend()
  const value = runtime(backend, { queueTimeoutMs: 10 })
  const first = value.evaluate(request, signal())
  await backend.started
  expect(await value.evaluate(request, signal())).toMatchObject({ code: 'REQUEST_TIMEOUT' })
  expect(backend.calls).toBe(1)
  backend.held[0]?.release()
  expect((await first).status).toBe('evaluated')
  const stalled = new LayaDecisionRuntime(
    layaConfigSchema.parse({ recordTimeoutMs: 10 }),
    new FakeBackend(),
    async () => new Promise<void>(() => {}),
  )
  resources.push(stalled)
  expect(await stalled.evaluate(request, signal(), { sessionId: 'session' })).toMatchObject({
    code: 'RECORDING_FAILED',
  })
})

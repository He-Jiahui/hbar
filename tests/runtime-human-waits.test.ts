import { expect, test } from 'bun:test'
import { z } from 'zod'
import { HbarError, type Approval } from '@hbar/contracts'
import { executionOwnershipSchema, type RuntimeOwner } from '@hbar/contracts/runtime'
import { executionHumanWaitSchema, type ExecutionHumanWait } from '@hbar/contracts/execution-waits'
import { userInputStateSchema, type UserInputState } from '@hbar/contracts/user-input-state'
import { IpcPeer, procedure } from '@hbar/runtime'
import { RuntimeHumanWaits } from '../apps/host/src/runtime-human-waits'
import { withRuntimeHumanWait } from '../apps/host/src/runtime-human-wait-client'

function deferred<Value>() {
  return Promise.withResolvers<Value>()
}
async function failure(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
  } catch (error) {
    return error
  }
  throw new Error('Expected a rejected wait')
}
function fixture() {
  const owner: RuntimeOwner = { unitId: 'kernel', generation: 1, incarnation: 'original-kernel' }
  const execution = executionOwnershipSchema.parse({
    owner,
    leaseId: 'original-lease',
    runId: 'original-run',
    sessionId: 'original-session',
    fence: 1,
    acquiredAt: 1,
    versions: {
      kernel: { unitId: owner.unitId, generation: owner.generation, artifactId: 'a'.repeat(64) },
      driver: { unitId: 'driver.pi', generation: 1, artifactId: 'b'.repeat(64) },
      plugins: [],
      hooks: [],
    },
  })
  let question: UserInputState | null = userInputStateSchema.parse({
    version: 1,
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    policy: { sessionId: execution.sessionId, policy: { mode: 'wait_user' }, source: 'default', revisions: {} },
    request: {
      requestId: 'question',
      sessionId: execution.sessionId,
      runId: execution.runId,
      callId: 'original-call',
      isBlocking: true,
      questions: [
        { id: 'scope', header: 'Scope', question: 'Which scope?', purpose: 'fact', isOther: false, isSecret: false },
      ],
    },
    settlement: null,
  })
  let approval: Approval = {
    id: 'approval',
    sessionId: execution.sessionId,
    runId: execution.runId,
    callId: 'original-call',
    tool: 'file.write',
    args: {},
    status: 'pending',
    createdAt: 1,
  }
  let revoked = false
  let reads = 0
  let readQuestion = async () => question
  const waits = new RuntimeHumanWaits({
    coordinator: {
      assertCanWrite(caller, lease) {
        if (revoked || caller.incarnation !== owner.incarnation || lease?.leaseId !== execution.leaseId)
          throw new HbarError('EXECUTION_OWNER_REVOKED', 'The original claim is no longer current')
      },
    },
    decisions: {
      question: () => {
        reads++
        return readQuestion()
      },
      approval: async () => {
        reads++
        return approval
      },
    },
  })
  const input = (change: Partial<ExecutionHumanWait> = {}) =>
    executionHumanWaitSchema.parse({
      waitId: crypto.randomUUID(),
      execution,
      callId: 'original-call',
      decision: { kind: 'questionnaire', id: 'question', revision: 1 },
      ...change,
    })
  const control = () => {
    let depth = 0
    return {
      get depth() {
        return depth
      },
      suspendDeadline() {
        depth++
        let active = true
        return () => {
          if (active) {
            active = false
            depth--
          }
        }
      },
    }
  }
  return {
    owner,
    execution,
    waits,
    input,
    control,
    get reads() {
      return reads
    },
    setQuestion(value: UserInputState | null) {
      question = value
    },
    get question() {
      if (!question) throw new Error('Question absent')
      return structuredClone(question)
    },
    setApproval(value: Partial<Approval>) {
      approval = { ...approval, ...value }
    },
    blockRead(operation: () => Promise<UserInputState | null>) {
      readQuestion = operation
    },
    revoke() {
      revoked = true
    },
  }
}
function pair(remote: RuntimeOwner) {
  const owner: RuntimeOwner = { unitId: 'base', generation: 1, incarnation: 'base' }
  let unit!: IpcPeer
  const host = new IpcPeer({ owner, remote, inFlight: 2, transport: { send: (frame) => unit.receive(frame) } })
  unit = new IpcPeer({ owner: remote, remote: owner, inFlight: 2, transport: { send: (frame) => host.receive(frame) } })
  return {
    host,
    unit,
    close() {
      host.close()
      unit.close()
    },
  }
}

test('a persisted original human wait pauses the original framed RPC and keeps its physical slot until settlement', async () => {
  const f = fixture(),
    peers = pair(f.owner),
    started = deferred<void>(),
    complete = deferred<string>()
  const detach = f.waits.attachKernel(peers.host, f.owner)
  peers.unit.register(
    'original.tool',
    procedure(z.undefined(), z.string(), () => {
      started.resolve()
      return complete.promise
    }),
  )
  const tracked = peers.host.callTracked('original.tool', undefined, z.string(), { timeoutMs: 100 })
  void tracked.result.catch(() => {})
  await started.promise
  const untrack = f.waits.track(f.execution, 'original-call', tracked)
  const entered = deferred<void>(),
    answer = deferred<string>()
  const waiting = withRuntimeHumanWait(
    peers.unit,
    f.execution,
    'original-call',
    { kind: 'questionnaire', id: 'question', revision: 1 },
    async () => {
      entered.resolve()
      return answer.promise
    },
  )
  try {
    await entered.promise
    await Bun.sleep(180)
    expect(f.waits.snapshot()).toEqual({ waits: 1, active: 1, callbacks: 1 })
    expect(peers.host.snapshot().inFlight).toBe(1)
    answer.resolve('human answer')
    expect(await waiting).toBe('human answer')
    complete.resolve('original result')
    expect(await tracked.result).toBe('original result')
    expect(await tracked.settled).toBe('original result')
    untrack()
    expect(f.waits.snapshot()).toEqual({ waits: 0, active: 0, callbacks: 0 })
  } finally {
    answer.resolve('cleanup')
    complete.resolve('cleanup')
    detach()
    untrack()
    peers.close()
  }
})

test('question state, blocking intent, revision and original Run/call all govern deadline suspension', async () => {
  const f = fixture(),
    deadline = f.control()
  const untrack = f.waits.track(f.execution, 'original-call', deadline)
  const original = f.question
  const invalid: Array<UserInputState | null> = [
    null,
    { ...original, revision: 2 },
    { ...original, request: { ...original.request, requestId: 'different-question' } },
    { ...original, request: { ...original.request, isBlocking: false } },
    { ...original, request: { ...original.request, runId: 'different-run' } },
    { ...original, request: { ...original.request, callId: 'different-call' } },
    { ...original, request: { ...original.request, sessionId: 'different-session' } },
    { ...original, settlement: { kind: 'cancelled', reason: 'cancelled' } },
  ]
  for (const question of invalid) {
    f.setQuestion(question)
    expect(await f.waits.begin(f.owner, f.input())).toBe(false)
    expect(deadline.depth).toBe(0)
  }
  f.setQuestion(original)
  const input = f.input()
  expect(await f.waits.begin(f.owner, input)).toBe(true)
  expect(await f.waits.begin(f.owner, input)).toBe(true)
  expect(deadline.depth).toBe(1)
  f.waits.end(f.owner, input)
  f.waits.end(f.owner, input)
  expect(deadline.depth).toBe(0)
  untrack()
})

test('ordinary approval and Plan-exit waits cannot borrow each other or a terminal approval', async () => {
  const f = fixture(),
    deadline = f.control()
  const untrack = f.waits.track(f.execution, 'original-call', deadline)
  const ordinary = f.input({ decision: { kind: 'approval', id: 'approval', revision: 1 } })
  const plan = f.input({ decision: { kind: 'plan_exit', id: 'approval', revision: 1 } })
  expect(await f.waits.begin(f.owner, plan)).toBe(false)
  expect(await f.waits.begin(f.owner, ordinary)).toBe(true)
  f.waits.end(f.owner, ordinary)
  f.setApproval({ tool: 'exit_plan_mode' })
  expect(await f.waits.begin(f.owner, ordinary)).toBe(false)
  expect(await f.waits.begin(f.owner, plan)).toBe(true)
  f.waits.end(f.owner, plan)
  f.setApproval({ status: 'allowed' })
  expect(await f.waits.begin(f.owner, plan)).toBe(false)
  expect(deadline.depth).toBe(0)
  untrack()
})

test('end during canonical validation and revocation cannot resurrect a wait after a late read', async () => {
  const f = fixture(),
    deadline = f.control(),
    read = deferred<UserInputState | null>()
  f.waits.track(f.execution, 'original-call', deadline)
  f.blockRead(() => read.promise)
  const input = f.input(),
    first = f.waits.begin(f.owner, input),
    duplicate = f.waits.begin(f.owner, input)
  expect(f.reads).toBe(1)
  f.waits.end(f.owner, input)
  read.resolve(f.question)
  expect(await first).toBe(false)
  expect(await duplicate).toBe(false)
  expect(deadline.depth).toBe(0)
  const second = deferred<UserInputState | null>()
  f.blockRead(() => second.promise)
  const revoked = f.waits.begin(f.owner, f.input())
  f.revoke()
  second.resolve(f.question)
  expect(await failure(revoked)).toMatchObject({ code: 'EXECUTION_OWNER_REVOKED' })
  expect(f.waits.snapshot().waits).toBe(0)
})

test('late callbacks inherit only matching waits and retain independent nested resumption and cleanup', async () => {
  const f = fixture(),
    first = f.input(),
    second = f.input()
  await f.waits.begin(f.owner, first)
  await f.waits.begin(f.owner, second)
  const matching = f.control(),
    otherCall = f.control(),
    otherRun = f.control()
  const untrack = f.waits.track(f.execution, 'original-call', matching)
  f.waits.track(f.execution, 'different-call', otherCall)
  f.waits.track({ ...f.execution, runId: 'different-run' }, 'original-call', otherRun)
  expect(matching.depth).toBe(2)
  expect(otherCall.depth).toBe(0)
  expect(otherRun.depth).toBe(0)
  f.waits.end(f.owner, first)
  expect(matching.depth).toBe(1)
  untrack()
  untrack()
  expect(matching.depth).toBe(0)
  f.revoke()
  f.waits.end(f.owner, second)
  f.waits.exited(f.owner)
  expect(f.waits.snapshot()).toEqual({ waits: 0, active: 0, callbacks: 0 })
})

test('authenticated ownership, full wait identity and bounded admission protect the registry', async () => {
  const f = fixture(),
    input = f.input(),
    foreign = { ...f.owner, generation: 2 }
  expect(await failure(f.waits.begin(foreign, input))).toMatchObject({ code: 'EXECUTION_OWNER_MISMATCH' })
  expect(f.reads).toBe(0)
  await f.waits.begin(f.owner, input)
  const conflicting = { ...input, callId: 'different-call' }
  expect(await failure(f.waits.begin(f.owner, conflicting))).toMatchObject({ code: 'EXECUTION_WAIT_CONFLICT' })
  expect(() => f.waits.end(f.owner, conflicting)).toThrow('different decision')
  for (let index = 1; index < 64; index++) await f.waits.begin(f.owner, f.input())
  expect(await failure(f.waits.begin(f.owner, f.input()))).toMatchObject({ code: 'BUSY' })
  for (let index = 0; index < 64; index++) f.waits.track(f.execution, 'original-call', f.control())
  expect(() => f.waits.track(f.execution, 'original-call', f.control())).toThrow('capacity is full')
  f.waits.release(f.execution)
  expect(f.waits.snapshot().waits).toBe(0)
  f.waits.exited(f.owner)
  expect(f.waits.snapshot().callbacks).toBe(0)
})

test('client cleanup closes a confirmed wait after operation cancellation without releasing its callback', async () => {
  const f = fixture(),
    peers = pair(f.owner),
    deadline = f.control()
  const detach = f.waits.attachKernel(peers.host, f.owner)
  f.waits.track(f.execution, 'original-call', deadline)
  try {
    expect(() => f.waits.attachKernel(peers.host, { ...f.owner, generation: 2 })).toThrow('authenticated Kernel')
    const result = withRuntimeHumanWait(
      peers.unit,
      f.execution,
      'original-call',
      { kind: 'questionnaire', id: 'question', revision: 1 },
      async () => {
        expect(deadline.depth).toBe(1)
        throw new HbarError('USER_CANCELLED', 'Cancelled by user')
      },
    )
    expect(await failure(result)).toMatchObject({ code: 'USER_CANCELLED' })
    expect(deadline.depth).toBe(0)
    expect(f.waits.snapshot()).toEqual({ waits: 0, active: 0, callbacks: 1 })
  } finally {
    detach()
    peers.close()
  }
})

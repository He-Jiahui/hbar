import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage, isDurableSessionEvent } from '@hbar/storage'
import { executionOwnershipSchema, type ExecutionOwnership } from '@hbar/contracts/runtime'
import { SettingsService } from '@hbar/kernel'
import { userInputRequestSchema, type Run, type SessionEvent } from '@hbar/contracts'
import type { Session } from '@hbar/contracts/directory'
import { AUTONOMY_DECISION_MODE_SETTING, AUTONOMY_DECISION_TARGET_SETTING } from '@hbar/contracts/autonomy'
import type { DelegatedInputIdentity, DelegatedInputRecord } from '@hbar/contracts/delegated-user-input'
import { userInputSettlementSchema } from '@hbar/contracts/user-input-state'
import { removeOwnedTestDirectory } from './owned-temp-directory'
import { createDelegatedUserInputStorage } from '../packages/storage/src/delegated-user-input'
import { createUserInputStateStorage } from '../packages/storage/src/user-input-state'
import { delegatedSourceContextSchema } from '@hbar/contracts/delegated-context'

async function failure(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
  } catch (error) {
    return error
  }
  throw new Error('Expected delegated input rejection')
}
const question = {
  id: 'scope',
  header: 'Scope',
  question: 'Choose the task scope',
  purpose: 'decision' as const,
  options: [
    { label: 'App', description: 'Cover the app' },
    { label: 'API', description: 'Cover the API' },
  ],
}
const identity = (state: DelegatedInputIdentity) => ({ sessionId: state.sessionId, requestId: state.requestId })
const mutation = (state: DelegatedInputRecord) => ({
  ...identity(state),
  delegationId: state.delegationId,
  expectedRevision: state.revision,
})
const delegatedAnswer = (state: DelegatedInputRecord, label = 'API') =>
  userInputSettlementSchema.parse({
    kind: 'answered',
    response: { answers: { scope: { answers: [label] } } },
    automatic: {
      version: 1,
      source: 'delegate',
      request: state.request,
      policy: state.policy,
      response: { answers: { scope: { answers: [label] } } },
      delegation: {
        delegationId: state.delegationId,
        targetSessionId: state.targetSessionId,
        targetRunId: state.targetRunId,
        replyRevision: state.revision,
      },
    },
  })

async function fixture(managed = false) {
  const prefix = 'hbar-delegated-input-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const path = join(root, 'state.sqlite')
  let storage = new Storage(path)
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', root, 'Source')
  const remote = await storage.call('createWorkspace', join(root, 'other'), 'Target')
  const actor = {
    id: 'delegating-operator',
    name: 'Delegating operator',
    role: 'operator' as const,
    workspaceIds: null,
    createdAt: 1,
    lastSeenAt: 1,
  }
  await storage.call('putDevice', actor, 'fixture-token-hash')
  const sessions: Session[] = []
  const runs: Run[] = []
  const leases: ExecutionOwnership[] = []
  for (let index = 0; index < 3; index++) {
    const session = await storage.call('createSessionCommand', {
      workspaceId: index === 0 ? workspace.id : remote.id,
      actorId: actor.id,
      idempotencyKey: `session-${index}`,
    })
    sessions.push(session)
    const run = await storage.call(
      'enqueue',
      session.id,
      `run-${index}`,
      { text: 'Original task', images: [] },
      'fixture',
    )
    if (managed) {
      const lease = await storage.call(
        'runtimeExecutionClaim',
        executionOwnershipSchema.parse({
          leaseId: `decision-lease-${index}`,
          sessionId: session.id,
          runId: run.id,
          owner: { unitId: 'kernel', generation: 1, incarnation: 'decision-kernel' },
          fence: 1,
          acquiredAt: Date.now(),
          versions: {
            kernel: { unitId: 'kernel', generation: 1, artifactId: 'a'.repeat(64) },
            driver: { unitId: 'driver', generation: 1, artifactId: 'b'.repeat(64) },
            plugins: [],
            hooks: [],
          },
        }),
      )
      if (!lease) throw new Error('The fixture Run did not acquire its original lease')
      leases.push(lease)
    } else await storage.call('claim', session.id)
    runs.push(run)
  }
  async function policy(source: number, target: number, global = false) {
    const service = new SettingsService(storage)
    const scope = global ? { kind: 'global' as const } : { kind: 'session' as const, targetId: sessions[source]!.id }
    const snapshot = await service.get(scope)
    await service.apply({
      schemaVersion: snapshot.schemaVersion,
      scope,
      baselineRevisions: snapshot.revisions,
      actorId: actor.id,
      idempotencyKey: crypto.randomUUID(),
      changes: [
        { op: 'set', path: [{ kind: 'field', name: AUTONOMY_DECISION_MODE_SETTING }], value: 'delegate' },
        { op: 'set', path: [{ kind: 'field', name: AUTONOMY_DECISION_TARGET_SETTING }], value: sessions[target]!.id },
      ],
    })
    return service.decisionPolicy(sessions[source]!.id)
  }
  async function acceptQuestion(
    source = 0,
    target = 1,
    overrides: Record<string, unknown> = {},
    existingPolicy?: Awaited<ReturnType<typeof policy>>,
  ) {
    const captured = existingPolicy ?? (await policy(source, target))
    const request = userInputRequestSchema.parse({
      requestId: crypto.randomUUID(),
      sessionId: sessions[source]!.id,
      runId: runs[source]!.id,
      callId: crypto.randomUUID(),
      questions: [{ ...question, ...overrides }],
    })
    const accepted = managed
      ? await storage.callOwned(leases[source]!, 'userInputAccept', { request, policy: captured })
      : await storage.call('userInputAccept', { request, policy: captured })
    return {
      sessionId: request.sessionId,
      requestId: request.requestId,
      expectedQuestionRevision: accepted.state.revision,
      policy: captured,
    }
  }
  async function delivered() {
    const input = await acceptQuestion()
    const accepted = await storage.call('delegatedInputAccept', input)
    const bound = await storage.call('delegatedInputBind', {
      ...mutation(accepted.state),
      targetSessionId: sessions[1]!.id,
      targetRunId: runs[1]!.id,
      delivery: 'guidance',
    })
    return { input, state: bound.state }
  }
  const complete = (state: DelegatedInputRecord, label = 'API') =>
    storage.call('delegatedInputComplete', {
      ...mutation(state),
      targetSessionId: sessions[1]!.id,
      targetRunId: runs[1]!.id,
      targetCallId: 'target-decision-tool',
      reply: { kind: 'answered', response: { answers: { scope: { answers: [label] } } } },
    })
  return {
    get storage() {
      return storage
    },
    sessions,
    runs,
    leases,
    actor,
    workspace,
    remote,
    policy,
    acceptQuestion,
    delivered,
    complete,
    async restart() {
      await storage.close()
      storage = new Storage(path)
      await storage.call('ready')
    },
    async close() {
      await storage.close()
      await removeOwnedTestDirectory(root, prefix)
    },
  }
}

test('source context and bounded summary receipts survive a Worker restart without replacement on repeated admission', async () => {
  const f = await fixture()
  try {
    const input = await f.acceptQuestion()
    await f.storage.call('compact', input.sessionId, 1, 'Original source summary', 'fixture')
    const summary = await f.storage.call('contextSummaryExcerpt', input.sessionId)
    expect(summary).toMatchObject({ text: 'Original source summary', throughSeq: 1, truncated: false })
    const context = delegatedSourceContextSchema.parse({
      version: 1,
      sessionId: input.sessionId,
      runId: f.runs[0]!.id,
      capturedAt: Date.now(),
      sessionTitle: 'Source title',
      task: { text: 'Original source task', truncated: false },
      ...(summary ? { summary } : {}),
    })
    await failure(f.storage.call('delegatedInputAccept', { ...input, context: { ...context, runId: f.runs[1]!.id } }))
    expect(await f.storage.call('delegatedInputRead', identity(input))).toBeNull()
    const accepted = await f.storage.call('delegatedInputAccept', { ...input, context })
    expect(accepted.state.context).toEqual(context)
    expect(
      await failure(
        f.storage.call('delegatedInputAccept', {
          ...input,
          context: { ...context, task: { text: 'Changed after admission', truncated: false } },
        }),
      ),
    ).toMatchObject({ code: 'DECISION_CONFLICT' })
    await f.restart()
    const repeated = await f.storage.call('delegatedInputAccept', input)
    expect(repeated.state.context).toEqual(context)
    expect(repeated.state.expiresAt).toBe(accepted.state.expiresAt)
    expect(repeated.created).toBe(false)
  } finally {
    await f.close()
  }
})

test('delegations retain original questions, target binding, reply proof and five minute deadline across a real Worker restart', async () => {
  const f = await fixture()
  try {
    const input = await f.acceptQuestion()
    const accepted = await f.storage.call('delegatedInputAccept', input)
    expect(accepted.created).toBe(true)
    expect(accepted.events.every((event) => isDurableSessionEvent(event.type))).toBe(true)
    expect(accepted.state.expiresAt - accepted.state.createdAt).toBe(300_000)
    expect(accepted.state).toMatchObject({
      sourceActorId: f.actor.id,
      sourceRunId: f.runs[0]!.id,
      status: 'pending',
      targetRunId: null,
    })
    expect((await f.storage.call('delegatedInputAccept', input)).created).toBe(false)
    const bound = await f.storage.call('delegatedInputBind', {
      ...mutation(accepted.state),
      targetSessionId: f.sessions[1]!.id,
      targetRunId: f.runs[1]!.id,
      delivery: 'guidance',
    })
    await f.restart()
    expect(await f.storage.call('delegatedInputRead', identity(bound.state))).toEqual(bound.state)
    const inbox = await f.storage.call('delegatedInputInbox', {
      sessionId: f.sessions[1]!.id,
      runId: f.runs[1]!.id,
      limit: 1,
    })
    expect(inbox.items).toEqual([bound.state])
    const answer = await f.complete(bound.state)
    expect(answer.state).toMatchObject({
      status: 'answered',
      repliedBy: { runId: f.runs[1]!.id, actorId: f.actor.id, callId: 'target-decision-tool' },
    })
    expect((await f.storage.call('userInputRead', identity(bound.state)))?.settlement).toBeNull()
    expect(await failure(f.complete(bound.state))).toMatchObject({ code: 'DECISION_CONFLICT' })
    await f.restart()
    expect(await f.storage.call('delegatedInputRead', identity(answer.state))).toEqual(answer.state)
    expect((await f.storage.call('run', f.runs[1]!.id)).input.text).toBe('Original task')
    expect(
      await failure(f.storage.call('delegatedInputFinish', { ...mutation(answer.state), reason: 'source_resolved' })),
    ).toMatchObject({ code: 'DECISION_CONFLICT' })
    await f.storage.call('userInputCommit', {
      ...identity(answer.state),
      expectedRevision: 1,
      settlement: { kind: 'answered', response: { answers: { scope: { answers: ['API'] } } } },
    })
    expect(await f.storage.call('delegatedInputRead', identity(answer.state))).toMatchObject({
      status: 'closed',
      reason: 'source_resolved',
      revision: answer.state.revision + 1,
    })
  } finally {
    await f.close()
  }
})

test('an exact delegated receipt settles the source once, survives target completion and retains its origin after restart', async () => {
  const f = await fixture()
  try {
    const delivered = await f.delivered()
    const answered = await f.complete(delivered.state)
    await f.storage.call('setRun', f.runs[1]!.id, 'completed')
    await f.restart()
    const input = { ...identity(answered.state), expectedRevision: 1, settlement: delegatedAnswer(answered.state) }
    const accepted = await f.storage.call('userInputCommit', input)
    expect(accepted.accepted).toBe(true)
    expect(accepted.state.settlement).toEqual(input.settlement)
    expect(accepted.events[0]?.type).toMatch(/^user_input\.state\./)
    expect(
      accepted.events.findIndex((event) => /^decision\.delegation\.[a-f0-9]{64}$/.test(event.type)),
    ).toBeGreaterThan(0)
    expect(await f.storage.call('delegatedInputRead', identity(answered.state))).toMatchObject({
      status: 'closed',
      reason: 'source_resolved',
      repliedBy: answered.state.repliedBy,
    })
    expect((await f.storage.call('run', f.runs[1]!.id)).status).toBe('completed')
    await f.restart()
    const duplicate = await f.storage.call('userInputCommit', input)
    expect(duplicate.accepted).toBe(false)
    expect(duplicate.state).toEqual(accepted.state)
    expect(duplicate.events).toEqual([])
    const manual = await f.storage.call('userInputCommit', {
      ...input,
      settlement: { kind: 'answered', response: { answers: { scope: { answers: ['App'] } } } },
    })
    expect(manual.accepted).toBe(false)
    expect(manual.state.settlement).toEqual(input.settlement)
    expect(
      (await f.storage.call('events', f.sessions[0]!.id, 0, 256)).filter(
        (event) => event.type === 'user_input.autoDecided',
      ),
    ).toHaveLength(1)
  } finally {
    await f.close()
  }
})

test('live delivery enters an open target steering gate once and preserves its original task', async () => {
  const f = await fixture()
  try {
    const input = await f.acceptQuestion()
    const accepted = await f.storage.call('delegatedInputAccept', input)
    expect(
      await failure(f.storage.call('delegatedInputDeliver', { ...mutation(accepted.state), targetPermission: 'ask' })),
    ).toMatchObject({ code: 'DELEGATION_TARGET_BUSY' })
    expect(await f.storage.call('delegatedInputRead', identity(accepted.state))).toEqual(accepted.state)
    await f.storage.call('setRun', f.runs[1]!.id, 'running')
    await f.storage.call('openRunSteering', f.sessions[1]!.id, f.runs[1]!.id)
    const delivered = await f.storage.call('delegatedInputDeliver', {
      ...mutation(accepted.state),
      targetPermission: 'ask',
    })
    expect(delivered.state).toMatchObject({ delivery: 'guidance', status: 'delivered', targetRunId: f.runs[1]!.id })
    expect(delivered.events.at(-1)?.type).toBe('message.committed')
    const page = await f.storage.call('readRunSteering', {
      sessionId: f.sessions[1]!.id,
      runId: f.runs[1]!.id,
      afterSeq: 0,
    })
    expect(page.messages).toHaveLength(1)
    const block = page.messages[0]?.content[0]
    if (block?.type !== 'text') throw new Error('The decision envelope is missing')
    expect(block.text).toContain(accepted.state.delegationId)
    expect((await f.storage.call('run', f.runs[1]!.id)).input.text).toBe('Original task')
    expect(
      (await f.storage.call('delegatedInputDeliver', { ...mutation(delivered.state), targetPermission: 'ask' })).events,
    ).toEqual([])
    const empty = await f.storage.call('readRunSteering', {
      sessionId: f.sessions[1]!.id,
      runId: f.runs[1]!.id,
      afterSeq: page.nextSeq,
      closeWhenEmpty: true,
    })
    expect(empty.closed).toBe(true)
    const another = await f.storage.call('delegatedInputAccept', await f.acceptQuestion(0, 1, {}, input.policy))
    expect(
      await failure(f.storage.call('delegatedInputDeliver', { ...mutation(another.state), targetPermission: 'ask' })),
    ).toMatchObject({ code: 'DELEGATION_TARGET_BUSY' })
    expect((await f.storage.call('delegatedInputRead', identity(another.state)))?.status).toBe('pending')
  } finally {
    await f.close()
  }
})

test('idle delivery publishes one dedicated queue item after its grant without changing target task ownership', async () => {
  const f = await fixture()
  try {
    const targetActor = { ...f.actor, id: 'original-target-owner' }
    await f.storage.call('putDevice', targetActor, 'original-target-token')
    await f.storage.call('setRun', f.runs[1]!.id, 'completed')
    const target = await f.storage.call(
      'enqueue',
      f.sessions[1]!.id,
      'owned-target-task',
      { text: 'Target original task', images: [] },
      'fixture',
      {
        actorId: targetActor.id,
        idempotencyKey: 'owned-target-task',
        requestId: 'owned-target-task',
        inputHash: 'b'.repeat(64),
      },
    )
    await f.storage.call('claim', f.sessions[1]!.id)
    await f.storage.call('setRun', target.id, 'completed')
    const owner = await f.storage.call('sessionExecutionPrincipal', f.sessions[1]!.id)
    const accepted = await f.storage.call('delegatedInputAccept', await f.acceptQuestion())
    const delivered = await f.storage.call('delegatedInputDeliver', {
      ...mutation(accepted.state),
      targetPermission: 'ask',
    })
    expect(delivered.state).toMatchObject({ status: 'delivered', delivery: 'dedicated' })
    const queued = delivered.events.at(-1)
    expect(queued?.type).toBe('run.queued')
    expect(delivered.events.findIndex((event) => /^decision\.delegation\.[a-f0-9]{64}$/.test(event.type))).toBeLessThan(
      delivered.events.length - 1,
    )
    const run = await f.storage.call('run', delivered.state.targetRunId!)
    expect(run.input).toMatchObject({
      source: 'system',
      approval: 'deny',
      permissionAtAdmission: 'ask',
      delegatedDecision: { ...identity(accepted.state), delegationId: accepted.state.delegationId },
    })
    expect(await f.storage.call('runExecutionPrincipal', run.id)).toEqual(
      await f.storage.call('runExecutionPrincipal', f.runs[0]!.id),
    )
    expect(await f.storage.call('sessionExecutionPrincipal', f.sessions[1]!.id)).toEqual(owner)
    expect((await f.storage.call('run', target.id)).input.text).toBe('Target original task')
    expect(
      (await f.storage.call('delegatedInputDeliver', { ...mutation(delivered.state), targetPermission: 'ask' })).events,
    ).toEqual([])
    await f.restart()
    expect(await f.storage.call('sessionExecutionPrincipal', f.sessions[1]!.id)).toEqual(owner)
    expect(await f.storage.call('claim', f.sessions[1]!.id)).toMatchObject({ id: run.id })
    expect(
      await f.storage.call('delegatedInputAdmitRun', {
        ...identity(accepted.state),
        delegationId: accepted.state.delegationId,
        targetSessionId: run.sessionId,
        targetRunId: run.id,
      }),
    ).toEqual(delivered.state)
    expect(
      (await f.storage.call('delegatedInputDeliver', { ...mutation(delivered.state), targetPermission: 'ask' })).events,
    ).toEqual([])
    expect(
      await failure(f.storage.call('enqueue', run.sessionId, 'forged-decision', run.input, run.modelId)),
    ).toMatchObject({ code: 'FORBIDDEN' })
    await f.storage.call('delegatedInputFinish', { ...mutation(delivered.state), reason: 'cancelled' })
    expect(
      await failure(
        f.storage.call('delegatedInputAdmitRun', {
          ...identity(accepted.state),
          delegationId: accepted.state.delegationId,
          targetSessionId: run.sessionId,
          targetRunId: run.id,
        }),
      ),
    ).toMatchObject({ code: 'DELEGATION_RECEIPT_INVALID' })
  } finally {
    await f.close()
  }
})

test('forged receipt identity, revision, answer and a delivered-but-unanswered grant cannot settle a source', async () => {
  const f = await fixture()
  try {
    const delivered = await f.delivered()
    const commit = (state: DelegatedInputRecord, label = 'API') =>
      f.storage.call('userInputCommit', {
        ...identity(state),
        expectedRevision: 1,
        settlement: delegatedAnswer(state, label),
      })
    expect(await failure(commit(delivered.state))).toMatchObject({ code: 'DELEGATION_RECEIPT_INVALID' })
    const { state } = await f.complete(delivered.state)
    for (const changed of [
      { delegationId: 'forged-receipt' },
      { targetSessionId: f.sessions[2]!.id },
      { targetRunId: f.runs[2]!.id },
      { revision: state.revision + 1 },
    ])
      expect(await failure(commit({ ...state, ...changed }))).toMatchObject({ code: 'DELEGATION_RECEIPT_INVALID' })
    expect(await failure(commit(state, 'App'))).toMatchObject({ code: 'DELEGATION_RECEIPT_INVALID' })
    expect((await f.storage.call('userInputRead', identity(state)))?.settlement).toBeNull()
    expect(await f.storage.call('delegatedInputRead', identity(state))).toEqual(state)
  } finally {
    await f.close()
  }
})

test('manual takeover and source cancellation close a grant without claiming delegated answer provenance', async () => {
  for (const kind of ['answered', 'cancelled'] as const) {
    const f = await fixture()
    try {
      const { state } = await f.complete((await f.delivered()).state)
      const settlement =
        kind === 'answered'
          ? { kind, response: { answers: { scope: { answers: ['API'] } } } }
          : { kind, reason: 'user_stopped' }
      const manual = await f.storage.call('userInputCommit', {
        ...identity(state),
        expectedRevision: 1,
        settlement,
      })
      expect(manual.state.settlement).toEqual(settlement)
      expect(await f.storage.call('delegatedInputRead', identity(state))).toMatchObject({
        status: kind === 'answered' ? 'closed' : 'cancelled',
      })
      const late = await f.storage.call('userInputCommit', {
        ...identity(state),
        expectedRevision: 1,
        settlement: delegatedAnswer(state),
      })
      expect(late.accepted).toBe(false)
      expect(late.state.settlement).toEqual(settlement)
      expect((await f.storage.call('run', f.runs[1]!.id)).status).toBe('running')
      expect(
        (await f.storage.call('events', f.sessions[0]!.id, 0, 256)).some(
          (event) => event.type === 'user_input.autoDecided',
        ),
      ).toBe(false)
    } finally {
      await f.close()
    }
  }
})

test('a saved target answer is checked again against source policy, permission, cancellation and availability', async () => {
  for (const boundary of ['permission', 'cancel', 'policy', 'archived', 'timeout'] as const) {
    const f = await fixture()
    try {
      const input = await f.acceptQuestion()
      const accepted = await f.storage.call('delegatedInputAccept', {
        ...input,
        ...(boundary === 'timeout' ? { timeoutMs: 1_000 } : {}),
      })
      const bound = await f.storage.call('delegatedInputBind', {
        ...mutation(accepted.state),
        targetSessionId: f.sessions[1]!.id,
        targetRunId: f.runs[1]!.id,
        delivery: 'guidance',
      })
      const { state } = await f.complete(bound.state)
      if (boundary === 'permission') {
        await f.storage.call('revokeDevice', f.actor.id)
        await f.storage.call('putDevice', { ...f.actor, workspaceIds: [f.workspace.id] }, 'narrowed-token')
      } else if (boundary === 'cancel') await f.storage.call('setRun', f.runs[0]!.id, 'cancelled')
      else if (boundary === 'policy') await f.policy(0, 2)
      else if (boundary === 'archived') await f.storage.call('updateSession', f.sessions[1]!.id, { archived: true })
      else await Bun.sleep(Math.max(0, state.expiresAt - Date.now()) + 20)
      expect(
        await failure(
          f.storage.call('userInputCommit', {
            ...identity(state),
            expectedRevision: 1,
            settlement: delegatedAnswer(state),
          }),
        ),
      ).toMatchObject({
        code:
          boundary === 'permission'
            ? 'FORBIDDEN'
            : boundary === 'cancel'
              ? 'USER_INPUT_INACTIVE'
              : boundary === 'policy'
                ? 'DECISION_POLICY_CHANGED'
                : boundary === 'archived'
                  ? 'DELEGATION_TARGET_UNAVAILABLE'
                  : 'DELEGATION_EXPIRED',
      })
      expect((await f.storage.call('userInputRead', identity(state)))?.settlement).toBeNull()
      expect(await f.storage.call('delegatedInputRead', identity(state))).toEqual(state)
    } finally {
      await f.close()
    }
  }
})

test('managed delegation writes bind the source lease while target replies require the different original target lease', async () => {
  const f = await fixture(true)
  try {
    const source = f.leases[0]!,
      target = f.leases[1]!
    const input = await f.acceptQuestion()
    expect(await failure(f.storage.call('delegatedInputAccept', input))).toMatchObject({
      code: 'EXECUTION_AUTHORITY_REQUIRED',
    })
    expect(await failure(f.storage.callOwned(target, 'delegatedInputAccept', input))).toMatchObject({
      code: 'EXECUTION_OWNER_REVOKED',
    })
    const accepted = await f.storage.callOwned(source, 'delegatedInputAccept', input)
    const delivery = { ...mutation(accepted.state), targetPermission: 'ask' as const }
    expect(await failure(f.storage.call('delegatedInputDeliver', delivery))).toMatchObject({
      code: 'EXECUTION_AUTHORITY_REQUIRED',
    })
    expect(await failure(f.storage.callOwned(target, 'delegatedInputDeliver', delivery))).toMatchObject({
      code: 'EXECUTION_OWNER_REVOKED',
    })
    const binding = {
      ...mutation(accepted.state),
      targetSessionId: f.sessions[1]!.id,
      targetRunId: f.runs[1]!.id,
      delivery: 'guidance' as const,
    }
    expect(await failure(f.storage.callOwned(target, 'delegatedInputBind', binding))).toMatchObject({
      code: 'EXECUTION_OWNER_REVOKED',
    })
    const bound = await f.storage.callOwned(source, 'delegatedInputBind', binding)
    const reply = {
      ...mutation(bound.state),
      targetSessionId: f.sessions[1]!.id,
      targetRunId: f.runs[1]!.id,
      targetCallId: 'target-call',
      reply: { kind: 'answered' as const, response: { answers: { scope: { answers: ['API'] } } } },
    }
    expect(await failure(f.storage.call('delegatedInputComplete', reply))).toMatchObject({
      code: 'EXECUTION_AUTHORITY_REQUIRED',
    })
    expect(await failure(f.storage.callOwned(source, 'delegatedInputComplete', reply))).toMatchObject({
      code: 'EXECUTION_OWNER_REVOKED',
    })
    await f.storage.call('runtimeExecutionRevoke', target.owner, [target.runId])
    expect(await failure(f.storage.callOwned(target, 'delegatedInputComplete', reply))).toMatchObject({
      code: 'EXECUTION_OWNER_REVOKED',
    })
    expect((await f.storage.call('delegatedInputRead', identity(bound.state)))?.reply).toBeNull()
    expect(
      (await f.storage.callOwned(source, 'delegatedInputFinish', { ...mutation(bound.state), reason: 'cancelled' }))
        .state.status,
    ).toBe('cancelled')
    expect((await f.storage.call('run', f.runs[1]!.id)).status).toBe('running')
  } finally {
    await f.close()
  }
})

test('delegation admission refuses secrets, facts, self targets and bounded transitive waiting cycles without a partial record', async () => {
  const f = await fixture()
  try {
    const captured = await f.policy(0, 1)
    for (const item of [{ isSecret: true }, { purpose: 'fact' }, { purpose: 'authorization' }]) {
      const input = await f.acceptQuestion(0, 1, item, captured)
      expect(await failure(f.storage.call('delegatedInputAccept', input))).toMatchObject({
        code: 'DELEGATION_HUMAN_REQUIRED',
      })
      expect(await f.storage.call('delegatedInputRead', identity(input))).toBeNull()
    }
    const a = await f.storage.call('delegatedInputAccept', await f.acceptQuestion(0, 1))
    await f.storage.call('delegatedInputAccept', await f.acceptQuestion(1, 2))
    const cycle = await f.acceptQuestion(2, 0)
    expect(await failure(f.storage.call('delegatedInputAccept', cycle))).toMatchObject({ code: 'DELEGATION_CYCLE' })
    expect(await f.storage.call('delegatedInputRead', identity(cycle))).toBeNull()
    await f.storage.call('delegatedInputFinish', { ...mutation(a.state), reason: 'cancelled' })
    expect((await f.storage.call('delegatedInputAccept', cycle)).created).toBe(true)
  } finally {
    await f.close()
  }
  const self = await fixture()
  try {
    const policy = await self.policy(0, 0, true)
    const input = await self.acceptQuestion(0, 0, {}, policy)
    expect(await failure(self.storage.call('delegatedInputAccept', input))).toMatchObject({ code: 'DELEGATION_SELF' })
    expect(await self.storage.call('delegatedInputRead', identity(input))).toBeNull()
  } finally {
    await self.close()
  }
})

test('only the bound target Run can answer exact original options and manual decisions beat late delegated replies', async () => {
  const f = await fixture()
  try {
    const { state } = await f.delivered()
    expect(await failure(f.complete(state, 'Invented choice'))).toMatchObject({ code: 'USER_INPUT_INVALID' })
    expect(
      await failure(
        f.storage.call('delegatedInputComplete', {
          ...mutation(state),
          targetSessionId: f.sessions[1]!.id,
          targetRunId: f.runs[2]!.id,
          targetCallId: 'forged',
          reply: { kind: 'human', reason: 'target_declined' },
        }),
      ),
    ).toMatchObject({ code: 'DELEGATION_TARGET_UNAVAILABLE' })
    expect(await f.storage.call('delegatedInputRead', identity(state))).toEqual(state)
    await f.storage.call('userInputCommit', {
      ...identity(state),
      expectedRevision: 1,
      settlement: { kind: 'answered', response: { answers: { scope: { answers: ['App'] } } } },
    })
    expect(await failure(f.complete(state))).toMatchObject({ code: 'DECISION_CONFLICT' })
    expect(await f.storage.call('delegatedInputRead', identity(state))).toMatchObject({
      status: 'closed',
      reason: 'source_resolved',
    })
    expect((await f.storage.call('userInputRead', identity(state)))?.settlement).toMatchObject({
      kind: 'answered',
      response: { answers: { scope: { answers: ['App'] } } },
    })
  } finally {
    await f.close()
  }
})

test('cross-workspace authority is checked again after device narrowing, source cancellation and policy replacement', async () => {
  for (const boundary of ['permission', 'cancel', 'policy', 'archived'] as const) {
    const f = await fixture()
    try {
      const { state } = await f.delivered()
      if (boundary === 'permission') {
        await f.storage.call('revokeDevice', f.actor.id)
        await f.storage.call('putDevice', { ...f.actor, workspaceIds: [f.workspace.id] }, 'narrowed-token')
      } else if (boundary === 'cancel') await f.storage.call('setRun', f.runs[0]!.id, 'cancelled')
      else if (boundary === 'policy') await f.policy(0, 2)
      else await f.storage.call('updateSession', f.sessions[1]!.id, { archived: true })
      expect(await failure(f.complete(state))).toMatchObject({
        code:
          boundary === 'permission'
            ? 'FORBIDDEN'
            : boundary === 'cancel'
              ? 'USER_CANCELLED'
              : boundary === 'policy'
                ? 'DECISION_POLICY_CHANGED'
                : 'DELEGATION_TARGET_UNAVAILABLE',
      })
      expect((await f.storage.call('delegatedInputRead', identity(state)))?.reply).toBeNull()
    } finally {
      await f.close()
    }
  }
})

test('a deadline or explicit target refusal leads to human handling and never creates an automatic answer', async () => {
  const f = await fixture()
  try {
    const input = await f.acceptQuestion()
    const accepted = await f.storage.call('delegatedInputAccept', { ...input, timeoutMs: 1_000 })
    expect(await failure(f.storage.call('delegatedInputAccept', input))).toMatchObject({ code: 'DECISION_CONFLICT' })
    expect(
      await failure(f.storage.call('delegatedInputFinish', { ...mutation(accepted.state), reason: 'timeout' })),
    ).toMatchObject({ code: 'DECISION_CONFLICT' })
    await Bun.sleep(1_020)
    expect(
      await failure(
        f.storage.call('delegatedInputBind', {
          ...mutation(accepted.state),
          targetSessionId: f.sessions[1]!.id,
          targetRunId: f.runs[1]!.id,
          delivery: 'dedicated',
        }),
      ),
    ).toMatchObject({ code: 'DELEGATION_EXPIRED' })
    expect(
      (await f.storage.call('delegatedInputFinish', { ...mutation(accepted.state), reason: 'timeout' })).state,
    ).toMatchObject({ status: 'human', reason: 'timeout' })
    const { state } = await f.delivered()
    const reply = await f.storage.call('delegatedInputComplete', {
      ...mutation(state),
      targetSessionId: f.sessions[1]!.id,
      targetRunId: f.runs[1]!.id,
      targetCallId: 'target-call',
      reply: { kind: 'human', reason: 'missing_information' },
    })
    expect(reply.state).toMatchObject({ status: 'human', reply: { kind: 'human', reason: 'missing_information' } })
    expect((await f.storage.call('userInputRead', identity(state)))?.settlement).toBeNull()
    expect(
      (await f.storage.call('delegatedInputInbox', { sessionId: f.sessions[1]!.id, runId: f.runs[1]!.id })).items,
    ).toEqual([])
  } finally {
    await f.close()
  }
})

test('the target Run needs its own current authority for both workspaces and revoking it invalidates its answer', async () => {
  const f = await fixture()
  try {
    const input = await f.acceptQuestion()
    const accepted = await f.storage.call('delegatedInputAccept', input)
    const targetActor = { ...f.actor, id: 'target-operator', workspaceIds: [f.remote.id] }
    await f.storage.call('putDevice', targetActor, 'target-token')
    await f.storage.call('setRun', f.runs[1]!.id, 'completed')
    const target = await f.storage.call(
      'enqueue',
      f.sessions[1]!.id,
      'target-owned-run',
      { text: 'Preserve target task', images: [] },
      'fixture',
      {
        actorId: targetActor.id,
        idempotencyKey: 'target-owned-run',
        inputHash: 'a'.repeat(64),
        requestId: 'target-owned-run',
      },
    )
    await f.storage.call('claim', f.sessions[1]!.id)
    const binding = {
      ...mutation(accepted.state),
      targetSessionId: f.sessions[1]!.id,
      targetRunId: target.id,
      delivery: 'guidance' as const,
    }
    expect(await failure(f.storage.call('delegatedInputBind', binding))).toMatchObject({ code: 'FORBIDDEN' })
    expect(
      (await f.storage.call('delegatedInputInbox', { sessionId: f.sessions[1]!.id, runId: target.id })).items,
    ).toEqual([])
    await f.storage.call('revokeDevice', targetActor.id)
    await f.storage.call(
      'putDevice',
      { ...targetActor, workspaceIds: [f.remote.id, f.workspace.id] },
      'authorized-target-token',
    )
    const bound = await f.storage.call('delegatedInputBind', binding)
    await f.storage.call('revokeDevice', targetActor.id)
    expect(
      await failure(
        f.storage.call('delegatedInputComplete', {
          ...mutation(bound.state),
          targetSessionId: f.sessions[1]!.id,
          targetRunId: target.id,
          targetCallId: 'target-owned-call',
          reply: { kind: 'human', reason: 'target_declined' },
        }),
      ),
    ).toMatchObject({ code: 'FORBIDDEN' })
    await f.storage.call(
      'putDevice',
      { ...targetActor, workspaceIds: [f.remote.id, f.workspace.id] },
      'restored-target-token',
    )
    const answered = await f.storage.call('delegatedInputComplete', {
      ...mutation(bound.state),
      targetSessionId: f.sessions[1]!.id,
      targetRunId: target.id,
      targetCallId: 'target-owned-call',
      reply: { kind: 'answered', response: { answers: { scope: { answers: ['API'] } } } },
    })
    await f.storage.call('revokeDevice', targetActor.id)
    expect(
      await failure(
        f.storage.call('userInputCommit', {
          ...identity(answered.state),
          expectedRevision: 1,
          settlement: delegatedAnswer(answered.state),
        }),
      ),
    ).toMatchObject({ code: 'FORBIDDEN' })
    expect((await f.storage.call('userInputRead', identity(answered.state)))?.settlement).toBeNull()
    await f.storage.call('delegatedInputFinish', { ...mutation(answered.state), reason: 'cancelled' })
    expect((await f.storage.call('run', target.id)).status).toBe('running')
    expect((await f.storage.call('run', target.id)).input.text).toBe('Preserve target task')
  } finally {
    await f.close()
  }
})

test('source queues have a hard bound and target inbox pages keep an ordered stable cursor', async () => {
  const f = await fixture()
  try {
    const policy = await f.policy(0, 1)
    for (let index = 0; index < 64; index++)
      await f.storage.call('delegatedInputAccept', await f.acceptQuestion(0, 1, {}, policy))
    const overflow = await f.acceptQuestion(0, 1, {}, policy)
    expect(await failure(f.storage.call('delegatedInputAccept', overflow))).toMatchObject({
      code: 'DELEGATION_CAPACITY',
    })
    expect(await f.storage.call('delegatedInputRead', identity(overflow))).toBeNull()
    const seen = new Set<string>()
    let after: string | undefined
    do {
      const page = await f.storage.call('delegatedInputInbox', {
        sessionId: f.sessions[1]!.id,
        runId: f.runs[1]!.id,
        limit: 7,
        ...(after ? { after } : {}),
      })
      expect(page.items.length).toBeLessThanOrEqual(7)
      for (const item of page.items) {
        expect(seen.has(item.delegationId)).toBe(false)
        seen.add(item.delegationId)
      }
      after = page.nextCursor
    } while (after)
    expect(seen.size).toBe(64)
    expect(
      (
        await f.storage.call('delegatedInputInbox', {
          sessionId: f.sessions[1]!.id,
          runId: f.runs[1]!.id,
          deliveredOnly: true,
        })
      ).items,
    ).toEqual([])
  } finally {
    await f.close()
  }
})

test('an answered grant has no remaining target dependency when checking a reverse waiting cycle', async () => {
  const f = await fixture()
  try {
    const answered = await f.complete((await f.delivered()).state)
    expect((await f.storage.call('userInputRead', identity(answered.state)))?.settlement).toBeNull()
    const reverse = await f.storage.call('delegatedInputAccept', await f.acceptQuestion(1, 0))
    expect(reverse.state).toMatchObject({ status: 'pending', targetSessionId: f.sessions[0]!.id })
    expect(await f.storage.call('delegatedInputRead', identity(answered.state))).toEqual(answered.state)
  } finally {
    await f.close()
  }
})

test('replaying a partial multi-Session journal never publishes a missing edge or loses an older waiting edge', async () => {
  const f = await fixture()
  try {
    const a = await f.acceptQuestion(0, 1),
      b = await f.acceptQuestion(1, 0)
    const sourceQuestion = await f.storage.call('userInputRead', identity(a)),
      targetQuestion = await f.storage.call('userInputRead', identity(b))
    if (!sourceQuestion || !targetQuestion) throw new Error('Missing original question')
    const questions = new Map([
      [a.sessionId, sourceQuestion],
      [b.sessionId, targetQuestion],
    ])
    const runs = new Map(
      (await Promise.all(f.runs.map((run) => f.storage.call('run', run.id)))).map((run) => [run.id, run]),
    )
    for (const crash of ['before_state', 'after_state', 'before_close'] as const) {
      const database = new Database(':memory:')
      database.exec(
        'CREATE TABLE events(sessionId TEXT,type TEXT,data TEXT,seq INTEGER,runId TEXT); CREATE TABLE settings_layers(id TEXT PRIMARY KEY,revision INTEGER);',
      )
      for (const question of questions.values())
        for (const [id, revision] of Object.entries(question.policy.revisions))
          database.query('INSERT OR REPLACE INTO settings_layers VALUES(?,?)').run(id, revision)
      const journal: SessionEvent[] = []
      let injecting = crash !== 'before_close'
      const insert = (event: SessionEvent) =>
        database
          .query('INSERT INTO events VALUES(?,?,?,?,?)')
          .run(event.sessionId, event.type, JSON.stringify(event.data), event.seq, event.runId)
      const append = (sessionId: string, type: string, data: unknown, runId?: string): SessionEvent => {
        const primary = /^decision\.delegation\.[a-f0-9]{64}$/.test(type)
        if (injecting && primary && crash !== 'after_state')
          throw new Error('Simulated process loss before primary state')
        const seq =
          (database
            .query<{ last: number }, [string]>('SELECT COALESCE(MAX(seq),0) AS last FROM events WHERE sessionId=?')
            .get(sessionId)?.last ?? 0) + 1
        const event: SessionEvent = {
          eventId: crypto.randomUUID(),
          sessionId,
          type,
          data: structuredClone(data),
          seq,
          runId: runId ?? null,
          stepId: null,
          version: 1,
          time: Date.now(),
        }
        journal.push(event)
        insert(event)
        if (injecting && primary && crash === 'after_state')
          throw new Error('Simulated process loss after primary state')
        return event
      }
      const create = () =>
        createDelegatedUserInputStorage(database, append, {
          question: (input) => questions.get(input.sessionId) ?? null,
          run: (id) => {
            const run = runs.get(id)
            if (!run) throw new Error('Unknown fixture Run')
            return run
          },
          principal: (id) => {
            const run = runs.get(id)
            if (!run) return null
            return { version: 1, actorId: f.actor.id, originSessionId: run.sessionId, originRunId: id }
          },
          authorize: () => true,
          available: () => true,
          exists: () => true,
        })
      try {
        const service = create()
        if (crash === 'before_close') {
          const accepted = service.accept(a)
          injecting = true
          expect(() => service.finish({ ...mutation(accepted.state), reason: 'cancelled' })).toThrow('process loss')
        } else expect(() => service.accept(a)).toThrow('process loss')
        injecting = false
        database.exec('DELETE FROM events')
        for (const event of journal) insert(event)
        const replayed = create()
        const known = replayed.read(identity(a))
        if (crash === 'before_state') {
          expect(known).toBeNull()
          expect(replayed.inbox({ sessionId: f.sessions[1]!.id, runId: f.runs[1]!.id }).items).toEqual([])
          replayed.accept(a)
        } else expect(known?.status).toBe('pending')
        expect(() => replayed.accept(b)).toThrow('waiting cycle')
        expect(replayed.inbox({ sessionId: f.sessions[1]!.id, runId: f.runs[1]!.id }).items).toHaveLength(1)
      } finally {
        database.close()
      }
    }
  } finally {
    await f.close()
  }
})

test('replaying a crash around source consumption never closes a grant before its canonical answer is durable', async () => {
  const f = await fixture()
  try {
    const { state } = await f.complete((await f.delivered()).state)
    const initial = (
      await Promise.all(f.sessions.map((session) => f.storage.call('events', session.id, 0, 256)))
    ).flat()
    const runs = new Map(
      (await Promise.all(f.runs.map((run) => f.storage.call('run', run.id)))).map((run) => [run.id, run]),
    )
    for (const crash of ['before_answer', 'after_answer', 'before_close'] as const) {
      const database = new Database(':memory:')
      database.exec(
        'CREATE TABLE events(sessionId TEXT,type TEXT,data TEXT,seq INTEGER,runId TEXT); CREATE TABLE runs(id TEXT,sessionId TEXT,status TEXT); CREATE TABLE settings_layers(id TEXT PRIMARY KEY,revision INTEGER);',
      )
      for (const run of runs.values())
        database.query('INSERT INTO runs VALUES(?,?,?)').run(run.id, run.sessionId, run.status)
      for (const [id, revision] of Object.entries(state.policy.revisions))
        database.query('INSERT INTO settings_layers VALUES(?,?)').run(id, revision)
      const journal = structuredClone(initial)
      const insert = (event: SessionEvent) =>
        database
          .query('INSERT INTO events VALUES(?,?,?,?,?)')
          .run(event.sessionId, event.type, JSON.stringify(event.data), event.seq, event.runId)
      for (const event of initial) insert(event)
      let injecting = true
      const append = (sessionId: string, type: string, data: unknown, runId?: string): SessionEvent => {
        const answer = /^user_input\.state\.[a-f0-9]{64}$/.test(type)
        const close = /^decision\.delegation\.[a-f0-9]{64}$/.test(type)
        if (injecting && ((crash === 'before_answer' && answer) || (crash === 'before_close' && close)))
          throw new Error('Simulated process loss')
        const seq =
          (database
            .query<{ last: number }, [string]>('SELECT COALESCE(MAX(seq),0) AS last FROM events WHERE sessionId=?')
            .get(sessionId)?.last ?? 0) + 1
        const event: SessionEvent = {
          eventId: crypto.randomUUID(),
          sessionId,
          type,
          data: structuredClone(data),
          seq,
          runId: runId ?? null,
          stepId: null,
          version: 1,
          time: Date.now(),
        }
        journal.push(event)
        insert(event)
        if (injecting && crash === 'after_answer' && answer) throw new Error('Simulated process loss')
        return event
      }
      const source: ReturnType<typeof createUserInputStateStorage> = createUserInputStateStorage(database, append, {
        prepareDelegatedSettlement: (question, settlement) => delegated.prepareSettlement(question, settlement),
      })
      const delegated = createDelegatedUserInputStorage(database, append, {
        question: source.read,
        run: (id) => {
          const run = runs.get(id)
          if (!run) throw new Error('Unknown fixture Run')
          return run
        },
        principal: (id) => {
          const run = runs.get(id)
          return run ? { version: 1, actorId: f.actor.id, originSessionId: run.sessionId, originRunId: id } : null
        },
        authorize: () => true,
        available: () => true,
        exists: () => true,
      })
      try {
        const input = { ...identity(state), expectedRevision: 1, settlement: delegatedAnswer(state) }
        expect(() => source.commit(input)).toThrow('process loss')
        injecting = false
        database.exec('DELETE FROM events')
        for (const event of journal) insert(event)
        const replayed = source.read(identity(state))
        expect(replayed?.settlement === null).toBe(crash === 'before_answer')
        expect(delegated.read(identity(state))?.status).toBe('answered')
        const retried = source.commit(input)
        expect(retried.accepted).toBe(crash === 'before_answer')
        expect(retried.state.settlement).toEqual(input.settlement)
        const grant = delegated.read(identity(state))
        if (!grant) throw new Error('Missing replayed grant')
        delegated.finish({ ...mutation(grant), reason: 'source_resolved' })
        expect(delegated.read(identity(state))?.status).toBe('closed')
        expect(source.read(identity(state))?.settlement).toEqual(input.settlement)
        expect(journal.filter((event) => /^user_input\.state\./.test(event.type))).toHaveLength(2)
      } finally {
        database.close()
      }
    }
  } finally {
    await f.close()
  }
})

test('delivery journal replay always retains the source grant before any target message and never blindly redelivers', async () => {
  const f = await fixture()
  try {
    const input = await f.acceptQuestion()
    const question = await f.storage.call('userInputRead', identity(input))
    if (!question) throw new Error('Missing source question')
    const runs = new Map(
      (await Promise.all(f.runs.map((run) => f.storage.call('run', run.id)))).map((run) => [run.id, run]),
    )
    for (const crash of ['before_message', 'after_message'] as const) {
      const database = new Database(':memory:')
      database.exec(
        'CREATE TABLE events(sessionId TEXT,type TEXT,data TEXT,seq INTEGER,runId TEXT); CREATE TABLE settings_layers(id TEXT PRIMARY KEY,revision INTEGER);',
      )
      for (const [id, revision] of Object.entries(input.policy.revisions))
        database.query('INSERT INTO settings_layers VALUES(?,?)').run(id, revision)
      const journal: SessionEvent[] = []
      const insert = (event: SessionEvent) =>
        database
          .query('INSERT INTO events VALUES(?,?,?,?,?)')
          .run(event.sessionId, event.type, JSON.stringify(event.data), event.seq, event.runId)
      const append = (sessionId: string, type: string, data: unknown, runId?: string): SessionEvent => {
        if (type === 'message.committed' && crash === 'before_message') throw new Error('Simulated delivery loss')
        const event: SessionEvent = {
          eventId: crypto.randomUUID(),
          sessionId,
          type,
          data: structuredClone(data),
          seq: journal.length + 1,
          runId: runId ?? null,
          stepId: null,
          version: 1,
          time: Date.now(),
        }
        journal.push(event)
        insert(event)
        if (type === 'message.committed' && crash === 'after_message') throw new Error('Simulated delivery loss')
        return event
      }
      const service = createDelegatedUserInputStorage(database, append, {
        question: () => question,
        run: (id) => {
          const run = runs.get(id)
          if (!run) throw new Error('Unknown Run')
          return run
        },
        principal: (id) => ({
          version: 1,
          actorId: f.actor.id,
          originSessionId: runs.get(id)!.sessionId,
          originRunId: id,
        }),
        authorize: () => true,
        available: () => true,
        exists: () => true,
        delivery: {
          plan: () => ({
            kind: 'guidance',
            targetRunId: f.runs[1]!.id,
            publish: () => [
              append(f.sessions[1]!.id, 'message.committed', { delegationId: input.requestId }, f.runs[1]!.id),
            ],
          }),
        },
      })
      try {
        const accepted = service.accept(input)
        expect(() => service.deliver({ ...mutation(accepted.state), targetPermission: 'ask' })).toThrow('delivery loss')
        database.exec('DELETE FROM events')
        for (const event of journal) insert(event)
        const known = service.read(identity(input))
        expect(known).toMatchObject({ status: 'delivered', targetRunId: f.runs[1]!.id })
        if (!known) throw new Error('Missing replayed delivery')
        expect(service.deliver({ ...mutation(known), targetPermission: 'ask' }).events).toEqual([])
        const messageIndex = journal.findIndex((event) => event.type === 'message.committed')
        if (crash === 'before_message') expect(messageIndex).toBe(-1)
        else
          expect(
            journal.findIndex(
              (event) =>
                /^decision\.delegation\.[a-f0-9]{64}$/.test(event.type) &&
                typeof event.data === 'object' &&
                event.data !== null &&
                'status' in event.data &&
                event.data.status === 'delivered',
            ),
          ).toBeLessThan(messageIndex)
      } finally {
        database.close()
      }
    }
  } finally {
    await f.close()
  }
})

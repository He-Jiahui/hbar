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
import { removeOwnedTestDirectory } from './owned-temp-directory'
import { createDelegatedUserInputStorage } from '../packages/storage/src/delegated-user-input'

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
    expect(
      (await f.storage.call('delegatedInputFinish', { ...mutation(answer.state), reason: 'source_resolved' })).state
        .status,
    ).toBe('closed')
  } finally {
    await f.close()
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
    expect(
      (await f.storage.call('delegatedInputFinish', { ...mutation(state), reason: 'manual_takeover' })).state,
    ).toMatchObject({ status: 'human', reason: 'manual_takeover' })
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
    await f.storage.call('delegatedInputFinish', { ...mutation(bound.state), reason: 'cancelled' })
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

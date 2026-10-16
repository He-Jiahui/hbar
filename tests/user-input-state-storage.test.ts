import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarError, userInputRequestSchema, type SessionEvent } from '@hbar/contracts'
import { autonomyPolicyResolutionSchema } from '@hbar/contracts/autonomy'
import { executionOwnershipSchema } from '@hbar/contracts/runtime'
import { userInputSettlementSchema } from '@hbar/contracts/user-input-state'
import { Storage, isDurableSessionEvent } from '@hbar/storage'
import { createUserInputStateStorage } from '../packages/storage/src/user-input-state'
import { removeOwnedTestDirectory } from './owned-temp-directory'

async function failure(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
  } catch (error) {
    return error
  }
  throw new Error('Expected a decision rejection')
}
async function fixture(managed = false) {
  const prefix = 'hbar-user-input-state-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const path = join(root, 'state.sqlite')
  let storage = new Storage(path)
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', root, 'Decision fixture')
  const session = await storage.call('createSessionCommand', {
    workspaceId: workspace.id,
    actorId: 'decision-actor',
    idempotencyKey: 'source',
  })
  const run = await storage.call('enqueue', session.id, 'source', { text: 'Choose a scope', images: [] }, 'fixture')
  const lease = managed
    ? await storage.call(
        'runtimeExecutionClaim',
        executionOwnershipSchema.parse({
          leaseId: 'question-lease',
          sessionId: session.id,
          runId: run.id,
          owner: { unitId: 'kernel', generation: 1, incarnation: 'question-kernel' },
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
    : null
  if (!managed) await storage.call('claim', session.id)
  const request = userInputRequestSchema.parse({
    requestId: 'question',
    sessionId: session.id,
    runId: run.id,
    callId: 'question-call',
    questions: [
      {
        id: 'scope',
        header: 'Scope',
        question: 'Which scope?',
        purpose: 'decision',
        options: [
          { label: 'App', description: 'Application', recommended: true },
          { label: 'API', description: 'Service' },
        ],
      },
    ],
  })
  const policy = autonomyPolicyResolutionSchema.parse({
    sessionId: session.id,
    policy: { mode: 'recommended' },
    source: 'default',
    revisions: {},
  })
  const manual = userInputSettlementSchema.parse({
    kind: 'answered',
    response: { answers: { scope: { answers: ['API'] } } },
  })
  const automatic = userInputSettlementSchema.parse({
    kind: 'answered',
    response: { answers: { scope: { answers: ['App'] } } },
    automatic: {
      version: 1,
      source: 'recommended',
      request,
      policy,
      response: { answers: { scope: { answers: ['App'] } } },
    },
  })
  return {
    get storage() {
      return storage
    },
    path,
    lease,
    request,
    policy,
    manual,
    automatic,
    identity: { sessionId: session.id, requestId: request.requestId },
    async reopen() {
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

test('the real Worker keeps one durable answer across concurrent manual/automatic submissions, lost retries and reopening', async () => {
  const f = await fixture()
  try {
    const accepted = await f.storage.call('userInputAccept', { request: f.request, policy: f.policy })
    expect(accepted.created).toBe(true)
    expect(accepted.events).toHaveLength(2)
    expect(accepted.events.every((event) => isDurableSessionEvent(event.type))).toBe(true)
    expect((await f.storage.call('userInputAccept', { request: f.request, policy: f.policy })).created).toBe(false)
    const competing = await Promise.all(
      [f.manual, f.automatic].map((settlement) =>
        f.storage.call('userInputCommit', { ...f.identity, expectedRevision: 1, settlement }),
      ),
    )
    expect(competing.filter((result) => result.accepted)).toHaveLength(1)
    expect(
      competing.every(
        (result) =>
          result.state.settlement?.kind === 'answered' &&
          result.state.settlement.response.answers.scope?.answers[0] === 'API',
      ),
    ).toBe(true)
    expect(
      (await f.storage.call('events', f.identity.sessionId, 0, 100)).filter(
        (event) => event.type === 'user_input.resolved',
      ),
    ).toHaveLength(1)
    await f.reopen()
    expect((await f.storage.call('userInputRead', f.identity))?.settlement).toEqual(f.manual)
    expect(
      (await f.storage.call('userInputCommit', { ...f.identity, expectedRevision: 1, settlement: f.automatic }))
        .accepted,
    ).toBe(false)
    expect(
      await failure(
        f.storage.call('userInputAccept', { request: { ...f.request, callId: 'other-call' }, policy: f.policy }),
      ),
    ).toMatchObject({ code: 'USER_INPUT_EXISTS' })
    const db = new Database(f.path, { readonly: true })
    try {
      const plan = db
        .query<{ detail: string }, [string, string]>(
          'EXPLAIN QUERY PLAN SELECT data,runId FROM events WHERE sessionId=? AND type=? ORDER BY seq DESC LIMIT 1',
        )
        .all(f.identity.sessionId, 'user_input.state.test')
      expect(plan.some((row) => row.detail.includes('events_session_type_seq'))).toBe(true)
    } finally {
      db.close()
    }
  } finally {
    await f.close()
  }
})

test('managed question writes require the exact source lease and reject cross-Run or revoked authority', async () => {
  const f = await fixture(true)
  try {
    const lease = f.lease
    if (!lease) throw new Error('Expected managed source lease')
    expect(await failure(f.storage.call('userInputAccept', { request: f.request, policy: f.policy }))).toMatchObject({
      code: 'EXECUTION_AUTHORITY_REQUIRED',
    })
    await f.storage.callOwned(lease, 'userInputAccept', { request: f.request, policy: f.policy })
    const source = await f.storage.call('session', f.identity.sessionId)
    const other = await f.storage.call('createSession', source.workspaceId)
    const run = await f.storage.call('enqueue', other.id, 'foreign', { text: 'Other task', images: [] }, 'fixture')
    await f.storage.call('claim', other.id)
    const request = { ...f.request, sessionId: other.id, runId: run.id }
    const policy = { ...f.policy, sessionId: other.id }
    expect(await failure(f.storage.callOwned(lease, 'userInputAccept', { request, policy }))).toMatchObject({
      code: 'EXECUTION_OWNER_REVOKED',
    })
    await f.storage.call('userInputAccept', { request, policy })
    expect(
      await failure(
        f.storage.callOwned(lease, 'userInputCommit', {
          sessionId: other.id,
          requestId: request.requestId,
          expectedRevision: 1,
          settlement: f.manual,
        }),
      ),
    ).toMatchObject({ code: 'EXECUTION_OWNER_REVOKED' })
    await f.storage.call('runtimeExecutionRevoke', lease.owner, [lease.runId])
    expect(
      await failure(
        f.storage.callOwned(lease, 'userInputCommit', { ...f.identity, expectedRevision: 1, settlement: f.manual }),
      ),
    ).toMatchObject({ code: 'EXECUTION_OWNER_REVOKED' })
    expect((await f.storage.call('userInputRead', f.identity))?.revision).toBe(1)
  } finally {
    await f.close()
  }
})

test('canonical policy revisions, source cancellation and automatic answer evidence are checked before committing', async () => {
  const f = await fixture()
  try {
    const policy = { ...f.policy, revisions: { 'settings:global': 1 } }
    const automatic =
      f.automatic.kind === 'answered' && f.automatic.automatic
        ? { ...f.automatic, automatic: { ...f.automatic.automatic, policy } }
        : f.automatic
    await f.storage.call('userInputAccept', { request: f.request, policy })
    expect(
      await failure(f.storage.call('userInputCommit', { ...f.identity, expectedRevision: 1, settlement: automatic })),
    ).toMatchObject({ code: 'DECISION_POLICY_CHANGED' })
    const invalid = userInputSettlementSchema.parse({
      kind: 'answered',
      response: { answers: { scope: { answers: ['invented'] } } },
      automatic: {
        version: 1,
        source: 'recommended',
        request: f.request,
        policy,
        response: { answers: { scope: { answers: ['invented'] } } },
      },
    })
    expect(
      await failure(f.storage.call('userInputCommit', { ...f.identity, expectedRevision: 1, settlement: invalid })),
    ).toMatchObject({ code: 'USER_INPUT_INVALID' })
    expect((await f.storage.call('userInputRead', f.identity))?.settlement).toBeNull()
    await f.storage.call('requestCancel', f.request.runId)
    expect(
      await failure(f.storage.call('userInputCommit', { ...f.identity, expectedRevision: 1, settlement: f.manual })),
    ).toMatchObject({ code: 'USER_CANCELLED' })
    const cancelled = await f.storage.call('userInputCommit', {
      ...f.identity,
      expectedRevision: 1,
      settlement: { kind: 'cancelled', reason: 'USER_CANCELLED' },
    })
    expect(cancelled.accepted).toBe(true)
    expect(cancelled.state.settlement?.kind).toBe('cancelled')
  } finally {
    await f.close()
  }
})

test('bounded question commits report real Worker persistence latency without model or UI time', async () => {
  const f = await fixture()
  try {
    const samples: number[] = []
    for (let index = 0; index < 24; index++) {
      const request = { ...f.request, requestId: `measured-${index}` }
      const started = performance.now()
      await f.storage.call('userInputAccept', { request, policy: f.policy })
      const result = await f.storage.call('userInputCommit', {
        sessionId: request.sessionId,
        requestId: request.requestId,
        expectedRevision: 1,
        settlement: f.manual,
      })
      expect(result.accepted).toBe(true)
      samples.push(performance.now() - started)
    }
    samples.sort((left, right) => left - right)
    console.log(
      JSON.stringify({
        event: 'durable-question-latency',
        samples: samples.length,
        p95Ms: samples[Math.ceil(samples.length * 0.95) - 1],
        maxMs: samples.at(-1),
      }),
    )
  } finally {
    await f.close()
  }
})

test('answer state and its compatibility audit roll back together when the append operation fails', () => {
  const db = new Database(':memory:')
  db.exec(
    'CREATE TABLE events(sessionId TEXT,runId TEXT,type TEXT,data TEXT,seq INTEGER); CREATE INDEX events_session_type_seq ON events(sessionId,type,seq); CREATE TABLE runs(id TEXT,sessionId TEXT,status TEXT); CREATE TABLE settings_layers(id TEXT,revision INTEGER);',
  )
  db.query('INSERT INTO runs VALUES(?,?,?)').run('run', 'session', 'running')
  let fault = false
  const append = (sessionId: string, type: string, data: unknown, runId?: string): SessionEvent => {
    if (fault && type === 'user_input.autoDecided') throw new HbarError('AUDIT_FAILED', 'Injected audit append failure')
    const seq = (db.query<{ count: number }, []>('SELECT count(*) AS count FROM events').get()?.count ?? 0) + 1
    db.query('INSERT INTO events VALUES(?,?,?,?,?)').run(sessionId, runId ?? null, type, JSON.stringify(data), seq)
    return {
      version: 1,
      eventId: crypto.randomUUID(),
      sessionId,
      runId: runId ?? null,
      stepId: null,
      type,
      data,
      seq,
      time: 1,
    }
  }
  try {
    const state = createUserInputStateStorage(db, append)
    const request = userInputRequestSchema.parse({
      requestId: 'question',
      sessionId: 'session',
      runId: 'run',
      callId: 'call',
      questions: [
        {
          id: 'choice',
          header: 'Pick',
          question: 'Pick',
          purpose: 'decision',
          options: [{ label: 'A', description: 'A', recommended: true }],
        },
      ],
    })
    const policy = autonomyPolicyResolutionSchema.parse({
      sessionId: 'session',
      policy: { mode: 'recommended' },
      source: 'default',
      revisions: {},
    })
    state.accept({ request, policy })
    fault = true
    const response = { answers: { choice: { answers: ['A'] } } }
    expect(() =>
      state.commit({
        sessionId: 'session',
        requestId: 'question',
        expectedRevision: 1,
        settlement: {
          kind: 'answered',
          response,
          automatic: { version: 1, source: 'recommended', request, policy, response },
        },
      }),
    ).toThrow('Injected audit append failure')
    expect(state.read({ sessionId: 'session', requestId: 'question' })).toMatchObject({ revision: 1, settlement: null })
    expect(db.query<{ count: number }, []>('SELECT count(*) AS count FROM events').get()?.count).toBe(2)
  } finally {
    db.close()
  }
})

import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { UserInput } from '@hbar/contracts'
import { Storage } from '@hbar/storage'

const resources: { root: string; store: Storage }[] = []

afterEach(async () => {
  const tempParent = await realpath(tmpdir())
  for (const { root, store } of resources.splice(0)) {
    await store.close()
    const resolvedRoot = await realpath(root)
    if (dirname(resolvedRoot) !== tempParent || !basename(resolvedRoot).startsWith('hbar-queued-run-guide-'))
      throw new Error(`Refusing to remove an unowned test root: ${resolvedRoot}`)
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-queued-run-guide-'))
  const store = new Storage(join(root, 'data.sqlite'))
  resources.push({ root, store })
  await store.call('ready')
  const workspace = await store.call('createWorkspace', root, 'test')
  const session = await store.call('createSession', workspace.id)
  return { root, store, workspace, session }
}

const input = (text: string, overrides: Partial<UserInput> = {}): UserInput => ({
  text,
  images: [],
  files: [],
  thinking: 'high' as const,
  approval: 'ask' as const,
  mode: 'default' as const,
  source: 'user' as const,
  ...overrides,
})

async function expectCode(operation: Promise<unknown>, ...codes: string[]) {
  try {
    await operation
    throw new Error(`Expected one of ${codes.join(', ')}`)
  } catch (error) {
    const code = (error as { code?: unknown }).code
    if (typeof code !== 'string') throw error
    expect(codes).toContain(code)
  }
}

async function activeAndQueued(store: Storage, sessionId: string, queuedInput = input('queued')) {
  const active = await store.call('enqueue', sessionId, 'active-request', input('active'), 'test-model')
  const queued = await store.call('enqueue', sessionId, 'queued-request', queuedInput, 'test-model')
  const claimed = await store.call('claim', sessionId)
  expect(claimed?.id).toBe(active.id)
  await store.call('setRun', active.id, 'running')
  await store.call('openRunSteering', sessionId, active.id)
  const editable = await store.call('queuedRunEditable', { sessionId, operationId: queued.id })
  return { active, queued, revision: editable.revision }
}

function guideRequest(sessionId: string, operationId: string, activeRunId: string, expectedRevision: number) {
  return { sessionId, operationId, activeRunId, expectedRevision }
}

test('a claimed SQLite projection cannot open guidance before the durable running boundary', async () => {
  const { store, session } = await fixture()
  const active = await store.call('enqueue', session.id, 'active-boundary', input('active'), 'test-model')
  expect((await store.call('claim', session.id))?.id).toBe(active.id)
  await expectCode(store.call('openRunSteering', session.id, active.id), 'COMMAND_CONFLICT')
  await store.call('setRun', active.id, 'running')
  await store.call('openRunSteering', session.id, active.id)
  expect((await store.call('readRunSteering', { sessionId: session.id, runId: active.id, afterSeq: 0 })).closed).toBe(
    false,
  )
})

test('guides exactly one queued user Run, projects one canonical message, and replays by receipt', async () => {
  const { store, session } = await fixture()
  const { active, queued, revision } = await activeAndQueued(store, session.id)
  const request = guideRequest(session.id, queued.id, active.id, revision)
  const mutation = { actorId: 'device-one', idempotencyKey: 'guide-one', request }
  const before = (await store.call('session', session.id)).seq

  const first = await store.call('guideQueuedRun', mutation)
  expect(first.event.type).toBe('message.committed')
  expect(first.event.seq).toBe(before + 1)
  expect(first.receipt).toMatchObject({
    commandId: 'queuedRun.guide',
    status: 'accepted',
    operationStatus: 'guided',
    sessionId: session.id,
    operationId: queued.id,
    activeRunId: active.id,
    revision: first.event.seq,
    sessionSeq: first.event.seq,
    queueRevision: revision,
  })
  expect(first.message).toMatchObject({
    id: first.receipt.messageId,
    sessionId: session.id,
    runId: active.id,
    role: 'user',
    seq: first.event.seq,
    content: [{ type: 'text', text: 'queued' }],
  })
  expect((await store.call('run', queued.id)).status).toBe('guided')
  expect((await store.call('run', active.id)).status).toBe('running')
  expect((await store.call('queuedUserRuns', { sessionId: session.id })).items).toHaveLength(0)

  const replay = await store.call('guideQueuedRun', mutation)
  expect(replay).toEqual(first)
  expect(await store.call('queuedRunGuideReceipt', 'device-one', 'guide-one', session.id)).toEqual(first.receipt)
  expect((await store.call('session', session.id)).seq).toBe(first.event.seq)
  expect(
    (await store.call('events', session.id, before)).filter((event) => event.type === 'message.committed'),
  ).toHaveLength(1)
})

test('reader returns bounded canonical steering messages and atomically seals an empty gate', async () => {
  const { store, session } = await fixture()
  const { active, queued, revision } = await activeAndQueued(store, session.id)
  const firstMutation = {
    actorId: 'device-one',
    idempotencyKey: 'guide-first',
    request: guideRequest(session.id, queued.id, active.id, revision),
  }
  const first = await store.call('guideQueuedRun', firstMutation)

  await expectCode(
    store.call('readRunSteering', {
      sessionId: session.id,
      runId: active.id,
      afterSeq: first.event.seq,
      closeWhenEmpty: true,
    }),
    'COMMAND_CONFLICT',
  )
  const delivered = await store.call('readRunSteering', {
    sessionId: session.id,
    runId: active.id,
    afterSeq: 0,
  })
  expect(delivered.closed).toBe(false)
  expect(delivered.messages).toHaveLength(1)
  expect(delivered.messages[0]).toMatchObject({ id: first.receipt.messageId, seq: first.event.seq, role: 'user' })
  expect(delivered.nextSeq).toBe(first.event.seq)

  const noNewMessages = await store.call('readRunSteering', {
    sessionId: session.id,
    runId: active.id,
    afterSeq: delivered.nextSeq,
  })
  expect(noNewMessages).toMatchObject({ messages: [], nextSeq: delivered.nextSeq, closed: false })
  const sealed = await store.call('readRunSteering', {
    sessionId: session.id,
    runId: active.id,
    afterSeq: delivered.nextSeq,
    closeWhenEmpty: true,
  })
  expect(sealed).toMatchObject({ messages: [], nextSeq: delivered.nextSeq, closed: true })

  const second = await store.call('enqueue', session.id, 'queued-second', input('second'), 'test-model')
  const secondRevision = (await store.call('queuedRunEditable', { sessionId: session.id, operationId: second.id }))
    .revision
  await expectCode(
    store.call('guideQueuedRun', {
      actorId: 'device-one',
      idempotencyKey: 'guide-after-close',
      request: guideRequest(session.id, second.id, active.id, secondRevision),
    }),
    'COMMAND_CONFLICT',
  )
})

test('unread steering admission is capped at twenty and acknowledging messages releases capacity', async () => {
  const { store, session } = await fixture()
  const active = await store.call('enqueue', session.id, 'active-request', input('active'), 'test-model')
  const queuedRuns = []
  for (let index = 0; index < 21; index++)
    queuedRuns.push(await store.call('enqueue', session.id, `queued-${index}`, input(`queued-${index}`), 'test-model'))
  expect((await store.call('claim', session.id))?.id).toBe(active.id)
  await store.call('setRun', active.id, 'running')
  await store.call('openRunSteering', session.id, active.id)

  const guided = []
  for (let index = 0; index < 20; index++) {
    const queued = queuedRuns[index]!
    const revision = (await store.call('queuedRunEditable', { sessionId: session.id, operationId: queued.id })).revision
    guided.push(
      await store.call('guideQueuedRun', {
        actorId: 'device-one',
        idempotencyKey: `guide-${index}`,
        request: guideRequest(session.id, queued.id, active.id, revision),
      }),
    )
  }
  expect(guided).toHaveLength(20)
  const overLimit = queuedRuns[20]!
  const overLimitRevision = (
    await store.call('queuedRunEditable', { sessionId: session.id, operationId: overLimit.id })
  ).revision
  await expectCode(
    store.call('guideQueuedRun', {
      actorId: 'device-one',
      idempotencyKey: 'guide-over-limit',
      request: guideRequest(session.id, overLimit.id, active.id, overLimitRevision),
    }),
    'BUSY',
    'COMMAND_CONFLICT',
  )

  const read = await store.call('readRunSteering', { sessionId: session.id, runId: active.id, afterSeq: 0 })
  expect(read.messages).toHaveLength(20)
  const nextRevision = (await store.call('queuedRunEditable', { sessionId: session.id, operationId: overLimit.id }))
    .revision
  const acceptedAfterAck = await store.call('guideQueuedRun', {
    actorId: 'device-one',
    idempotencyKey: 'guide-after-ack',
    request: guideRequest(session.id, overLimit.id, active.id, nextRevision),
  })
  expect(acceptedAfterAck.receipt.operationId).toBe(overLimit.id)
})

test('restart rebuilds the orphaned guide event, message projection, guided status, and receipt', async () => {
  const resource = await fixture()
  const { root, session } = resource
  const { store, active, queued, revision } = {
    store: resource.store,
    ...(await activeAndQueued(resource.store, session.id)),
  }
  const mutation = {
    actorId: 'device-recovery',
    idempotencyKey: 'guide-recovery',
    request: guideRequest(session.id, queued.id, active.id, revision),
  }
  const first = await store.call('guideQueuedRun', mutation)
  await store.close()
  resources.splice(
    resources.findIndex((item) => item.store === store),
    1,
  )

  const db = new Database(join(root, 'data.sqlite'))
  try {
    db.transaction(() => {
      db.query('DELETE FROM entity_command_receipts WHERE actorId=? AND idempotencyKey=?').run(
        mutation.actorId,
        mutation.idempotencyKey,
      )
      db.query('DELETE FROM session_event_index WHERE eventId=?').run(first.receipt.eventId)
      db.query('DELETE FROM events WHERE eventId=?').run(first.receipt.eventId)
      db.query('DELETE FROM messages WHERE id=?').run(first.receipt.messageId)
      db.query("UPDATE runs SET status='queued',endedAt=NULL,error=NULL,failure=NULL WHERE id=?").run(queued.id)
      db.query('UPDATE sessions SET seq=? WHERE id=?').run(first.event.seq - 1, session.id)
    })()
  } finally {
    db.close()
  }

  const reopened = new Storage(join(root, 'data.sqlite'))
  resources.push({ root, store: reopened })
  await reopened.call('ready')
  expect((await reopened.call('run', queued.id)).status).toBe('guided')
  expect(await reopened.call('queuedRunGuideReceipt', mutation.actorId, mutation.idempotencyKey, session.id)).toEqual(
    first.receipt,
  )
  expect(
    (await reopened.call('snapshot', session.id)).messages.some((message) => message.id === first.receipt.messageId),
  ).toBe(true)
  expect((await reopened.call('events', session.id, first.event.seq - 1)).map((event) => event.eventId)).toEqual([
    first.event.eventId,
  ])
  expect(await reopened.call('recover')).toBe(1)
  expect((await reopened.call('run', active.id)).status).toBe('interrupted')
  await expectCode(reopened.call('openRunSteering', session.id, active.id), 'COMMAND_CONFLICT')
  expect(
    (await reopened.call('readRunSteering', { sessionId: session.id, runId: active.id, afterSeq: 0 })).closed,
  ).toBe(true)
  expect((await reopened.call('guideQueuedRun', mutation)).receipt).toEqual(first.receipt)
})

test('guide enforces exact queued-user ownership, active-run identity, and policy parity', async () => {
  const { store, workspace, session } = await fixture()
  const active = await store.call('enqueue', session.id, 'active-request', input('active'), 'test-model')
  const target = await store.call('enqueue', session.id, 'target-request', input('target'), 'test-model')
  const goal = await store.call('enqueue', session.id, 'goal-request', input('goal', { source: 'goal' }), 'test-model')
  const foreignSession = await store.call('createSession', workspace.id)
  const foreignActive = await store.call('enqueue', foreignSession.id, 'foreign-active', input('foreign'), 'test-model')
  await store.call('claim', session.id)
  await store.call('claim', foreignSession.id)
  await store.call('setRun', active.id, 'running')
  await store.call('setRun', foreignActive.id, 'running')
  await store.call('openRunSteering', session.id, active.id)
  const targetRevision = (await store.call('queuedRunEditable', { sessionId: session.id, operationId: target.id }))
    .revision

  await expectCode(
    store.call('guideQueuedRun', {
      actorId: 'device',
      idempotencyKey: 'goal',
      request: guideRequest(session.id, goal.id, active.id, targetRevision),
    }),
    'FORBIDDEN',
  )
  await expectCode(
    store.call('guideQueuedRun', {
      actorId: 'device',
      idempotencyKey: 'foreign-active',
      request: guideRequest(session.id, target.id, foreignActive.id, targetRevision),
    }),
    'NOT_FOUND',
  )
  await expectCode(
    store.call('guideQueuedRun', {
      actorId: 'device',
      idempotencyKey: 'foreign-session',
      request: guideRequest(foreignSession.id, target.id, active.id, targetRevision),
    }),
    'NOT_FOUND',
  )

  const mismatched = await store.call('enqueue', session.id, 'mismatched-model', input('mismatch'), 'another-model')
  const mismatchedRevision = (
    await store.call('queuedRunEditable', { sessionId: session.id, operationId: mismatched.id })
  ).revision
  await expectCode(
    store.call('guideQueuedRun', {
      actorId: 'device',
      idempotencyKey: 'mismatched-model',
      request: guideRequest(session.id, mismatched.id, active.id, mismatchedRevision),
    }),
    'COMMAND_CONFLICT',
  )

  await store.call('setRun', active.id, 'waiting_approval')
  await expectCode(
    store.call('guideQueuedRun', {
      actorId: 'device',
      idempotencyKey: 'waiting-approval',
      request: guideRequest(session.id, target.id, active.id, targetRevision),
    }),
    'COMMAND_CONFLICT',
  )
  await store.call('requestCancel', active.id)
  await expectCode(
    store.call('guideQueuedRun', {
      actorId: 'device',
      idempotencyKey: 'cancel-requested',
      request: guideRequest(session.id, target.id, active.id, targetRevision),
    }),
    'COMMAND_CONFLICT',
  )
  await store.call('setRun', active.id, 'completed')
  expect((await store.call('claim', session.id))?.id).toBe(target.id)
  await expectCode(
    store.call('guideQueuedRun', {
      actorId: 'device',
      idempotencyKey: 'claimed-target',
      request: guideRequest(session.id, target.id, target.id, targetRevision),
    }),
    'COMMAND_CONFLICT',
  )
})

test('guide/edit/remove/claim races settle the selected queued Run once', async () => {
  const { store, session } = await fixture()
  const { active, queued, revision } = await activeAndQueued(store, session.id)
  const request = guideRequest(session.id, queued.id, active.id, revision)
  const queueMutationRequest = { sessionId: session.id, operationId: queued.id, expectedRevision: revision }
  const outcomes = await Promise.allSettled([
    store.call('guideQueuedRun', { actorId: 'guide', idempotencyKey: 'race-guide', request }),
    store.call('editQueuedRunText', {
      actorId: 'edit',
      idempotencyKey: 'race-edit',
      request: { ...queueMutationRequest, text: 'edited before guide' },
    }),
    store.call('removeQueuedRun', { actorId: 'remove', idempotencyKey: 'race-remove', request: queueMutationRequest }),
    store.call('claim', session.id),
  ])
  const mutationOutcomes = outcomes.slice(0, 3)
  expect(mutationOutcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
  expect(outcomes[3]?.status).toBe('fulfilled')
  const after = await store.call('run', queued.id)
  expect(['guided', 'running', 'cancelled']).toContain(after.status)
  const events = await store.call('events', session.id, 0)
  const selectedEvents = events.filter((event) => event.runId === queued.id || event.type === 'message.committed')
  expect(
    selectedEvents.filter((event) => ['run.inputEdited', 'run.settled'].includes(event.type)).length,
  ).toBeLessThanOrEqual(1)
  expect(selectedEvents.filter((event) => event.type === 'message.committed')).toHaveLength(
    after.status === 'guided' ? 1 : 0,
  )
})

test('a contending final empty probe and Guide have one ordered winner, never accepted input behind a sealed gate', async () => {
  for (const guideFirst of [false, true]) {
    const { store, session } = await fixture()
    const { active, queued, revision } = await activeAndQueued(store, session.id)
    const mutation = {
      actorId: 'device-race',
      idempotencyKey: 'final-guide',
      request: guideRequest(session.id, queued.id, active.id, revision),
    }
    const probe = () =>
      store.call('readRunSteering', {
        sessionId: session.id,
        runId: active.id,
        afterSeq: 0,
        closeWhenEmpty: true,
      })
    if (guideFirst) {
      const [guided, read] = await Promise.all([store.call('guideQueuedRun', mutation), probe()])
      expect(read.closed).toBe(false)
      expect(read.messages.map((message) => message.id)).toEqual([guided.message.id])
      expect((await store.call('run', queued.id)).status).toBe('guided')
    } else {
      const closing = probe()
      const guide = store.call('guideQueuedRun', mutation)
      expect((await closing).closed).toBe(true)
      await expectCode(guide, 'COMMAND_CONFLICT')
      expect((await store.call('run', queued.id)).status).toBe('queued')
      expect(
        await store.call('queuedRunGuideReceipt', mutation.actorId, mutation.idempotencyKey, session.id),
      ).toBeNull()
    }
  }
})

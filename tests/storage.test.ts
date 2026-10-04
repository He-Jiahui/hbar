import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage } from '@hbar/storage'

const resources: { root: string; store: Storage }[] = []
afterEach(async () => {
  for (const { root, store } of resources.splice(0)) {
    await store.close()
    await rm(root, { recursive: true, force: true })
  }
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-storage-'))
  const store = new Storage(join(root, 'test.sqlite'))
  resources.push({ root, store })
  await store.call('ready')
  const workspace = await store.call('createWorkspace', root, 'test')
  const session = await store.call('createSession', workspace.id)
  return { root, store, workspace, session }
}
test('committed messages, events, and pagination share a monotonic cursor', async () => {
  const { store, session } = await fixture()
  for (let i = 0; i < 75; i++)
    await store.call('commit', session.id, 'run', 'user', [{ type: 'text', text: `message ${i}` }])
  const snapshot = await store.call('snapshot', session.id, undefined, 60)
  expect(snapshot.cursor).toBe(76)
  expect(snapshot.messages).toHaveLength(60)
  expect(snapshot.hasOlder).toBe(true)
  const older = await store.call('snapshot', session.id, snapshot.messages[0]!.seq, 60)
  expect(older.messages).toHaveLength(15)
  expect(older.hasOlder).toBe(false)
  expect((await store.call('events', session.id, 0)).map((e) => e.seq)).toEqual(
    Array.from({ length: 76 }, (_, i) => i + 1),
  )
})
test('idempotent commands enqueue one durable run and claim only one at a time', async () => {
  const { store, session } = await fixture()
  const input = { text: 'same', images: [] }
  const a = await store.call('enqueue', session.id, 'request', input, 'test')
  const b = await store.call('enqueue', session.id, 'request', input, 'test')
  expect(a.id).toBe(b.id)
  await store.call('enqueue', session.id, 'request-2', input, 'test')
  expect((await store.call('claim', session.id))?.id).toBe(a.id)
  expect(await store.call('claim', session.id)).toBeNull()
  await store.call('setRun', a.id, 'completed')
  expect((await store.call('claim', session.id))?.id).not.toBe(a.id)
})
test('queued runs can be reordered and claim follows the visible queue order', async () => {
  const { store, session } = await fixture()
  const input = { text: 'queued', images: [] }
  const first = await store.call('enqueue', session.id, 'request-1', input, 'test')
  const second = await store.call('enqueue', session.id, 'request-2', input, 'test')
  const third = await store.call('enqueue', session.id, 'request-3', input, 'test')
  await store.call('reorderQueued', session.id, [third.id, first.id, second.id])
  expect((await store.call('claim', session.id))?.id).toBe(third.id)
})

test('run board pages real names, stable cursors, and null usage', async () => {
  const { store, workspace, session } = await fixture()
  const first = await store.call('enqueue', session.id, 'board-1', { text: 'one', images: [] }, 'test')
  await store.call('enqueue', session.id, 'board-2', { text: 'two', images: [] }, 'test')
  const page = await store.call('runBoard', { workspaceId: workspace.id, limit: 1 })
  expect(page.items).toHaveLength(1)
  expect(page.items[0]?.run.workspaceName).toBe('test')
  expect(page.items[0]?.run.sessionTitle).toBe('New session')
  expect(page.items[0]?.usage).toBeNull()
  expect(page.nextCursor).not.toBeNull()
  const next = await store.call('runBoard', { workspaceId: workspace.id, limit: 1, cursor: page.nextCursor! })
  expect(next.items).toHaveLength(1)
  expect(next.items[0]?.run.id).not.toBe(page.items[0]?.run.id)
  await store.call('setRun', first.id, 'completed')
  let cursorError: unknown
  try {
    await store.call('runBoard', { workspaceId: workspace.id, limit: 1, cursor: page.nextCursor! })
  } catch (error) {
    cursorError = error
  }
  expect(cursorError).toMatchObject({ code: 'INVALID_CURSOR' })
})
test('recovery preserves an unknown tool outcome without replaying it', async () => {
  const { store, session } = await fixture()
  const run = await store.call('enqueue', session.id, 'request', { text: 'write', images: [] }, 'test')
  await store.call('claim', session.id)
  await store.call('toolStart', session.id, run.id, 'call', 'write_file', { path: 'output.txt' })
  expect(await store.call('recover')).toBe(1)
  expect((await store.call('run', run.id)).status).toBe('interrupted')
  expect((await store.call('run', run.id)).failure).toEqual({
    code: 'EFFECT_UNKNOWN',
    category: 'result_unknown',
    retryable: false,
  })
  expect((await store.call('snapshot', session.id)).messages[0]?.content[0]).toMatchObject({
    type: 'tool_result',
    isError: true,
    callId: 'call',
  })
  expect(await store.call('recover')).toBe(0)
})

test('session move preserves history and rejects active runs', async () => {
  const { root, store, session } = await fixture()
  const target = await store.call('createWorkspace', join(root, 'target'), 'target')
  await store.call('commit', session.id, 'run', 'assistant', [{ type: 'text', text: 'history' }])
  const beforeMoveSummary = await store.call('sessionSummary', session.id)
  expect(beforeMoveSummary.workspaceId).toBe(session.workspaceId)
  expect(beforeMoveSummary.lastResponseAt).not.toBeNull()
  expect((await store.call('sessionSummaries', [session.id])).map((item) => item.sessionId)).toEqual([session.id])
  const moved = await store.call('moveSession', session.id, target.id)
  expect(moved.session.workspaceId).toBe(target.id)
  expect((await store.call('sessionSummary', session.id)).workspaceId).toBe(target.id)
  expect((await store.call('snapshot', session.id)).messages[0]?.content[0]).toEqual({ type: 'text', text: 'history' })
  expect((await store.call('events', session.id, 0)).at(-1)?.type).toBe('session.moved')
  const run = await store.call('enqueue', session.id, 'move-busy', { text: 'busy', images: [] }, 'test')
  const third = await store.call('createWorkspace', join(root, 'third'), 'third')
  try {
    await store.call('moveSession', session.id, third.id)
    throw new Error('expected move to reject')
  } catch (error) {
    expect(error instanceof Error ? error.message : String(error)).toContain('Stop the session')
  }
  await store.call('setRun', run.id, 'cancelled')
})

test('session summaries prioritize active output, goal, plan, and tool activity', async () => {
  const { store, session } = await fixture()
  const run = await store.call('enqueue', session.id, 'summary-activity', { text: 'activity', images: [] }, 'test')
  await store.call('claim', session.id)
  await store.call('toolStart', session.id, run.id, 'read', 'read_file', { path: 'README.md' })
  expect((await store.call('sessionSummary', session.id)).activity).toBe('reading')
  await store.call('append', session.id, 'plan.updated', { steps: [] }, run.id)
  expect((await store.call('sessionSummary', session.id)).activity).toBe('plan')
  await store.call('append', session.id, 'goal.started', { id: 'goal' }, run.id)
  expect((await store.call('sessionSummary', session.id)).activity).toBe('goal')
  await store.call('commit', session.id, run.id, 'assistant', [{ type: 'text', text: 'answer' }])
  expect((await store.call('sessionSummary', session.id)).activity).toBe('output')
  await store.call('setRun', run.id, 'waiting_approval')
  expect((await store.call('sessionSummary', session.id)).activity).toBe('waiting_approval')
  await store.call('setRun', run.id, 'cancelled')
})

test('session summaries prioritize waiting approval across concurrent runs', async () => {
  const { store, session } = await fixture()
  const waiting = await store.call('enqueue', session.id, 'waiting', { text: 'waiting', images: [] }, 'test')
  await store.call('claim', session.id)
  await store.call('setRun', waiting.id, 'waiting_approval')
  await store.call('enqueue', session.id, 'newer-queued', { text: 'queued', images: [] }, 'test')
  const summary = await store.call('sessionSummary', session.id)
  expect(summary.activity).toBe('waiting_approval')
  expect(summary.activeRunId).toBe(waiting.id)
  await store.call('setRun', waiting.id, 'cancelled')
})

test('settled tools append one durable execution timing fact', async () => {
  const { store, session } = await fixture()
  const run = await store.call('enqueue', session.id, 'tool-timing', { text: 'tool', images: [] }, 'test')
  await store.call('claim', session.id)
  await store.call('toolStart', session.id, run.id, 'timed-call', 'read_file', { path: 'input.txt' })
  const settled = await store.call('toolEnd', session.id, run.id, 'timed-call', false)
  expect(settled).toMatchObject({
    sessionId: session.id,
    runId: run.id,
    type: 'tool.settled',
    data: { callId: 'timed-call', failed: false },
  })
  expect(await store.call('toolEnd', session.id, run.id, 'timed-call', true)).toBeNull()
  expect((await store.call('events', session.id, 0)).filter((event) => event.type === 'tool.settled')).toHaveLength(1)
})

test('entity command receipts make session creation and forks durable across retries and restart', async () => {
  const resource = await fixture()
  const { root, workspace, session } = resource
  const createInput = {
    actorId: 'device-1',
    idempotencyKey: 'create-session',
    workspaceId: workspace.id,
    title: 'Idempotent session',
  }
  const created = await resource.store.call('createSessionCommand', createInput)
  expect(await resource.store.call('createSessionCommand', createInput)).toEqual(created)
  let conflict: unknown
  try {
    await resource.store.call('createSessionCommand', { ...createInput, title: 'Different session' })
  } catch (error) {
    conflict = error
  }
  expect(conflict).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  const forkInput = {
    actorId: 'device-1',
    idempotencyKey: 'fork-session',
    sessionId: session.id,
  }
  const forked = await resource.store.call('forkSessionCommand', forkInput)
  expect(await resource.store.call('forkSessionCommand', forkInput)).toEqual(forked)
  expect((await resource.store.call('childSessions', session.id)).map((item) => item.id)).toEqual([forked.id])

  await resource.store.close()
  resource.store = new Storage(join(root, 'test.sqlite'))
  resources.find((item) => item.root === root)!.store = resource.store
  await resource.store.call('ready')
  expect(await resource.store.call('createSessionCommand', createInput)).toEqual(created)
  expect(await resource.store.call('forkSessionCommand', forkInput)).toEqual(forked)
})

import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { HbarError } from '@hbar/contracts'
import { Kernel, MemorySecrets, createWorkspaceSessionCommands } from '@hbar/kernel'
import { Storage, type StoragePort } from '@hbar/storage'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function storageFixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-message-fork-'))
  let store = new Storage(join(root, 'test.sqlite'))
  cleanups.push(async () => {
    await store.close()
    await rm(root, { recursive: true, force: true })
  })
  await store.call('ready')
  const workspace = await store.call('createWorkspace', root, 'test')
  const session = await store.call('createSession', workspace.id)
  return {
    root,
    workspace,
    session,
    get store() {
      return store
    },
    async restart() {
      await store.close()
      store = new Storage(join(root, 'test.sqlite'))
      await store.call('ready')
    },
  }
}

async function completedTurn(store: StoragePort, sessionId: string, key: string) {
  const run = await store.call('enqueue', sessionId, key, { text: key, images: [] }, 'test-model')
  expect((await store.call('claim', sessionId))?.id).toBe(run.id)
  const user = (await store.call('commit', sessionId, run.id, 'user', [{ type: 'text', text: `${key} prompt` }]))
    .message
  const assistant = (
    await store.call('commit', sessionId, run.id, 'assistant', [{ type: 'text', text: `${key} reply` }])
  ).message
  await store.call('setRun', run.id, 'completed')
  return { run, user, assistant }
}

const forkInput = (sessionId: string, messageId: string, key: string) => ({
  actorId: 'paired-device',
  idempotencyKey: key,
  sessionId,
  messageId,
})

async function expectStorageError(operation: Promise<unknown>, code: string) {
  let failure: unknown
  try {
    await operation
  } catch (error) {
    failure = error
  }
  expect(failure).toMatchObject({ code })
}

test('message-target forks copy exact user or terminal assistant prefix without inventing child runs', async () => {
  const { store, session } = await storageFixture()
  const first = await completedTurn(store, session.id, 'first')
  const second = await completedTurn(store, session.id, 'second')
  const fromUser = await store.call('forkFromMessageCommand', forkInput(session.id, second.user.id, 'user-fork'))
  const fromAssistant = await store.call(
    'forkFromMessageCommand',
    forkInput(session.id, second.assistant.id, 'assistant-fork'),
  )
  expect(fromUser.parentId).toBe(session.id)
  expect(fromAssistant.parentId).toBe(session.id)
  const userSnapshot = await store.call('snapshot', fromUser.id)
  const assistantSnapshot = await store.call('snapshot', fromAssistant.id)
  expect(userSnapshot.messages.map((message) => message.content[0])).toEqual([
    { type: 'text', text: 'first prompt' },
    { type: 'text', text: 'first reply' },
    { type: 'text', text: 'second prompt' },
  ])
  expect(assistantSnapshot.messages.map((message) => message.content[0])).toEqual([
    ...userSnapshot.messages.map((message) => message.content[0]),
    { type: 'text', text: 'second reply' },
  ])
  expect(userSnapshot.runs).toEqual([])
  expect(assistantSnapshot.runs).toEqual([])
  expect(userSnapshot.messages.map((message) => message.runId)).toEqual([first.run.id, first.run.id, second.run.id])
  expect(userSnapshot.messages.some((message) => message.id === second.user.id)).toBe(false)
  expect((await store.call('events', fromUser.id, 0))[1]).toMatchObject({
    type: 'session.forked',
    data: { parentId: session.id, sourceMessageId: second.user.id, sourceSeq: second.user.seq, boundary: 'message' },
  })
  expect((await store.call('snapshot', session.id)).messages).toHaveLength(4)
})

test('message-target fork resolves old history beyond the snapshot run limit, and survives reply loss and restart', async () => {
  const fixture = await storageFixture()
  const { session } = fixture
  const first = await completedTurn(fixture.store, session.id, 'turn-0')
  for (let index = 1; index < 46; index++) await completedTurn(fixture.store, session.id, `turn-${index}`)
  expect((await fixture.store.call('snapshot', session.id)).runs).toHaveLength(40)
  const input = forkInput(session.id, first.user.id, 'reply-was-lost')
  const created = await fixture.store.call('forkFromMessageCommand', input)
  expect((await fixture.store.call('snapshot', created.id)).messages.map((message) => message.role)).toEqual(['user'])
  await fixture.restart()
  expect(await fixture.store.call('forkFromMessageCommand', input)).toEqual(created)
  expect((await fixture.store.call('childSessions', session.id)).map((child) => child.id)).toEqual([created.id])
  expect((await fixture.store.call('snapshot', created.id)).runs).toEqual([])
  expect((await fixture.store.call('snapshot', session.id)).messages.length).toBeGreaterThan(0)
})

test('target identity, settled status, turn end, active run, and tool prefix are checked before any child exists', async () => {
  const { store, workspace, session } = await storageFixture()
  const other = await store.call('createSession', workspace.id)
  const otherTurn = await completedTurn(store, other.id, 'other')
  const run = await store.call('enqueue', session.id, 'active', { text: 'active', images: [] }, 'test-model')
  await store.call('claim', session.id)
  const user = (await store.call('commit', session.id, run.id, 'user', [{ type: 'text', text: 'prompt' }])).message
  const mid = (await store.call('commit', session.id, run.id, 'assistant', [{ type: 'text', text: 'still working' }]))
    .message
  for (const [messageId, code] of [
    [otherTurn.user.id, 'NOT_FOUND'],
    [user.id, 'INVALID_TARGET'],
  ] as const) {
    await expectStorageError(store.call('forkFromMessageCommand', forkInput(session.id, messageId, messageId)), code)
  }
  await store.call('commit', session.id, run.id, 'assistant', [{ type: 'text', text: 'done' }])
  await store.call('setRun', run.id, 'completed')
  await expectStorageError(store.call('forkFromMessageCommand', forkInput(session.id, mid.id, 'mid')), 'INVALID_TARGET')
  const tool = (
    await store.call('commit', session.id, run.id, 'tool', [
      {
        type: 'tool_result',
        callId: 'orphan',
        name: 'read',
        text: 'output',
        isError: false,
      },
    ])
  ).message
  await expectStorageError(
    store.call('forkFromMessageCommand', forkInput(session.id, tool.id, 'tool')),
    'INVALID_TARGET',
  )
  const latest = (await store.call('snapshot', session.id)).messages.find(
    (message) => message.role === 'assistant' && message.id !== mid.id,
  )!
  await expectStorageError(
    store.call('forkFromMessageCommand', forkInput(session.id, latest.id, 'orphan-prefix')),
    'INVALID_TARGET',
  )
  const next = await store.call('enqueue', session.id, 'queued', { text: 'queued', images: [] }, 'test-model')
  expect(next.status).toBe('queued')
  await expectStorageError(store.call('forkFromMessageCommand', forkInput(session.id, user.id, 'busy')), 'BUSY')
  expect(await store.call('childSessions', session.id)).toEqual([])
})

test('cancelled and failed turns cannot become message-target forks; distinct payloads conflict on a reused key', async () => {
  const { store, session } = await storageFixture()
  for (const [key, status] of [
    ['cancelled', 'cancelled'],
    ['failed', 'failed'],
  ] as const) {
    const run = await store.call('enqueue', session.id, key, { text: key, images: [] }, 'test-model')
    await store.call('claim', session.id)
    const user = (await store.call('commit', session.id, run.id, 'user', [{ type: 'text', text: key }])).message
    await store.call('commit', session.id, run.id, 'assistant', [{ type: 'text', text: key }])
    await store.call('setRun', run.id, status)
    await expectStorageError(
      store.call('forkFromMessageCommand', forkInput(session.id, user.id, key)),
      'INVALID_TARGET',
    )
  }
  const valid = await completedTurn(store, session.id, 'valid')
  const input = forkInput(session.id, valid.user.id, 'same-key')
  const child = await store.call('forkFromMessageCommand', input)
  expect(await store.call('forkFromMessageCommand', input)).toEqual(child)
  await expectStorageError(
    store.call('forkFromMessageCommand', { ...input, messageId: valid.assistant.id }),
    'IDEMPOTENCY_CONFLICT',
  )
})

test('only complete tool-call/result prefixes can be copied, with original provider data preserved', async () => {
  const { store, session } = await storageFixture()
  const run = await store.call('enqueue', session.id, 'paired', { text: 'paired', images: [] }, 'test-model')
  await store.call('claim', session.id)
  await store.call('commit', session.id, run.id, 'user', [{ type: 'text', text: 'read' }])
  await store.call('commit', session.id, run.id, 'assistant', [
    { type: 'tool_call', callId: 'read-1', name: 'read', args: { path: 'a.txt' } },
  ])
  await store.call('commit', session.id, run.id, 'tool', [
    { type: 'tool_result', callId: 'read-1', name: 'read', text: 'hello', isError: false },
  ])
  const final = (
    await store.call('commit', session.id, run.id, 'assistant', [{ type: 'text', text: 'file inspected' }], undefined, {
      trace: 'source',
    })
  ).message
  await store.call('setRun', run.id, 'completed')
  const child = await store.call('forkFromMessageCommand', forkInput(session.id, final.id, 'paired-key'))
  expect((await store.call('snapshot', child.id)).messages.at(-1)?.providerData).toEqual({ trace: 'source' })

  const inconsistent = await store.call(
    'enqueue',
    session.id,
    'missing-result',
    { text: 'missing-result', images: [] },
    'test-model',
  )
  await store.call('claim', session.id)
  await store.call('commit', session.id, inconsistent.id, 'user', [{ type: 'text', text: 'another' }])
  await store.call('commit', session.id, inconsistent.id, 'assistant', [
    { type: 'tool_call', callId: 'read-2', name: 'read', args: { path: 'b.txt' } },
  ])
  const incomplete = (
    await store.call('commit', session.id, inconsistent.id, 'assistant', [
      { type: 'text', text: 'not actually finished' },
    ])
  ).message
  await store.call('setRun', inconsistent.id, 'completed')
  await expectStorageError(
    store.call('forkFromMessageCommand', forkInput(session.id, incomplete.id, 'incomplete-prefix')),
    'INVALID_BOUNDARY',
  )
  expect((await store.call('childSessions', session.id)).map((row) => row.id)).toEqual([child.id])
})

test('attachment-only or blank prompts and tool-only or empty replies are not message-fork targets', async () => {
  const { store, session } = await storageFixture()
  const imageRun = await store.call('enqueue', session.id, 'image', { text: '', images: [] }, 'test-model')
  await store.call('claim', session.id)
  const image = (
    await store.call('commit', session.id, imageRun.id, 'user', [
      {
        type: 'image',
        artifact: { id: 'a'.repeat(64), name: 'screenshot.png', mime: 'image/png', size: 32 },
      },
    ])
  ).message
  await store.call('commit', session.id, imageRun.id, 'assistant', [{ type: 'text', text: 'I see it' }])
  await store.call('setRun', imageRun.id, 'completed')
  await expectStorageError(
    store.call('forkFromMessageCommand', forkInput(session.id, image.id, 'image-target')),
    'INVALID_TARGET',
  )

  const blankRun = await store.call('enqueue', session.id, 'blank', { text: ' ', images: [] }, 'test-model')
  await store.call('claim', session.id)
  const blank = (await store.call('commit', session.id, blankRun.id, 'user', [{ type: 'text', text: '  ' }])).message
  await store.call('commit', session.id, blankRun.id, 'assistant', [{ type: 'text', text: 'answer' }])
  await store.call('setRun', blankRun.id, 'completed')
  await expectStorageError(
    store.call('forkFromMessageCommand', forkInput(session.id, blank.id, 'blank-target')),
    'INVALID_TARGET',
  )

  const toolRun = await store.call('enqueue', session.id, 'tool-only', { text: 'tool-only', images: [] }, 'test-model')
  await store.call('claim', session.id)
  const toolUser = (await store.call('commit', session.id, toolRun.id, 'user', [{ type: 'text', text: 'read' }]))
    .message
  await store.call('commit', session.id, toolRun.id, 'assistant', [
    {
      type: 'tool_call',
      callId: 'tool-only',
      name: 'read',
      args: {},
    },
  ])
  await store.call('commit', session.id, toolRun.id, 'tool', [
    {
      type: 'tool_result',
      callId: 'tool-only',
      name: 'read',
      text: 'done',
      isError: false,
    },
  ])
  await store.call('setRun', toolRun.id, 'completed')
  await expectStorageError(
    store.call('forkFromMessageCommand', forkInput(session.id, toolUser.id, 'tool-only-target')),
    'INVALID_TARGET',
  )

  const emptyRun = await store.call(
    'enqueue',
    session.id,
    'empty-reply',
    { text: 'empty-reply', images: [] },
    'test-model',
  )
  await store.call('claim', session.id)
  const emptyUser = (await store.call('commit', session.id, emptyRun.id, 'user', [{ type: 'text', text: 'question' }]))
    .message
  const emptyAssistant = (
    await store.call('commit', session.id, emptyRun.id, 'assistant', [{ type: 'text', text: '  ' }])
  ).message
  await store.call('setRun', emptyRun.id, 'completed')
  await expectStorageError(
    store.call('forkFromMessageCommand', forkInput(session.id, emptyUser.id, 'empty-user-target')),
    'INVALID_TARGET',
  )
  await expectStorageError(
    store.call('forkFromMessageCommand', forkInput(session.id, emptyAssistant.id, 'empty-assistant-target')),
    'INVALID_TARGET',
  )

  const noResponseRun = await store.call(
    'enqueue',
    session.id,
    'no-response',
    { text: 'no-response', images: [] },
    'test-model',
  )
  await store.call('claim', session.id)
  const noResponse = (
    await store.call('commit', session.id, noResponseRun.id, 'user', [
      {
        type: 'text',
        text: 'did the run answer?',
      },
    ])
  ).message
  await store.call('setRun', noResponseRun.id, 'completed')
  await expectStorageError(
    store.call('forkFromMessageCommand', forkInput(session.id, noResponse.id, 'no-response-target')),
    'INVALID_TARGET',
  )
  expect(await store.call('childSessions', session.id)).toEqual([])
})

test('paired Host public command authenticates the actor, requires an idempotency key, and retries one child', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-message-fork-host-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  const commands = createWorkspaceSessionCommandClient(client)
  cleanups.push(async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })
  const source =
    (await kernel.storage.call('sessions'))[0] ??
    (await kernel.storage.call('createSession', (await kernel.storage.call('workspaces'))[0]!.id))
  const turn = await completedTurn(kernel.storage, source.id, 'host')
  const input = { sessionId: source.id, messageId: turn.user.id }
  await expect(client.connect()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  await client.pair(host.pairing.code, 'message fork test')
  await expect(commands.execute('session.forkFromMessage', input)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  const lostReply = createWorkspaceSessionCommandClient({
    async call(method, params) {
      await client.call(method, params)
      throw new HbarError('DISCONNECTED', 'The Host accepted the command but its reply was lost')
    },
  })
  await expect(
    lostReply.execute('session.forkFromMessage', input, { idempotencyKey: 'host-key' }),
  ).rejects.toMatchObject({
    code: 'RESULT_UNKNOWN',
  })
  const [child, retry] = await Promise.all([
    commands.execute('session.forkFromMessage', input, { idempotencyKey: 'host-key' }),
    commands.execute('session.forkFromMessage', input, { idempotencyKey: 'host-key' }),
  ])
  expect(retry).toEqual(child)
  expect((await kernel.storage.call('childSessions', source.id)).map((row) => row.id)).toEqual([child.id])
  const local = createWorkspaceSessionCommands(kernel)
  cleanups.push(async () => local.dispose())
  await expect(local.execute('session.forkFromMessage', input, { idempotencyKey: 'no-actor' })).rejects.toMatchObject({
    code: 'INVALID_INPUT',
  })
})

import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { parseArguments } from '@hbar/commands'
import { workspaceSessionCommands } from '@hbar/contracts/commands/workspaces'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { Storage } from '@hbar/storage'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})
async function storageFixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-fork-eligibility-'))
  const store = new Storage(join(root, 'test.sqlite'))
  cleanups.push(async () => {
    await store.close()
    await rm(root, { recursive: true, force: true })
  })
  await store.call('ready')
  const workspace = await store.call('createWorkspace', root, 'test')
  const session = await store.call('createSession', workspace.id)
  return { store, workspace, session }
}

test('one bounded query resolves 180 historic messages beyond 40 Runs, preserves input order and duplicate IDs', async () => {
  const { store, session } = await storageFixture()
  const ids: string[] = []
  for (let index = 0; index < 90; index++) {
    const run = await store.call('enqueue', session.id, `run-${index}`, { text: `${index}`, images: [] }, 'model')
    await store.call('claim', session.id)
    ids.push(
      (await store.call('commit', session.id, run.id, 'user', [{ type: 'text', text: `prompt-${index}` }])).message.id,
    )
    ids.push(
      (await store.call('commit', session.id, run.id, 'assistant', [{ type: 'text', text: `answer-${index}` }])).message
        .id,
    )
    await store.call('setRun', run.id, 'completed')
  }
  const before = await store.call('session', session.id)
  expect((await store.call('snapshot', session.id)).runs).toHaveLength(40)
  const start = performance.now()
  const result = await store.call('forkableMessages', { sessionId: session.id, messageIds: [...ids, ids[0]!] })
  expect(performance.now() - start).toBeLessThan(10_000)
  expect(result.items).toHaveLength(181)
  expect(result.items.map((item) => item.messageId)).toEqual([...ids, ids[0]!])
  expect(result.items.every((item) => item.eligible && item.reason === 'ready')).toBe(true)
  expect(await store.call('session', session.id)).toEqual(before)
  expect(await store.call('childSessions', session.id)).toEqual([])
  expect(JSON.stringify(result)).not.toContain('prompt-0')
  let failure: unknown
  try {
    await store.call('forkableMessages', {
      sessionId: session.id,
      messageIds: Array.from({ length: 201 }, () => ids[0]!),
    })
  } catch (error) {
    failure = error
  }
  expect(failure).toMatchObject({ code: 'STORAGE_ERROR' })
})

test('eligibility and atomic write share target and tool-prefix rules, including copied child history', async () => {
  const { store, workspace, session } = await storageFixture()
  const other = await store.call('createSession', workspace.id)
  const run = await store.call('enqueue', session.id, 'first', { text: 'first', images: [] }, 'model')
  await store.call('claim', session.id)
  const user = (await store.call('commit', session.id, run.id, 'user', [{ type: 'text', text: 'prompt' }])).message
  const middle = (await store.call('commit', session.id, run.id, 'assistant', [{ type: 'text', text: 'checking' }]))
    .message
  await store.call('commit', session.id, run.id, 'assistant', [
    { type: 'tool_call', callId: 'open', name: 'read', args: {} },
  ])
  await store.call('commit', session.id, run.id, 'tool', [
    { type: 'tool_result', callId: 'open', name: 'read', text: 'ok', isError: false },
  ])
  const final = (await store.call('commit', session.id, run.id, 'assistant', [{ type: 'text', text: 'final' }])).message
  await store.call('setRun', run.id, 'completed')
  const candidate = { sessionId: session.id, messageIds: [user.id, middle.id, final.id, 'unknown', user.id] }
  expect((await store.call('forkableMessages', candidate)).items.map((item) => item.reason)).toEqual([
    'ready',
    'invalid_target',
    'ready',
    'not_found',
    'ready',
  ])
  const fork = await store.call('forkFromMessageCommand', {
    actorId: 'owner',
    idempotencyKey: 'fork-once',
    sessionId: session.id,
    messageId: final.id,
  })
  expect(
    (await store.call('forkableMessages', { sessionId: fork.id, messageIds: [user.id, final.id] })).items.map(
      (item) => item.reason,
    ),
  ).toEqual(['not_found', 'not_found'])
  const forkMessageIds = (await store.call('snapshot', fork.id)).messages.map((message) => message.id)
  expect(
    (await store.call('forkableMessages', { sessionId: fork.id, messageIds: forkMessageIds })).items.every(
      (item) => item.reason === 'invalid_target',
    ),
  ).toBe(true)
  expect((await store.call('forkableMessages', { sessionId: other.id, messageIds: [user.id] })).items[0]?.reason).toBe(
    'not_found',
  )

  const queued = await store.call('enqueue', session.id, 'queued', { text: 'queued', images: [] }, 'model')
  expect(queued.status).toBe('queued')
  expect(
    (await store.call('forkableMessages', { sessionId: session.id, messageIds: [user.id] })).items[0]?.reason,
  ).toBe('busy')
  await store.call('claim', session.id)
  await store.call('setRun', queued.id, 'cancelled')
  expect(
    (await store.call('forkableMessages', { sessionId: session.id, messageIds: [user.id] })).items[0]?.reason,
  ).toBe('ready')

  const orphan = await store.call('enqueue', session.id, 'orphan', { text: 'orphan', images: [] }, 'model')
  await store.call('claim', session.id)
  const orphanUser = (
    await store.call('commit', session.id, orphan.id, 'user', [{ type: 'text', text: 'orphan prompt' }])
  ).message
  const orphanAssistant = (
    await store.call('commit', session.id, orphan.id, 'assistant', [
      { type: 'tool_call', callId: 'missing', name: 'read', args: {} },
      { type: 'text', text: 'response' },
    ])
  ).message
  await store.call('setRun', orphan.id, 'completed')
  expect(
    (
      await store.call('forkableMessages', { sessionId: session.id, messageIds: [orphanUser.id, orphanAssistant.id] })
    ).items.map((item) => item.reason),
  ).toEqual(['ready', 'invalid_boundary'])
  let failure: unknown
  try {
    await store.call('forkFromMessageCommand', {
      actorId: 'owner',
      idempotencyKey: 'orphan-write',
      sessionId: session.id,
      messageId: orphanAssistant.id,
    })
  } catch (error) {
    failure = error
  }
  expect(failure).toMatchObject({ code: 'INVALID_BOUNDARY' })
})

test('public Host query is authenticated, bounded, read-only, and CLI metadata accepts a JSON ID page', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-fork-eligibility-host-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  cleanups.push(async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })
  await expect(client.connect()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  await client.pair(host.pairing.code, 'fork eligibility')
  const session = await kernel.storage.call('createSession', (await kernel.storage.call('workspaces'))[0]!.id)
  const input = { sessionId: session.id, messageIds: ['absent'] }
  const parsed = parseArguments(workspaceSessionCommands['session.forkableMessages'].metadata, [
    '--session',
    session.id,
    '--messages',
    JSON.stringify(input.messageIds),
  ])
  expect(parsed).toEqual(input)
  const before = await kernel.storage.call('session', session.id)
  const commands = createWorkspaceSessionCommandClient(client)
  expect(await commands.execute('session.forkableMessages', input)).toEqual({
    sessionId: session.id,
    items: [{ messageId: 'absent', eligible: false, reason: 'not_found' }],
  })
  expect(await kernel.storage.call('session', session.id)).toEqual(before)
  await expect(
    commands.execute('session.forkableMessages', { ...input, messageIds: Array.from({ length: 201 }, () => 'absent') }),
  ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
})

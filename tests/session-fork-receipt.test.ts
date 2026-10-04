import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient, createSystemCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { CommandError, parseArguments } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { workspaceSessionCommands } from '@hbar/contracts/commands/workspaces'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { Storage } from '@hbar/storage'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function sourceTurn(store: Storage | Kernel['storage'], sessionId: string) {
  const run = await store.call('enqueue', sessionId, 'receipt-run', { text: 'prompt', images: [] }, 'model')
  await store.call('claim', sessionId)
  const user = (await store.call('commit', sessionId, run.id, 'user', [{ type: 'text', text: 'prompt' }])).message
  await store.call('commit', sessionId, run.id, 'assistant', [{ type: 'text', text: 'reply' }])
  await store.call('setRun', run.id, 'completed')
  return user
}

async function failureCode(work: Promise<unknown>): Promise<string | null> {
  try {
    await work
    return null
  } catch (error) {
    return error instanceof HbarError || error instanceof CommandError ? error.code : 'OTHER'
  }
}

test('read-only receipt distinguishes missing request, original target, other actor and mismatched payload after restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-fork-receipt-'))
  let store = new Storage(join(root, 'test.sqlite'))
  cleanups.push(async () => {
    await store.close()
    await rm(root, { recursive: true, force: true })
  })
  await store.call('ready')
  const workspace = await store.call('createWorkspace', root, 'test')
  const source = await store.call('createSession', workspace.id)
  const user = await sourceTurn(store, source.id)
  const input = { actorId: 'device-1', idempotencyKey: 'key-1', sessionId: source.id, messageId: user.id }
  const before = await store.call('session', source.id)
  expect(await store.call('forkFromMessageReceipt', input)).toBeNull()
  expect(await store.call('session', source.id)).toEqual(before)
  expect(await store.call('childSessions', source.id)).toEqual([])
  const child = await store.call('forkFromMessageCommand', input)
  await store.close()
  store = new Storage(join(root, 'test.sqlite'))
  await store.call('ready')
  expect(await store.call('forkFromMessageReceipt', input)).toEqual(child)
  expect(await store.call('forkFromMessageReceipt', { ...input, actorId: 'device-2' })).toBeNull()
  expect(await store.call('forkFromMessageReceipt', { ...input, idempotencyKey: 'never-sent' })).toBeNull()
  expect(await failureCode(store.call('forkFromMessageReceipt', { ...input, messageId: 'other-message' }))).toBe(
    'IDEMPOTENCY_CONFLICT',
  )
  expect(await failureCode(store.call('forkFromMessageReceipt', { ...input, sessionId: 'other-session' }))).toBe(
    'IDEMPOTENCY_CONFLICT',
  )
  expect((await store.call('childSessions', source.id)).map((item) => item.id)).toEqual([child.id])
})

test('paired Host checks its own actor and only observes lost-reply write, never initiates an absent request', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-fork-receipt-host-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(kernel, { port: 0 })
  const url = `http://127.0.0.1:${host.server.port}`
  const first = new HbarClient(url)
  const second = new HbarClient(url)
  cleanups.push(async () => {
    first.disconnect()
    second.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })
  await first.pair(host.pairing.code, 'first device')
  const secondCode = await createSystemCommandClient(first).execute('pairing.create', {})
  await second.pair(secondCode.code, 'second device')
  const source = await kernel.storage.call('createSession', (await kernel.storage.call('workspaces'))[0]!.id)
  const user = await sourceTurn(kernel.storage, source.id)
  const input = { sessionId: source.id, messageId: user.id, idempotencyKey: 'lost-write-key' }
  const query = createWorkspaceSessionCommandClient(first)
  const otherActor = createWorkspaceSessionCommandClient(second)
  expect(await query.execute('session.forkFromMessageReceipt', input)).toBeNull()
  expect(await kernel.storage.call('childSessions', source.id)).toEqual([])
  const lostReply = createWorkspaceSessionCommandClient({
    async call(method, params) {
      await first.call(method, params)
      throw new HbarError('DISCONNECTED', 'Reply lost after Host commit')
    },
  })
  expect(
    await failureCode(
      lostReply.execute(
        'session.forkFromMessage',
        {
          sessionId: source.id,
          messageId: user.id,
        },
        { idempotencyKey: input.idempotencyKey },
      ),
    ),
  ).toBe('RESULT_UNKNOWN')
  const persisted = await query.execute('session.forkFromMessageReceipt', input)
  expect(persisted?.parentId).toBe(source.id)
  expect(await otherActor.execute('session.forkFromMessageReceipt', input)).toBeNull()
  expect(await failureCode(query.execute('session.forkFromMessageReceipt', { ...input, messageId: 'wrong' }))).toBe(
    'IDEMPOTENCY_CONFLICT',
  )
  expect(persisted).not.toBeNull()
  expect((await kernel.storage.call('childSessions', source.id)).map((item) => item.id)).toEqual([persisted!.id])
  const cli = parseArguments(workspaceSessionCommands['session.forkFromMessageReceipt'].metadata, [
    '--session',
    source.id,
    '--message',
    user.id,
    '--idempotency-key',
    input.idempotencyKey,
  ])
  expect(cli).toEqual(input)
})

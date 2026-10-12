import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage } from '@hbar/storage'

const resources: Array<{ root: string; storage: Storage }> = []
afterEach(async () => {
  for (const { root, storage } of resources.splice(0)) {
    await storage.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('workspace-scoped request recovery does not cross workspace boundaries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-peer-request-journal-'))
  const storage = new Storage(join(root, 'state.sqlite'))
  resources.push({ root, storage })
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', root, 'local')
  const session = await storage.call('createSession', workspace.id)
  const otherWorkspace = await storage.call('createWorkspace', `${root}-other`, 'other')
  const otherSession = await storage.call('createSession', otherWorkspace.id)
  const command = {
    actorId: 'peer-fixture',
    idempotencyKey: 'peer-key',
    inputHash: 'a'.repeat(64),
    requestId: 'peer-request',
  }
  const local = await storage.call(
    'enqueue',
    session.id,
    'peer-request',
    { text: 'local', images: [], source: 'user' },
    'fixture-model',
    command,
  )
  const foreign = await storage.call(
    'enqueue',
    otherSession.id,
    'peer-request',
    { text: 'foreign', images: [], source: 'user' },
    'fixture-model',
    command,
  )
  const localReceipt = await storage.call('runByRequestInWorkspace', workspace.id, 'peer-request')
  expect(localReceipt).toMatchObject({
    run: { id: local.id, sessionId: session.id },
    command,
    acceptedSeq: local.queuedEvent?.seq,
  })
  const foreignReceipt = await storage.call('runByRequestInWorkspace', otherWorkspace.id, 'peer-request')
  expect(foreignReceipt).toMatchObject({
    run: { id: foreign.id, sessionId: otherSession.id },
    command,
    acceptedSeq: foreign.queuedEvent?.seq,
  })
  expect(await storage.call('runByRequestInWorkspace', workspace.id, 'missing')).toBeNull()
})

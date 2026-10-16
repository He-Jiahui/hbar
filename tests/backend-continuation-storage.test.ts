import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type UserInput } from '@hbar/contracts'
import { BACKEND_UNATTENDED_SETTING } from '@hbar/contracts/backend'
import { SettingsService } from '@hbar/kernel/controller'
import { createInProcessStorage } from './in-process-storage'
import { removeOwnedTestDirectory } from './owned-temp-directory'

test('real enqueue reconciles an accepted continuation, rejects new disabled work across reopen, and permits manual work', async () => {
  const prefix = 'hbar-backend-continuation-db-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const file = join(root, 'state.sqlite')
  let storage = createInProcessStorage(file)
  const policy = async (enabled: boolean) => {
    const settings = new SettingsService(storage)
    const before = await settings.get({ kind: 'global' })
    return settings.apply({
      schemaVersion: before.schemaVersion,
      scope: before.scope,
      baselineRevisions: before.revisions,
      actorId: 'continuation-db-fixture',
      idempotencyKey: crypto.randomUUID(),
      changes: [{ op: 'set', path: [{ kind: 'field', name: BACKEND_UNATTENDED_SETTING }], value: enabled }],
    })
  }
  try {
    await storage.call('ready')
    const workspace = await storage.call('createWorkspace', root, 'Continuation fixture')
    const session = await storage.call('createSession', workspace.id, 'Retained Goal intent')
    const input: UserInput = {
      text: '',
      images: [],
      source: 'goal',
      continuation: { goalId: 'goal', intentId: 'intent' },
    }
    const original = await storage.call('enqueue', session.id, 'accepted', input, 'fixture')
    await policy(false)
    await storage.close()
    storage = createInProcessStorage(file)
    await storage.call('ready')
    expect((await storage.call('enqueue', session.id, 'accepted', input, 'fixture')).id).toBe(original.id)
    let rejected: unknown
    try {
      await storage.call('enqueue', session.id, 'new-automatic', input, 'fixture')
    } catch (error) {
      rejected = error
    }
    expect(rejected).toMatchObject({ code: 'BACKEND_AUTOMATION_DISABLED' })
    expect(await storage.call('runByRequest', session.id, 'new-automatic')).toBeNull()
    const manual = await storage.call(
      'enqueue',
      session.id,
      'manual',
      { text: 'Run my task', images: [], source: 'user' },
      'fixture',
    )
    expect(manual.status).toBe('queued')
    await policy(true)
    const automatic = await storage.call('enqueue', session.id, 'new-automatic', input, 'fixture')
    expect(automatic.id).not.toBe(original.id)
    expect((await storage.call('enqueue', session.id, 'new-automatic', input, 'fixture')).id).toBe(automatic.id)
    expect((await storage.call('snapshot', session.id)).runs).toHaveLength(3)
  } finally {
    await storage.close()
    await removeOwnedTestDirectory(root, prefix)
  }
}, 5_000)

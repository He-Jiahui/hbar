import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BACKEND_UNATTENDED_SETTING } from '@hbar/contracts/backend'
import { SettingsService } from '@hbar/kernel/controller'
import { createInProcessStorage } from './in-process-storage'
import { removeOwnedTestDirectory } from './owned-temp-directory'

async function fixture(source: 'user' | 'goal' = 'user', unknownEffect = false) {
  const prefix = 'hbar-backend-recovery-db-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const file = join(root, 'state.sqlite')
  let storage = createInProcessStorage(file)
  try {
    await storage.call('ready')
    const workspace = await storage.call('createWorkspace', root, 'Recovery fixture')
    const session = await storage.call('createSession', workspace.id, 'Original task')
    const original = await storage.call(
      'enqueue',
      session.id,
      'original-task',
      { text: 'Keep my original task', images: [], source },
      'fixture',
    )
    await storage.call('claim', session.id)
    await storage.call('commit', session.id, original.id, 'assistant', [
      { type: 'text', text: 'Previously committed partial work' },
    ])
    if (unknownEffect) {
      await storage.call('commit', session.id, original.id, 'assistant', [
        { type: 'tool_call', callId: 'unknown-write', name: 'write_file', args: { path: 'out' } },
      ])
      await storage.call('toolStart', session.id, original.id, 'unknown-write', 'write_file', { path: 'out' })
    }
    await storage.call('recover', { runIds: [original.id], preserveQueued: true, preserveApprovals: true })
    const interrupted = await storage.call('run', original.id)
    if (interrupted.status !== 'interrupted') throw new Error('Expected an interrupted storage predecessor')
    return {
      get storage() {
        return storage
      },
      session,
      original: interrupted,
      async policy(enabled: boolean) {
        const settings = new SettingsService(storage)
        const before = await settings.get({ kind: 'global' })
        return settings.apply({
          schemaVersion: before.schemaVersion,
          scope: before.scope,
          baselineRevisions: before.revisions,
          actorId: 'recovery-fixture',
          idempotencyKey: crypto.randomUUID(),
          changes: [{ op: 'set', path: [{ kind: 'field', name: BACKEND_UNATTENDED_SETTING }], value: enabled }],
        })
      },
      async reopen() {
        await storage.close()
        storage = createInProcessStorage(file)
        await storage.call('ready')
      },
      async interruptQueued(runId: string) {
        const claimed = await storage.call('claim', session.id)
        if (claimed?.id !== runId) throw new Error('Unexpected recovery successor claim')
        await storage.call('recover', { runIds: [runId], preserveQueued: true, preserveApprovals: true })
      },
      async close() {
        await storage.close()
        await removeOwnedTestDirectory(root, prefix)
      },
    }
  } catch (error) {
    await storage.close()
    await removeOwnedTestDirectory(root, prefix)
    throw error
  }
}

for (const source of ['user', 'goal'] as const)
  test(`automatic ${source} recovery rechecks disabled settings in its queue transaction and resumes once after reopen`, async () => {
    const f = await fixture(source)
    try {
      const planned = await f.storage.call('runtimeRecoveryPlan', f.original.id)
      expect(planned.chain.status).toBe('pending')
      await f.policy(false)
      const before = await f.storage.call('snapshot', f.session.id)
      const held = await f.storage.call('runtimeRecoveryQueue', f.original.id, planned.recoveryId)
      expect(held).toMatchObject({
        recoveryId: planned.recoveryId,
        run: null,
        chain: { status: 'waiting', reasonCode: 'BACKEND_AUTOMATION_DISABLED', attempts: 0, automaticAttempts: 0 },
      })
      expect(await f.storage.call('run', f.original.id)).toEqual(f.original)
      expect((await f.storage.call('snapshot', f.session.id)).runs).toHaveLength(1)
      expect((await f.storage.call('snapshot', f.session.id)).messages).toEqual(before.messages)
      await f.reopen()
      expect(await f.storage.call('runtimeRecoveryRead', f.original.id)).toEqual(held)
      await f.policy(true)
      await f.storage.call('runtimeRecoveryHold', f.original.id, planned.recoveryId, null)
      const accepted = await f.storage.call('runtimeRecoveryQueue', f.original.id, planned.recoveryId)
      if (!accepted.run) throw new Error('Expected the original recovery identity to resume')
      expect(accepted).toMatchObject({
        recoveryId: planned.recoveryId,
        chain: { attempts: 1, automaticAttempts: 1 },
        run: { status: 'queued', input: f.original.input, recovery: { predecessorRunId: f.original.id } },
      })
      expect((await f.storage.call('runtimeRecoveryQueue', f.original.id, planned.recoveryId)).run?.id).toBe(
        accepted.run.id,
      )
      expect((await f.storage.call('snapshot', f.session.id)).runs).toHaveLength(2)
      expect((await f.storage.call('snapshot', f.session.id)).messages).toEqual(before.messages)
    } finally {
      await f.close()
    }
  }, 5_000)

test('missing legacy settings admit a recovery and disabling does not erase its accepted identity', async () => {
  const f = await fixture()
  try {
    const planned = await f.storage.call('runtimeRecoveryPlan', f.original.id)
    const accepted = await f.storage.call('runtimeRecoveryQueue', f.original.id, planned.recoveryId)
    if (!accepted.run) throw new Error('Expected legacy automatic recovery admission')
    expect(accepted.chain).toMatchObject({ attempts: 1, automaticAttempts: 1 })
    await f.policy(false)
    const repeated = await f.storage.call('runtimeRecoveryQueue', f.original.id, planned.recoveryId)
    expect(repeated.run).toEqual(accepted.run)
    expect(repeated.chain).toEqual(accepted.chain)
    expect((await f.storage.call('snapshot', f.session.id)).runs).toHaveLength(2)
    expect(await f.storage.call('run', f.original.id)).toEqual(f.original)
  } finally {
    await f.close()
  }
}, 5_000)

for (const source of ['user', 'goal'] as const)
  test(`disabled ${source} automation still admits terminal reconciliation with an exact committed completion witness`, async () => {
    const f = await fixture(source)
    try {
      await f.storage.call('append', f.session.id, 'run.driverCompleted', { version: 1 }, f.original.id)
      await f.policy(false)
      const before = await f.storage.call('snapshot', f.session.id)
      const planned = await f.storage.call('runtimeRecoveryPlan', f.original.id)
      const accepted = await f.storage.call('runtimeRecoveryQueue', f.original.id, planned.recoveryId)
      if (!accepted.run) throw new Error('Expected completion-only reconciliation to retain its linked identity')
      expect(accepted.run.recovery).toMatchObject({ predecessorRunId: f.original.id, attempt: 1 })
      expect(accepted.manual).toBeUndefined()
      expect(await f.storage.call('run', f.original.id)).toEqual(f.original)
      expect((await f.storage.call('snapshot', f.session.id)).messages).toEqual(before.messages)
      expect((await f.storage.call('snapshot', f.session.id)).runs).toHaveLength(2)
    } finally {
      await f.close()
    }
  }, 5_000)

test('completion-only reconciliation keeps a bounded original witness across an interrupted successor', async () => {
  const f = await fixture()
  try {
    await f.storage.call('append', f.session.id, 'run.driverCompleted', { version: 1 }, f.original.id)
    const first = await f.storage.call('runtimeRecoveryPlan', f.original.id)
    const queued = await f.storage.call('runtimeRecoveryQueue', f.original.id, first.recoveryId)
    if (!queued.run) throw new Error('Expected the first reconciliation identity')
    await f.interruptQueued(queued.run.id)
    await f.policy(false)
    const next = await f.storage.call('runtimeRecoveryPlan', queued.run.id)
    const accepted = await f.storage.call('runtimeRecoveryQueue', queued.run.id, next.recoveryId)
    expect(accepted.run?.recovery).toMatchObject({
      rootRunId: f.original.id,
      predecessorRunId: queued.run.id,
      attempt: 2,
    })
    expect((await f.storage.call('run', queued.run.id)).status).toBe('interrupted')
    expect((await f.storage.call('snapshot', f.session.id)).runs).toHaveLength(3)
  } finally {
    await f.close()
  }
}, 5_000)

test('an unrelated completed Run in the same Session does not authorize disabled recovery', async () => {
  const f = await fixture()
  try {
    const other = await f.storage.call(
      'enqueue',
      f.session.id,
      'other-task',
      { text: 'Other task', images: [] },
      'fixture',
    )
    await f.storage.call('claim', f.session.id)
    await f.storage.call('append', f.session.id, 'run.driverCompleted', { version: 1 }, other.id)
    await f.storage.call('setRun', other.id, 'completed')
    await f.policy(false)
    const planned = await f.storage.call('runtimeRecoveryPlan', f.original.id)
    const held = await f.storage.call('runtimeRecoveryQueue', f.original.id, planned.recoveryId)
    expect(held).toMatchObject({
      run: null,
      chain: { status: 'waiting', reasonCode: 'BACKEND_AUTOMATION_DISABLED', attempts: 0 },
    })
    expect((await f.storage.call('snapshot', f.session.id)).runs).toHaveLength(2)
  } finally {
    await f.close()
  }
}, 5_000)

test('a malformed completion witness cannot bypass disabled automatic admission', async () => {
  const f = await fixture()
  try {
    await f.storage.call('append', f.session.id, 'run.driverCompleted', { version: 2 }, f.original.id)
    await f.policy(false)
    const planned = await f.storage.call('runtimeRecoveryPlan', f.original.id)
    let failure: unknown
    try {
      await f.storage.call('runtimeRecoveryQueue', f.original.id, planned.recoveryId)
    } catch (error) {
      failure = error
    }
    expect(failure).toMatchObject({ code: 'SESSION_LOG_CORRUPTED' })
    expect(await f.storage.call('runtimeRecoveryRead', f.original.id)).toMatchObject({
      run: null,
      chain: { attempts: 0, automaticAttempts: 0 },
    })
    expect((await f.storage.call('snapshot', f.session.id)).runs).toHaveLength(1)
  } finally {
    await f.close()
  }
}, 5_000)

test('an explicit stored manual recovery bypasses the switch once without granting its next automatic successor', async () => {
  const f = await fixture()
  try {
    await f.policy(false)
    const planned = await f.storage.call('runtimeRecoveryPlan', f.original.id)
    const manual = {
      requestId: `command-${'c'.repeat(64)}`,
      command: { actorId: 'manual-actor', idempotencyKey: 'continue', requestId: 'manual', inputHash: 'd'.repeat(64) },
    }
    await f.storage.call('runtimeRecoveryHold', f.original.id, planned.recoveryId, null, manual)
    const accepted = await f.storage.call('runtimeRecoveryQueue', f.original.id, planned.recoveryId)
    if (!accepted.run) throw new Error('Expected the stored explicit manual recovery')
    expect(accepted).toMatchObject({
      manual,
      chain: { attempts: 1, automaticAttempts: 0 },
      run: { recovery: { predecessorRunId: f.original.id, manual: true, attempt: 1, automaticAttempt: 0 } },
    })
    await f.interruptQueued(accepted.run.id)
    const next = await f.storage.call('runtimeRecoveryPlan', accepted.run.id)
    expect(next.manual).toBeUndefined()
    const held = await f.storage.call('runtimeRecoveryQueue', accepted.run.id, next.recoveryId)
    expect(held).toMatchObject({
      run: null,
      chain: { status: 'waiting', reasonCode: 'BACKEND_AUTOMATION_DISABLED', attempts: 1, automaticAttempts: 0 },
    })
    expect((await f.storage.call('snapshot', f.session.id)).runs).toHaveLength(2)
    expect((await f.storage.call('run', accepted.run.id)).status).toBe('interrupted')
  } finally {
    await f.close()
  }
}, 5_000)

test('disabled settings and a stored manual request cannot override an unknown write outcome', async () => {
  const f = await fixture('user', true)
  try {
    expect(f.original.failure?.category).toBe('result_unknown')
    await f.storage.call('append', f.session.id, 'run.driverCompleted', { version: 1 }, f.original.id)
    await f.policy(false)
    const planned = await f.storage.call('runtimeRecoveryPlan', f.original.id)
    expect(planned.chain).toMatchObject({ status: 'waiting', reasonCode: 'EFFECT_UNKNOWN' })
    await f.storage.call('runtimeRecoveryHold', f.original.id, planned.recoveryId, null, {
      requestId: `command-${'e'.repeat(64)}`,
      command: { actorId: 'manual-actor', idempotencyKey: 'unknown', requestId: 'manual', inputHash: 'f'.repeat(64) },
    })
    const held = await f.storage.call('runtimeRecoveryQueue', f.original.id, planned.recoveryId)
    expect(held).toMatchObject({
      run: null,
      chain: { status: 'waiting', reasonCode: 'EFFECT_UNKNOWN', attempts: 0, automaticAttempts: 0 },
    })
    expect(await f.storage.call('run', f.original.id)).toEqual(f.original)
    expect((await f.storage.call('snapshot', f.session.id)).runs).toHaveLength(1)
  } finally {
    await f.close()
  }
}, 5_000)

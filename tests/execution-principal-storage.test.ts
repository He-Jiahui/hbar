import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage } from '@hbar/storage'
import type { RunCommandRecord } from '@hbar/contracts/commands/run'
import type { ExecutionPrincipal } from '@hbar/contracts/execution-principal'
import { createExecutionPrincipalStorage } from '../packages/storage/src/execution-principals'
import { removeOwnedTestDirectory } from './owned-temp-directory'

const command = (actorId: string, requestId: string): RunCommandRecord => ({
  actorId,
  requestId,
  idempotencyKey: requestId,
  inputHash: 'a'.repeat(64),
})
const input = { text: 'ordinary task', images: [] }
async function failure(action: Promise<unknown>): Promise<unknown> {
  try {
    await action
  } catch (error) {
    return error
  }
  throw new Error('Expected operation rejection')
}
async function fixture() {
  const prefix = 'hbar-execution-principal-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  let storage = new Storage(join(root, 'test.sqlite'))
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', root, 'principal fixture')
  const session = await storage.call('createSessionCommand', {
    workspaceId: workspace.id,
    actorId: 'actor-a',
    idempotencyKey: 'create',
  })
  return {
    root,
    workspace,
    session,
    get storage() {
      return storage
    },
    async rebuild() {
      await storage.close()
      await rename(join(root, 'test.sqlite'), join(root, 'original-projection.sqlite'))
      storage = new Storage(join(root, 'test.sqlite'))
      await storage.call('ready')
    },
    async close() {
      await storage.close()
      await removeOwnedTestDirectory(root, prefix)
    },
  }
}

test('Run principals remain immutable across later submissions, explicit continuations and canonical-log rebuilds', async () => {
  const f = await fixture()
  try {
    const original = await f.storage.call('enqueue', f.session.id, 'automatic-first', input, 'fixture')
    const creator: ExecutionPrincipal = {
      version: 1,
      actorId: 'actor-a',
      originSessionId: f.session.id,
      originRunId: null,
    }
    expect(await f.storage.call('runExecutionPrincipal', original.id)).toEqual(creator)
    const later = await f.storage.call(
      'enqueue',
      f.session.id,
      'manual-b',
      input,
      'fixture',
      command('actor-b', 'manual-b'),
    )
    const manual: ExecutionPrincipal = {
      version: 1,
      actorId: 'actor-b',
      originSessionId: f.session.id,
      originRunId: later.id,
    }
    expect(await f.storage.call('runExecutionPrincipal', later.id)).toEqual(manual)
    expect(await f.storage.call('runExecutionPrincipal', original.id)).toEqual(creator)
    const inherited = await f.storage.call(
      'enqueue',
      f.session.id,
      'continue-original',
      input,
      'fixture',
      undefined,
      undefined,
      original.id,
    )
    expect(await f.storage.call('runExecutionPrincipal', inherited.id)).toEqual(creator)
    expect(
      await failure(
        f.storage.call('enqueue', f.session.id, 'manual-b', input, 'fixture', command('actor-c', 'manual-b')),
      ),
    ).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    expect(await f.storage.call('runExecutionPrincipal', later.id)).toEqual(manual)
    await f.rebuild()
    expect(await f.storage.call('runExecutionPrincipal', original.id)).toEqual(creator)
    expect(await f.storage.call('runExecutionPrincipal', later.id)).toEqual(manual)
    expect(await f.storage.call('runExecutionPrincipal', inherited.id)).toEqual(creator)
  } finally {
    await f.close()
  }
})

test('child creation captures its actual parent Run instead of a later queued actor and rejects unrelated sources atomically', async () => {
  const f = await fixture()
  try {
    const original = await f.storage.call(
      'enqueue',
      f.session.id,
      'parent-a',
      input,
      'fixture',
      command('actor-a', 'parent-a'),
    )
    await f.storage.call('enqueue', f.session.id, 'parent-b', input, 'fixture', command('actor-b', 'parent-b'))
    const child = await f.storage.call('createSession', f.workspace.id, 'child', f.session.id, {
      kind: 'run',
      runId: original.id,
    })
    const expected = await f.storage.call('runExecutionPrincipal', original.id)
    expect(await f.storage.call('sessionExecutionPrincipal', child.id)).toEqual(expected)
    const childRun = await f.storage.call('enqueue', child.id, 'child', input, 'fixture')
    expect(await f.storage.call('runExecutionPrincipal', childRun.id)).toEqual(expected)
    const other = await f.storage.call('createSession', f.workspace.id, 'unrelated')
    const count = (await f.storage.call('sessions')).length
    expect(
      await failure(
        f.storage.call('createSession', f.workspace.id, 'invalid', other.id, { kind: 'run', runId: original.id }),
      ),
    ).toMatchObject({ code: 'EXECUTION_PRINCIPAL_SOURCE' })
    expect(
      await failure(
        f.storage.call('enqueue', other.id, 'invalid', input, 'fixture', undefined, undefined, original.id),
      ),
    ).toMatchObject({ code: 'EXECUTION_PRINCIPAL_SOURCE' })
    expect((await f.storage.call('sessions')).length).toBe(count)
    expect(await f.storage.call('runByRequest', other.id, 'invalid')).toBeNull()
  } finally {
    await f.close()
  }
})

test('automatic recovery retains its original principal while a manual retry binds its new authenticated operator', async () => {
  const f = await fixture()
  try {
    const original = await f.storage.call(
      'enqueue',
      f.session.id,
      'recover',
      input,
      'fixture',
      command('actor-a', 'recover'),
    )
    await f.storage.call('claim', f.session.id)
    await f.storage.call('recover', { runIds: [original.id], preserveQueued: true, preserveApprovals: true })
    const plan = await f.storage.call('runtimeRecoveryPlan', original.id)
    const recovered = await f.storage.call('runtimeRecoveryQueue', original.id, plan.recoveryId)
    if (!recovered.run) throw new Error('Expected automatic recovery')
    const automatic = recovered.run
    expect(await f.storage.call('runExecutionPrincipal', automatic.id)).toEqual(
      await f.storage.call('runExecutionPrincipal', original.id),
    )
    await f.storage.call('claim', f.session.id)
    await f.storage.call('recover', { runIds: [automatic.id], preserveQueued: true, preserveApprovals: true })
    const second = await f.storage.call('runtimeRecoveryPlan', automatic.id)
    await f.storage.call('runtimeRecoveryHold', automatic.id, second.recoveryId, null, {
      requestId: `command-${'b'.repeat(64)}`,
      command: command('actor-b', 'retry-b'),
    })
    const manual = await f.storage.call('runtimeRecoveryQueue', automatic.id, second.recoveryId)
    if (!manual.run) throw new Error('Expected manual recovery')
    const expected: ExecutionPrincipal = {
      version: 1,
      actorId: 'actor-b',
      originSessionId: f.session.id,
      originRunId: manual.run.id,
    }
    expect(await f.storage.call('runExecutionPrincipal', manual.run.id)).toEqual(expected)
    await f.rebuild()
    expect(await f.storage.call('runExecutionPrincipal', automatic.id)).toEqual(
      await f.storage.call('runExecutionPrincipal', original.id),
    )
    expect(await f.storage.call('runExecutionPrincipal', manual.run.id)).toEqual(expected)
  } finally {
    await f.close()
  }
})

test('legacy journal reads use canonical submission proof, leave unbound histories unbound, and bound cyclic recovery', () => {
  const db = new Database(':memory:')
  db.exec(
    'CREATE TABLE runs(id TEXT PRIMARY KEY,sessionId TEXT); CREATE TABLE events(sessionId TEXT,runId TEXT,type TEXT,data TEXT,seq INTEGER); CREATE INDEX event_run_type ON events(runId,type); CREATE INDEX event_session_type_seq ON events(sessionId,type,seq);',
  )
  const add = (runId: string, seq: number, data: unknown, type = 'run.queued', sessionId = 'session') => {
    db.query('INSERT INTO runs VALUES(?,?)').run(runId, sessionId)
    db.query('INSERT INTO events VALUES(?,?,?,?,?)').run(sessionId, runId, type, JSON.stringify(data), seq)
  }
  try {
    const port = createExecutionPrincipalStorage(db)
    add('legacy', 1, {})
    expect(port.run('legacy')).toBeNull()
    add('canonical', 2, { command: command('actor-a', 'canonical') })
    expect(port.run('canonical')).toEqual({
      version: 1,
      actorId: 'actor-a',
      originSessionId: 'session',
      originRunId: 'canonical',
    })
    add('recovered', 3, { predecessorRunId: 'canonical' }, 'run.recoveryQueued')
    expect(port.session('session')).toEqual(port.run('canonical'))
    add('cycle-a', 4, { predecessorRunId: 'cycle-b' }, 'run.recoveryQueued')
    add('cycle-b', 5, { predecessorRunId: 'cycle-a' }, 'run.recoveryQueued')
    expect(() => port.run('cycle-a')).toThrow('cyclic or too deep')
    add('foreign', 6, { predecessorRunId: 'canonical' }, 'run.recoveryQueued', 'other-session')
    expect(() => port.run('foreign')).toThrow('another session')
  } finally {
    db.close()
  }
})

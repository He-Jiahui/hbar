import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Approval } from '@hbar/contracts'
import { createNodeIdentity, nodeIdFromPublicKey } from '@hbar/node-core'
import { Storage, STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { nodeExecutionTargetSchema } from '@hbar/contracts/node-execution-target'

test('Approval execution targets survive Worker reopen and canonical JSONL projection rebuild', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-approval-execution-target-'))
  const path = join(root, 'storage.sqlite')
  let storage = new Storage(path)
  try {
    await storage.call('ready')
    const workspace = await storage.call('createWorkspace', root, 'Approval target')
    const session = await storage.call('createSession', workspace.id)
    const run = await storage.call('enqueue', session.id, 'approval-targets', { text: 'Review', images: [] }, 'fixture')
    const identity = createNodeIdentity()
    const target = nodeExecutionTargetSchema.parse({
      kind: 'node',
      nodeId: nodeIdFromPublicKey(identity.publicKey),
      nodeName: 'Remote Builder',
      rootId: 'engine',
      nodePath: '/srv/engine',
      rootAccess: 'read',
      capabilitySummary: {
        backends: ['bwrap', 'container'],
        filesystem: 'enforced',
        network: 'env-only',
        floor: { process: true, network: false, terminal: true, osConfinement: 'required' },
        observedAt: 1_797_000_123_456,
      },
    })
    if (target.kind !== 'node') throw new Error('Expected a captured node target')
    const local: Approval = {
      id: 'approval-local',
      sessionId: session.id,
      runId: run.id,
      callId: 'call-local',
      tool: 'write_file',
      args: { path: 'local.txt', content: 'value' },
      status: 'pending',
      createdAt: 1,
    }
    const remote: Approval = { ...local, id: 'approval-remote', callId: 'call-remote', executionTarget: target }
    const localEvent = await storage.call('createApproval', local)
    const remoteEvent = await storage.call('createApproval', remote)
    expect(await storage.call('approval', local.id)).toEqual(local)
    expect(await storage.call('approval', remote.id)).toEqual(remote)

    const invalid = {
      ...remote,
      id: 'approval-invalid-target',
      callId: 'call-invalid',
      executionTarget: { ...target, capabilitySummary: { ...target.capabilitySummary, observedAt: -1 } },
    }
    const failure = await storage.call('createApproval', invalid).then(
      () => null,
      (error: unknown) => error,
    )
    expect(failure).toMatchObject({ code: 'STORAGE_ERROR' })
    expect(
      (await storage.call('events', session.id, 0)).some(
        (event) => event.type === 'approval.requested' && (event.data as Approval).id === invalid.id,
      ),
    ).toBe(false)

    await storage.close()
    const db = new Database(path)
    try {
      db.transaction(() => {
        for (const event of [localEvent, remoteEvent]) {
          db.query('DELETE FROM session_event_index WHERE eventId=?').run(event.eventId)
          db.query('DELETE FROM events WHERE eventId=?').run(event.eventId)
        }
        db.query('DELETE FROM approvals WHERE id IN (?,?)').run(local.id, remote.id)
      })()
    } finally {
      db.close()
    }

    storage = new Storage(path)
    expect(await storage.call('ready')).toEqual({ version: STORAGE_SCHEMA_VERSION })
    expect(await storage.call('approval', local.id)).toEqual(local)
    expect(await storage.call('approval', remote.id)).toEqual(remote)
  } finally {
    await storage.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('schema 30 adds Approval executionTarget to a version 29 database', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-approval-target-migration-'))
  const path = join(root, 'storage.sqlite')
  let storage = new Storage(path)
  try {
    await storage.call('ready')
    const workspace = await storage.call('createWorkspace', root, 'Migration')
    await storage.close()
    const db = new Database(path)
    try {
      db.exec(
        'DROP INDEX node_run_worktrees_session; DROP TABLE node_run_worktrees; ALTER TABLE approvals DROP COLUMN executionTarget; PRAGMA user_version=29;',
      )
      expect(
        db
          .query<{ name: string }, []>(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='node_run_worktrees'",
          )
          .get(),
      ).toBeNull()
    } finally {
      db.close()
    }
    storage = new Storage(path)
    expect(await storage.call('ready')).toEqual({ version: STORAGE_SCHEMA_VERSION })
    const migrated = new Database(path)
    try {
      expect(
        (migrated.query('PRAGMA table_info(approvals)').all() as { name: string }[]).some(
          (column) => column.name === 'executionTarget',
        ),
      ).toBe(true)
    } finally {
      migrated.close()
    }
    expect(await storage.call('workspace', workspace.id)).toEqual(workspace)
  } finally {
    await storage.close()
    await rm(root, { recursive: true, force: true })
  }
})

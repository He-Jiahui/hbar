import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nodeFloorSchema, nodeCapabilitiesSchema } from '@hbar/contracts/node'
import { Storage, STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { StorageNodeRegistryPort } from '@hbar/storage/node-registry'
import { NodeRegistryService } from '@hbar/node-link'
import { createNodeIdentity } from '@hbar/node-core'
import { SANDBOX_EVALUATOR_FINGERPRINT } from '@hbar/sandbox'

async function fixture(run: (storage: Storage, registry: NodeRegistryService, path: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-execution-intent-'))
  const path = join(root, 'host.sqlite')
  const storage = new Storage(path)
  await storage.call('ready')
  const registry = await NodeRegistryService.open(new StorageNodeRegistryPort(storage))
  try {
    await run(storage, registry, path)
  } finally {
    registry.dispose()
    await storage.close()
    await rm(root, { recursive: true, force: true })
  }
}

async function registerNode(registry: NodeRegistryService) {
  const invite = await registry.invite('execution recovery node')
  const identity = createNodeIdentity()
  const node = await registry.join(identity.publicKey, invite.code, 'execution recovery node')
  const {
    roots: _roots,
    protectedPaths: _paths,
    environmentAllowlist: _allowlist,
    ...floor
  } = nodeFloorSchema.parse({ roots: [] })
  await registry.touch(
    node.nodeId,
    nodeCapabilitiesSchema.parse({
      protocol: 1,
      nodeId: node.nodeId,
      platform: 'linux',
      evaluator: SANDBOX_EVALUATOR_FINGERPRINT,
      roots: [{ rootId: 'engine', name: 'Engine', nodePath: '/srv/engine', access: 'write' }],
      sandbox: { backends: ['none'], filesystem: 'none', network: 'none' },
      floor,
    }),
  )
  return node
}

function executionMetadata(workspaceId: string, nodeId: string, sessionId: string, runId: string, callId: string) {
  return {
    workspaceId,
    nodeId,
    rootId: 'engine',
    nodePath: '/srv/engine',
    operationId: `${runId}:${callId}`,
    kind: 'process' as const,
    authority: {
      sessionId,
      runId,
      callId,
      sandbox: null,
      admission: { kind: 'allow' as const },
    },
  }
}

test('process intent persists exact binding, defers only its bound Run, and enumerates with a bounded cursor', async () => {
  await fixture(async (storage, registry) => {
    const node = await registerNode(registry)
    const workspace = await storage.call('createNodeWorkspace', { nodeId: node.nodeId, rootId: 'engine' })
    const records: { sessionId: string; runId: string }[] = []
    for (const callId of ['call-a', 'call-b']) {
      const session = await storage.call('createSession', workspace.id, callId)
      const run = await storage.call(
        'enqueue',
        session.id,
        `request-${callId}`,
        { text: 'Run a bounded command', images: [] },
        'fixture',
      )
      await storage.call('claim', session.id)
      const metadata = executionMetadata(workspace.id, node.nodeId, session.id, run.id, callId)
      await storage.call(
        'toolStart',
        session.id,
        run.id,
        callId,
        'workspace.exec',
        { command: 'true' },
        undefined,
        metadata,
      )
      records.push({ sessionId: session.id, runId: run.id })
    }

    const first = await storage.call('pendingNodeExecutionIntents', { limit: 1 })
    expect(first.items).toHaveLength(1)
    const firstItem = first.items[0]
    if (!firstItem || !first.nextCursor) throw new Error('Expected a bounded first-page cursor')
    expect(first.nextCursor).toBe(firstItem.operationId)
    expect(firstItem).toMatchObject({
      workspaceId: workspace.id,
      nodeId: node.nodeId,
      rootId: 'engine',
      nodePath: '/srv/engine',
      kind: 'process',
      args: { command: 'true' },
      authority: { admission: { kind: 'allow' }, sandbox: null },
    })
    const second = await storage.call('pendingNodeExecutionIntents', { after: first.nextCursor, limit: 1 })
    expect(second.items).toHaveLength(1)
    expect(second.items[0]?.callId).not.toBe(first.items[0]?.callId)
    expect(second.nextCursor).toBeNull()
    const scopedRecord = records[1]
    if (!scopedRecord) throw new Error('Expected second fixture Run')
    const scoped = await storage.call('pendingNodeExecutionIntents', { runIds: [scopedRecord.runId], limit: 10 })
    expect(scoped.items.map((item) => item.runId)).toEqual([scopedRecord.runId])
    expect(await storage.call('pendingNodeExecutionIntents', { runIds: [], limit: 10 })).toMatchObject({
      items: [],
      nextCursor: null,
    })
    expect(await storage.call('recover', { deferNodeExecutions: true })).toBe(0)
    for (const record of records) {
      expect((await storage.call('run', record.runId)).status).toBe('running')
      expect((await storage.call('snapshot', record.sessionId)).messages.flatMap((message) => message.content)).toEqual(
        [],
      )
    }
  })
})

test('legacy started intent without persisted node identity stays on conservative unknown recovery', async () => {
  await fixture(async (storage, registry) => {
    const node = await registerNode(registry)
    const workspace = await storage.call('createNodeWorkspace', { nodeId: node.nodeId, rootId: 'engine' })
    const session = await storage.call('createSession', workspace.id, 'Legacy')
    const run = await storage.call('enqueue', session.id, 'legacy-request', { text: 'Run', images: [] }, 'fixture')
    await storage.call('claim', session.id)
    await storage.call('toolStart', session.id, run.id, 'legacy-call', 'workspace.exec', { command: 'true' })

    expect(await storage.call('recover')).toBe(1)
    expect((await storage.call('run', run.id)).status).toBe('interrupted')
    const toolResults = (await storage.call('snapshot', session.id)).messages
      .flatMap((message) => message.content)
      .filter((block) => block.type === 'tool_result')
    expect(toolResults).toMatchObject([{ callId: 'legacy-call', outcome: { kind: 'unknown', executionStarted: true } }])
    expect(await storage.call('pendingNodeExecutionIntents', { limit: 10 })).toMatchObject({
      items: [],
      nextCursor: null,
    })
  })
})

test('run-scoped pending pages and atomic Node receipt settlement validate identity, lease, idempotency, and recovery', async () => {
  await fixture(async (storage, registry, path) => {
    const node = await registerNode(registry)
    const workspace = await storage.call('createNodeWorkspace', { nodeId: node.nodeId, rootId: 'engine' })
    const session = await storage.call('createSession', workspace.id, 'Atomic settlement')
    const run = await storage.call('enqueue', session.id, 'atomic-settlement', { text: 'Run', images: [] }, 'fixture')
    const callId = 'atomic-call'
    const owner = { unitId: 'kernel', generation: 1, incarnation: 'settlement-test' }
    const lease = await storage.call('runtimeExecutionClaim', {
      leaseId: crypto.randomUUID(),
      sessionId: session.id,
      runId: run.id,
      owner,
      fence: 1,
      acquiredAt: Date.now(),
      versions: {
        kernel: { unitId: owner.unitId, generation: owner.generation, artifactId: 'a'.repeat(64) },
        driver: { unitId: 'driver', generation: 1, artifactId: 'b'.repeat(64) },
        plugins: [],
        hooks: [],
      },
    })
    if (!lease) throw new Error('Fixture execution lease was not claimed')
    await storage.callOwned(
      lease,
      'toolStart',
      session.id,
      run.id,
      callId,
      'workspace.exec',
      { command: 'printf', args: ['durable'] },
      undefined,
      {
        ...executionMetadata(workspace.id, node.nodeId, session.id, run.id, callId),
        authority: {
          sessionId: session.id,
          runId: run.id,
          callId,
          sandbox: null,
          admission: { kind: 'allow' as const },
        },
      },
    )
    const pending = await storage.call('pendingNodeExecutionIntents', { runIds: [run.id], limit: 10 })
    expect(pending.items).toHaveLength(1)
    const record = pending.items[0]
    if (!record) throw new Error('Expected pending Node intent')
    const { createdAt: _createdAt, ...identity } = record
    const input = {
      identity,
      result: {
        text: 'durable',
        isError: false,
        details: { code: 0, executionStarted: true },
        outcome: { kind: 'succeeded' as const, executionStarted: true },
      },
    }
    const activeFailure = await storage.callOwned(lease, 'nodeExecutionIntentSettle', input).then(
      () => null,
      (error: unknown) => error,
    )
    expect(activeFailure).toMatchObject({ code: 'EXECUTION_OWNER_ACTIVE' })
    await storage.call('runtimeExecutionRevoke', lease.owner, [run.id])
    const forgedFailure = await storage
      .call('nodeExecutionIntentSettle', {
        identity: { ...identity, rootId: 'forged-root' },
        result: {
          text: 'durable',
          isError: false,
          outcome: { kind: 'succeeded', executionStarted: true },
        },
      })
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(forgedFailure).toMatchObject({ code: 'EXECUTION_OWNER_MISMATCH' })
    expect((await storage.call('pendingNodeExecutionIntents', { runIds: [run.id], limit: 10 })).items).toHaveLength(1)

    const settled = await storage.call('nodeExecutionIntentSettle', input)
    const duplicate = await storage.call('nodeExecutionIntentSettle', input)
    expect(duplicate.event.eventId).toBe(settled.event.eventId)
    const conflictFailure = await storage
      .call('nodeExecutionIntentSettle', {
        identity,
        result: { ...input.result, text: 'conflicting result' },
      })
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(conflictFailure).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    expect(await storage.call('pendingNodeExecutionIntents', { runIds: [run.id], limit: 10 })).toMatchObject({
      items: [],
      nextCursor: null,
    })
    const toolResults = (await storage.call('snapshot', session.id)).messages
      .flatMap((message) => message.content)
      .filter((block) => block.type === 'tool_result')
    expect(toolResults).toMatchObject([
      {
        callId,
        name: 'workspace.exec',
        text: 'durable',
        outcome: { kind: 'succeeded', executionStarted: true },
      },
    ])

    await storage.close()
    const replayDb = new Database(path)
    try {
      replayDb.transaction(() => {
        replayDb
          .query(
            `DELETE FROM session_event_index WHERE eventId IN (
               SELECT eventId FROM events WHERE runId=? AND type IN ('tool.started','message.committed','tool.settled')
             )`,
          )
          .run(run.id)
        replayDb
          .query("DELETE FROM events WHERE runId=? AND type IN ('tool.started','message.committed','tool.settled')")
          .run(run.id)
        replayDb.query("DELETE FROM messages WHERE runId=? AND role='tool'").run(run.id)
        replayDb.query('DELETE FROM tool_intents WHERE id=?').run(identity.operationId)
        replayDb.query('DELETE FROM node_execution_intents WHERE operationId=?').run(identity.operationId)
      })()
    } finally {
      replayDb.close()
    }
    const reopened = new Storage(path)
    try {
      await reopened.call('ready')
      expect(await reopened.call('pendingNodeExecutionIntents', { runIds: [run.id], limit: 10 })).toMatchObject({
        items: [],
        nextCursor: null,
      })
      const recoveredResults = (await reopened.call('snapshot', session.id)).messages
        .flatMap((message) => message.content)
        .filter((block) => block.type === 'tool_result')
      expect(recoveredResults).toMatchObject([
        { callId, text: 'durable', outcome: { kind: 'succeeded', executionStarted: true } },
      ])
    } finally {
      await reopened.close()
    }
  })
})

test('atomic Node receipt settlement writes nested sequence results under their original parent', async () => {
  await fixture(async (storage, registry) => {
    const node = await registerNode(registry)
    const workspace = await storage.call('createNodeWorkspace', { nodeId: node.nodeId, rootId: 'engine' })
    const session = await storage.call('createSession', workspace.id, 'Nested settlement')
    const run = await storage.call('enqueue', session.id, 'nested-settlement', { text: 'Run', images: [] }, 'fixture')
    await storage.call('claim', session.id)
    const callId = 'nested-call'
    const parentCallId = 'sequence-parent'
    await storage.call(
      'append',
      session.id,
      'tool.sequence_call',
      { parentCallId, callId, index: 0, name: 'workspace.exec', arguments: { command: 'true' } },
      run.id,
    )
    await storage.call('toolStart', session.id, run.id, callId, 'workspace.exec', { command: 'true' }, undefined, {
      ...executionMetadata(workspace.id, node.nodeId, session.id, run.id, callId),
      authority: {
        sessionId: session.id,
        runId: run.id,
        callId,
        sandbox: null,
        admission: { kind: 'allow' as const },
      },
    })
    const pending = await storage.call('pendingNodeExecutionIntents', { runIds: [run.id], limit: 10 })
    const record = pending.items[0]
    if (!record) throw new Error('Expected nested Node intent')
    const { createdAt: _createdAt, ...identity } = record
    const receipt = await storage.call('nodeExecutionIntentSettle', {
      identity,
      result: {
        text: 'The node never accepted this execution.',
        isError: true,
        details: { code: 'NODE_NOT_STARTED', executionStarted: false },
      },
    })
    expect(receipt.event.type).toBe('tool.settled')
    const events = await storage.call('events', session.id, 0)
    const sequenceResult = events.find((event) => event.type === 'tool.sequence_result')
    expect(sequenceResult?.data).toMatchObject({
      parentCallId,
      content: [
        {
          callId,
          text: 'The node never accepted this execution.',
          outcome: { kind: 'failed', executionStarted: false },
        },
      ],
    })
    expect(
      (await storage.call('snapshot', session.id)).messages.flatMap((message) => message.content),
    ).not.toContainEqual(expect.objectContaining({ callId }))
  })
})

test('Worker reopen restores exact process authority from canonical tool.started and keeps recovery conservative', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-execution-journal-recovery-'))
  const path = join(root, 'host.sqlite')
  let storage = new Storage(path)
  let registry: NodeRegistryService | null = null
  try {
    await storage.call('ready')
    registry = await NodeRegistryService.open(new StorageNodeRegistryPort(storage))
    const node = await registerNode(registry)
    const workspace = await storage.call('createNodeWorkspace', { nodeId: node.nodeId, rootId: 'engine' })
    const session = await storage.call('createSession', workspace.id, 'Journal recovery')
    const run = await storage.call('enqueue', session.id, 'journal-request', { text: 'Run', images: [] }, 'fixture')
    await storage.call('claim', session.id)
    const authority = {
      sessionId: session.id,
      runId: run.id,
      callId: 'journal-call',
      sandbox: null,
      admission: { kind: 'allow' as const },
    }
    const started = await storage.call(
      'toolStart',
      session.id,
      run.id,
      'journal-call',
      'workspace.exec',
      { command: 'printf', args: ['hello world'], env: { MODE: 'safe' } },
      undefined,
      {
        ...executionMetadata(workspace.id, node.nodeId, session.id, run.id, 'journal-call'),
        authority,
      },
    )
    const startedData = started.data as Record<string, unknown>
    expect(startedData).toMatchObject({
      args: { command: 'printf', args: ['hello world'], env: { MODE: 'safe' } },
      nodeExecution: {
        workspaceId: workspace.id,
        nodeId: node.nodeId,
        rootId: 'engine',
        nodePath: '/srv/engine',
        operationId: `${run.id}:journal-call`,
        kind: 'process',
        authority,
      },
    })
    const metadata = startedData.nodeExecution
    if (!metadata || typeof metadata !== 'object') throw new Error('Expected node execution journal metadata')
    expect(Object.hasOwn(metadata, 'args')).toBe(false)
    const expected = {
      operationId: `${run.id}:journal-call`,
      workspaceId: workspace.id,
      sessionId: session.id,
      runId: run.id,
      callId: 'journal-call',
      name: 'workspace.exec',
      args: { command: 'printf', args: ['hello world'], env: { MODE: 'safe' } },
      nodeId: node.nodeId,
      rootId: 'engine',
      nodePath: '/srv/engine',
      kind: 'process',
      authority,
    }
    registry.dispose()
    registry = null
    await storage.close()

    const clearProjection = (clearIntent: boolean) => {
      const db = new Database(path)
      try {
        db.transaction(() => {
          db.query('DELETE FROM session_event_index WHERE eventId=?').run(started.eventId)
          db.query('DELETE FROM events WHERE eventId=?').run(started.eventId)
          db.query('DELETE FROM tool_intents WHERE id=?').run(expected.operationId)
          if (clearIntent) db.query('DELETE FROM node_execution_intents WHERE operationId=?').run(expected.operationId)
        })()
      } finally {
        db.close()
      }
    }

    clearProjection(true)
    storage = new Storage(path)
    await storage.call('ready')
    expect(await storage.call('pendingNodeExecutionIntents', { limit: 10 })).toMatchObject({
      items: [expected],
      nextCursor: null,
    })

    // Replaying the same canonical identity over an existing projection is idempotent.
    await storage.close()
    clearProjection(false)
    storage = new Storage(path)
    await storage.call('ready')
    expect(await storage.call('pendingNodeExecutionIntents', { limit: 10 })).toMatchObject({
      items: [expected],
      nextCursor: null,
    })
    expect(await storage.call('recover')).toBe(1)
    expect((await storage.call('run', run.id)).status).toBe('interrupted')
    expect(await storage.call('pendingNodeExecutionIntents', { limit: 10 })).toMatchObject({
      items: [],
      nextCursor: null,
    })
    const results = (await storage.call('snapshot', session.id)).messages
      .flatMap((message) => message.content)
      .filter((block) => block.type === 'tool_result')
    expect(results).toMatchObject([{ callId: 'journal-call', outcome: { kind: 'unknown', executionStarted: true } }])
  } finally {
    registry?.dispose()
    await storage.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('historical node journal replays after its completed session moves to a local workspace without becoming pending', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-execution-moved-journal-'))
  const path = join(root, 'host.sqlite')
  let storage = new Storage(path)
  let registry: NodeRegistryService | null = null
  try {
    await storage.call('ready')
    registry = await NodeRegistryService.open(new StorageNodeRegistryPort(storage))
    const node = await registerNode(registry)
    const nodeWorkspace = await storage.call('createNodeWorkspace', { nodeId: node.nodeId, rootId: 'engine' })
    const localWorkspace = await storage.call('createWorkspace', join(root, 'local'), 'Local workspace')
    const session = await storage.call('createSession', nodeWorkspace.id, 'Moved history')
    const run = await storage.call('enqueue', session.id, 'moved-history', { text: 'Run', images: [] }, 'fixture')
    await storage.call('claim', session.id)
    const callId = 'moved-call'
    const started = await storage.call(
      'toolStart',
      session.id,
      run.id,
      callId,
      'workspace.exec',
      { command: 'true' },
      undefined,
      {
        ...executionMetadata(nodeWorkspace.id, node.nodeId, session.id, run.id, callId),
        authority: {
          sessionId: session.id,
          runId: run.id,
          callId,
          sandbox: null,
          admission: { kind: 'allow' as const },
        },
      },
    )
    await storage.call('toolEnd', session.id, run.id, callId)
    await storage.call('setRun', run.id, 'completed')
    await storage.call('moveSession', session.id, localWorkspace.id)
    expect((await storage.call('session', session.id)).workspaceId).toBe(localWorkspace.id)
    registry.dispose()
    registry = null
    await storage.close()

    const db = new Database(path)
    try {
      db.transaction(() => {
        db.query('DELETE FROM session_event_index WHERE eventId=?').run(started.eventId)
        db.query('DELETE FROM events WHERE eventId=?').run(started.eventId)
        db.query('DELETE FROM node_execution_intents WHERE operationId=?').run(`${run.id}:${callId}`)
        db.query('DELETE FROM tool_intents WHERE id=?').run(`${run.id}:${callId}`)
      })()
    } finally {
      db.close()
    }

    storage = new Storage(path)
    await storage.call('ready')
    expect((await storage.call('session', session.id)).workspaceId).toBe(localWorkspace.id)
    expect((await storage.call('run', run.id)).status).toBe('completed')
    expect(await storage.call('pendingNodeExecutionIntents', { limit: 10 })).toMatchObject({
      items: [],
      nextCursor: null,
    })
    await storage.call('moveSession', session.id, nodeWorkspace.id)
    expect((await storage.call('session', session.id)).workspaceId).toBe(nodeWorkspace.id)
    expect(await storage.call('pendingNodeExecutionIntents', { limit: 10 })).toMatchObject({
      items: [],
      nextCursor: null,
    })
    const database = new Database(path)
    try {
      expect(database.query('SELECT status FROM tool_intents WHERE id=?').get(`${run.id}:${callId}`)).toEqual({
        status: 'settled',
      })
    } finally {
      database.close()
    }
  } finally {
    registry?.dispose()
    await storage.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('the current schema migrates a version 28 SQLite database and keeps local rows readable', async () => {
  await fixture(async (storage, _registry, path) => {
    const workspace = await storage.call('createWorkspace', '/legacy-node-intent-migration', 'Legacy')
    await storage.close()
    const database = new Database(path)
    try {
      database.exec(
        'DROP INDEX node_run_workspace_mounts_session; DROP TABLE node_run_workspace_mounts; DROP INDEX node_execution_intents_run_call; DROP TABLE node_execution_intents; DROP INDEX node_run_worktrees_session; DROP TABLE node_run_worktrees; ALTER TABLE approvals DROP COLUMN executionTarget; PRAGMA user_version=28',
      )
      expect(database.query<{ user_version: number }, []>('PRAGMA user_version').get()?.user_version).toBe(28)
      expect(
        database
          .query<{ name: string }, []>(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('node_execution_intents','node_run_worktrees','node_run_workspace_mounts')",
          )
          .all(),
      ).toEqual([])
      expect(
        database
          .query<{ name: string }, []>('PRAGMA table_info(approvals)')
          .all()
          .some((column) => column.name === 'executionTarget'),
      ).toBe(false)
    } finally {
      database.close()
    }
    const migrated = new Storage(path)
    try {
      expect(await migrated.call('ready')).toEqual({ version: STORAGE_SCHEMA_VERSION })
      expect(await migrated.call('workspace', workspace.id)).toEqual(workspace)
      expect(await migrated.call('pendingNodeExecutionIntents', { limit: 10 })).toMatchObject({
        items: [],
        nextCursor: null,
      })
    } finally {
      await migrated.close()
    }
  })
})

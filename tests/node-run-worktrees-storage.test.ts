import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nodeCapabilitiesSchema, nodeFloorSchema } from '@hbar/contracts/node'
import { Storage, STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { StorageNodeRegistryPort } from '@hbar/storage/node-registry'
import { NodeRegistryService } from '@hbar/node-link'
import { createNodeIdentity } from '@hbar/node-core'
import { SANDBOX_EVALUATOR_FINGERPRINT } from '@hbar/sandbox'

test('managed Node worktree binding survives Worker reopen and JSONL projection repair without replaying effects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-run-worktree-'))
  const path = join(root, 'host.sqlite')
  let storage = new Storage(path)
  let registry: NodeRegistryService | null = null
  try {
    await storage.call('ready')
    registry = await NodeRegistryService.open(new StorageNodeRegistryPort(storage))
    const invite = await registry.invite('managed worktree node')
    const identity = createNodeIdentity()
    const node = await registry.join(identity.publicKey, invite.code, 'managed worktree node')
    const {
      roots: _roots,
      protectedPaths: _paths,
      environmentAllowlist: _allowlist,
      ...floor
    } = nodeFloorSchema.parse({ roots: [] })
    const workspaceCapability = {
      rootId: 'engine',
      name: 'Engine',
      nodePath: '/srv/engine',
      access: 'write' as const,
    }
    await registry.touch(
      node.nodeId,
      nodeCapabilitiesSchema.parse({
        protocol: 1,
        nodeId: node.nodeId,
        platform: 'linux',
        evaluator: SANDBOX_EVALUATOR_FINGERPRINT,
        roots: [workspaceCapability],
        sandbox: { backends: ['none'], filesystem: 'none', network: 'none' },
        floor,
      }),
    )
    const workspace = await storage.call('createNodeWorkspace', { nodeId: node.nodeId, rootId: 'engine' })
    const session = await storage.call('createSession', workspace.id, 'Managed worktree run')
    const selection = {
      mode: 'isolated-worktree' as const,
      branch: { kind: 'existing' as const, name: 'feature/managed' },
    }
    await storage.call('setSessionLaunchTarget', {
      sessionId: session.id,
      expectedRevision: 0,
      selection,
      actorId: 'fixture',
      idempotencyKey: 'managed-target',
    })
    const accepted = await storage.call(
      'enqueue',
      session.id,
      'managed-run',
      { text: 'Run in isolation', images: [] },
      'fixture',
      undefined,
      {
        sessionId: session.id,
        expectedRevision: 1,
        selection,
        targetPath: workspace.path,
        branch: 'feature/managed',
        head: null,
      },
    )
    await storage.call('claim', session.id)
    const admission = await storage.call('nodeRunWorktreeAdmission', accepted.id)
    if (!admission) throw new Error('Expected the accepted remote Run to retain its worktree admission snapshot')
    expect(admission).toMatchObject({
      runId: accepted.id,
      sessionId: session.id,
      workspaceId: workspace.id,
      launchTarget: { expectedRevision: 1, selection },
      originalWorkspaceLocation: { nodeId: node.nodeId, rootId: 'engine', nodePath: '/srv/engine' },
    })

    const worktreeId = 'a'.repeat(32)
    const worktreeRootId = `wt_${worktreeId}`
    const worktreePath = `/srv/engine/.hbar-worktrees/${worktreeId}`
    const worktree = {
      worktreeId,
      sessionId: session.id,
      createdByRunId: accepted.id,
      targetRevision: admission.launchTarget.expectedRevision,
      worktreeRootId,
      parentRootId: 'engine',
      nodePath: worktreePath,
      branch: 'feature/managed',
      createdAt: Date.now(),
    }
    const wrongBranch = await storage
      .call('nodeRunWorktreeBind', {
        runId: accepted.id,
        launchTargetRevision: admission.launchTarget.expectedRevision,
        worktree: { ...worktree, branch: 'feature/forged' },
      })
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(wrongBranch).toMatchObject({ code: 'COMMAND_CONFLICT' })
    const staleRevision = await storage
      .call('nodeRunWorktreeBind', {
        runId: accepted.id,
        launchTargetRevision: admission.launchTarget.expectedRevision + 1,
        worktree,
      })
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(staleRevision).toMatchObject({ code: 'COMMAND_CONFLICT' })
    const forgedRoot = await storage
      .call('nodeRunWorktreeBind', {
        runId: accepted.id,
        launchTargetRevision: admission.launchTarget.expectedRevision,
        worktree: { ...worktree, worktreeRootId: 'caller-chosen-root' },
      })
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(forgedRoot).toMatchObject({ code: 'WORKSPACE_SCOPE' })

    const binding = await storage.call('nodeRunWorktreeBind', {
      runId: accepted.id,
      launchTargetRevision: admission.launchTarget.expectedRevision,
      worktree,
    })
    expect(binding).toMatchObject({
      runId: accepted.id,
      workspaceId: workspace.id,
      nodeId: node.nodeId,
      parentRootId: 'engine',
      worktreeRootId,
      worktreeId,
      nodePath: worktreePath,
      launchTargetRevision: admission.launchTarget.expectedRevision,
      originalWorkspaceLocation: { rootId: 'engine', nodePath: '/srv/engine' },
    })
    expect(
      await storage.call('nodeRunWorktreeBind', {
        runId: accepted.id,
        launchTargetRevision: admission.launchTarget.expectedRevision,
        worktree,
      }),
    ).toEqual(binding)
    expect(
      (await storage.call('events', session.id, 0, 100)).filter((event) => event.type === 'run.worktreeBound'),
    ).toHaveLength(1)
    expect(await storage.call('nodeRunWorktree', accepted.id)).toEqual(binding)

    const nextRun = await storage.call(
      'enqueue',
      session.id,
      'managed-run-next',
      { text: 'Continue in isolation', images: [] },
      'fixture',
    )
    const nextBinding = await storage.call('nodeRunWorktreeBind', {
      runId: nextRun.id,
      launchTargetRevision: admission.launchTarget.expectedRevision,
      worktree,
    })
    expect(nextBinding).toMatchObject({ runId: nextRun.id, worktreeId, worktreeCreatedByRunId: accepted.id })
    expect(
      (await storage.call('events', session.id, 0, 100)).filter((event) => event.type === 'run.worktreeBound'),
    ).toHaveLength(2)

    const movedWhileActive = await storage
      .call('moveSession', session.id, (await storage.call('createWorkspace', join(root, 'local'), 'Local')).id)
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(movedWhileActive).toMatchObject({ code: 'BUSY' })

    const callId = 'managed-call'
    await storage.call('toolStart', session.id, accepted.id, callId, 'workspace.exec', { command: 'true' }, undefined, {
      workspaceId: workspace.id,
      nodeId: node.nodeId,
      rootId: worktreeRootId,
      nodePath: worktreePath,
      operationId: `${accepted.id}:${callId}`,
      kind: 'process',
      authority: {
        sessionId: session.id,
        runId: accepted.id,
        callId,
        sandbox: null,
        admission: { kind: 'allow' },
        managedWorktree: { worktreeId, targetRevision: binding.worktreeTargetRevision },
      },
    })
    expect(await storage.call('pendingNodeExecutionIntents', { runIds: [accepted.id], limit: 10 })).toMatchObject({
      items: [{ rootId: worktreeRootId, nodePath: worktreePath, callId }],
    })

    registry.dispose()
    registry = null
    await storage.close()
    const clearProjection = () => {
      const database = new Database(path)
      try {
        database.transaction(() => {
          database
            .query(
              "DELETE FROM session_event_index WHERE eventId IN (SELECT eventId FROM events WHERE runId IN (?,?) AND type IN ('run.worktreeBound','tool.started'))",
            )
            .run(accepted.id, nextRun.id)
          database
            .query("DELETE FROM events WHERE runId IN (?,?) AND type IN ('run.worktreeBound','tool.started')")
            .run(accepted.id, nextRun.id)
          database.query('DELETE FROM node_run_worktrees WHERE worktreeId=?').run(worktreeId)
          database.query('DELETE FROM node_execution_intents WHERE runId=?').run(accepted.id)
          database.query('DELETE FROM tool_intents WHERE runId=?').run(accepted.id)
        })()
      } finally {
        database.close()
      }
    }
    clearProjection()

    storage = new Storage(path)
    expect(await storage.call('ready')).toEqual({ version: STORAGE_SCHEMA_VERSION })
    expect(await storage.call('nodeRunWorktreeAdmission', accepted.id)).toEqual(admission)
    expect(await storage.call('nodeRunWorktree', accepted.id)).toEqual(binding)
    expect(await storage.call('nodeRunWorktree', nextRun.id)).toEqual(nextBinding)
    const pending = await storage.call('pendingNodeExecutionIntents', { runIds: [accepted.id], limit: 10 })
    expect(pending.items).toMatchObject([{ rootId: worktreeRootId, nodePath: worktreePath, callId }])
    expect(await storage.call('recover')).toBe(1)
    expect((await storage.call('run', accepted.id)).status).toBe('interrupted')
    expect(await storage.call('pendingNodeExecutionIntents', { runIds: [accepted.id], limit: 10 })).toMatchObject({
      items: [],
      nextCursor: null,
    })
    const toolResults = (await storage.call('snapshot', session.id)).messages
      .flatMap((message) => message.content)
      .filter((block) => block.type === 'tool_result')
    expect(toolResults).toMatchObject([{ callId, outcome: { kind: 'unknown', executionStarted: true } }])
    expect((await storage.call('events', session.id, 0, 100)).some((event) => event.type === 'run.worktreeBound')).toBe(
      true,
    )
  } finally {
    registry?.dispose()
    await storage.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('managed Node worktree binding rejects session movement between Run admission and binding', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-run-worktree-move-'))
  const path = join(root, 'host.sqlite')
  let storage = new Storage(path)
  let registry: NodeRegistryService | null = null
  try {
    await storage.call('ready')
    registry = await NodeRegistryService.open(new StorageNodeRegistryPort(storage))
    const invite = await registry.invite('move race node')
    const identity = createNodeIdentity()
    const node = await registry.join(identity.publicKey, invite.code, 'move race node')
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
    const workspace = await storage.call('createNodeWorkspace', { nodeId: node.nodeId, rootId: 'engine' })
    const local = await storage.call('createWorkspace', join(root, 'local'), 'Local')
    const session = await storage.call('createSession', workspace.id, 'Move race')
    const selection = {
      mode: 'isolated-worktree' as const,
      branch: { kind: 'existing' as const, name: 'feature/remote' },
    }
    await storage.call('setSessionLaunchTarget', {
      sessionId: session.id,
      expectedRevision: 0,
      selection,
      actorId: 'fixture',
      idempotencyKey: 'remote-target',
    })
    const target = await storage.call('sessionLaunchTarget', session.id)
    const run = await storage.call(
      'enqueue',
      session.id,
      'move-race',
      { text: 'Run', images: [] },
      'fixture',
      undefined,
      {
        sessionId: session.id,
        expectedRevision: target.revision,
        selection,
        targetPath: workspace.path,
        branch: 'feature/remote',
        head: null,
      },
    )
    await storage.close()

    const database = new Database(path)
    try {
      database.query('UPDATE sessions SET workspaceId=? WHERE id=?').run(local.id, session.id)
    } finally {
      database.close()
    }
    storage = new Storage(path)
    await storage.call('ready')
    const admission = await storage.call('nodeRunWorktreeAdmission', run.id)
    expect(admission).toMatchObject({
      workspaceId: workspace.id,
      launchTarget: { expectedRevision: target.revision, selection },
      originalWorkspaceLocation: { rootId: 'engine' },
    })
    const worktreeId = 'c'.repeat(32)
    const error = await storage
      .call('nodeRunWorktreeBind', {
        runId: run.id,
        launchTargetRevision: admission?.launchTarget.expectedRevision ?? 0,
        worktree: {
          worktreeId,
          sessionId: session.id,
          createdByRunId: run.id,
          targetRevision: admission?.launchTarget.expectedRevision ?? 0,
          worktreeRootId: `wt_${worktreeId}`,
          parentRootId: 'engine',
          nodePath: `/srv/engine/.hbar-worktrees/${worktreeId}`,
          branch: 'feature/remote',
          createdAt: Date.now(),
        },
      })
      .then(
        () => null,
        (failure: unknown) => failure,
      )
    expect(error).toMatchObject({ code: 'WORKSPACE_SCOPE' })
    expect(await storage.call('nodeRunWorktree', run.id)).toBeNull()
  } finally {
    registry?.dispose()
    await storage.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('shared-current Run cannot bind a managed child worktree', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-run-worktree-shared-'))
  const path = join(root, 'host.sqlite')
  const storage = new Storage(path)
  let registry: NodeRegistryService | null = null
  try {
    await storage.call('ready')
    registry = await NodeRegistryService.open(new StorageNodeRegistryPort(storage))
    const invite = await registry.invite('shared current node')
    const identity = createNodeIdentity()
    const node = await registry.join(identity.publicKey, invite.code, 'shared current node')
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
    const workspace = await storage.call('createNodeWorkspace', { nodeId: node.nodeId, rootId: 'engine' })
    const session = await storage.call('createSession', workspace.id, 'Shared current worktree denial')
    const run = await storage.call(
      'enqueue',
      session.id,
      'shared-current-denial',
      { text: 'Run', images: [] },
      'fixture',
    )
    const admission = await storage.call('nodeRunWorktreeAdmission', run.id)
    if (!admission) throw new Error('Expected the accepted remote Run to retain its workspace snapshot')
    const worktreeId = 'b'.repeat(32)
    const error = await storage
      .call('nodeRunWorktreeBind', {
        runId: run.id,
        launchTargetRevision: admission.launchTarget.expectedRevision,
        worktree: {
          worktreeId,
          sessionId: session.id,
          createdByRunId: run.id,
          targetRevision: admission.launchTarget.expectedRevision,
          worktreeRootId: `wt_${worktreeId}`,
          parentRootId: 'engine',
          nodePath: `/srv/engine/.hbar-worktrees/${worktreeId}`,
          branch: 'hbar/run/shared-current',
          createdAt: Date.now(),
        },
      })
      .then(
        () => null,
        (failure: unknown) => failure,
      )
    expect(error).toMatchObject({ code: 'COMMAND_CONFLICT' })
    expect(await storage.call('nodeRunWorktree', run.id)).toBeNull()
  } finally {
    registry?.dispose()
    await storage.close()
    await rm(root, { recursive: true, force: true })
  }
})

import { afterEach, describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { nodeFloorSchema, type NodeCallAuthority } from '@hbar/contracts/node'
import {
  acceptedNodeWorktreeTargetDigest,
  acceptedWorkspaceFolderDigest,
  type NodeWorktreeProvisioningAuthority,
} from '@hbar/contracts/node-worktree-provisioning'
import { nodeWorkspaceMountManifestSchema } from '@hbar/contracts/node-workspace-mount-plan'
import { NodeStateStorage } from '@hbar/storage/node-state'
import { NodeLocalConfirmationStorage } from '@hbar/storage/node-local-confirmations'
import { LocalExecution } from '@hbar/local-tools'
import { WorkspaceNodeProtocol, WorkspaceNodeService, nodeProtectedPaths } from '@hbar/node-core'
import { createManagedNodeBackend } from '../apps/node/src/managed-backend'
import { installManagedNodeWorktrees } from '../apps/node/src/managed-worktrees'
import { createWorkspaceNodeGitRuntime } from '../apps/node/src/git-runtime'
import { createNodeGitRunner } from '../packages/node-core/src/git-service'
import { nodeWorkspaceMountManifestDigest } from '../packages/node-core/src/workspace-mount-plan'

const temporary: string[] = []

async function git(cwd: string, ...args: string[]): Promise<void> {
  const child = Bun.spawn(['git', ...args], { cwd, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code !== 0) throw new Error(stderr || stdout || `git exited ${code}`)
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('production managed Git worktree composition', () => {
  it.skipIf(process.platform === 'win32')(
    'routes named worktree create and remove through protocol, durable Git receipts, and managed argv',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'hbar-node-worktree-production-'))
      temporary.push(root)
      const repository = join(root, 'shared')
      const dataRoot = join(root, 'node-private')
      await mkdir(repository)
      await mkdir(dataRoot)
      await git(repository, 'init', '--initial-branch=main')
      await git(repository, 'config', 'user.name', 'Production Worktree Test')
      await git(repository, 'config', 'user.email', 'production-worktree@example.invalid')
      await writeFile(join(repository, 'tracked.txt'), 'initial\n')
      await git(repository, 'add', '--', 'tracked.txt')
      await git(repository, 'commit', '-m', 'initial')

      const state = new NodeStateStorage(join(dataRoot, 'node.sqlite'))
      await state.call('ready', {})
      const floor = nodeFloorSchema.parse({
        roots: [{ rootId: 'engine', name: 'Engine', path: repository, access: 'write' }],
        process: true,
        network: false,
        backend: 'auto',
        osConfinement: 'required',
        environmentAllowlist: ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR'],
        localConfirm: 'write',
      })
      await state.call('floor.set', floor)
      const backend = await createManagedNodeBackend({ dataRoot, backend: 'auto' })
      let node: WorkspaceNodeService | undefined
      const execution = new LocalExecution([dataRoot], undefined, undefined, {
        get: (workspace) => nodeProtectedPaths(node?.policy ?? floor, dataRoot, workspace),
      })
      node = await WorkspaceNodeService.open('node-worktree-production', dataRoot, state, execution, backend)
      node.installLocalConfirmations(new NodeLocalConfirmationStorage(state))
      const protocol = new WorkspaceNodeProtocol(node)
      node.installGit((gitRoot) => createWorkspaceNodeGitRuntime(gitRoot, createNodeGitRunner()))
      await installManagedNodeWorktrees(node)

      const folderSnapshot = {
        schemaVersion: 1 as const,
        workspaceId: 'workspace-production',
        revision: 1,
        folders: [{ id: 'engine-folder', alias: 'engine', path: repository }],
      }
      const makeProvisioning = (runId: string, acceptedFolders = folderSnapshot): NodeWorktreeProvisioningAuthority => {
        const accepted = {
          workspaceId: acceptedFolders.workspaceId,
          sessionId: 'session-production',
          runId,
          nodeId: 'node-worktree-production',
          targetRevision: 7,
          selection: {
            mode: 'isolated-worktree' as const,
            branch: { kind: 'new' as const, name: 'hbar/session-production', startPoint: 'main' },
          },
          workspaceFolderRevision: acceptedFolders.revision,
          workspaceFolderDigest: acceptedWorkspaceFolderDigest(acceptedFolders),
        }
        return {
          kind: 'launch-target',
          ...accepted,
          acceptedTargetDigest: acceptedNodeWorktreeTargetDigest(accepted),
        }
      }
      const createProvisioning = makeProvisioning('run-production')
      const createOperationId = `${createProvisioning.runId}:worktree-create`
      const createInput = {
        operationId: createOperationId,
        rootId: 'engine',
        expectedRoot: repository,
        provisioning: createProvisioning,
        branch: 'hbar/session-production',
        startPoint: 'main',
        createBranch: true,
      }
      const getBeforeCreateInput = {
        operationId: `${createProvisioning.runId}:worktree-get`,
        rootId: 'engine',
        expectedRoot: repository,
        provisioning: createProvisioning,
        branch: 'hbar/session-production',
        startPoint: 'main',
        createBranch: true,
      }
      expect(await protocol.invoke('worktree.get', getBeforeCreateInput, AbortSignal.timeout(10_000))).toBeNull()
      let createPending: unknown
      try {
        await protocol.invoke('worktree.create', createInput, AbortSignal.timeout(60_000))
      } catch (error) {
        createPending = error
      }
      expect(createPending).toMatchObject({ code: 'NODE_LOCAL_CONFIRMATION_PENDING' })
      const pendingCreate = await node.listLocalConfirmations()
      const createConfirmation = pendingCreate.entries[0]
      expect(createConfirmation?.identity).toMatchObject({
        source: 'launch-target',
        operationId: createOperationId,
        sessionId: createProvisioning.sessionId,
        runId: createProvisioning.runId,
        acceptedTargetDigest: createProvisioning.acceptedTargetDigest,
      })
      if (!createConfirmation) throw new Error('B did not queue launch-target confirmation')
      await node.resolveLocalConfirmation(
        { deviceId: 'bootstrap-local', role: 'operator' },
        { confirmationId: createConfirmation.id, decision: 'approve' },
      )
      const created = await protocol.invoke('worktree.create', createInput, AbortSignal.timeout(60_000))
      expect(created).toMatchObject({
        sessionId: createProvisioning.sessionId,
        createdByRunId: createProvisioning.runId,
        targetRevision: 7,
        parentRootId: 'engine',
      })
      const worktree = created as { worktreeId: string; worktreeRootId: string; nodePath: string }
      expect(worktree.nodePath).toBe(resolve(repository, '.hbar-worktrees', worktree.worktreeId))
      expect(await protocol.invoke('worktree.get', getBeforeCreateInput, AbortSignal.timeout(10_000))).toMatchObject({
        worktreeId: worktree.worktreeId,
        nodePath: worktree.nodePath,
      })
      expect(
        (await state.call('operation.get', { operationId: getBeforeCreateInput.operationId }))?.kind,
      ).toBeUndefined()
      expect((await state.call('operation.get', { operationId: createOperationId }))?.kind).toBe('git')
      expect((await state.call('operation.get', { operationId: createOperationId }))?.authority).toMatchObject({
        kind: 'launch-target',
        acceptedTargetDigest: createProvisioning.acceptedTargetDigest,
      })
      expect(
        (await state.call('audit.list', { after: 0, limit: 100 })).some((entry) => entry.source === 'launch-target'),
      ).toBe(true)
      expect(await Bun.file(join(worktree.nodePath, 'tracked.txt')).text()).toBe('initial\n')

      const mountUnsigned = {
        schemaVersion: 1 as const,
        workspaceId: 'workspace-production',
        revision: 1,
        nodeId: 'node-worktree-production',
        primaryRootId: 'engine',
        roots: [{ rootId: 'engine', expectedRoot: repository, alias: 'engine' }],
      }
      const workspaceMounts = nodeWorkspaceMountManifestSchema.parse({
        ...mountUnsigned,
        digest: nodeWorkspaceMountManifestDigest(mountUnsigned),
      })
      const childAuthority: NodeCallAuthority = {
        sessionId: 'session-production',
        runId: 'run-production',
        callId: 'child-read',
        sandbox: null,
        admission: { kind: 'allow' },
        workspaceMounts,
        managedWorktree: { worktreeId: worktree.worktreeId, targetRevision: 7 },
      }
      const readInput = {
        rootId: worktree.worktreeRootId,
        expectedRoot: worktree.nodePath,
        path: 'tracked.txt',
        authority: childAuthority,
      }
      const initialRead = await protocol.invoke('fs.readBytes', readInput, AbortSignal.timeout(10_000))
      expect(Buffer.from((initialRead as { data: string }).data, 'base64').toString('utf8')).toBe('initial\n')
      await expect(
        protocol.invoke(
          'fs.readBytes',
          {
            ...readInput,
            authority: { ...childAuthority, managedWorktree: undefined },
          },
          AbortSignal.timeout(5_000),
        ),
      ).rejects.toThrow()
      await expect(
        protocol.invoke(
          'fs.readBytes',
          {
            ...readInput,
            authority: {
              ...childAuthority,
              managedWorktree: { worktreeId: '0'.repeat(32), targetRevision: 7 },
            },
          },
          AbortSignal.timeout(5_000),
        ),
      ).rejects.toThrow()
      await expect(
        protocol.invoke('fs.readBytes', { ...readInput, expectedRoot: repository }, AbortSignal.timeout(5_000)),
      ).rejects.toThrow()

      const writeAuthority: NodeCallAuthority = {
        sessionId: 'session-production',
        runId: 'run-production',
        callId: 'child-write',
        sandbox: null,
        admission: { kind: 'allow' },
        workspaceMounts,
        managedWorktree: { worktreeId: worktree.worktreeId, targetRevision: 7 },
      }
      const edit = 'preserved\n'
      const editInput = {
        ...readInput,
        authority: writeAuthority,
        operationId: `${writeAuthority.runId}:${writeAuthority.callId}`,
        offset: 0,
        totalBytes: Buffer.byteLength(edit),
        data: Buffer.from(edit).toString('base64'),
        final: true,
      }
      let editPending: unknown
      try {
        await protocol.invoke('fs.write', editInput, AbortSignal.timeout(10_000))
      } catch (error) {
        editPending = error
      }
      expect(editPending).toMatchObject({ code: 'NODE_LOCAL_CONFIRMATION_PENDING' })
      const pendingEdit = await node.listLocalConfirmations()
      const editConfirmation = pendingEdit.entries.find((entry) => entry.identity.operationId === editInput.operationId)
      if (!editConfirmation) throw new Error('B did not queue child edit confirmation')
      await node.resolveLocalConfirmation(
        { deviceId: 'bootstrap-local', role: 'operator' },
        { confirmationId: editConfirmation.id, decision: 'approve' },
      )
      await protocol.invoke('fs.write', editInput, AbortSignal.timeout(10_000))
      expect(await Bun.file(join(worktree.nodePath, 'tracked.txt')).text()).toBe(edit)
      const laterFolderSnapshot = {
        ...folderSnapshot,
        revision: folderSnapshot.revision + 1,
        folders: [
          ...folderSnapshot.folders,
          { id: 'tools-folder', alias: 'tools', path: join(root, 'another-registered-location') },
        ],
      }
      const laterProvisioning = makeProvisioning('run-later-production', laterFolderSnapshot)
      expect(laterProvisioning.acceptedTargetDigest).toBe(createProvisioning.acceptedTargetDigest)
      const lookedUp = await protocol.invoke(
        'worktree.get',
        {
          operationId: `${laterProvisioning.runId}:worktree-get`,
          rootId: 'engine',
          expectedRoot: repository,
          provisioning: laterProvisioning,
          branch: 'hbar/session-production',
          startPoint: 'main',
          createBranch: true,
        },
        AbortSignal.timeout(10_000),
      )
      expect(lookedUp).toMatchObject({ worktreeId: worktree.worktreeId, nodePath: worktree.nodePath })
      const reused = await protocol.invoke(
        'worktree.create',
        {
          operationId: `${laterProvisioning.runId}:worktree-create`,
          rootId: 'engine',
          expectedRoot: repository,
          provisioning: laterProvisioning,
          branch: 'hbar/session-production',
          startPoint: 'main',
          createBranch: true,
        },
        AbortSignal.timeout(10_000),
      )
      expect(reused).toMatchObject({ worktreeId: worktree.worktreeId, nodePath: worktree.nodePath })
      expect(await Bun.file(join(worktree.nodePath, 'tracked.txt')).text()).toBe(edit)
      const restoreAuthority: NodeCallAuthority = {
        sessionId: 'session-production',
        runId: 'run-production',
        callId: 'child-restore',
        sandbox: null,
        admission: { kind: 'allow' },
        workspaceMounts,
        managedWorktree: { worktreeId: worktree.worktreeId, targetRevision: 7 },
      }
      const original = 'initial\n'
      const restoreInput = {
        ...readInput,
        authority: restoreAuthority,
        operationId: `${restoreAuthority.runId}:${restoreAuthority.callId}`,
        offset: 0,
        totalBytes: Buffer.byteLength(original),
        data: Buffer.from(original).toString('base64'),
        final: true,
      }
      let restorePending: unknown
      try {
        await protocol.invoke('fs.write', restoreInput, AbortSignal.timeout(10_000))
      } catch (error) {
        restorePending = error
      }
      expect(restorePending).toMatchObject({ code: 'NODE_LOCAL_CONFIRMATION_PENDING' })
      const pendingRestore = await node.listLocalConfirmations()
      const restoreConfirmation = pendingRestore.entries.find(
        (entry) => entry.identity.operationId === restoreInput.operationId,
      )
      if (!restoreConfirmation) throw new Error('B did not queue child restore confirmation')
      await node.resolveLocalConfirmation(
        { deviceId: 'bootstrap-local', role: 'operator' },
        { confirmationId: restoreConfirmation.id, decision: 'approve' },
      )
      await protocol.invoke('fs.write', restoreInput, AbortSignal.timeout(10_000))

      const removeProvisioning = makeProvisioning('run-remove-production')
      const removeOperationId = `${removeProvisioning.runId}:worktree-remove`
      const removeInput = {
        operationId: removeOperationId,
        rootId: 'engine',
        expectedRoot: repository,
        worktreeId: worktree.worktreeId,
        provisioning: removeProvisioning,
      }
      let removePending: unknown
      try {
        await protocol.invoke('worktree.remove', removeInput, AbortSignal.timeout(60_000))
      } catch (error) {
        removePending = error
      }
      expect(removePending).toMatchObject({ code: 'NODE_LOCAL_CONFIRMATION_PENDING' })
      const pendingRemove = await node.listLocalConfirmations()
      const removeConfirmation = pendingRemove.entries.at(-1)
      if (!removeConfirmation) throw new Error('B did not queue worktree removal confirmation')
      await node.resolveLocalConfirmation(
        { deviceId: 'bootstrap-local', role: 'operator' },
        { confirmationId: removeConfirmation.id, decision: 'approve' },
      )
      await protocol.invoke('worktree.remove', removeInput, AbortSignal.timeout(60_000))
      expect((await state.call('operation.get', { operationId: removeOperationId }))?.kind).toBe('git')
      expect(await Bun.file(worktree.nodePath).exists()).toBe(false)
      await protocol.dispose()
      await node.dispose()
      node = undefined
      await state.close()
    },
    90_000,
  )
})

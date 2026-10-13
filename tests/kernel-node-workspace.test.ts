import { expect, spyOn, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { WorkspaceExecutionScope } from '@hbar/kernel'
import type { Workspace } from '@hbar/contracts'
import type { NodeWorkspaceInspectionPort } from '@hbar/kernel/node-workspace-inspection'
import type { NodeExecutionTarget } from '@hbar/contracts/node-execution-target'
import type { NodeManagedWorktree } from '@hbar/contracts/node-worktree'
import { nodeCapabilitiesSchema } from '@hbar/contracts/node'
import { createNodeIdentity, nodeIdFromPublicKey } from '@hbar/node-core'
import { SANDBOX_EVALUATOR_FINGERPRINT } from '@hbar/sandbox'
import type { ToolDefinition } from '@hbar/plugin-sdk'
import type { NodeWorktreePort } from '@hbar/kernel'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { nodeWorktreeProvisioningAuthoritySchema } from '@hbar/contracts/node-worktree-provisioning'
import { parseNodeWorkspaceLocator } from '@hbar/contracts/node-address'

test('a node-owned Run executes in its B-managed worktree with durable per-Run authority', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-kernel-node-workspace-'))
  let executionTarget: NodeExecutionTarget = { kind: 'local' }
  let knownNodeId = ''
  let managedWorktree: NodeManagedWorktree | null = null
  const nodeWorktrees: NodeWorktreePort = {
    create: async (_nodeId, request) => {
      const provisioning = nodeWorktreeProvisioningAuthoritySchema.parse(request.provisioning)
      const created: NodeManagedWorktree = {
        worktreeId: 'c'.repeat(32),
        sessionId: provisioning.sessionId,
        createdByRunId: provisioning.runId,
        targetRevision: provisioning.targetRevision,
        worktreeRootId: `wt_${'c'.repeat(32)}`,
        parentRootId: request.rootId,
        nodePath: '/srv/engine/.hbar-worktrees/c',
        branch: request.branch,
        createdAt: Date.now(),
      }
      managedWorktree = created
      executionTarget = {
        kind: 'node',
        nodeId: knownNodeId,
        nodeName: 'Builder',
        rootId: created.worktreeRootId,
        nodePath: created.nodePath,
        rootAccess: 'write',
        capabilitySummary: {
          backends: ['none'],
          filesystem: 'none',
          network: 'none',
          floor: { process: true, network: false, terminal: false, osConfinement: 'off' },
          observedAt: Date.now(),
        },
      }
      return created
    },
    get: async () => managedWorktree,
    remove: async () => {},
  }
  const nodeWorkspaceInspection: NodeWorkspaceInspectionPort = {
    captureExecutionTarget: async () => executionTarget,
    resolveWorkspaceMountManifest: async (_request, folders, primary) => {
      const unsigned = {
        schemaVersion: 1 as const,
        workspaceId: folders.workspaceId,
        revision: folders.revision,
        nodeId: primary.nodeId,
        primaryRootId: primary.rootId,
        roots: folders.folders.map((folder) => {
          const locator = parseNodeWorkspaceLocator(folder.path)
          if (!locator) throw new Error('The test mount is not a node workspace locator')
          return { rootId: locator.rootId, expectedRoot: '/srv/engine', alias: folder.alias }
        }),
      }
      return { ...unsigned, digest: createHash('sha256').update(JSON.stringify(unsigned)).digest('hex') }
    },
    verifyWorkspaceFolders: async (_nodeId, folders) => folders,
  }
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    nodeWorkspaceInspection,
    nodeWorktrees,
  })
  try {
    const identity = createNodeIdentity()
    const nodeId = nodeIdFromPublicKey(identity.publicKey)
    knownNodeId = nodeId
    const capabilities = nodeCapabilitiesSchema.parse({
      protocol: 1,
      nodeId,
      platform: 'linux',
      evaluator: SANDBOX_EVALUATOR_FINGERPRINT,
      roots: [{ rootId: 'engine', name: 'Engine', nodePath: '/srv/engine', access: 'write' }],
      sandbox: { backends: ['none'], filesystem: 'none', network: 'none' },
      floor: { process: true, network: false, terminal: false, osConfinement: 'off' },
    })
    await kernel.storage.call('nodeRegister', {
      nodeId,
      publicKey: identity.publicKey,
      name: 'Builder',
      createdAt: Date.now(),
    })
    await kernel.storage.call('nodeTouch', nodeId, Date.now(), capabilities)
    const workspace = await kernel.createNodeWorkspace({ nodeId, rootId: 'engine' })
    const folderSnapshot = await kernel.storage.call('workspaceFolders', workspace.id)
    const primaryAlias = folderSnapshot.folders[0]?.alias
    if (!primaryAlias) throw new Error('The remote workspace has no primary folder alias')
    const session = await kernel.createSession(workspace.id)
    await kernel.setSessionLaunchTarget({
      actorId: 'test-user',
      idempotencyKey: 'remote-isolated-target',
      sessionId: session.id,
      expectedRevision: 0,
      selection: { mode: 'isolated-worktree', branch: { kind: 'new', name: 'feature/remote-run' } },
    })
    executionTarget = {
      kind: 'node',
      nodeId,
      nodeName: 'Builder',
      rootId: 'engine',
      nodePath: '/srv/engine',
      rootAccess: 'write',
      capabilitySummary: {
        backends: ['none'],
        filesystem: 'none',
        network: 'none',
        floor: { process: true, network: false, terminal: false, osConfinement: 'off' },
        observedAt: Date.now(),
      },
    }
    const targetSpy = spyOn(kernel.sessionLaunchTargets, 'workspaceForRun')
    const mountSpy = spyOn(kernel.workspaceSandboxes, 'prepare')
    const modelWorkspacePaths: string[] = []
    const modelSystems: string[] = []
    const removeContextHook = kernel.hooks.on('context.build', (request) => {
      const workspacePath = request.context?.workspacePath
      if (typeof workspacePath !== 'string') throw new Error('Model context omitted its workspace path')
      modelWorkspacePaths.push(workspacePath)
      modelSystems.push(request.system)
      return request
    })
    const observed: { readonly contextWorkspace: Workspace; readonly scope: WorkspaceExecutionScope | undefined }[] = []
    const tool: ToolDefinition = {
      name: 'scope_probe',
      description: 'Capture the active owner scope for the remote workspace test.',
      inputSchema: z.object({}),
      effect: 'read',
      workspaceAccess: { kind: 'workspace' },
      execute: async (_args, context) => {
        observed.push({ contextWorkspace: context.workspace, scope: kernel.workspaceExecutionScope() })
        return { text: 'captured' }
      },
    }
    const removeTool = kernel.tools.register(tool)
    try {
      await kernel.setPermissionMode('allow')
      const run = await kernel.submit(
        session.id,
        'node-worktree-owner-scope',
        { text: '/tool scope_probe {}', images: [] },
        'local-fixture',
        undefined,
        undefined,
        1,
      )
      await kernel.waitForIdle()
      const storedRun = await kernel.storage.call('run', run.id)
      expect(storedRun.status).toBe('completed')
      expect(targetSpy).not.toHaveBeenCalled()
      expect(mountSpy).not.toHaveBeenCalled()
      expect(modelWorkspacePaths.length).toBeGreaterThan(0)
      expect(modelWorkspacePaths.every((path) => path === '/srv/engine/.hbar-worktrees/c')).toBe(true)
      expect(modelSystems.join('\n')).toContain(`${primaryAlias}/relative-path`)
      expect(modelSystems.join('\n')).toContain(`/workspace/${primaryAlias}/relative-path`)
      expect(observed).toHaveLength(1)
      const capture = observed[0]
      expect(capture).toBeDefined()
      if (!capture) throw new Error('The remote tool did not capture its owner scope')
      expect(capture).toMatchObject({
        contextWorkspace: {
          path: `hbar-node://${nodeId}/wt_${'c'.repeat(32)}`,
          location: { kind: 'node', nodeId, rootId: `wt_${'c'.repeat(32)}`, nodePath: '/srv/engine/.hbar-worktrees/c' },
        },
        scope: {
          workspace: { path: `hbar-node://${nodeId}/wt_${'c'.repeat(32)}` },
          authority: {
            sessionId: session.id,
            runId: run.id,
            sandbox: null,
            admission: { kind: 'allow' },
            workspaceMounts: {
              workspaceId: workspace.id,
              nodeId,
              primaryRootId: 'engine',
              roots: [{ rootId: 'engine', expectedRoot: '/srv/engine', alias: primaryAlias }],
            },
          },
        },
      })
      expect(capture.scope?.authority?.callId).toBeString()
      expect(capture.scope?.authority?.workspaceMounts?.digest).toMatch(/^[a-f0-9]{64}$/)
      expect(capture.scope?.signal.aborted).toBe(false)
      expect(managedWorktree).not.toBeNull()
      expect(modelWorkspacePaths.at(-1)).toBe('/srv/engine/.hbar-worktrees/c')
      expect(observed).toHaveLength(1)
      expect(capture.contextWorkspace.location).toEqual({
        kind: 'node',
        nodeId,
        rootId: `wt_${'c'.repeat(32)}`,
        nodePath: '/srv/engine/.hbar-worktrees/c',
      })
      expect(capture.scope?.authority?.managedWorktree).toEqual({
        worktreeId: 'c'.repeat(32),
        targetRevision: 1,
      })
    } finally {
      await removeTool()
      await removeContextHook()
      targetSpy.mockRestore()
      mountSpy.mockRestore()
    }
  } finally {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

import { expect, spyOn, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { WorkspaceExecutionScope } from '@hbar/kernel'
import type { Workspace } from '@hbar/contracts'
import { nodeCapabilitiesSchema } from '@hbar/contracts/node'
import { createNodeIdentity, nodeIdFromPublicKey } from '@hbar/node-core'
import { SANDBOX_EVALUATOR_FINGERPRINT } from '@hbar/sandbox'
import type { ToolDefinition } from '@hbar/plugin-sdk'
import { z } from 'zod'

test('a node-owned Run keeps its B workspace and supplies admitted authority only during tool execution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-kernel-node-workspace-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  try {
    const identity = createNodeIdentity()
    const nodeId = nodeIdFromPublicKey(identity.publicKey)
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
    const session = await kernel.createSession(workspace.id)
    const targetSpy = spyOn(kernel.sessionLaunchTargets, 'workspaceForRun')
    const mountSpy = spyOn(kernel.workspaceSandboxes, 'prepare')
    const modelWorkspacePaths: string[] = []
    const removeContextHook = kernel.hooks.on('context.build', (request) => {
      const workspacePath = request.context?.workspacePath
      if (typeof workspacePath !== 'string') throw new Error('Model context omitted its workspace path')
      modelWorkspacePaths.push(workspacePath)
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
        'node-workspace-owner-scope',
        { text: '/tool scope_probe {}', images: [] },
        'local-fixture',
      )
      await kernel.waitForIdle()
      expect((await kernel.storage.call('run', run.id)).status).toBe('completed')
      expect(targetSpy).not.toHaveBeenCalled()
      expect(mountSpy).not.toHaveBeenCalled()
      expect(modelWorkspacePaths.length).toBeGreaterThan(0)
      expect(modelWorkspacePaths.every((path) => path === '/srv/engine')).toBe(true)
      expect(observed).toHaveLength(1)
      const capture = observed[0]
      expect(capture).toBeDefined()
      if (!capture) throw new Error('The remote tool did not capture its owner scope')
      expect(capture).toMatchObject({
        contextWorkspace: { path: workspace.path, location: workspace.location },
        scope: {
          workspace: { path: workspace.path, location: workspace.location },
          authority: {
            sessionId: session.id,
            runId: run.id,
            sandbox: null,
            admission: { kind: 'allow' },
          },
        },
      })
      expect(capture.scope?.authority?.callId).toBeString()
      expect(capture.scope?.signal.aborted).toBe(false)
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
